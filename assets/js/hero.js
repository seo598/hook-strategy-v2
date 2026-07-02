/* =====================================================================
   HOOK STRATEGY — Hero WebGL scene
   Morphing GLSL icosahedron (fresnel + simplex displacement) + particle
   field, bloom post-processing, mouse / scroll / device-orientation
   interaction. Performance-guarded (DPR cap, visibility pause, RM aware).
   ===================================================================== */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.getElementById('hero-canvas');

// shared scroll progress (0..1 across hero) — read by main.js too if needed
export const heroState = { scroll: 0, ready: false };

function isWebGLBlocked() {
  try {
    const c = document.createElement('canvas');
    return !(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) { return true; }
}

/* ---- GLSL ---- */
const simplex = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const orbVert = /* glsl */`
uniform float uTime; uniform float uAmp; uniform float uMouse;
varying vec3 vNormal; varying vec3 vView; varying float vDisp;
${simplex}
void main(){
  float t = uTime * 0.32;
  float n = snoise(normal * 1.5 + t);
  float n2 = snoise(normal * 3.0 - t * 0.7);
  float disp = (n * 0.6 + n2 * 0.4) * uAmp * (0.6 + uMouse * 0.7);
  vDisp = disp;
  vec3 pos = position + normal * disp;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const orbFrag = /* glsl */`
precision highp float;
uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform float uFade; uniform float uDesk;
varying vec3 vNormal; varying vec3 vView; varying float vDisp;
// thin-film-style iridescence: cheap cosine palette on the rim
vec3 irid(float t){
  return 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.66) + t));
}
void main(){
  float ndv = max(dot(vNormal, vView), 0.0);
  float fres = pow(1.0 - ndv, mix(3.0, 2.0, uDesk));
  float band = 0.5 + 0.5 * sin(vDisp * 9.0 + uTime * 0.8);

  // key + fill lighting so the form reads as a lit volume, not a flat blob
  vec3 keyDir  = normalize(vec3(0.55, 0.75, 0.45));
  vec3 fillDir = normalize(vec3(-0.6, -0.2, 0.5));
  float key  = max(dot(vNormal, keyDir), 0.0);
  float fill = max(dot(vNormal, fillDir), 0.0);
  float lit  = mix(0.30, 0.45, uDesk) + 0.85 * key + 0.18 * fill;

  // a solid, visible forest-green body (reads as an object without bloom)...
  vec3 base = mix(uA, uB, band);
  vec3 col = base * (mix(0.34, 0.55, uDesk) + mix(0.55, 0.45, uDesk) * band) * lit;

  // ...with a restrained lime rim that shimmers into iridescence at glancing angles
  vec3 rimCol = mix(uC, uB, band);
  vec3 sheen  = mix(rimCol, irid(vDisp * 1.6 + uTime * 0.05), 0.35);
  col += sheen * fres * mix(0.75, 1.6, uDesk);

  // soft specular glint along the creases of the displacement
  float spec = pow(max(dot(reflect(-keyDir, vNormal), vView), 0.0), 24.0);
  col += uC * spec * 0.5;
  col += uC * smoothstep(0.3, 0.6, vDisp) * 0.12;

  gl_FragColor = vec4(col * uFade, 1.0);
}`;

const ptVert = /* glsl */`
uniform float uTime; uniform float uSize; uniform vec2 uMouse;
attribute float aScale; attribute float aSpeed;
varying float vA; varying float vDepth;
void main(){
  vec3 p = position;
  p.y += sin(uTime * aSpeed + position.x * 2.0) * 0.15;
  p.x += cos(uTime * aSpeed * 0.8 + position.z * 1.5) * 0.15;
  // nearer (larger aScale) particles react more to the cursor — adds parallax depth
  p.xy += uMouse * (aScale * 0.6);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * aScale * (300.0 / -mv.z);
  vA = aScale;
  // 0 = close, 1 = far — used to fade distant motes into haze
  vDepth = smoothstep(4.0, 16.0, -mv.z);
}`;

const ptFrag = /* glsl */`
precision mediump float; varying float vA; varying float vDepth; uniform vec3 uColor; uniform vec3 uColorFar;
void main(){
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  // soft round sprite, dimmer with distance (volumetric depth cue)
  float a = smoothstep(0.5, 0.0, d) * (0.03 + vA * 0.12) * (1.0 - vDepth * 0.78);
  vec3 col = mix(uColor, uColorFar, vDepth);
  gl_FragColor = vec4(col, a);
}`;

function init(canvas) {
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  // On Arabic (RTL) pages the text is right-aligned, so mirror the hook to the left.
  const RTL = document.documentElement.getAttribute('dir') === 'rtl';
  // Only touch-PRIMARY devices should fall back to tilt. Everything else —
  // including a narrow desktop window or a small preview panel (where the
  // width-based `isMobile` is true) — is mouse-driven and must follow the cursor.
  const isTouch = window.matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  renderer.setClearColor(0x06170d, 1); // opaque brand-dark (green ink) backdrop

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x06070b, 0.085);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 6);

  // ---- the hook (brand mark: a 3D fishing hook — "where great ideas take bait") ----
  const orbMat = new THREE.ShaderMaterial({
    vertexShader: orbVert, fragmentShader: orbFrag,
    uniforms: {
      uTime: { value: 0 }, uAmp: { value: 0.04 }, uMouse: { value: 0 }, uFade: { value: 1 },
      uDesk: { value: isMobile ? 0.0 : 1.0 }, // desktop-only contrast/rim lift; mobile keeps the softer original look
      uA: { value: new THREE.Color(isMobile ? 0x084424 : 0x0f7a3a) }, // deep green body (brighter on desktop so it separates from the dark bg)
      uB: { value: new THREE.Color(0x30cc64) }, // emerald mid
      uC: { value: new THREE.Color(0xd8f404) }, // neon yellow rim
    },
  });

  // Centerline of a fishing hook, traced top→tip: eye loop, straight shank,
  // U-bend, and the point curling back up on the inside. (Silhouette verified
  // as a flat SVG before porting here.)
  function buildHookGeometry() {
    const P = []; const V = (x, y) => new THREE.Vector3(x, y, 0);
    const ex = 0, ey = 1.35, er = 0.22;                 // eye loop
    for (let a = 250; a >= -80; a -= 14) { const r = a * Math.PI / 180; P.push(V(ex + Math.cos(r) * er, ey + Math.sin(r) * er)); }
    for (let y = 1.12; y >= -0.35; y -= 0.12) P.push(V(0, y)); // shank
    const bx = -0.5, by = -0.35, br = 0.5;              // bend + point
    for (let a = 0; a >= -300; a -= 8) { const r = a * Math.PI / 180; P.push(V(bx + Math.cos(r) * br, by + Math.sin(r) * br)); }
    const curve = new THREE.CatmullRomCurve3(P, false, 'catmullrom', 0.5);
    return new THREE.TubeGeometry(curve, isMobile ? 160 : 260, 0.085, isMobile ? 10 : 18, false);
  }
  const orbGeo = buildHookGeometry();
  const hookMesh = new THREE.Mesh(orbGeo, orbMat);

  const orb = new THREE.Group();
  orb.add(hookMesh);

  // faint fishing line rising from the eye
  const lineGeo = new THREE.CylinderGeometry(0.007, 0.004, 2.4, 6);
  lineGeo.translate(0, 1.57 + 1.2, 0);
  const fishingLine = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ color: 0x30cc64, transparent: true, opacity: 0.22 }));
  orb.add(fishingLine);

  // recenter so the hook sways about its own centroid, not the eye
  orbGeo.computeBoundingBox();
  const hookCenter = new THREE.Vector3(); orbGeo.boundingBox.getCenter(hookCenter);
  hookMesh.position.sub(hookCenter);
  fishingLine.position.sub(hookCenter);

  // On phones the portrait viewport makes the hook fill the screen + bloom
  // floods green — keep it a small upper accent instead of a backdrop.
  orb.scale.setScalar(isMobile ? 0.62 : 1.35);
  orb.position.x = (isMobile ? 0.3 : 2.3) * (RTL ? -1 : 1);
  orb.position.y = isMobile ? 1.85 : 0.35;
  scene.add(orb);

  // ---- particles ----
  const COUNT = isMobile ? 1800 : 4200;
  const pGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(COUNT * 3);
  const scl = new Float32Array(COUNT);
  const spd = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    const r = 3 + Math.random() * 9;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos[i*3]   = r * Math.sin(ph) * Math.cos(th);
    pos[i*3+1] = r * Math.sin(ph) * Math.sin(th) * 0.7;
    pos[i*3+2] = r * Math.cos(ph) - 4;
    scl[i] = Math.random();
    spd[i] = 0.2 + Math.random() * 0.8;
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pGeo.setAttribute('aScale', new THREE.BufferAttribute(scl, 1));
  pGeo.setAttribute('aSpeed', new THREE.BufferAttribute(spd, 1));
  const pMat = new THREE.ShaderMaterial({
    vertexShader: ptVert, fragmentShader: ptFrag, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uSize: { value: isMobile ? 12 : 16 }, uMouse: { value: new THREE.Vector2() }, uColor: { value: new THREE.Color(0xc9e88f) }, uColorFar: { value: new THREE.Color(0x2c6b3f) } },
  });
  const points = new THREE.Points(pGeo, pMat);
  scene.add(points);

  // ---- post ----
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), isMobile ? 0.18 : 0.5, 0.5, 0.72);
  composer.addPass(bloom);

  // cinematic grade: chromatic aberration at the edges + vignette + film grain
  const GradeShader = {
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uAberration: { value: isMobile ? 1.1 : 2.0 },
      uVignette: { value: 1.0 },
      uGrain: { value: isMobile ? 0.035 : 0.055 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes;
      uniform float uAberration; uniform float uVignette; uniform float uGrain;
      varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec2 uv = vUv;
        vec2 dir = uv - 0.5;
        float r2 = dot(dir, dir);
        // radial chromatic aberration — zero at center, grows toward edges
        vec2 off = dir * r2 * (uAberration / uRes.x) * 6.0;
        float cr = texture2D(tDiffuse, uv + off).r;
        float cg = texture2D(tDiffuse, uv).g;
        float cb = texture2D(tDiffuse, uv - off).b;
        vec3 col = vec3(cr, cg, cb);
        // vignette
        float vig = smoothstep(0.95, 0.25, r2 * uVignette * 2.2);
        col *= mix(0.72, 1.0, vig);
        // animated film grain
        float g = hash(uv * uRes + fract(uTime) * 100.0) - 0.5;
        col += g * uGrain;
        gl_FragColor = vec4(col, 1.0);
      }`,
  };
  const grade = new ShaderPass(GradeShader);
  grade.renderToScreen = true;
  composer.addPass(grade);

  // ---- sizing ----
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    // The post pipeline (bloom + grain + chromatic aberration) is low-frequency and
    // soft, so run it at a capped ratio rather than the crisp main pass's full DPR.
    // Indistinguishable on screen, but ~40% less post-pass fragment work on HiDPI/4K.
    const postDpr = Math.min(renderer.getPixelRatio(), 1.5);
    composer.setPixelRatio(postDpr);
    composer.setSize(w, h);
    grade.uniforms.uRes.value.set(w * postDpr, h * postDpr);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  // ---- interaction ----
  const mouse = new THREE.Vector2(0, 0);
  const target = new THREE.Vector2(0, 0);
  // Always track the mouse — fires on any pointer device, at any viewport width.
  window.addEventListener('mousemove', (e) => {
    target.x = (e.clientX / window.innerWidth) * 2 - 1;
    target.y = -((e.clientY / window.innerHeight) * 2 - 1);
  }, { passive: true });
  if (isTouch && window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', (e) => {
      target.x = THREE.MathUtils.clamp((e.gamma || 0) / 35, -1, 1);
      target.y = THREE.MathUtils.clamp((e.beta || 0) / 60 - 0.5, -1, 1);
    }, { passive: true });
  }

  // scroll progress across hero
  const hero = document.getElementById('hero');
  function onScroll() {
    const rect = hero.getBoundingClientRect();
    const p = THREE.MathUtils.clamp(-rect.top / (rect.height || 1), 0, 1);
    heroState.scroll = p;
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---- visibility pause ----
  // Track "in view" and "tab visible" independently and AND them each frame.
  // (A single latched flag could only ever clear — `visible = !hidden && visible`
  // never restores true — so alt-tabbing while the hero was on screen froze it
  // for the rest of the session because the IntersectionObserver never re-fired.)
  let inView = true, tabVisible = !document.hidden;
  const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; }, { threshold: 0 });
  io.observe(hero);
  document.addEventListener('visibilitychange', () => { tabVisible = !document.hidden; });

  // ---- loop ----
  const clock = new THREE.Clock();
  heroState.ready = true;

  function frame() {
    requestAnimationFrame(frame);
    if (!inView || !tabVisible) return;
    const t = clock.getElapsedTime();
    const sp = heroState.scroll;

    mouse.lerp(target, 0.05);
    const mlen = Math.min(Math.hypot(mouse.x, mouse.y), 1);

    if (!reduceMotion) {
      orbMat.uniforms.uTime.value = t;
      pMat.uniforms.uTime.value = t;
      // the hook dangles and sways on its line rather than spinning
      orb.rotation.y = Math.sin(t * 0.3) * 0.6 + mouse.x * 0.4;
      orb.rotation.z = Math.sin(t * 0.5) * 0.06;
      orb.rotation.x = mouse.y * 0.25;
      points.rotation.y = t * 0.02 + mouse.x * 0.15;
    }
    orbMat.uniforms.uMouse.value += (mlen - orbMat.uniforms.uMouse.value) * 0.05;
    orbMat.uniforms.uAmp.value = 0.04 + sp * 0.12;
    pMat.uniforms.uMouse.value.set(mouse.x * 0.6, mouse.y * 0.6);
    grade.uniforms.uTime.value = t;

    // scroll handoff: the orb recedes, shrinks and dissolves as the next
    // section rises — hero → statement reads as one continuous camera move
    const handoff = THREE.MathUtils.smoothstep(sp, 0.0, 1.0);
    const oScale = (isMobile ? 0.62 : 1.35) * (1.0 - handoff * 0.45);
    orb.scale.setScalar(oScale);
    orbMat.uniforms.uFade.value = 1.0 - handoff * 0.85;

    // the hook tracks the cursor across the hero. Drive it from the RAW cursor
    // (target) with a single smoothing stage so it follows crisply instead of
    // lagging through two cascaded low-pass filters (mouse.lerp → position.lerp).
    // Desktop: rest the hook in the clear space beside the left-aligned headline,
    // frustum-aware (from the actual window aspect at z=6/FOV50) so it never clips
    // on narrow / split-screen windows. RTL mirrors it to the left.
    const halfW = Math.tan((50 * Math.PI / 180) / 2) * 6 * (window.innerWidth / Math.max(1, window.innerHeight));
    const baseX = (isMobile ? 0.3 : Math.min(2.6, halfW - 1.3)) * (RTL ? -1 : 1);
    const baseY = isMobile ? (isTouch ? 1.85 : 1.3) : 0.35;
    const rangeX = isTouch ? 0.45 : 2.2, rangeY = isTouch ? 0.4 : 2.0;
    const followX = baseX + target.x * rangeX;
    const followY = baseY + target.y * rangeY - sp * 1.2;
    orb.position.x += (followX - orb.position.x) * 0.14;
    orb.position.y += (followY - orb.position.y) * 0.14;
    orb.position.z = -sp * 2.0;

    // camera holds nearly steady (tiny parallax) so the hook visibly travels to the cursor
    camera.position.x += (mouse.x * 0.2 - camera.position.x) * 0.04;
    camera.position.y += (mouse.y * 0.12 - camera.position.y) * 0.04;
    camera.position.z = 6 + sp * 4.5;
    camera.lookAt(0, 0, 0);

    composer.render();
  }
  frame();

  // render one static frame even under reduced motion
  if (reduceMotion) composer.render();
}

/* ---- boot (after all GLSL/const + init() are defined) ---- */
if (canvas && !isWebGLBlocked()) {
  // Defer WebGL setup to idle so the hero headline (LCP) paints first.
  const boot = () => init(canvas);
  if ('requestIdleCallback' in window) requestIdleCallback(boot, { timeout: 700 });
  else setTimeout(boot, 150);
} else if (canvas) {
  // graceful fallback: subtle on-brand gradient so the hero is never empty
  canvas.style.background = 'radial-gradient(60% 60% at 70% 30%, rgba(48,204,100,0.22), transparent 70%), radial-gradient(50% 50% at 30% 70%, rgba(216,244,4,0.12), transparent 70%), #06170d';
}

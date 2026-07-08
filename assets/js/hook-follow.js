/* =====================================================================
   HOOK STRATEGY — Page-wide cursor follower
   A fixed, transparent WebGL layer that renders the 3D brand hook and
   chases the cursor across the WHOLE page (fades in once the hero scrolls
   away, so the hero's own hook hands off to this one). Mouse users only;
   no post-processing (keeps the layer genuinely transparent over content).
   ===================================================================== */
import * as THREE from 'three';

const canvas = document.getElementById('hook-follow');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch = window.matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);

function isWebGLBlocked() {
  try { const c = document.createElement('canvas'); return !(c.getContext('webgl2') || c.getContext('webgl')); }
  catch (e) { return true; }
}

const hookVert = /* glsl */`
  varying vec3 vN; varying vec3 vV; varying float vY;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    vY = position.y;                       // local height, for the body gradient
    gl_Position = projectionMatrix * mv;
  }`;

const hookFrag = /* glsl */`
  precision highp float;
  uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform float uTime;
  varying vec3 vN; varying vec3 vV; varying float vY;
  // cheap thin-film iridescence
  vec3 irid(float t){ return 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.66) + t)); }
  void main(){
    float ndv  = max(dot(vN, vV), 0.0);
    float fres = pow(1.0 - ndv, 2.6);

    // key + fill so the metal reads as a lit volume
    vec3 keyDir  = normalize(vec3(0.55, 0.80, 0.55));
    vec3 fillDir = normalize(vec3(-0.60, -0.10, 0.50));
    float key  = max(dot(vN, keyDir), 0.0);
    float fill = max(dot(vN, fillDir), 0.0);
    float lit  = 0.30 + 0.80 * key + 0.20 * fill;

    // forest → emerald gradient down the length of the hook
    float g = smoothstep(-1.1, 1.6, vY);
    vec3 col = mix(uA, uB, g * 0.7) * lit;

    // faux-metallic environment reflection (bright above, dark below)
    vec3 refl = reflect(-vV, vN);
    float m = refl.y * 0.5 + 0.5;
    col += mix(uA * 0.35, uC, smoothstep(0.35, 0.96, m)) * 0.30;

    // animated iridescent lime rim
    vec3 rim = mix(uC, irid(vY * 0.4 + uTime * 0.05), 0.35);
    col += rim * fres * 1.05;

    // crisp specular glint + faint emissive lift
    float spec = pow(max(dot(reflect(-keyDir, vN), vV), 0.0), 40.0);
    col += uC * spec * 0.7;
    col += uB * 0.05;

    gl_FragColor = vec4(col, 1.0);
  }`;

// Hook centerline, traced top→tip: eye loop → shank → U-bend → point.
function hookPoints() {
  const P = []; const V = (x, y) => new THREE.Vector3(x, y, 0);
  const ex = 0, ey = 1.35, er = 0.22;
  for (let a = 250; a >= -80; a -= 14) { const r = a * Math.PI / 180; P.push(V(ex + Math.cos(r) * er, ey + Math.sin(r) * er)); }
  for (let y = 1.12; y >= -0.35; y -= 0.12) P.push(V(0, y));
  const bx = -0.5, by = -0.35, br = 0.5;
  for (let a = 0; a >= -300; a -= 8) { const r = a * Math.PI / 180; P.push(V(bx + Math.cos(r) * br, by + Math.sin(r) * br)); }
  return P;
}

function init() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setClearColor(0x000000, 0); // fully transparent — only the hook draws

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  const CAM_Z = 6;
  camera.position.set(0, 0, CAM_Z);

  const mat = new THREE.ShaderMaterial({
    vertexShader: hookVert, fragmentShader: hookFrag,
    uniforms: {
      uA: { value: new THREE.Color(0x0c4f2a) }, // deep forest body
      uB: { value: new THREE.Color(0x30cc64) }, // emerald mid
      uC: { value: new THREE.Color(0xd8f404) }, // neon lime rim
      uTime: { value: 0 },
    },
  });

  // build a solid hook: smooth tube + spheres capping the two open ends
  const R = 0.09;
  const pts = hookPoints();
  const tubeGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5), 300, R, 20, false);
  tubeGeo.computeBoundingBox();
  const c = new THREE.Vector3(); tubeGeo.boundingBox.getCenter(c);
  tubeGeo.translate(-c.x, -c.y, -c.z);

  const hook = new THREE.Group();
  hook.add(new THREE.Mesh(tubeGeo, mat));
  const capGeo = new THREE.SphereGeometry(R, 16, 12);
  [pts[0], pts[pts.length - 1]].forEach((p) => {
    const cap = new THREE.Mesh(capGeo, mat);
    cap.position.set(p.x - c.x, p.y - c.y, p.z - c.z);
    hook.add(cap);
  });
  hook.scale.setScalar(0.34);
  scene.add(hook);

  // cursor → world mapping across the full viewport (at the hook's z=0 plane)
  let halfH = 2.8, aspect = 1;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    aspect = w / h; camera.aspect = aspect; camera.updateProjectionMatrix();
    halfH = Math.tan((camera.fov * Math.PI / 180) / 2) * CAM_Z;
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  // target = where the cursor is, in world units; hook lerps toward it
  const target = new THREE.Vector2(0, 0);
  window.addEventListener('mousemove', (e) => {
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = -((e.clientY / window.innerHeight) * 2 - 1);
    target.set(nx * halfH * aspect, ny * halfH);
  }, { passive: true });

  // only visible / rendering once the hero has scrolled away
  let active = false;
  function onScroll() {
    const past = window.scrollY > window.innerHeight * 0.55;
    if (past !== active) { active = past; canvas.classList.toggle('is-active', active); }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  let tabVisible = !document.hidden;
  document.addEventListener('visibilitychange', () => { tabVisible = !document.hidden; });

  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    if (!active || !tabVisible) return; // idle (and invisible) while in the hero
    const t = clock.getElapsedTime();
    mat.uniforms.uTime.value = t;
    hook.position.x += (target.x - hook.position.x) * 0.12;
    hook.position.y += (target.y - hook.position.y) * 0.12;
    hook.rotation.y = Math.sin(t * 0.4) * 0.5;
    hook.rotation.z = Math.sin(t * 0.6) * 0.08;
    renderer.render(scene, camera);
  }
  frame();
}

// Mouse users only — a chasing element on touch / reduced-motion is unwanted.
if (canvas && !isTouch && !reduceMotion && !isWebGLBlocked()) {
  const boot = () => init();
  if ('requestIdleCallback' in window) requestIdleCallback(boot, { timeout: 800 });
  else setTimeout(boot, 200);
}

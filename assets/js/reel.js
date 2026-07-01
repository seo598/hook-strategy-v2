/* =====================================================================
   HOOK STRATEGY — "The Reel" cinematic scroll experience
   Fixed full-viewport WebGL background: a camera flies along a curved path
   through a particle field, passing a glowing "monolith" at each chapter's
   scroll position. Foreground chapters (real HTML, real text) sit on top —
   the canvas is purely decorative (aria-hidden) so content, SEO and a11y
   never depend on WebGL. Reuses the bloom + film-grade recipe from hero.js.
   ===================================================================== */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { lenis } from './main.js';

const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.getElementById('reel-canvas');

function isWebGLBlocked() {
  try {
    const c = document.createElement('canvas');
    return !(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) { return true; }
}

/* One waypoint per chapter section, in document order. Colors cycle through
   brand greens/lime, with a warm gold moment for the Dear Gold chapter. */
const CHAPTERS = [
  { id: 'reel-intro',          a: 0x084424, c: 0xd8f404 },
  { id: 'reel-fact-audience',  a: 0x084424, c: 0xd8f404 },
  { id: 'reel-fact-time',      a: 0x0a2c18, c: 0x7cffb2 },
  { id: 'reel-fact-hook',      a: 0x0a2c18, c: 0xfccc00 },
  { id: 'reel-fact-video',     a: 0x084424, c: 0xd8f404 },
  { id: 'reel-fact-discovery', a: 0x0a2c18, c: 0x30cc64 },
  { id: 'reel-fact-trust',     a: 0x0a2c18, c: 0x6de0c8 },
  { id: 'reel-fact-tiktok',    a: 0x084424, c: 0xd8f404 },
  { id: 'reel-fact-community', a: 0x0a2c18, c: 0x7cffb2 },
  { id: 'reel-outro',          a: 0x084424, c: 0xd8f404 },
];
const N = CHAPTERS.length;

/* ---- monolith shader: low-poly icosahedron, soft ripple + fresnel rim ---- */
const monoVert = /* glsl */`
uniform float uTime;
varying vec3 vNormal; varying vec3 vView;
void main(){
  vec3 pos = position + normal * (sin(uTime * 0.6 + position.x * 3.0) * 0.03);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const monoFrag = /* glsl */`
precision highp float;
uniform vec3 uA; uniform vec3 uC; uniform float uGlow;
varying vec3 vNormal; varying vec3 vView;
void main(){
  float fres = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.5);
  vec3 col = uA * 0.55 + uC * fres * 1.5;
  gl_FragColor = vec4(col * uGlow, 1.0);
}`;

/* ---- particle field: soft round sprites, additive, brand lime/green ---- */
const ptVert = /* glsl */`
uniform float uTime; uniform float uSize;
attribute float aScale; attribute float aSpeed;
varying float vA;
void main(){
  vec3 p = position;
  p.x += sin(uTime * aSpeed + position.z * 0.4) * 0.4;
  p.y += cos(uTime * aSpeed * 0.8 + position.z * 0.3) * 0.4;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * aScale * (280.0 / -mv.z);
  vA = aScale;
}`;
const ptFrag = /* glsl */`
precision mediump float; varying float vA; uniform vec3 uColor;
void main(){
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d) * (0.03 + vA * 0.1);
  gl_FragColor = vec4(uColor, a);
}`;

function init(canvas) {
  const isMobile = window.matchMedia('(max-width: 768px)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  renderer.setClearColor(0x06170d, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x06070b, 0.045);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);

  /* ---- camera path: one control point per chapter, spaced along Z ---- */
  const waypoints = [];
  for (let i = 0; i < N; i++) {
    const ang = i * 0.85;
    waypoints.push(new THREE.Vector3(Math.sin(ang) * 3.4, Math.cos(ang * 0.7) * 1.7, -i * 10));
  }
  const curve = new THREE.CatmullRomCurve3(waypoints, false, 'catmullrom', 0.2);
  camera.position.copy(waypoints[0]).add(new THREE.Vector3(0, 0, 2));
  const lookTarget = new THREE.Vector3();

  /* ---- monoliths: one glowing anchor per project chapter (skip intro) ---- */
  const detail = isMobile ? 1 : 2;
  const monoliths = [];
  for (let i = 1; i < N; i++) {
    const ch = CHAPTERS[i];
    const mat = new THREE.ShaderMaterial({
      vertexShader: monoVert, fragmentShader: monoFrag,
      uniforms: { uTime: { value: 0 }, uA: { value: new THREE.Color(ch.a) }, uC: { value: new THREE.Color(ch.c) }, uGlow: { value: 0.6 } },
    });
    const scale = i === N - 1 ? 1.5 : 1.05; // bigger "flare" at the outro
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1 * scale, detail), mat);
    mesh.position.copy(waypoints[i]);
    scene.add(mesh);
    monoliths.push({ mesh, mat, index: i });

    const halo = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.55 * scale, 0),
      new THREE.MeshBasicMaterial({ color: ch.c, wireframe: true, transparent: true, opacity: 0.08 })
    );
    halo.position.copy(waypoints[i]);
    scene.add(halo);
    monoliths[monoliths.length - 1].halo = halo;
  }

  /* ---- particle field spanning the full journey ---- */
  const COUNT = isMobile ? 1400 : 3200;
  const depth = (N - 1) * 10 + 12;
  const pGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(COUNT * 3);
  const scl = new Float32Array(COUNT);
  const spd = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    const r = 2.5 + Math.random() * 7;
    const th = Math.random() * Math.PI * 2;
    pos[i * 3] = Math.cos(th) * r;
    pos[i * 3 + 1] = Math.sin(th) * r * 0.6;
    pos[i * 3 + 2] = -Math.random() * depth + 6;
    scl[i] = Math.random();
    spd[i] = 0.15 + Math.random() * 0.5;
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pGeo.setAttribute('aScale', new THREE.BufferAttribute(scl, 1));
  pGeo.setAttribute('aSpeed', new THREE.BufferAttribute(spd, 1));
  const pMat = new THREE.ShaderMaterial({
    vertexShader: ptVert, fragmentShader: ptFrag, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uSize: { value: isMobile ? 11 : 15 }, uColor: { value: new THREE.Color(0xc9e88f) } },
  });
  const points = new THREE.Points(pGeo, pMat);
  scene.add(points);

  /* ---- post: bloom + film grade (same recipe as the homepage hero) ---- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), isMobile ? 0.3 : 0.4, 0.6, 0.68);
  composer.addPass(bloom);

  const GradeShader = {
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uAberration: { value: isMobile ? 1.0 : 1.8 }, uGrain: { value: isMobile ? 0.03 : 0.045 } },
    vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; uniform float uAberration; uniform float uGrain;
      varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec2 uv = vUv; vec2 dir = uv - 0.5; float r2 = dot(dir, dir);
        vec2 off = dir * r2 * (uAberration / uRes.x) * 6.0;
        vec3 col = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
        float vig = smoothstep(0.95, 0.2, r2 * 2.2);
        col *= mix(0.68, 1.0, vig);
        col += (hash(uv * uRes + fract(uTime) * 100.0) - 0.5) * uGrain;
        gl_FragColor = vec4(col, 1.0);
      }`,
  };
  const grade = new ShaderPass(GradeShader);
  grade.renderToScreen = true;
  composer.addPass(grade);

  /* ---- sizing ---- */
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    const postDpr = Math.min(renderer.getPixelRatio(), 1.5);
    composer.setPixelRatio(postDpr);
    composer.setSize(w, h);
    grade.uniforms.uRes.value.set(w * postDpr, h * postDpr);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  /* ---- scroll progress (0..1 over the whole page) ---- */
  let scrollP = 0;
  function updateScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    scrollP = max > 0 ? THREE.MathUtils.clamp(window.scrollY / max, 0, 1) : 0;
  }
  window.addEventListener('scroll', updateScroll, { passive: true });
  updateScroll();

  /* ---- chapter dot nav + progress bar (driven by the same scrollP) ---- */
  const dots = [...document.querySelectorAll('.reel__dot')];
  const fill = document.getElementById('reel-progress-fill');
  let activeIdx = -1;
  dots.forEach((dot) => dot.addEventListener('click', () => {
    const el = document.getElementById(dot.dataset.goto);
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { offset: 0, duration: 1.3 });
    else el.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' });
  }));
  function updateChrome() {
    if (fill) fill.style.width = (scrollP * 100).toFixed(2) + '%';
    const idx = Math.round(scrollP * (N - 1));
    if (idx !== activeIdx) {
      activeIdx = idx;
      dots.forEach((d, i) => d.classList.toggle('is-active', i === idx));
    }
  }

  /* ---- pause when the tab isn't visible ---- */
  let tabVisible = !document.hidden;
  document.addEventListener('visibilitychange', () => { tabVisible = !document.hidden; });

  /* ---- loop ---- */
  const clock = new THREE.Clock();
  const camLerp = RM ? 1 : 0.09;

  function frame() {
    requestAnimationFrame(frame);
    if (!tabVisible) return;
    const t = clock.getElapsedTime();

    const camPos = curve.getPointAt(scrollP);
    camera.position.lerp(camPos, camLerp);
    const lookP = Math.min(scrollP + 0.035, 1);
    lookTarget.lerp(curve.getPointAt(lookP), camLerp);
    camera.lookAt(lookTarget);

    if (!RM) {
      pMat.uniforms.uTime.value = t;
      points.rotation.z = t * 0.01;
    }
    grade.uniforms.uTime.value = t;

    monoliths.forEach(({ mesh, mat, halo, index }) => {
      const dist = Math.abs(scrollP - index / (N - 1));
      const proximity = 1 - THREE.MathUtils.smoothstep(dist, 0, 0.12);
      mat.uniforms.uGlow.value = 0.55 + proximity * 0.9;
      if (!RM) {
        mat.uniforms.uTime.value = t;
        mesh.rotation.y = t * (0.08 + proximity * 0.2);
        halo.rotation.y = -t * 0.05;
      }
      const s = 1 + proximity * 0.25;
      mesh.scale.setScalar(s);
      halo.scale.setScalar(s);
    });

    updateChrome();
    composer.render();
  }
  frame();
}

/* ---- boot ---- */
if (canvas && !isWebGLBlocked()) {
  const boot = () => init(canvas);
  if ('requestIdleCallback' in window) requestIdleCallback(boot, { timeout: 700 });
  else setTimeout(boot, 150);
} else if (canvas) {
  canvas.style.background = 'radial-gradient(60% 60% at 70% 30%, rgba(48,204,100,0.22), transparent 70%), radial-gradient(50% 50% at 30% 70%, rgba(216,244,4,0.12), transparent 70%), #06170d';
}

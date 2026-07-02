/* =====================================================================
   HOOK STRATEGY — The Grove (interactive garden game)
   Six playable stages: plant a seed (idea) → roots (strategy) → rain
   (content) → sunlight (performance) → wind (social) → harvest (growth).
   Self-contained: Three.js scene + generative Web Audio + tiny tween/
   particle systems. No main.js. Reuses the .xp-* page chrome/CSS.
   ===================================================================== */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/* ---------- environment ---------- */
const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const AR = (document.documentElement.getAttribute('lang') || '').startsWith('ar');
const isMobile = window.matchMedia('(max-width: 768px)').matches;

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const canvas = $('xp-canvas'), gate = $('xp-gate'), chrome = $('xp-chrome'),
      dotsNav = $('xp-dots'), story = $('xp-story'), hint = $('xp-hint'),
      progressFill = $('xp-progress-fill'), soundBtn = $('xp-sound'),
      replayBtn = $('xp-replay'), loadingEl = $('xp-loading'), loadingPct = $('xp-loading-pct');
if (!canvas) throw new Error('grove: no canvas');

/* ---------- strings (page copy lives in HTML; only dynamic UI here) ---------- */
const STR = AR ? {
  hints: [
    'المس <span class="xp-hint__key">التربة</span> لتزرع فكرتك',
    'اضغط <span class="xp-hint__key">مطوّلاً</span> لتنمو الجذور',
    '<span class="xp-hint__key">انقر</span> لتُمطر',
    'اضغط <span class="xp-hint__key">مطوّلاً</span> لتُشرق الشمس',
    '<span class="xp-hint__key">اسحب</span> لترسل الريح',
    'المس <span class="xp-hint__key">الثمار</span> لتقطف النموّ',
  ],
  toasts: ['الفكرة في الأرض 🌱', 'جذور راسخة — هذه هي الاستراتيجية', 'ارتوت — هذا هو المحتوى',
           'أشرقت — هذا هو الأداء', 'حملتها الريح — هذا هو السوشال', 'قطفتَ النموّ 🎉'],
  rmHint: 'المس أو اضغط <span class="xp-hint__key">Enter</span> للمتابعة',
} : {
  hints: [
    'tap the <span class="xp-hint__key">soil</span> to plant your idea',
    'press &amp; <span class="xp-hint__key">hold</span> to grow the roots',
    '<span class="xp-hint__key">tap</span> to let it rain',
    'press &amp; <span class="xp-hint__key">hold</span> to shine',
    '<span class="xp-hint__key">swipe</span> to send the wind',
    'tap the <span class="xp-hint__key">fruit</span> to harvest',
  ],
  toasts: ['Idea planted 🌱', 'Roots locked in — that’s strategy', 'Watered — that’s content',
           'Sunlit — that’s performance', 'Carried by the wind — that’s social', 'Growth, harvested 🎉'],
  rmHint: 'tap or press <span class="xp-hint__key">Enter</span> to continue',
};

/* ---------- palette ---------- */
const C = {
  bg0: new THREE.Color(0x06170d), bgSun: new THREE.Color(0x0d2f1a),
  soil: 0x123222, soilDark: 0x0c2418, grass: 0x155c33,
  trunk: 0x2a4d2e, leafA: 0x1d7d43, leafB: 0x30cc64, leafSun: 0x53e07f,
  lime: 0xd8f404, gold: 0xfccc00, mint: 0xe8fcf0, root: 0x9fb96a,
};

/* ---------- renderer / scene ---------- */
// No `antialias` here: the frame is drawn through EffectComposer, whose render
// target ignores the canvas MSAA. We give the composer a multisampled target instead.
const renderer = new THREE.WebGLRenderer({ canvas, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
const skyCol = C.bg0.clone();
renderer.setClearColor(skyCol, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x06170d, 0.055);

const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
camera.position.set(0, 2.4, 7);

/* toon gradient (3-step cel shading) */
const gradTex = new THREE.DataTexture(new Uint8Array([70, 150, 255]), 3, 1, THREE.RedFormat);
gradTex.needsUpdate = true; gradTex.minFilter = gradTex.magFilter = THREE.NearestFilter;
const toon = (color, opts = {}) => new THREE.MeshToonMaterial({ color, gradientMap: gradTex, ...opts });

/* lights */
scene.add(new THREE.AmbientLight(0x3a5a45, 0.85));
const sunLight = new THREE.DirectionalLight(0xfff2c8, 0.25);
sunLight.position.set(4, 5, -2);
scene.add(sunLight);
const rim = new THREE.PointLight(0xd8f404, 0.5, 14);
rim.position.set(-3, 2.5, 3);
scene.add(rim);

/* ---------- island ---------- */
const world = new THREE.Group(); scene.add(world);
const isle = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 2.1, 1.15, 10, 1), toon(C.soil));
isle.position.y = -0.58; world.add(isle);
const mound = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), toon(C.soilDark));
mound.scale.set(1, 0.32, 1); mound.position.y = 0.02; world.add(mound);
for (let i = 0; i < 14; i++) { // grass tufts
  const g = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.22 + Math.random() * 0.18, 4), toon(C.grass));
  const a = Math.random() * Math.PI * 2, r = 1.1 + Math.random() * 1.9;
  g.position.set(Math.cos(a) * r, 0.09, Math.sin(a) * r);
  g.rotation.z = (Math.random() - 0.5) * 0.35;
  world.add(g);
}

/* ---------- seed & sprout ---------- */
const seed = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), toon(0x4a3620));
seed.scale.set(1, 1.25, 1); seed.position.set(0, 2.6, 0); seed.visible = false; world.add(seed);

const sprout = new THREE.Group(); sprout.position.y = 0.06; sprout.scale.setScalar(0.001); world.add(sprout);
const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.34, 6), toon(C.leafB));
stem.geometry.translate(0, 0.17, 0); sprout.add(stem);
for (const s of [-1, 1]) {
  const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 5), toon(C.leafB));
  leaf.position.set(0.09 * s, 0.3, 0); leaf.rotation.z = s * -1.1; sprout.add(leaf);
}

/* ---------- roots (underground) ---------- */
const rootsGroup = new THREE.Group(); world.add(rootsGroup);
const rootMat = toon(C.root, { emissive: 0x556b2f, emissiveIntensity: 0.25 });
const ROOTS = [];
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2 + 0.3;
  const end = new THREE.Vector3(Math.cos(a) * (1.1 + Math.random() * 0.7), -1.7 - Math.random() * 0.7, Math.sin(a) * (1.1 + Math.random() * 0.7));
  const mid = end.clone().multiplyScalar(0.45); mid.y = -0.7 - Math.random() * 0.3;
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.05, 0), mid, end]);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.035, 5, false), rootMat);
  tube.scale.setScalar(0.001); rootsGroup.add(tube); ROOTS.push(tube);
}

/* ---------- tree ---------- */
const tree = new THREE.Group(); world.add(tree);
const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.17, 2.1, 7), toon(C.trunk));
trunk.geometry.translate(0, 1.05, 0); trunk.scale.y = 0.001; trunk.visible = false; tree.add(trunk);

const BRANCHES = [];
[[0.55, 0.9, 0.5], [1.0, -1.0, -0.4], [1.35, 0.7, -0.7], [1.6, -0.6, 0.6]].forEach(([h, dir, zr]) => {
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.62, 5), toon(C.trunk));
  b.geometry.translate(0, 0.31, 0);
  b.position.y = h; b.rotation.z = dir * 0.9; b.rotation.y = zr * 2;
  b.scale.setScalar(0.001); tree.add(b); BRANCHES.push(b);
});

const leafMat = toon(C.leafA, { emissive: 0x000000, emissiveIntensity: 0 });
const leafMatB = toon(C.leafB, { emissive: 0x000000, emissiveIntensity: 0 });
const PUFFS = [];
[[0, 2.25, 0, 0.58], [0.55, 2.0, 0.15, 0.4], [-0.5, 1.95, -0.2, 0.42], [0.3, 2.55, -0.3, 0.38],
 [-0.35, 2.5, 0.3, 0.36], [0.62, 1.55, -0.42, 0.3], [-0.6, 1.5, 0.4, 0.3]].forEach(([x, y, z, r], i) => {
  const p = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), i % 2 ? leafMatB : leafMat);
  p.position.set(x, y, z); p.scale.setScalar(0.001); tree.add(p); PUFFS.push(p);
});

const FRUITS = [];
[[0.55, 2.28], [-0.52, 2.2], [0.18, 2.72], [-0.25, 1.78], [0.6, 1.72]].forEach(([x, y], i) => {
  const f = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8),
    toon(C.lime, { emissive: C.lime, emissiveIntensity: 0.85 }));
  f.position.set(x, y, 0.3 - (i % 3) * 0.3); f.scale.setScalar(0.001);
  f.userData = { alive: false, idx: i, baseY: y };
  tree.add(f); FRUITS.push(f);
});

/* ---------- side plots (virality sprouts) ---------- */
const PLOTS = [];
[[-2.0, 0.7], [1.95, -0.75]].forEach(([x, z]) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), toon(C.soilDark));
  m.scale.set(1, 0.3, 1); m.position.set(x, 0.02, z); world.add(m);
  const sp = new THREE.Group(); sp.position.set(x, 0.05, z); sp.scale.setScalar(0.001); world.add(sp);
  const st = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.3, 5), toon(C.leafB));
  st.geometry.translate(0, 0.15, 0); sp.add(st);
  const lf = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 5), toon(C.leafB));
  lf.position.set(0.07, 0.26, 0); lf.rotation.z = -1.1; sp.add(lf);
  PLOTS.push({ sprout: sp, grown: false, pos: new THREE.Vector3(x, 0.4, z) });
});

/* ---------- rain cloud + drops ---------- */
const cloud = new THREE.Group(); cloud.position.set(0.2, 4.3, -0.3); cloud.visible = false; world.add(cloud);
[[0, 0, 0, 0.65], [0.55, -0.08, 0.1, 0.45], [-0.55, -0.05, -0.1, 0.5]].forEach(([x, y, z, r]) => {
  const c = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), toon(0x1d3b2a));
  c.position.set(x, y, z); c.scale.y = 0.62; cloud.add(c);
});
const RAIN_N = 220;
const rainPos = new Float32Array(RAIN_N * 3);
const rainVel = new Float32Array(RAIN_N); // 0 = inactive
for (let i = 0; i < RAIN_N; i++) rainPos[i * 3 + 1] = -100;
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3).setUsage(THREE.DynamicDrawUsage));
const rainPts = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xbfe8ff, size: 0.05, transparent: true, opacity: 0.85 }));
rainPts.frustumCulled = false; world.add(rainPts);
let dropsLanded = 0;

function rainBurst() {
  let n = 0;
  for (let i = 0; i < RAIN_N && n < 26; i++) {
    if (rainVel[i] === 0) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 1.5;
      rainPos[i * 3] = cloud.position.x + Math.cos(a) * r;
      rainPos[i * 3 + 1] = cloud.position.y - 0.4 - Math.random() * 0.5;
      rainPos[i * 3 + 2] = cloud.position.z + Math.sin(a) * r;
      rainVel[i] = 5 + Math.random() * 2.5; n++;
    }
  }
}

/* ---------- sun + beam ---------- */
const sun = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10),
  new THREE.MeshBasicMaterial({ color: C.gold }));
sun.position.set(5.5, 0.2, -4); sun.visible = false; scene.add(sun);
const beam = new THREE.Mesh(new THREE.ConeGeometry(1.6, 7, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xfce77d, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
beam.visible = false; scene.add(beam);
let sunP = 0; // 0..1 sunrise progress

/* ---------- wind streaks ---------- */
const WIND_N = 90;
const windPos = new Float32Array(WIND_N * 3), windSeed = new Float32Array(WIND_N);
for (let i = 0; i < WIND_N; i++) {
  windPos[i * 3] = -6 + Math.random() * 12;
  windPos[i * 3 + 1] = 0.4 + Math.random() * 3;
  windPos[i * 3 + 2] = -2 + Math.random() * 4;
  windSeed[i] = Math.random() * 10;
}
const windGeo = new THREE.BufferGeometry();
windGeo.setAttribute('position', new THREE.BufferAttribute(windPos, 3).setUsage(THREE.DynamicDrawUsage));
const windMat = new THREE.PointsMaterial({ color: 0xa8d8b8, size: 0.05, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
const windPts = new THREE.Points(windGeo, windMat);
windPts.frustumCulled = false; world.add(windPts);
let windPower = 0;

/* ---------- spores ---------- */
const SPORES = [];
for (let i = 0; i < 6; i++) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5),
    new THREE.MeshBasicMaterial({ color: C.lime }));
  m.visible = false; world.add(m);
  SPORES.push({ mesh: m, t: 0, active: false, from: new THREE.Vector3(), ctrl: new THREE.Vector3(), to: new THREE.Vector3(), plot: 0 });
}
let sporesLanded = 0, sporesSent = 0;

/* ---------- generic particle bursts (seed puff, fruit pops, confetti) ---------- */
const BURST_N = 240;
const bPos = new Float32Array(BURST_N * 3), bVel = new Float32Array(BURST_N * 3),
      bLife = new Float32Array(BURST_N), bCol = new Float32Array(BURST_N * 3);
for (let i = 0; i < BURST_N; i++) bPos[i * 3 + 1] = -100;
const bGeo = new THREE.BufferGeometry();
bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3).setUsage(THREE.DynamicDrawUsage));
bGeo.setAttribute('color', new THREE.BufferAttribute(bCol, 3).setUsage(THREE.DynamicDrawUsage));
const bPts = new THREE.Points(bGeo, new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
bPts.frustumCulled = false; world.add(bPts);
const burstColors = [new THREE.Color(C.lime), new THREE.Color(C.gold), new THREE.Color(C.mint), new THREE.Color(C.leafB)];
function spawnBurst(pos, n = 20, speed = 1.6) {
  let made = 0;
  for (let i = 0; i < BURST_N && made < n; i++) {
    if (bLife[i] <= 0) {
      bPos[i * 3] = pos.x; bPos[i * 3 + 1] = pos.y; bPos[i * 3 + 2] = pos.z;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), sp = speed * (0.4 + Math.random() * 0.8);
      bVel[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
      bVel[i * 3 + 1] = Math.abs(Math.cos(ph)) * sp * 1.2;
      bVel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
      const c = burstColors[(Math.random() * burstColors.length) | 0];
      bCol[i * 3] = c.r; bCol[i * 3 + 1] = c.g; bCol[i * 3 + 2] = c.b;
      bLife[i] = 1 + Math.random() * 0.8; made++;
    }
  }
  if (made) bGeo.attributes.color.needsUpdate = true; // else bursts render black/invisible
}

/* ---------- fireflies ---------- */
const FLY_N = 50;
const flyPos = new Float32Array(FLY_N * 3), flySeed = new Float32Array(FLY_N);
for (let i = 0; i < FLY_N; i++) {
  const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 5;
  flyPos[i * 3] = Math.cos(a) * r; flyPos[i * 3 + 1] = 0.3 + Math.random() * 3.2; flyPos[i * 3 + 2] = Math.sin(a) * r;
  flySeed[i] = Math.random() * 10;
}
const flyGeo = new THREE.BufferGeometry();
flyGeo.setAttribute('position', new THREE.BufferAttribute(flyPos, 3).setUsage(THREE.DynamicDrawUsage));
world.add(new THREE.Points(flyGeo, new THREE.PointsMaterial({ color: 0xc9e88f, size: 0.045, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })));

/* ---------- post ---------- */
// Multisampled composer target (WebGL2) so edges are smooth on desktop.
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: isMobile ? 0 : 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), isMobile ? 0.35 : 0.45, 0.6, 0.62);
composer.addPass(bloom);

/* ---------- tweens ---------- */
const anims = [];
const easeOutCubic = (k) => 1 - Math.pow(1 - k, 3);
const easeOutBack = (k) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
function animate(dur, fn, ease = easeOutCubic, done) { anims.push({ t: 0, dur, fn, ease, done }); }
function popIn(mesh, scale = 1, dur = 0.55) {
  mesh.visible = true;
  animate(dur, (k) => mesh.scale.setScalar(Math.max(0.001, scale * k)), easeOutBack);
}

/* ---------- audio (all synthesized; unlocked by gate click) ---------- */
const SND = { ctx: null, master: null, windGain: null, on: false };
function audioInit() {
  if (SND.ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  const ctx = new AC(); SND.ctx = ctx;
  SND.master = ctx.createGain(); SND.master.gain.value = 0.7; SND.master.connect(ctx.destination);
  // soft garden pad
  [[110, 0.05], [164.8, 0.028], [220, 0.014]].forEach(([f, g]) => {
    const o = ctx.createOscillator(), gn = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f; gn.gain.value = g;
    o.connect(gn); gn.connect(SND.master); o.start();
  });
  // wind loop (filtered noise, gain driven per-frame)
  const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 480; bp.Q.value = 0.6;
  SND.windGain = ctx.createGain(); SND.windGain.gain.value = 0;
  src.connect(bp); bp.connect(SND.windGain); SND.windGain.connect(SND.master); src.start();
}
function tone(f, { d = 0.2, type = 'sine', g = 0.18, slide = 0 } = {}) {
  if (!SND.ctx || !SND.on) return;
  const ctx = SND.ctx, o = ctx.createOscillator(), gn = ctx.createGain(), t = ctx.currentTime;
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
  gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(gn); gn.connect(SND.master); o.start(t); o.stop(t + d + 0.02);
}
const PENT = [523, 587, 659, 784, 880];
const plink = () => tone(PENT[(Math.random() * PENT.length) | 0] * (Math.random() < 0.3 ? 2 : 1), { d: 0.1, type: 'triangle', g: 0.05 });
const thud = () => { tone(95, { d: 0.3, g: 0.5, slide: -55 }); };
const chime = () => [0, 4, 7, 12].forEach((s, i) => setTimeout(() => tone(523 * Math.pow(2, s / 12), { d: 0.5, type: 'triangle', g: 0.1 }), i * 95));
const popSnd = (i) => tone(440 + i * 90, { d: 0.14, type: 'square', g: 0.07 });
function setMuted(m) {
  SND.on = !m;
  if (SND.master) SND.master.gain.value = m ? 0 : 0.7;
  if (soundBtn) { soundBtn.classList.toggle('is-muted', m); soundBtn.setAttribute('aria-pressed', String(!m)); }
}

/* ---------- game state ---------- */
const N = 6;
let started = false, stage = -1, stageP = 0, maxReached = 0, advancing = false, finished = false;
// Track the two hold modalities independently so releasing one never cancels
// the other (and so a held pointer entering a hold-stage keeps growing).
let holdPointer = false, holdKey = false;
const isHolding = () => holdPointer || holdKey;
let fruitsPopped = 0, seedDropping = false;

/* dots */
const dots = [];
if (dotsNav) {
  for (let i = 0; i < N; i++) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'xp-dot'; b.disabled = true;
    b.setAttribute('aria-label', (AR ? 'المرحلة ' : 'Stage ') + (i + 1));
    dotsNav.appendChild(b); dots.push(b);
  }
}

/* toast */
const toast = document.createElement('div');
toast.className = 'grove-toast'; toast.setAttribute('role', 'status');
document.body.appendChild(toast);
let toastTimer = 0;
function showToast(msg) {
  toast.textContent = msg; toast.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-on'), 1900);
}

/* stats (final chapter) */
const statEls = [...document.querySelectorAll('.grove-stat b')];
function setStats(frac) {
  statEls.forEach((el) => {
    const to = parseFloat(el.dataset.to || '0'), dec = parseInt(el.dataset.dec || '0', 10);
    el.textContent = (to * frac).toFixed(dec);
  });
}

/* camera targets per stage (+ gate orbit) */
const CAMS = [
  { p: [0.9, 1.15, 3.3], l: [0, 0.3, 0] },     // seed
  { p: [0.4, -1.2, 3.6], l: [0, -0.9, 0] },    // roots
  { p: [1.5, 1.8, 4.8], l: [0, 1.1, 0] },      // rain
  { p: [-1.7, 1.9, 5.2], l: [0, 1.35, 0] },    // sun
  { p: [0.2, 2.3, 6.4], l: [0, 1.5, 0] },      // wind
  { p: [2.3, 2.1, 5.3], l: [0, 1.7, 0] },      // bloom
];
const camPos = camera.position.clone(), camLook = new THREE.Vector3(0, 0.8, 0);
const camPosT = camPos.clone(), camLookT = camLook.clone();
const pointerPar = new THREE.Vector2();

function setCamStage(i) {
  camPosT.fromArray(CAMS[i].p); camLookT.fromArray(CAMS[i].l);
  if (RM) { camPos.copy(camPosT); camLook.copy(camLookT); }
}

/* ---------- HUD sync ---------- */
function syncHud() {
  const f = finished ? 1 : Math.max(0, (stage + Math.min(stageP, 1)) / N);
  if (progressFill) progressFill.style.width = (f * 100).toFixed(1) + '%';
  dots.forEach((d, i) => {
    d.classList.toggle('is-active', i === stage && !finished);
    d.classList.toggle('is-done', finished || i < stage);
  });
}
function setStage(i) {
  stage = i; stageP = 0; advancing = false;
  maxReached = Math.max(maxReached, i);
  document.querySelectorAll('.xp-chapter').forEach((ch) => ch.classList.toggle('is-active', +ch.dataset.ch === i));
  if (hint) { hint.innerHTML = RM ? STR.rmHint : STR.hints[i]; hint.hidden = false; }
  setCamStage(i);
  // stage entries
  if (i === 2) { cloud.visible = true; cloud.scale.setScalar(0.001); popIn(cloud, 1, 0.7); }
  if (i === 3) { sun.visible = true; beam.visible = true; }
  if (i === 4) { windMat.opacity = 0; }
  if (i === 5) {
    FRUITS.forEach((f, k) => setTimeout(() => {
      if (finished || advancing || stage !== 5) return; // harvest already force-completed
      f.userData.alive = true; f.userData.settled = false;
      popIn(f, 1, 0.5); plink();
      animate(0.5, () => {}, (k2) => k2, () => { f.userData.settled = true; });
    }, 250 + k * 220));
  }
  syncHud();
}

function completeStage() {
  if (advancing) return;
  advancing = true; stageP = 1; syncHud();
  showToast(STR.toasts[stage]); chime();
  applyEndState(stage);
  if (stage < N - 1) setTimeout(() => setStage(stage + 1), 1400);
  else finishGame();
}

/* idempotent growth end-states (also lets RM users skip cleanly) */
const grown = { seed: false, roots: false, rain: false, sun: false, wind: false };
function applyEndState(i) {
  if (i === 0 && !grown.seed) {
    grown.seed = true; seed.visible = false;
    popIn(sprout, 1, 0.8);
  }
  if (i === 1 && !grown.roots) {
    grown.roots = true;
    ROOTS.forEach((r) => { if (r.scale.x < 1) animate(0.5, (k) => r.scale.setScalar(Math.max(r.scale.x, k)), easeOutCubic); });
    // sapling
    trunk.visible = true;
    animate(1.1, (k) => { trunk.scale.y = Math.max(trunk.scale.y, 0.001 + 0.34 * k); }, easeOutCubic);
    animate(0.8, (k) => sprout.scale.setScalar(Math.max(0.001, 1 - k * 0.999)));
  }
  if (i === 2 && !grown.rain) {
    grown.rain = true;
    animate(1.2, (k) => { trunk.scale.y = Math.max(trunk.scale.y, 0.34 + 0.36 * k); });
    PUFFS.slice(0, 4).forEach((p, k) => setTimeout(() => popIn(p, 1), k * 160));
    BRANCHES.slice(0, 2).forEach((b, k) => setTimeout(() => popIn(b, 1), 200 + k * 180));
    animate(0.8, (k) => cloud.scale.setScalar(Math.max(0.001, 1 - k * 0.999)), easeOutCubic, () => { cloud.visible = false; });
  }
  if (i === 3 && !grown.sun) {
    grown.sun = true; sunP = 1;
    animate(1.2, (k) => { trunk.scale.y = Math.max(trunk.scale.y, 0.7 + 0.3 * k); });
    PUFFS.slice(4).forEach((p, k) => setTimeout(() => popIn(p, 1), k * 170));
    BRANCHES.slice(2).forEach((b, k) => setTimeout(() => popIn(b, 1), 150 + k * 170));
    leafMat.color.set(C.leafSun); leafMatB.emissive.set(C.lime); leafMatB.emissiveIntensity = 0.12;
  }
  if (i === 4 && !grown.wind) {
    grown.wind = true;
    PLOTS.forEach((pl) => { if (!pl.grown) { pl.grown = true; popIn(pl.sprout, 1, 0.7); } });
  }
  if (i === 5) {
    // harvest any fruit still on the tree (e.g. reduced-motion / force-complete)
    FRUITS.forEach((f) => {
      if (f.userData.alive) {
        f.userData.alive = false;
        const wp = new THREE.Vector3(); f.getWorldPosition(wp); spawnBurst(wp, 14, 1.3);
        animate(0.3, (k) => f.scale.setScalar(Math.max(0.001, 1 - k)), easeOutCubic, () => { f.visible = false; });
      }
    });
  }
}

function finishGame() {
  finished = true;
  if (hint) hint.hidden = true;
  spawnBurst(new THREE.Vector3(0, 2.6, 0), RM ? 30 : 120, 2.4);
  setStats(1);
  syncHud();
}

/* replay */
if (replayBtn) replayBtn.addEventListener('click', () => window.location.reload());

/* ---------- input ---------- */
let pDown = false, pDownT = 0, pDownX = 0, pDownY = 0, lastX = 0;
const uiTarget = (e) => e.target.closest && e.target.closest('a, button, .xp-chrome, .xp-gate');

function doTap(x, y) {
  if (!started || advancing || finished) return;
  if (RM) { stageP = 1; completeStage(); return; }
  if (stage === 0) {
    if (seedDropping) return; // ignore a second tap while the seed is falling
    seedDropping = true;
    // plant: seed drops into the soil
    seed.visible = true; seed.position.set(0, 2.6, 0);
    animate(0.55, (k) => { seed.position.y = 2.6 - 2.52 * easeOutCubic(k); }, (k) => k, () => {
      thud(); spawnBurst(new THREE.Vector3(0, 0.15, 0), 16, 0.9);
      completeStage();
    });
  } else if (stage === 2) {
    rainBurst(); plink();
  } else if (stage === 5) {
    // fruit pick: screen-space distance test (fat-finger friendly)
    const v = new THREE.Vector3();
    let best = null, bestD = 64; // px radius
    for (const f of FRUITS) {
      if (!f.userData.alive) continue;
      f.getWorldPosition(v); v.project(camera);
      const sx = (v.x * 0.5 + 0.5) * window.innerWidth, sy = (-v.y * 0.5 + 0.5) * window.innerHeight;
      const d = Math.hypot(sx - x, sy - y);
      if (d < bestD) { bestD = d; best = f; }
    }
    if (best) popFruit(best);
  }
}

function popFruit(f) {
  f.userData.alive = false;
  fruitsPopped++;
  popSnd(fruitsPopped);
  const wp = new THREE.Vector3(); f.getWorldPosition(wp);
  spawnBurst(wp, 18, 1.4);
  animate(0.3, (k) => f.scale.setScalar(Math.max(0.001, 1 - k)), easeOutCubic, () => { f.visible = false; });
  setStats(fruitsPopped / FRUITS.length);
  stageP = fruitsPopped / FRUITS.length;
  syncHud();
  if (fruitsPopped >= FRUITS.length) completeStage();
}

window.addEventListener('pointerdown', (e) => {
  if (uiTarget(e)) return;
  pDown = true; pDownT = performance.now(); pDownX = e.clientX; pDownY = e.clientY; lastX = e.clientX;
  // Set the pointer hold on ANY game-surface press. Hold-stages read isHolding();
  // stage-4 auto-wind reads holdKey only, so a plain pointer hold never auto-winds.
  if (started) holdPointer = true;
  if (story && started) story.classList.add('is-traveling');
}, { passive: true });

window.addEventListener('pointermove', (e) => {
  pointerPar.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  if (pDown && started && stage === 4 && !RM) {
    windPower = Math.min(1, windPower + Math.abs(e.clientX - lastX) / 260);
    lastX = e.clientX;
  }
}, { passive: true });

window.addEventListener('pointerup', (e) => {
  if (!pDown) return;
  pDown = false; holdPointer = false;
  if (story) story.classList.remove('is-traveling');
  const dt = performance.now() - pDownT;
  const dist = Math.hypot(e.clientX - pDownX, e.clientY - pDownY);
  // Under reduced-motion, hold/swipe are no-ops, so accept any release as "advance".
  if (RM || (dt < 320 && dist < 14)) doTap(e.clientX, e.clientY);
}, { passive: true });

window.addEventListener('pointercancel', () => {
  pDown = false; holdPointer = false;
  if (story) story.classList.remove('is-traveling');
}, { passive: true });

window.addEventListener('keydown', (e) => {
  if (!started) return;
  if (uiTarget(e)) return; // let a focused chrome/gate control handle its own keys
  if (RM && (e.key === ' ' || e.key === 'Enter') && !e.repeat) {
    e.preventDefault(); doTap(window.innerWidth / 2, window.innerHeight / 2); return;
  }
  if (e.key === ' ') {
    e.preventDefault();
    holdKey = true;
    if (stage === 4 && !e.repeat) windPower = Math.min(1, windPower + 0.28); // keyboard wind
    if (stage === 2 && !e.repeat) { rainBurst(); plink(); }
  }
  if (e.key === 'Enter' && !e.repeat) {
    if (stage === 5) { const f = FRUITS.find((x) => x.userData.alive); if (f) popFruit(f); }
    else doTap(window.innerWidth / 2, window.innerHeight / 2);
  }
});
window.addEventListener('keyup', (e) => {
  if (e.key === ' ') holdKey = false;
});

/* ---------- gate ---------- */
function start(withSound) {
  if (started) return;
  started = true;
  if (withSound) { audioInit(); setMuted(false); if (SND.ctx && SND.ctx.state === 'suspended') SND.ctx.resume(); }
  else setMuted(true);
  gate.classList.add('is-gone');
  setTimeout(() => { gate.hidden = true; }, 800);
  if (chrome) chrome.hidden = false;
  if (dotsNav) dotsNav.hidden = false;
  document.body.classList.add('xp-started');
  setStage(0);
  // move focus off the (now hidden) gate button onto the live story region
  if (story) { try { story.focus({ preventScroll: true }); } catch (e) { story.focus(); } }
}
const btnSound = $('xp-enter-sound'), btnSilent = $('xp-enter-silent');
if (btnSound) btnSound.addEventListener('click', () => start(true));
if (btnSilent) btnSilent.addEventListener('click', () => start(false));
if (soundBtn) soundBtn.addEventListener('click', () => {
  const unmuting = !SND.on;
  if (unmuting) {
    audioInit(); // no-op if already created
    if (SND.ctx && SND.ctx.state === 'suspended') SND.ctx.resume();
  }
  setMuted(!unmuting);
});

/* fake-but-honest loading: scene is procedural, so fill fast once the first frame renders */
let firstFrame = false;
function markLoaded() {
  let p = 0;
  const iv = setInterval(() => {
    p = Math.min(100, p + 18 + Math.random() * 18);
    if (loadingPct) loadingPct.textContent = String(Math.floor(p));
    if (p >= 100) { clearInterval(iv); if (loadingEl) loadingEl.classList.add('is-ready'); }
  }, 70);
}

/* ---------- custom cursor (fine pointers; page has no main.js) ---------- */
if (FINE) {
  const cur = $('cursor');
  if (cur) {
    document.body.classList.add('has-cursor');
    const dot = cur.querySelector('.cursor__dot'), ring = cur.querySelector('.cursor__ring');
    let rx = 0, ry = 0;
    window.addEventListener('mousemove', (e) => {
      if (dot) dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      cur.dataset.x = e.clientX; cur.dataset.y = e.clientY;
    }, { passive: true });
    (function ringLoop() {
      requestAnimationFrame(ringLoop);
      const tx = +cur.dataset.x || 0, ty = +cur.dataset.y || 0;
      rx += (tx - rx) * 0.16; ry += (ty - ry) * 0.16;
      if (ring) ring.style.transform = `translate(${rx}px, ${ry}px)`;
    })();
  }
}

/* ---------- resize / visibility ---------- */
function resize() {
  // Guard against a 0-size viewport (backgrounded/restored tabs report 0×0):
  // 0/0 aspect is NaN and 0×0 bloom targets are invalid — clamp to 1px and
  // recover on the next real resize event.
  const w = Math.max(1, canvas.clientWidth || window.innerWidth);
  const h = Math.max(1, canvas.clientHeight || window.innerHeight);
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
resize();
window.addEventListener('resize', resize, { passive: true });
let tabVisible = !document.hidden;
document.addEventListener('visibilitychange', () => { tabVisible = !document.hidden; });

/* ---------- main loop ---------- */
const clock = new THREE.Clock();
const _v = new THREE.Vector3();
let t = 0;

function frame() {
  requestAnimationFrame(frame);
  if (!tabVisible) return;
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;

  /* tweens */
  for (let i = anims.length - 1; i >= 0; i--) {
    const a = anims[i]; a.t += dt;
    const k = Math.min(1, a.t / a.dur);
    a.fn(a.ease(k));
    if (k >= 1) { anims.splice(i, 1); if (a.done) a.done(); }
  }

  /* stage mechanics */
  if (started && !advancing && !finished && !RM) {
    if (stage === 1 && isHolding()) { // roots: hold to grow
      stageP = Math.min(1, stageP + dt / 2.6);
      const upto = Math.floor(stageP * ROOTS.length);
      ROOTS.forEach((r, i) => {
        if (i < upto && r.scale.x < 1) r.scale.setScalar(Math.min(1, r.scale.x + dt * 3));
      });
      if (stageP >= 1) completeStage();
    }
    if (stage === 3) { // sun: hold to shine
      sunP += (Math.min(1, stageP) - sunP) * (1 - Math.exp(-dt * 6)); // sunrise visual follows progress
      if (isHolding()) {
        stageP = Math.min(1, stageP + dt / 2.6);
        if (stageP >= 1) completeStage();
      }
    }
    if (stage === 4) { // wind: swipe power → spores carried to new plots
      stageP = Math.min(1, sporesLanded / 6);
      if (windPower > 0.3 && sporesSent < 6) {
        const s = SPORES[sporesSent];
        if (!s.active) {
          sporesSent++;
          s.active = true; s.t = 0; s.plot = sporesSent % 2;
          s.from.set((Math.random() - 0.5) * 0.8, 2 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6);
          s.to.copy(PLOTS[s.plot].pos).setY(0.15);
          s.ctrl.copy(s.from).lerp(s.to, 0.5).setY(2.8 + Math.random());
          s.mesh.visible = true;
          windPower *= 0.45; // spend the gust
        }
      }
      if (holdKey) windPower = Math.min(1, windPower + dt * 0.5); // keyboard-only auto wind
      if (sporesLanded >= 6) { stageP = 1; completeStage(); }
    }
    syncHud(); // keep the progress bar live during hold/wind accrual
  }

  /* wind visuals + decay (any stage, adds life) */
  windPower = Math.max(0, windPower - dt * (stage === 4 ? 0.35 : 1.2));
  windMat.opacity = windPower * 0.55;
  if (windPower > 0.01) {
    for (let i = 0; i < WIND_N; i++) {
      windPos[i * 3] += (2.5 + windPower * 5) * dt;
      windPos[i * 3 + 1] += Math.sin(t * 3 + windSeed[i]) * dt * 0.4;
      if (windPos[i * 3] > 6.5) windPos[i * 3] = -6.5;
    }
    windGeo.attributes.position.needsUpdate = true;
  }
  if (SND.windGain) SND.windGain.gain.value = SND.on ? windPower * 0.35 : 0;
  // tree lean in wind
  tree.rotation.z = -windPower * 0.16 + Math.sin(t * 1.1) * 0.008;

  /* spores flight */
  for (const s of SPORES) {
    if (!s.active) continue;
    s.t += dt / 1.25;
    const k = Math.min(1, s.t), ik = 1 - k;
    s.mesh.position.set(
      ik * ik * s.from.x + 2 * ik * k * s.ctrl.x + k * k * s.to.x,
      ik * ik * s.from.y + 2 * ik * k * s.ctrl.y + k * k * s.to.y,
      ik * ik * s.from.z + 2 * ik * k * s.ctrl.z + k * k * s.to.z
    );
    if (k >= 1) {
      s.active = false; s.mesh.visible = false;
      sporesLanded++;
      spawnBurst(s.to, 10, 0.8); plink();
      const pl = PLOTS[s.plot];
      if (!pl.grown && sporesLanded >= 3) { pl.grown = true; popIn(pl.sprout, 1, 0.7); }
    }
  }

  /* rain */
  let landed = 0;
  let anyRain = false;
  for (let i = 0; i < RAIN_N; i++) {
    if (rainVel[i] === 0) continue;
    anyRain = true;
    rainPos[i * 3 + 1] -= rainVel[i] * dt;
    if (rainPos[i * 3 + 1] <= 0.04) {
      rainVel[i] = 0; rainPos[i * 3 + 1] = -100;
      landed++;
    }
  }
  if (anyRain) rainGeo.attributes.position.needsUpdate = true;
  if (landed && stage === 2 && !advancing) {
    dropsLanded += landed;
    if (dropsLanded % 3 === 0) plink();
    stageP = Math.min(1, dropsLanded / 110);
    // trunk creeps up as it drinks
    trunk.visible = true;
    trunk.scale.y = Math.max(trunk.scale.y, 0.34 + stageP * 0.3);
    syncHud();
    if (stageP >= 1) completeStage();
  }
  if (cloud.visible) cloud.position.x = 0.2 + Math.sin(t * 0.6) * 0.35;

  /* sun rise/shine */
  if (sun.visible) {
    const p = stage === 3 ? Math.max(stageP, sunP) : sunP;
    sun.position.set(5.5 - p * 2.2, 0.2 + p * 4.1, -4 + p * 1.2);
    sunLight.intensity = 0.25 + p * 1.15;
    sunLight.position.copy(sun.position);
    beam.position.copy(sun.position).lerp(_v.set(0, 1.6, 0), 0.5);
    beam.lookAt(0, 1.4, 0); beam.rotateX(-Math.PI / 2);
    beam.material.opacity = (isHolding() && stage === 3 ? 0.16 : 0.06) * p;
    skyCol.copy(C.bg0).lerp(C.bgSun, p * 0.85);
    renderer.setClearColor(skyCol, 1);
    scene.fog.color.copy(skyCol); // fog follows the sky so the horizon has no seam
  }

  /* bursts physics */
  let anyBurst = false;
  for (let i = 0; i < BURST_N; i++) {
    if (bLife[i] <= 0) continue;
    anyBurst = true;
    bLife[i] -= dt;
    bVel[i * 3 + 1] -= dt * 2.6;
    bPos[i * 3] += bVel[i * 3] * dt;
    bPos[i * 3 + 1] += bVel[i * 3 + 1] * dt;
    bPos[i * 3 + 2] += bVel[i * 3 + 2] * dt;
    if (bLife[i] <= 0) bPos[i * 3 + 1] = -100;
  }
  if (anyBurst) bGeo.attributes.position.needsUpdate = true;

  /* fruits idle pulse (only once each has finished its pop-in tween) */
  if (stage === 5) {
    FRUITS.forEach((f, i) => {
      if (f.userData.alive && f.userData.settled) {
        const s = 1 + Math.sin(t * 3 + i) * 0.07;
        f.scale.setScalar(s);
        f.position.y = f.userData.baseY + Math.sin(t * 1.6 + i * 2) * 0.03;
      }
    });
  }

  /* gate idle orbit or stage camera */
  if (!started) {
    const a = t * 0.12;
    camPosT.set(Math.sin(a) * 7, 2.6, Math.cos(a) * 7);
    camLookT.set(0, 0.9, 0);
  }
  const ease = RM ? 1 : 1 - Math.exp(-dt * 3.4); // frame-rate-independent glide
  camPos.lerp(camPosT, ease); camLook.lerp(camLookT, ease);
  camera.position.copy(camPos);
  if (FINE && !RM) {
    camera.position.x += pointerPar.x * 0.18;
    camera.position.y += -pointerPar.y * 0.12;
  }
  camera.lookAt(camLook);

  /* fireflies drift */
  for (let i = 0; i < FLY_N; i++) {
    flyPos[i * 3 + 1] += Math.sin(t * 0.8 + flySeed[i]) * dt * 0.12;
  }
  flyGeo.attributes.position.needsUpdate = true;

  composer.render();

  if (!firstFrame) { firstFrame = true; markLoaded(); }
}
frame();

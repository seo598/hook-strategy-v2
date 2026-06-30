/* =====================================================================
   HOOK STRATEGY — Interaction layer
   Lenis smooth scroll · custom cursor · magnetic buttons · scroll reveals
   · word-by-word statement · animated counters · nav · menu · form.
   GSAP + Lenis loaded from CDN with graceful fallbacks (content always
   becomes visible even if a CDN fails).
   ===================================================================== */

const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ---------- dynamic CDN imports (resilient) ---------- */
let gsap = null, ScrollTrigger = null, Lenis = null;
// Fetch all three CDN modules concurrently (was 3 sequential round-trips that
// blocked every interaction below until each resolved in turn). Each failure is
// isolated so a single CDN hiccup still leaves the others usable.
const [gsapMod, stMod, lenisMod] = await Promise.all([
  import('https://esm.sh/gsap@3.12.5').catch((e) => { console.warn('GSAP unavailable, using fallback motion', e); return null; }),
  import('https://esm.sh/gsap@3.12.5/ScrollTrigger').catch(() => null),
  import('https://esm.sh/lenis@1.1.14').catch((e) => { console.warn('Lenis unavailable, native scroll', e); return null; }),
]);
if (gsapMod) gsap = gsapMod.gsap || gsapMod.default;
if (stMod) ScrollTrigger = stMod.ScrollTrigger || stMod.default;
if (gsap && ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
if (lenisMod) Lenis = lenisMod.default || lenisMod.Lenis;

// Set the hidden start for split-title words via GSAP itself (not CSS) so no
// stale px transform is parsed. Done immediately — the preloader covers it.
if (gsap && !RM) gsap.set('.hero__title .word, .contact__title .word', { yPercent: 110 });

/* ---------- preloader ---------- */
(function preloader() {
  const el = document.getElementById('preloader');
  const fill = document.getElementById('preloader-fill');
  const count = document.getElementById('preloader-count');
  if (!el) return;
  let p = 0;
  const tick = setInterval(() => {
    p = Math.min(100, p + Math.random() * 18);
    if (fill) fill.style.width = p + '%';
    if (count) count.textContent = Math.floor(p);
    if (p >= 100) {
      clearInterval(tick);
      setTimeout(() => { el.classList.add('is-done'); startIntro(); }, 250);
    }
  }, 120);
})();

/* ---------- Lenis smooth scroll ---------- */
let lenis = null;
if (Lenis && !RM) {
  lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
  if (gsap && ScrollTrigger) {
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  } else {
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }
  document.documentElement.classList.add('lenis');
}

/* smooth anchor scrolling */
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (id.length < 2) return;
    const t = document.querySelector(id);
    if (!t) return;
    e.preventDefault();
    closeMenu();
    if (lenis) lenis.scrollTo(t, { offset: -20, duration: 1.3 });
    else t.scrollIntoView({ behavior: RM ? 'auto' : 'smooth' });
  });
});

/* ---------- intro (hero title) ---------- */
function startIntro() {
  const words = document.querySelectorAll('.hero__title .word');
  if (gsap && !RM) {
    gsap.to('.hero__title .word', { yPercent: 0, duration: 1.1, ease: 'power4.out', stagger: 0.08, delay: 0.1 });
    gsap.to('.hero .reveal-up', { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.12, delay: 0.5 });
  } else {
    words.forEach((w) => { w.style.transform = 'none'; w.style.transition = 'transform .9s cubic-bezier(.22,1,.36,1)'; });
    document.querySelectorAll('.hero .reveal-up').forEach((el) => el.classList.add('is-in'));
  }
}

/* ---------- scroll reveals (IntersectionObserver — CDN-independent) ---------- */
(function reveals() {
  const els = [...document.querySelectorAll('.reveal-up:not(.hero .reveal-up)')];
  if (RM) { els.forEach((e) => e.classList.add('is-in')); return; }
  const reveal = (el) => {
    if (el.classList.contains('is-in')) return;
    const sibs = [...el.parentElement.querySelectorAll('.reveal-up')];
    const idx = Math.max(0, sibs.indexOf(el));
    el.style.transitionDelay = Math.min(idx, 6) * 0.06 + 's';
    el.classList.add('is-in');
  };
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { reveal(en.target); io.unobserve(en.target); } });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });
  els.forEach((e) => io.observe(e));

  // Safety net: an IntersectionObserver can miss an element that is scrolled past
  // between samples (fast scroll, or a throttled background tab) — it then stays
  // at opacity:0 forever, which is what was hiding the section titles. Sweep on
  // scroll (rAF-coalesced), on load, and once after settle: anything whose top has
  // entered the viewport is revealed even if the observer never fired for it.
  let scheduled = false;
  const sweep = () => {
    scheduled = false;
    const limit = window.innerHeight * 0.9;
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i];
      if (el.classList.contains('is-in')) { els.splice(i, 1); continue; }
      if (el.getBoundingClientRect().top < limit) { reveal(el); io.unobserve(el); els.splice(i, 1); }
    }
  };
  const onScroll = () => { if (scheduled) return; scheduled = true; requestAnimationFrame(sweep); };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('load', sweep);
  setTimeout(sweep, 800);
})();

/* ---------- contact title words ---------- */
(function contactTitle() {
  const words = document.querySelectorAll('.contact__title .word');
  if (!words.length) return;
  if (RM) { words.forEach((w) => w.style.transform = 'none'); return; }
  const io = new IntersectionObserver(([en]) => {
    if (en.isIntersecting) {
      if (gsap) gsap.to('.contact__title .word', { yPercent: 0, duration: 1, ease: 'power4.out', stagger: 0.07 });
      else words.forEach((w, i) => { w.style.transition = `transform .9s ${0.06*i}s cubic-bezier(.22,1,.36,1)`; w.style.transform = 'none'; });
      io.disconnect();
    }
  }, { threshold: 0.4 });
  io.observe(document.querySelector('.contact__title'));
})();

/* ---------- statement: word-by-word light up ---------- */
(function statement() {
  const el = document.querySelector('[data-stagger-words]');
  if (!el) return;
  const words = el.textContent.trim().split(/\s+/);
  el.innerHTML = words.map((w) => `<span class="w">${w}</span>`).join(' ');
  if (RM) { el.querySelectorAll('.w').forEach((w) => w.classList.add('is-lit')); return; }
  const spans = [...el.querySelectorAll('.w')];
  const apply = () => {
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const prog = (vh - r.top) / (vh * 0.5 + r.height);
    const lit = Math.floor(prog * spans.length);
    spans.forEach((s, i) => s.classList.toggle('is-lit', i < lit));
  };
  // coalesce a burst of scroll/resize events into one layout read per frame
  let scheduled = false;
  const update = () => { if (scheduled) return; scheduled = true; requestAnimationFrame(() => { scheduled = false; apply(); }); };
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update, { passive: true }); apply();
})();

/* ---------- animated counters ---------- */
(function counters() {
  // exclude the case-explorer metrics — the switcher animates those itself
  const stats = [...document.querySelectorAll('[data-count]')].filter((el) => !el.closest('[data-cases]'));
  const run = (el) => {
    const raw = el.dataset.count;
    const end = parseFloat(raw);
    const dec = /\./.test(raw) ? 1 : 0;
    const pre = el.dataset.prefix || '';
    const suf = el.dataset.suffix || '';
    const fmt = (v) => dec ? v.toFixed(1) : String(Math.round(v));
    if (RM) { el.textContent = pre + fmt(end) + suf; return; }
    const dur = 1800; const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = pre + fmt(end * e) + suf;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver((ents) => {
    ents.forEach((en) => { if (en.isIntersecting) { run(en.target); io.unobserve(en.target); } });
  }, { threshold: 0.6 });
  stats.forEach((s) => io.observe(s));
})();

/* ---------- custom cursor ---------- */
if (FINE && !RM) {
  document.body.classList.add('has-cursor');
  const cur = document.getElementById('cursor');
  const dot = cur.querySelector('.cursor__dot');
  const ring = cur.querySelector('.cursor__ring');
  const label = cur.querySelector('.cursor__label');
  let mx = innerWidth/2, my = innerHeight/2, rx = mx, ry = my;
  window.addEventListener('mousemove', (e) => {
    mx = e.clientX; my = e.clientY;
    dot.style.transform = `translate(${mx}px,${my}px) translate(-50%,-50%)`;
    label.style.transform = `translate(${mx}px,${my}px) translate(-50%,-50%)`;
  }, { passive: true });
  const loop = () => { rx += (mx-rx)*0.18; ry += (my-ry)*0.18; ring.style.transform = `translate(${rx}px,${ry}px) translate(-50%,-50%)`; requestAnimationFrame(loop); };
  loop();
  document.querySelectorAll('[data-cursor]').forEach((el) => {
    const type = el.dataset.cursor;
    el.addEventListener('mouseenter', () => {
      cur.classList.toggle('is-hover', type === 'hover');
      cur.classList.toggle('is-view', type === 'view');
      if (type === 'view') label.textContent = 'View';
    });
    el.addEventListener('mouseleave', () => { cur.classList.remove('is-hover','is-view'); label.textContent = ''; });
  });
}

/* ---------- magnetic buttons ---------- */
if (FINE && !RM) {
  document.querySelectorAll('[data-magnetic]').forEach((el) => {
    const strength = 0.4;
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width/2) * strength;
      const y = (e.clientY - r.top - r.height/2) * strength;
      el.style.transform = `translate(${x}px,${y}px)`;
    });
    el.addEventListener('mouseleave', () => { el.style.transform = ''; });
  });
}

/* ---------- card tilt + pointer glow ---------- */
if (FINE && !RM) {
  document.querySelectorAll('[data-tilt]').forEach((el) => {
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      el.style.transform = `perspective(900px) rotateY(${(px-0.5)*8}deg) rotateX(${(0.5-py)*8}deg) translateY(-4px)`;
      el.style.setProperty('--mx', px*100 + '%');
      el.style.setProperty('--my', py*100 + '%');
    });
    el.addEventListener('mouseleave', () => { el.style.transform = ''; });
  });
}

/* ---------- nav behaviour ---------- */
(function nav() {
  const nav = document.getElementById('nav');
  let last = 0, scheduled = false;
  const apply = () => {
    const y = window.scrollY;
    nav.classList.toggle('is-scrolled', y > 40);
    if (!document.body.classList.contains('menu-open')) {
      nav.classList.toggle('is-hidden', y > last && y > 300);
    }
    last = y;
  };
  const onScroll = () => { if (scheduled) return; scheduled = true; requestAnimationFrame(() => { scheduled = false; apply(); }); };
  window.addEventListener('scroll', onScroll, { passive: true });
})();

/* ---------- mobile menu ---------- */
const burger = document.getElementById('burger');
const menu = document.getElementById('menu');
function closeMenu() {
  document.body.classList.remove('menu-open');
  if (burger) burger.setAttribute('aria-expanded', 'false');
  if (menu) menu.setAttribute('aria-hidden', 'true');
  if (lenis) lenis.start();
}
if (burger) {
  burger.addEventListener('click', () => {
    const open = document.body.classList.toggle('menu-open');
    burger.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-hidden', String(!open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    if (lenis) open ? lenis.stop() : lenis.start();
  });
}

/* ---------- scroll progress bar ---------- */
(function progress() {
  const fill = document.getElementById('scroll-fill');
  if (!fill) return;
  let scheduled = false;
  const apply = () => {
    const h = document.documentElement.scrollHeight - innerHeight;
    fill.style.width = (h > 0 ? (scrollY / h) * 100 : 0) + '%';
  };
  const onScroll = () => { if (scheduled) return; scheduled = true; requestAnimationFrame(() => { scheduled = false; apply(); }); };
  window.addEventListener('scroll', onScroll, { passive: true }); apply();
})();

/* ---------- contact form (front-end demo) ---------- */
(function form() {
  const f = document.getElementById('contact-form');
  if (!f) return;
  const status = document.getElementById('contact-status');
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!f.checkValidity()) { status.textContent = 'Please fill in every field.'; status.style.color = '#FCCC00'; f.reportValidity(); return; }
    status.style.color = ''; status.textContent = 'Sending…';
    setTimeout(() => { status.textContent = "Got it — we'll be in touch within one business day."; f.reset(); }, 700);
  });
})();

/* ---------- live market chart: grow bars when in view ---------- */
(function market() {
  const m = document.querySelector('.market');
  if (!m) return;
  if (RM) { m.classList.add('is-shown'); return; }
  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { m.classList.add('is-shown'); io.disconnect(); }
  }, { threshold: 0.25 });
  io.observe(m);
})();

/* ---------- team → services deep-link ---------- */
(function deepLinkServices() {
  const links = document.querySelectorAll('[data-svc]');
  if (!links.length) return;
  links.forEach((b) => {
    b.addEventListener('click', () => {
      const ids = (b.dataset.svc || '').split(/\s+/).filter(Boolean);
      const first = ids[0] && document.getElementById(ids[0]);
      if (first) {
        if (lenis) lenis.scrollTo(first, { offset: -110, duration: 1.2 });
        else first.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'center' });
      }
      setTimeout(() => ids.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.add('is-flash');
        setTimeout(() => el.classList.remove('is-flash'), 2200);
      }), RM ? 0 : 520);
    });
  });
})();

/* ---------- Featured work: filter by service + capped "show all" ---------- */
(function workFilter() {
  const chips = [...document.querySelectorAll('.work__filter')];
  const cards = [...document.querySelectorAll('.work__grid .work-card')];
  const moreBtn = document.querySelector('[data-work-more]');
  if (!cards.length) return;
  // homepage caps to a handful; a dedicated work page sets data-cap="all" to show everything
  const capAttr = document.querySelector('.work__filters')?.dataset.cap;
  const CAP = capAttr === 'all' ? Infinity : (capAttr ? +capAttr : 4);
  let filter = 'all', expanded = false;

  const render = () => {
    const replay = [];
    let shown = 0;
    cards.forEach((card) => {
      const matches = filter === 'all' || (card.dataset.tags || '').split(/\s+/).includes(filter);
      // the cap only trims the unfiltered, un-expanded view; filtering shows every match
      const capped = filter === 'all' && !expanded && shown >= CAP;
      if (matches) shown++;
      const show = matches && !capped;
      const was = !card.classList.contains('is-hidden');
      card.classList.toggle('is-hidden', !show);
      if (show && !was && !RM) { card.style.animation = 'none'; replay.push(card); }
    });
    if (replay.length) { void document.body.offsetWidth; replay.forEach((c) => { c.style.animation = ''; }); }
    if (moreBtn) {
      moreBtn.hidden = !(filter === 'all' && cards.length > CAP);
      const lbl = moreBtn.querySelector('span');
      if (lbl) lbl.textContent = expanded ? 'Show fewer' : `Show all work (${cards.length})`;
    }
  };

  chips.forEach((chip) => chip.addEventListener('click', () => {
    filter = chip.dataset.filter;
    chips.forEach((c) => { const on = c === chip; c.classList.toggle('is-active', on); c.setAttribute('aria-pressed', String(on)); });
    render();
  }));
  if (moreBtn) moreBtn.addEventListener('click', () => { expanded = !expanded; render(); });
  render();
})();

/* ---------- "Book a strategy call" → scroll to contact + pre-fill ---------- */
(function bookCall() {
  document.querySelectorAll('[data-prefill="strategy-call"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const msg = document.getElementById('message');
      if (msg && !msg.value.trim()) {
        msg.value = "I'd like to book a free 30-minute strategy call. Here's a bit about my brand and what I'm trying to grow:\n\n";
      }
      const status = document.getElementById('contact-status');
      if (status) status.textContent = '';
      setTimeout(() => { const name = document.getElementById('name'); if (name) name.focus({ preventScroll: true }); }, RM ? 0 : 950);
    });
  });
})();

/* ---------- pinned, scroll-scrubbed Process ---------- */
(function pinnedProcess() {
  const track = document.querySelector('[data-process]');
  if (!track || !gsap || !ScrollTrigger || RM) return;
  if (!window.matchMedia('(min-width: 769px)').matches) return; // mobile keeps the simple stack
  const section = track.closest('.process');
  const steps = [...track.querySelectorAll('.process-step')];
  const fill = track.querySelector('.process__rail-fill');
  if (!section || !steps.length) return;
  track.classList.add('is-pinned');

  const setActive = (p) => {
    if (fill) fill.style.transform = `scaleX(${Math.max(0, Math.min(1, p))})`;
    const reach = p * (steps.length + 0.35);
    steps.forEach((s, i) => s.classList.toggle('is-active', reach > i + 0.12));
  };
  setActive(0);

  ScrollTrigger.create({
    trigger: section,
    start: 'top top+=6%',
    end: '+=130%',
    pin: true,
    pinSpacing: true,
    scrub: 0.5,
    onUpdate: (self) => setActive(self.progress),
    onLeaveBack: () => setActive(0),
  });
  // Lenis + pinning need a layout recalc once everything has settled
  window.addEventListener('load', () => ScrollTrigger.refresh());
})();

/* ---------- page-transition curtain (multi-page wipe) ---------- */
(function pageCurtain() {
  if (RM) return;
  const curtain = document.createElement('div');
  curtain.className = 'page-curtain';
  curtain.setAttribute('aria-hidden', 'true');
  curtain.innerHTML = '<span class="page-curtain__mark">HOOK</span>';
  document.body.appendChild(curtain);

  // reveal-on-load for sub-pages; the homepage already has its own preloader.
  // Drive it with inline styles only (an inline transform would otherwise beat
  // the .is-reveal class and leave the curtain stuck covering the page).
  if (!document.getElementById('preloader')) {
    curtain.style.transition = 'none';
    curtain.style.transform = 'translateY(0)'; // cover instantly, no animation
    const clear = () => { curtain.style.transition = ''; curtain.style.transform = ''; };
    requestAnimationFrame(() => requestAnimationFrame(() => {
      curtain.style.transition = 'transform 0.6s cubic-bezier(0.7,0,0.3,1)';
      curtain.style.transform = 'translateY(-100%)'; // lift away to reveal the page
      curtain.addEventListener('transitionend', clear, { once: true });
      setTimeout(clear, 900); // fallback if the tab was throttled and transitionend never fired
    }));
  }

  const isInternalPage = (a) => {
    const href = a.getAttribute('href') || '';
    if (!href || href[0] === '#' || /^(mailto:|tel:)/.test(href)) return false;
    if (a.target === '_blank' || a.hasAttribute('download')) return false;
    try {
      const u = new URL(href, location.href);
      return u.origin === location.origin && /\.html?($|[?#])/.test(u.pathname + u.search);
    } catch (e) { return false; }
  };

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || !isInternalPage(a)) return;
    const dest = a.href;
    if (dest === location.href) return;
    e.preventDefault();
    curtain.classList.add('is-cover');
    setTimeout(() => { window.location.href = dest; }, 560);
  });

  // if the user returns via the back/forward cache, clear any stuck curtain
  window.addEventListener('pageshow', (ev) => {
    if (ev.persisted) { curtain.classList.remove('is-cover', 'is-reveal'); curtain.style.transform = ''; }
  });
})();

/* ---------- interactive case-study explorer ---------- */
(function caseExplorer() {
  const root = document.querySelector('[data-cases]');
  if (!root) return;
  const tabs = [...root.querySelectorAll('.cases__nav-btn')];
  const stages = [...root.querySelectorAll('.cases__stage')];
  if (!tabs.length || !stages.length) return;

  // Show a handful of clients by default; the rest open via the toggle.
  const moreBtn = root.querySelector('[data-cases-more]');
  const CAP = 4;
  let expanded = false;
  const renderTabs = () => {
    tabs.forEach((t, i) => { t.hidden = !(expanded || i < CAP || t.classList.contains('is-active')); });
    if (moreBtn) {
      moreBtn.hidden = tabs.length <= CAP;
      const lbl = moreBtn.querySelector('span');
      if (lbl) lbl.textContent = expanded ? 'Show fewer' : `Show All Case Studies (${tabs.length})`;
    }
  };

  const animateMetrics = (stage) => {
    stage.querySelectorAll('.cases__metric-num').forEach((el) => {
      const raw = el.dataset.count;
      if (raw === undefined) return; // static (non-numeric) highlight — leave as-is
      const end = parseFloat(raw);
      const dec = /\./.test(raw) ? 1 : 0;
      const pre = el.dataset.prefix || '';
      const suf = el.dataset.suffix || '';
      const fmt = (v) => (dec ? v.toFixed(1) : String(Math.round(v)));
      if (RM) { el.textContent = pre + fmt(end) + suf; return; }
      const dur = 1100, t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = pre + fmt(end * e) + suf;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  };

  const show = (key, focus) => {
    tabs.forEach((t) => {
      const on = t.dataset.case === key;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    stages.forEach((s) => {
      const on = s.dataset.case === key;
      s.hidden = !on;
      s.classList.toggle('is-active', on);
      if (on) animateMetrics(s);
    });
    renderTabs(); // keep the just-activated client visible even when collapsed
  };

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t.dataset.case));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const dir = (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : -1;
      const next = tabs[(i + dir + tabs.length) % tabs.length];
      show(next.dataset.case, true);
    });
  });

  if (moreBtn) moreBtn.addEventListener('click', () => { expanded = !expanded; renderTabs(); });
  renderTabs();

  // animate the first stage's metrics once the explorer scrolls into view
  if (RM) { const a = stages.find((s) => !s.hidden); if (a) animateMetrics(a); return; }
  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { const a = stages.find((s) => !s.hidden); if (a) animateMetrics(a); io.disconnect(); }
  }, { threshold: 0.25 });
  io.observe(root);
})();

/* ---------- tech stack: filter by discipline ---------- */
(function techFilter() {
  const root = document.querySelector('[data-tech]');
  if (!root) return;
  const chips = [...root.querySelectorAll('.tech__filter')];
  const items = [...root.querySelectorAll('.tech__item')];
  const empty = root.querySelector('.tech__empty');
  if (!chips.length || !items.length) return;

  // Counts derive from the DOM, so the stack can be extended just by adding
  // <li class="tech__item" data-cat="…"> tiles (and a chip for a new discipline).
  const countEl = document.querySelector('#tech .tech__count [data-count]');
  if (countEl) countEl.dataset.count = String(items.length);
  const discEl = document.querySelector('#tech [data-disciplines]');
  if (discEl) discEl.textContent = String(chips.filter((c) => c.dataset.filter !== 'all').length);

  const LIMIT = 12;                       // tiles shown before "Show all" in the All view
  const moreBtn = root.querySelector('.tech__more');
  const moreLabel = moreBtn ? moreBtn.querySelector('span') : null;
  let filter = 'all';
  let expanded = false;

  const apply = () => {
    let shown = 0, matched = 0; const replay = [];
    items.forEach((it) => {
      const inFilter = filter === 'all' || it.dataset.cat === filter;
      let show = inFilter;
      if (inFilter) { matched++; if (filter === 'all' && !expanded && matched > LIMIT) show = false; }
      it.classList.toggle('is-hidden', !show);
      if (show) { shown++; if (!RM) { it.style.animation = 'none'; replay.push(it); } }
    });
    if (replay.length) { void document.body.offsetWidth; replay.forEach((it) => { it.style.animation = ''; }); }
    if (empty) empty.hidden = shown > 0;
    if (moreBtn) {
      const need = filter === 'all' && items.length > LIMIT;
      moreBtn.hidden = !need;
      moreBtn.setAttribute('aria-expanded', String(expanded));
      if (moreLabel) moreLabel.textContent = expanded ? 'Show fewer' : ('Show all ' + items.length + ' tools');
    }
  };

  chips.forEach((chip) => chip.addEventListener('click', () => {
    filter = chip.dataset.filter;
    expanded = false;                      // collapse again when switching discipline
    chips.forEach((c) => { const on = c === chip; c.classList.toggle('is-active', on); c.setAttribute('aria-pressed', String(on)); });
    apply();
  }));
  if (moreBtn) moreBtn.addEventListener('click', () => { expanded = !expanded; apply(); });
  apply();                                 // start collapsed
})();

/* ---------- journal: topic filter + inline read toggle ---------- */
(function journal() {
  const root = document.querySelector('[data-jr]');
  if (!root) return;
  const chips = [...root.querySelectorAll('[data-jr-filter]')];
  const items = [...root.querySelectorAll('[data-jr-cat]')];
  chips.forEach((chip) => chip.addEventListener('click', () => {
    const f = chip.dataset.jrFilter;
    chips.forEach((c) => { const on = c === chip; c.classList.toggle('is-active', on); c.setAttribute('aria-pressed', String(on)); });
    items.forEach((it) => it.classList.toggle('is-hidden', !(f === 'all' || it.dataset.jrCat === f)));
  }));
  root.querySelectorAll('.post__more').forEach((btn) => {
    const body = btn.parentElement.querySelector('.post__body');
    if (!body) return;
    btn.addEventListener('click', () => {
      const open = body.hasAttribute('hidden');
      body.toggleAttribute('hidden', !open);
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Close ✕' : 'Read →';
    });
  });
})();

/* ---------- industries: cursor-follow visual + spotlight ---------- */
(function industries() {
  const root = document.querySelector('[data-ind]');
  if (!root) return;
  const rows = [...root.querySelectorAll('.ind__row')];
  const reveal = root.querySelector('.ind__reveal');
  const cards = [...root.querySelectorAll('.ind__card')];
  if (!reveal || !rows.length || !FINE || RM) return; // touch/RM: static list with tags

  let tx = 0, ty = 0, cx = 0, cy = 0, shown = false;
  root.addEventListener('pointermove', (e) => {
    const r = root.getBoundingClientRect();
    tx = e.clientX - r.left;
    ty = e.clientY - r.top;
  }, { passive: true });

  const loop = () => {
    cx += (tx - cx) * 0.16;
    cy += (ty - cy) * 0.16;
    reveal.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%) scale(${shown ? 1 : 0.6})`;
    requestAnimationFrame(loop);
  };
  loop();

  rows.forEach((row, i) => {
    row.addEventListener('pointerenter', () => {
      shown = true;
      reveal.classList.add('is-shown');
      root.classList.add('is-hovering');
      cards.forEach((c, k) => c.classList.toggle('is-active', k === i));
      rows.forEach((r, k) => r.classList.toggle('is-dim', k !== i));
    });
  });
  root.addEventListener('pointerleave', () => {
    shown = false;
    reveal.classList.remove('is-shown');
    root.classList.remove('is-hovering');
    rows.forEach((r) => r.classList.remove('is-dim'));
  });
})();

/* ---------- team avatars: Photo ⇄ Cartoon toggle ---------- */
(function avatarToggle() {
  const tg = document.querySelector('[data-tm-toggle]');
  if (!tg) return;
  const btns = [...tg.querySelectorAll('.tm-toggle__btn')];
  const pill = tg.querySelector('.tm-toggle__pill');
  const imgs = [...document.querySelectorAll('.tm-av img')];
  if (!btns.length || !imgs.length) return;

  const movePill = (btn) => {
    if (!pill) return;
    pill.style.width = btn.offsetWidth + 'px';
    pill.style.transform = `translateX(${btn.offsetLeft - 4}px)`;
  };
  const setMode = (mode, btn) => {
    btns.forEach((b) => { const on = b === btn; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
    movePill(btn);
    imgs.forEach((img) => {
      const cur = img.getAttribute('src');
      const m = cur.match(/avatar-(?:toon-)?([a-z]+)\.jpg/i);
      if (!m) return;
      const q = (cur.match(/\?[^"]*$/) || [''])[0]; // carry the cache-bust query across toggles
      img.setAttribute('src', `assets/img/team/avatar-${mode === 'toon' ? 'toon-' : ''}${m[1]}.jpg${q}`);
    });
  };
  btns.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode, b)));

  const active = tg.querySelector('.tm-toggle__btn.is-active') || btns[0];
  requestAnimationFrame(() => movePill(active));
  window.addEventListener('resize', () => { const a = tg.querySelector('.tm-toggle__btn.is-active'); if (a) movePill(a); }, { passive: true });
})();

/* ---------- capabilities: 3D cursor tilt + service-family grouping ---------- */
(function capabilities() {
  const list = document.querySelector('[data-caps]');
  if (!list) return;
  const chips = [...list.querySelectorAll('.cap__chip')];
  if (!chips.length) return;
  const tilt = FINE && !RM;
  chips.forEach((chip) => {
    const svc = chip.dataset.svc;
    // hovering a discipline lights up every discipline that feeds the same service
    chip.addEventListener('pointerenter', () => {
      list.classList.add('is-hovering');
      chips.forEach((c) => {
        c.classList.toggle('is-on', c === chip);
        c.classList.toggle('is-related', c !== chip && c.dataset.svc === svc);
      });
    });
    if (tilt) {
      chip.addEventListener('pointermove', (e) => {
        const r = chip.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        chip.style.transform = `perspective(600px) rotateY(${px * 18}deg) rotateX(${-py * 18}deg) translateZ(16px)`;
      });
      chip.addEventListener('pointerleave', () => { chip.style.transform = ''; });
    }
  });
  list.addEventListener('pointerleave', () => {
    list.classList.remove('is-hovering');
    chips.forEach((c) => c.classList.remove('is-on', 'is-related'));
  });
})();

/* ---------- year ---------- */
const yr = document.getElementById('year');
if (yr) yr.textContent = new Date().getFullYear();

/* ═══════════════════════════════════════════════════════════════
   VoiceCalc AI — motion layer: number-universe hero, scroll progress,
   heading reveals, 3D tilt, magnetic buttons, card spotlight,
   video reel and film player. Everything honours prefers-reduced-motion.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // ---------- 1. Hero "number universe" (glyphs flying toward you, gold / white / cyan)
  const cvs = document.getElementById('heroCanvas');
  if (cvs) {
    const ctx = cvs.getContext('2d');
    const GLYPHS = '0123456789+−×÷=%√π'.split('');
    const COLORS = ['255,216,77', '255,216,77', '255,216,77', '255,255,255', '127,231,255'];
    let W = 0, H = 0, D = 1, parts = [], mx = 0, my = 0, tmx = 0, tmy = 0, visible = true, last = 0, warp = 0;
    const N = () => Math.round(Math.min(300, Math.max(120, (W * H) / (D * D) / 5200)));
    function spawn(p, far) {
      p.x = (Math.random() - 0.5) * 2.4; p.y = (Math.random() - 0.5) * 2.4; p.z = far ? 1 : 0.15 + Math.random() * 0.85;
      p.g = Math.random() < 0.7 ? GLYPHS[(Math.random() * GLYPHS.length) | 0] : '•'; p.c = COLORS[(Math.random() * COLORS.length) | 0];
      p.s = 0.6 + Math.random() * 0.9; return p;
    }
    function resize() {
      const r = cvs.getBoundingClientRect(); D = Math.min(2, window.devicePixelRatio || 1);
      W = cvs.width = Math.max(1, r.width * D); H = cvs.height = Math.max(1, r.height * D);
      const n = N(); parts = Array.from({ length: n }, () => spawn({}, false));
    }
    function frame(now) {
      const dt = Math.min(50, now - (last || now)); last = now;
      mx += (tmx - mx) * 0.05; my += (tmy - my) * 0.05; warp *= 0.94;
      ctx.clearRect(0, 0, W, H);
      const cx = W * (0.5 + mx * 0.04), cy = H * (0.45 + my * 0.04), f = Math.max(W, H) * 0.55;
      const speed = (0.00011 + warp * 0.0012) * dt;
      for (const p of parts) {
        const pz = p.z; p.z -= speed * p.s; if (p.z <= 0.02) { spawn(p, true); continue; }
        const sx = cx + (p.x / p.z) * f, sy = cy + (p.y / p.z) * f;
        if (sx < -50 || sx > W + 50 || sy < -50 || sy > H + 50) { spawn(p, true); continue; }
        const px = cx + (p.x / pz) * f, py = cy + (p.y / pz) * f;
        const a = Math.min(1, (1 - p.z) * 2.0) * 0.9;
        const size = Math.max(2, (1.15 - p.z) * 34 * D * p.s);
        if (p.g === '•') {
          ctx.strokeStyle = `rgba(${p.c},${a * 0.8})`; ctx.lineWidth = Math.max(1, size * 0.12); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(sx, sy); ctx.stroke();
        } else {
          ctx.font = `800 ${size}px Outfit, system-ui, sans-serif`; ctx.fillStyle = `rgba(${p.c},${a})`; ctx.fillText(p.g, sx, sy);
        }
      }
      if (visible && !reduced) requestAnimationFrame(frame);
    }
    resize(); window.addEventListener('resize', resize);
    if (finePointer) window.addEventListener('pointermove', (e) => { tmx = e.clientX / window.innerWidth - 0.5; tmy = e.clientY / window.innerHeight - 0.5; });
    window.addEventListener('scroll', () => { warp = Math.min(1, warp + 0.05); }, { passive: true });
    if (reduced) frame(performance.now());
    else new IntersectionObserver((es) => es.forEach((e) => { const was = visible; visible = e.isIntersecting; if (visible && !was) { last = 0; requestAnimationFrame(frame); } })).observe(cvs);
    if (!reduced) requestAnimationFrame(frame);
  }

  // ---------- 2. Scroll progress bar
  const bar = document.getElementById('scrollProgress');
  if (bar) {
    const upd = () => { const h = document.documentElement; const p = h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight); bar.style.transform = `scaleX(${p.toFixed(4)})`; };
    window.addEventListener('scroll', upd, { passive: true }); upd();
  }

  // ---------- 3. Heading word reveals
  document.querySelectorAll('.split-reveal').forEach((h) => {
    const walk = (node) => {
      [...node.childNodes].forEach((c) => {
        if (c.nodeType === 3) {
          const frag = document.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach((w) => { if (!w) return; if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(w)); return; } const s = document.createElement('span'); s.className = 'sw'; s.textContent = w; frag.appendChild(s); });
          c.replaceWith(frag);
        } else if (c.nodeType === 1 && /grad/.test(c.className)) {
          // gradient text must stay one element (background-clip: text), so it animates as one unit
          const s = document.createElement('span'); s.className = 'sw'; c.replaceWith(s); s.appendChild(c);
        } else if (c.nodeType === 1 && c.tagName !== 'BR') walk(c);
      });
    };
    walk(h);
    h.querySelectorAll('.sw').forEach((s, i) => { s.style.transitionDelay = `${i * 55}ms`; });
  });
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.25 });
    document.querySelectorAll('.split-reveal').forEach((h) => io.observe(h));
  } else document.querySelectorAll('.split-reveal').forEach((h) => h.classList.add('in'));

  // ---------- 4. 3D tilt, magnetic buttons, card spotlight (mouse / trackpad only)
  if (finePointer && !reduced) {
    document.querySelectorAll('[data-tilt]').forEach((el) => {
      const max = +(el.dataset.tilt || 8);
      el.addEventListener('pointermove', (e) => { const r = el.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; el.style.transform = `perspective(900px) rotateY(${(x * max).toFixed(2)}deg) rotateX(${(-y * max).toFixed(2)}deg)`; });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
    document.querySelectorAll('.btn-primary.btn-lg, .btn-primary.btn-md').forEach((b) => {
      b.addEventListener('pointermove', (e) => { const r = b.getBoundingClientRect(); const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2; b.style.transform = `translate(${(x * 0.18).toFixed(1)}px, ${(y * 0.25).toFixed(1)}px)`; });
      b.addEventListener('pointerleave', () => { b.style.transform = ''; });
    });
    document.querySelectorAll('.stat-card, .feature-card, .bento-card, .faq-card, .reel-card, .live-card').forEach((c) => {
      c.classList.add('spot');
      c.addEventListener('pointermove', (e) => { const r = c.getBoundingClientRect(); c.style.setProperty('--mx', `${e.clientX - r.left}px`); c.style.setProperty('--my', `${e.clientY - r.top}px`); });
    });
  }

  // ---------- 5. Video reel: play muted while on screen, tap for sound (one at a time)
  const reel = [...document.querySelectorAll('.reel-card video')];
  const loadSrc = (v) => { if (!v.src && v.dataset.src) { v.src = v.dataset.src; v.load(); } };
  if (reel.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      const v = e.target;
      if (e.isIntersecting && !reduced) { loadSrc(v); v.play().catch(() => {}); } else { v.pause(); }
    }), { threshold: 0.55 });
    reel.forEach((v) => io.observe(v));
  }
  document.querySelectorAll('.reel-card').forEach((card) => {
    const v = card.querySelector('video'), btn = card.querySelector('.reel-sound');
    const toggle = () => {
      loadSrc(v);
      const on = v.muted;
      reel.forEach((o) => { if (o !== v) { o.muted = true; o.closest('.reel-card').classList.remove('sound'); } });
      v.muted = !on; card.classList.toggle('sound', on);
      btn.setAttribute('aria-label', on ? 'Mute' : 'Turn sound on');
      if (on) { v.currentTime = 0; } v.play().catch(() => {});
    };
    const ph = card.querySelector('.reel-phone');
    ph.addEventListener('click', toggle);
    ph.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  });

  // ---------- 6. Film modal (landscape on wide screens, vertical on phones)
  const modal = document.getElementById('filmModal'), filmBtn = document.getElementById('filmBtn');
  if (modal && filmBtn) {
    const fv = modal.querySelector('video');
    const open = () => {
      const wide = window.innerWidth > window.innerHeight;
      const src = wide ? 'assets/video/film-16x9.mp4' : 'assets/video/film-9x16.mp4';
      modal.classList.toggle('tall', !wide);
      if (fv.dataset.cur !== src) { fv.src = src; fv.dataset.cur = src; }
      reel.forEach((o) => o.pause());
      modal.hidden = false; requestAnimationFrame(() => modal.classList.add('open'));
      fv.currentTime = 0; fv.play().catch(() => {}); modal.querySelector('.film-close').focus();
    };
    const close = () => { modal.classList.remove('open'); fv.pause(); setTimeout(() => { modal.hidden = true; }, 250); filmBtn.focus(); };
    filmBtn.addEventListener('click', open);
    modal.querySelector('.film-close').addEventListener('click', close);
    modal.querySelector('.film-backdrop').addEventListener('click', close);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });
  }
})();

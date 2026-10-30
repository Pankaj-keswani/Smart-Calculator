/* ═══════════════════════════════════════════════════════════════
   VoiceCalc AI — Live demo running the app's REAL calculation engine
   (js/engine.js is built from the app source by tools/web-engine).
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const root = document.getElementById('liveDemo');
  if (!root || !window.VoiceCalcEngine) return;
  const E = window.VoiceCalcEngine;
  const $ = (id) => document.getElementById(id);
  const form = $('liveForm'), input = $('liveInput'), mic = $('liveMic'), quote = $('liveQuote'), resultEl = $('liveResult'),
    exprEl = $('liveExpr'), msgEl = $('liveMsg'), totalChip = $('liveTotal'), totalVal = $('liveTotalVal'), resetBtn = $('liveReset'),
    tape = $('liveTape'), langSel = $('liveLang'), langWrap = $('liveLangs'), privacy = $('livePrivacy'), wave = $('liveWave');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let grouping = 'indian';
  let last = null; // { result, expression }
  let busy = false;

  // ---------- formatting
  const grp = (s) => (s ? E.group(String(s).replace(/,/g, ''), grouping) : s);
  const prettyExpr = (s) => grp(String(s || '').replace(/\*/g, '×').replace(/\//g, '÷'));

  // ---------- slot-machine number roll
  function roll(el, text) {
    el.textContent = '';
    const chars = [...text];
    const spans = chars.map((c) => { const s = document.createElement('span'); s.className = /\d/.test(c) ? 'rd' : 'rc'; s.textContent = c; el.appendChild(s); return s; });
    if (reduced) return;
    const t0 = performance.now(), dur = 520;
    const tick = (now) => {
      const u = (now - t0) / dur; let done = true;
      spans.forEach((s, i) => {
        if (s.className !== 'rd') return;
        const settle = 0.35 + 0.65 * (i / Math.max(1, chars.length - 1));
        if (u < settle) { s.textContent = String(Math.floor(Math.random() * 10)); done = false; } else s.textContent = chars[i];
      });
      if (!done) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ---------- waveform (animated; louder while listening or computing)
  const wctx = wave && wave.getContext('2d');
  let energy = 0.15, target = 0.15, waveOn = false;
  function sizeWave() { if (!wave) return; const r = wave.getBoundingClientRect(); const d = Math.min(2, window.devicePixelRatio || 1); wave.width = Math.max(1, r.width * d); wave.height = Math.max(1, r.height * d); }
  function drawWave(t) {
    if (!wctx) return;
    energy += (target - energy) * 0.08;
    const W = wave.width, H = wave.height; wctx.clearRect(0, 0, W, H);
    const lines = [['rgba(255,225,77,0.95)', 1, 0], ['rgba(127,231,255,0.75)', 0.7, 1.7], ['rgba(255,255,255,0.35)', 0.5, 3.1]];
    for (const [c, k, ph] of lines) {
      wctx.beginPath();
      for (let x = 0; x <= W; x += 3) {
        const u = x / W * 2 - 1; const env = Math.exp(-u * u * 3.2);
        const y = H / 2 + Math.sin(u * 16 - t * 0.006 * (1 + k) + ph) * env * H * 0.38 * energy * k + Math.sin(u * 41 + t * 0.011) * env * H * 0.05 * energy;
        x === 0 ? wctx.moveTo(x, y) : wctx.lineTo(x, y);
      }
      wctx.strokeStyle = c; wctx.lineWidth = Math.max(1.5, W / 420); wctx.stroke();
    }
    if (waveOn) requestAnimationFrame(drawWave);
  }
  if (wave && 'IntersectionObserver' in window) {
    sizeWave(); window.addEventListener('resize', sizeWave);
    new IntersectionObserver((es) => es.forEach((e) => { const was = waveOn; waveOn = e.isIntersecting && !reduced; if (waveOn && !was) requestAnimationFrame(drawWave); if (reduced) drawWave(0); })).observe(wave);
  }
  const pulse = (v, ms) => { target = v; if (ms) setTimeout(() => { target = 0.15; }, ms); };

  // ---------- calculation
  function renderTotal() {
    if (last) { totalVal.textContent = grp(last.result); totalChip.hidden = false; } else totalChip.hidden = true;
  }
  function addTape(q, r, ok) {
    const li = document.createElement('li'); li.className = ok ? '' : 'bad';
    li.innerHTML = `<span class="q"></span><span class="arrow">→</span><span class="r"></span>`;
    li.querySelector('.q').textContent = q; li.querySelector('.r').textContent = ok ? grp(r) : '—'; li.dataset.raw = r;
    tape.prepend(li); while (tape.children.length > 5) tape.lastChild.remove();
  }
  async function run(text) {
    text = (text || '').trim(); if (!text || busy) return;
    busy = true; pulse(0.9, 600);
    quote.textContent = `“${text}”`; quote.classList.add('on');
    try {
      const r = await E.calculate(text);
      if (r.ok) {
        roll(resultEl, grp(r.result)); exprEl.textContent = prettyExpr(r.expression); msgEl.textContent = '';
        last = { result: r.result, expression: r.expression };
        resultEl.classList.remove('pop'); void resultEl.offsetWidth; resultEl.classList.add('pop');
        root.classList.remove('hit'); void root.offsetWidth; root.classList.add('hit');
      } else {
        msgEl.textContent = "Didn't catch that. Try a chip below, or say it another way.";
      }
      renderTotal(); addTape(text, r.result, r.ok);
    } catch (e) {
      msgEl.textContent = 'Something went wrong. Please try again.';
    } finally { busy = false; }
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); run(input.value); input.value = ''; });
  root.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { run(b.dataset.q); }));
  resetBtn.addEventListener('click', () => { E.reset(); last = null; renderTotal(); resultEl.textContent = '0'; exprEl.textContent = 'Ready to calculate'; quote.textContent = '“Start fresh”'; });
  root.querySelectorAll('[data-group]').forEach((b) => b.addEventListener('click', () => {
    grouping = b.dataset.group; root.querySelectorAll('[data-group]').forEach((x) => x.classList.toggle('active', x === b));
    if (last) { resultEl.textContent = grp(last.result); exprEl.textContent = prettyExpr(last.expression); }
    tape.querySelectorAll('li').forEach((li) => { if (!li.classList.contains('bad')) li.querySelector('.r').textContent = grp(li.dataset.raw); });
    renderTotal();
  }));

  // ---------- voice (browser speech recognition, where available)
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { mic.hidden = true; langWrap.hidden = true; privacy.textContent = 'Voice input needs a browser with speech recognition (Chrome, Edge or Safari). Typing works everywhere. Nothing you enter is stored or sent anywhere.'; return; }
  let rec = null, listening = false;
  function stop() { listening = false; mic.classList.remove('on'); mic.setAttribute('aria-pressed', 'false'); target = 0.15; if (rec) try { rec.stop(); } catch (e) { /* ignore */ } }
  mic.addEventListener('click', () => {
    if (listening) { stop(); return; }
    rec = new SR(); rec.lang = langSel.value; rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = false;
    rec.onresult = (ev) => {
      let interim = '', fin = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) { const t = ev.results[i][0].transcript; if (ev.results[i].isFinal) fin += t; else interim += t; }
      if (interim) { quote.textContent = `“${interim}”`; quote.classList.add('on'); target = 0.85; }
      if (fin) { stop(); run(fin); }
    };
    rec.onerror = (ev) => { stop(); msgEl.textContent = ev.error === 'not-allowed' || ev.error === 'service-not-allowed' ? 'Microphone permission was blocked. You can still type a sum.' : (ev.error === 'no-speech' ? "Didn't hear anything. Tap the mic and try again." : 'Voice input is not available right now. You can still type a sum.'); };
    rec.onend = () => { if (listening) stop(); };
    try { rec.start(); listening = true; mic.classList.add('on'); mic.setAttribute('aria-pressed', 'true'); msgEl.textContent = ''; quote.textContent = '“Listening…”'; target = 0.6; } catch (e) { stop(); }
  });
})();

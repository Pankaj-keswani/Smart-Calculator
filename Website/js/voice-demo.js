/* ═══════════════════════════════════════════════════════════════
   SmartCalc AI — Interactive Voice Math AI Playground
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const sampleChips = document.querySelectorAll('.sample-chip');
  const textInput = document.getElementById('voiceTextInput');
  const micSimBtn = document.getElementById('voiceMicSimBtn');
  const waveContainer = document.getElementById('audioWaveContainer');
  const rawSpokenEl = document.getElementById('pipeRawSpoken');
  const strippedNoiseEl = document.getElementById('pipeStrippedNoise');
  const mathFormulaEl = document.getElementById('pipeMathFormula');
  const finalAnswerEl = document.getElementById('pipeFinalAnswer');

  // Noise words dictionary (matching our app's noise stripping engine)
  const NOISE_WORDS = [
    'hey', 'hi', 'hello', 'namaste', 'please', 'pls', 'kindly', 'just', 'ok', 'okay',
    'can you', 'could you', 'would you', 'tell me', 'give me', 'show me', 'find out',
    'what is', "what's", 'whats', 'how much is', 'how much', 'what do i get',
    'calculate', 'compute', 'solve', 'evaluate', 'answer', 'result',
    'um', 'uh', 'hmm', 'ah', 'like', 'actually', 'basically', 'so', 'well',
    'bro', 'bhai', 'dude', 'man', 'sir', 'buddy', 'friend', 'suno', 'batao', 'yaar'
  ];

  // Process and simulate the voice AI pipeline
  function runVoiceSimulation(spokenText) {
    if (!spokenText || !spokenText.trim()) return;

    // Trigger visualizer wave animation
    if (waveContainer) {
      waveContainer.classList.add('active');
    }

    if (rawSpokenEl) {
      rawSpokenEl.textContent = `"${spokenText}"`;
    }

    // Identify and highlight stripped noise words
    let lower = spokenText.toLowerCase();
    const removedWords = [];

    NOISE_WORDS.forEach(noise => {
      const regex = new RegExp(`\\b${noise}\\b`, 'gi');
      if (regex.test(lower)) {
        removedWords.push(noise);
        lower = lower.replace(regex, ' ');
      }
    });

    if (strippedNoiseEl) {
      if (removedWords.length > 0) {
        strippedNoiseEl.innerHTML = removedWords
          .map(w => `<span class="noise-stripped">~~${w}~~</span>`)
          .join(' ');
      } else {
        strippedNoiseEl.innerHTML = '<span style="color:#94a3b8">None (Pure math spoken)</span>';
      }
    }

    // Convert spoken math phrases to mathematical expression
    let expr = lower
      .replace(/\bplus\b/g, '+')
      .replace(/\band\b/g, '+')
      .replace(/\bminus\b/g, '-')
      .replace(/\btimes\b/g, '×')
      .replace(/\bmultiplied by\b/g, '×')
      .replace(/\binto\b/g, '×')
      .replace(/\bdivided by\b/g, '÷')
      .replace(/\bby\b/g, '÷')
      .replace(/\bover\b/g, '÷')
      .replace(/\bpercent of\b/g, '% ×')
      .replace(/\bpercentage of\b/g, '% ×')
      .replace(/\btip on\b/g, '% ×')
      .replace(/\bsquare root of\b/g, '√')
      .replace(/\bsqrt of\b/g, '√')
      .replace(/\s+/g, ' ')
      .trim();

    // Check for square root
    let displayExpr = expr;
    let evalExpr = expr;

    if (expr.includes('√')) {
      evalExpr = expr.replace(/√\s*(\d+(\.\d+)?)/g, 'Math.sqrt($1)');
    }

    // Percentage replacement
    evalExpr = evalExpr.replace(/(\d+(\.\d+)?)%\s*×\s*(\d+(\.\d+)?)/g, '($1/100)*$3');
    evalExpr = evalExpr.replace(/(\d+(\.\d+)?)%/g, '($1/100)');
    evalExpr = evalExpr.replace(/×/g, '*').replace(/÷/g, '/');

    // Display expression formatting
    if (mathFormulaEl) {
      mathFormulaEl.textContent = displayExpr || '—';
    }

    // Calculate answer after a short realistic 250ms processing pause
    setTimeout(() => {
      try {
        // Strip non-eval characters
        const safe = evalExpr.replace(/[^0-9+\-*/().\sMath.sqrt]/g, '');
        const res = Function(`'use strict'; return (${safe})`)();
        if (typeof res === 'number' && !isNaN(res) && isFinite(res)) {
          const formatted = Math.round(res * 100000) / 100000;
          if (finalAnswerEl) finalAnswerEl.textContent = formatted;
        } else {
          if (finalAnswerEl) finalAnswerEl.textContent = 'Invalid';
        }
      } catch (e) {
        if (finalAnswerEl) finalAnswerEl.textContent = 'Ready';
      }

      // Stop wave animation
      if (waveContainer) {
        waveContainer.classList.remove('active');
      }
    }, 450);
  }

  // Setup click listeners for sample pills
  sampleChips.forEach(chip => {
    chip.addEventListener('click', () => {
      sampleChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const phrase = chip.getAttribute('data-phrase') || chip.textContent.replace(/^"|"$/g, '').trim();
      if (textInput) {
        textInput.value = phrase;
      }
      runVoiceSimulation(phrase);
    });
  });

  // Run on input submit / button click
  if (micSimBtn) {
    micSimBtn.addEventListener('click', () => {
      const phrase = textInput ? textInput.value : '';
      if (phrase) {
        runVoiceSimulation(phrase);
      }
    });
  }

  if (textInput) {
    textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        runVoiceSimulation(textInput.value);
      }
    });
  }

  // Initial trigger
  if (textInput && textInput.value) {
    runVoiceSimulation(textInput.value);
  }
})();

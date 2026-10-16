/* ═══════════════════════════════════════════════════════════════
   SmartCalc AI — Live In-Browser Calculator Engine
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // DOM Elements
  const exprEl = document.getElementById('calcExpr');
  const resultEl = document.getElementById('calcResult');
  const statusEl = document.getElementById('calcStatus');
  const exprContainer = document.getElementById('calcExprContainer');
  const soundToggleBtn = document.getElementById('soundToggleBtn');
  const keypad = document.getElementById('calcKeypad');
  const modeKeypadBtn = document.getElementById('modeKeypadBtn');
  const modeVoiceBtn = document.getElementById('modeVoiceBtn');
  const micPillBar = document.getElementById('micPillBar');

  // State
  let expression = '';
  let evaluated = false;
  let soundEnabled = true;
  let audioCtx = null;

  // Web Audio Click Synthesizer
  function playClickHaptic(type = 'click') {
    if (!soundEnabled) return;
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      const now = audioCtx.currentTime;
      if (type === 'equals') {
        // Distinctive double chirp for equals
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(540, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'clear') {
        // Deeper click for AC
        osc.type = 'sine';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.06);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.start(now);
        osc.stop(now + 0.06);
      } else {
        // Crisp tactile mechanical click (like iPhone keyboard)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(420, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.025);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
        osc.start(now);
        osc.stop(now + 0.025);
      }
    } catch (e) {
      // Audio not permitted or supported
    }
  }

  // Safe Math Evaluator
  function safeEval(expr) {
    if (!expr || expr.trim() === '') return '';
    
    // Replace visual operators with JS math operators
    let clean = expr
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/−/g, '-');

    // Balance open parentheses
    const openCount = (clean.match(/\(/g) || []).length;
    const closeCount = (clean.match(/\)/g) || []).length;
    if (openCount > closeCount) {
      clean += ')'.repeat(openCount - closeCount);
    }

    // Handle percentage (e.g. 50% * 200 -> 0.5 * 200)
    clean = clean.replace(/(\d+(\.\d+)?)%/g, '($1/100)');

    try {
      // Validate characters
      if (/[^0-9+\-*/().\s]/.test(clean)) return null;
      // Evaluate using Function sandbox
      const res = Function(`'use strict'; return (${clean})`)();
      if (typeof res === 'number' && !isNaN(res) && isFinite(res)) {
        // Format decimals
        const rounded = Math.round(res * 100000000) / 100000000;
        return String(rounded);
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  // UI Updates
  function updateDisplay(statusMsg = '') {
    if (exprEl) {
      exprEl.textContent = expression || '';
      // Smooth horizontal scroll to end
      if (exprContainer) {
        exprContainer.scrollLeft = exprContainer.scrollWidth;
      }
    }

    if (statusEl) {
      statusEl.textContent = statusMsg;
    }

    // Compute live preview if not already showing final result
    if (!evaluated && resultEl) {
      if (!expression) {
        resultEl.textContent = '0';
      } else {
        const preview = safeEval(expression);
        if (preview !== null && preview !== '') {
          resultEl.textContent = preview;
        }
      }
    }
  }

  // Handle Input Key
  function handleInput(btnValue) {
    if (statusEl) statusEl.textContent = '';

    // If starting a fresh calculation after equals
    if (evaluated) {
      if (['+', '-', '×', '÷', '%'].includes(btnValue)) {
        // Continue chaining from previous result
        expression = (resultEl ? resultEl.textContent : '0') + ' ' + btnValue + ' ';
      } else if (btnValue === 'AC') {
        expression = '';
      } else if (btnValue === '⌫') {
        expression = '';
      } else {
        expression = '';
      }
      evaluated = false;
    }

    switch (btnValue) {
      case 'AC':
        playClickHaptic('clear');
        expression = '';
        if (resultEl) resultEl.textContent = '0';
        updateDisplay();
        break;

      case '⌫':
        playClickHaptic('click');
        if (expression.length > 0) {
          // If trailing character is a space, remove the operator chunk
          if (expression.endsWith(' ')) {
            expression = expression.trimEnd();
            expression = expression.slice(0, -1).trimEnd();
          } else {
            expression = expression.slice(0, -1);
          }
        }
        updateDisplay();
        break;

      case '=':
        playClickHaptic('equals');
        if (!expression.trim()) return;

        // Smart Pending Operator Safety (Guarantees no reset to 0!)
        const trimmed = expression.trim();
        const lastChar = trimmed.slice(-1);
        if (['+', '-', '×', '÷'].includes(lastChar)) {
          // The user ended with an operator! Safely evaluate without the dangling operator or notify
          const safeExpr = trimmed.slice(0, -1).trim();
          const ans = safeEval(safeExpr);
          if (ans !== null && ans !== '') {
            if (resultEl) resultEl.textContent = ans;
            evaluated = true;
            updateDisplay('Calculation completed (pending operator ignored)');
          } else {
            updateDisplay('Calculation is still pending...');
          }
          return;
        }

        const finalAns = safeEval(expression);
        if (finalAns !== null && finalAns !== '') {
          if (resultEl) resultEl.textContent = finalAns;
          evaluated = true;
        } else {
          updateDisplay('Invalid expression');
        }
        break;

      case '()':
        playClickHaptic('click');
        const openP = (expression.match(/\(/g) || []).length;
        const closeP = (expression.match(/\)/g) || []).length;
        const last = expression.trim().slice(-1);
        if (openP > closeP && (/\d|\)/.test(last))) {
          expression += ')';
        } else {
          if (/\d|\)/.test(last)) {
            expression += ' × (';
          } else {
            expression += '(';
          }
        }
        updateDisplay();
        break;

      case '%':
        playClickHaptic('click');
        if (expression && /\d|\)/.test(expression.trim().slice(-1))) {
          expression += '%';
          updateDisplay();
        }
        break;

      case '+':
      case '-':
      case '×':
      case '÷':
        playClickHaptic('click');
        if (!expression) {
          if (btnValue === '-') expression = '-';
        } else {
          const t = expression.trim();
          const lastOp = t.slice(-1);
          if (['+', '-', '×', '÷'].includes(lastOp)) {
            // Replace trailing operator with the new one cleanly
            expression = t.slice(0, -1) + btnValue + ' ';
          } else {
            expression += ' ' + btnValue + ' ';
          }
        }
        updateDisplay();
        break;

      default:
        // Numbers and decimal
        playClickHaptic('click');
        expression += btnValue;
        updateDisplay();
        break;
    }
  }

  // Keypad Click Listeners
  if (keypad) {
    keypad.addEventListener('click', (e) => {
      const btn = e.target.closest('.calc-btn');
      if (!btn) return;
      const val = btn.getAttribute('data-val') || btn.textContent.trim();
      handleInput(val);
    });
  }

  // Sound Toggle Listener
  if (soundToggleBtn) {
    soundToggleBtn.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      soundToggleBtn.textContent = soundEnabled ? '🔔' : '🔕';
      soundToggleBtn.title = soundEnabled ? 'Tactile Clicks: On' : 'Tactile Clicks: Muted';
      playClickHaptic('click');
    });
  }

  // Mode Switcher Listeners
  if (modeKeypadBtn && modeVoiceBtn) {
    modeKeypadBtn.addEventListener('click', () => {
      modeKeypadBtn.classList.add('active');
      modeVoiceBtn.classList.remove('active');
      playClickHaptic('click');
      if (micPillBar) {
        micPillBar.querySelector('.mic-toggle-label').textContent = 'OFF';
      }
    });

    modeVoiceBtn.addEventListener('click', () => {
      modeVoiceBtn.classList.add('active');
      modeKeypadBtn.classList.remove('active');
      playClickHaptic('click');
      if (micPillBar) {
        micPillBar.querySelector('.mic-toggle-label').textContent = 'LISTENING';
      }
      // Trigger voice simulation smooth scroll to section
      const voiceSection = document.getElementById('voice-ai');
      if (voiceSection) {
        voiceSection.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  // Initial Sample Value
  expression = '45 × 12 + 80';
  updateDisplay();
  const initAns = safeEval(expression);
  if (initAns && resultEl) resultEl.textContent = initAns;
})();

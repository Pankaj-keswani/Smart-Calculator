/* ═══════════════════════════════════════════════════════════════
   VoiceCalc AI — Official Landing Page JavaScript (main.js)
   ═══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // 1. Mobile Menu Toggle
  const navToggle = document.getElementById('navToggle');
  const mobileMenu = document.getElementById('mobileMenu');

  if (navToggle && mobileMenu) {
    navToggle.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.toggle('active');
      navToggle.setAttribute('aria-expanded', isOpen);
      navToggle.classList.toggle('open', isOpen);
    });

    // Close on mobile link tap
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('active');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // 2. Scroll Reveal Animations via IntersectionObserver
  const revealElements = document.querySelectorAll('.reveal, .bento-card, .stat-card, .voice-sandbox-card');
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    revealElements.forEach(el => revealObserver.observe(el));
  } else {
    revealElements.forEach(el => el.classList.add('revealed'));
  }

  // 3. Animated Metric Counters
  const counters = document.querySelectorAll('[data-count]');
  if ('IntersectionObserver' in window && counters.length > 0) {
    const counterObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const target = parseInt(entry.target.getAttribute('data-count'), 10);
          const duration = 1400;
          const start = 0;
          const startTime = performance.now();

          function updateCounter(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const current = Math.floor(easeOut * target);
            entry.target.textContent = current;

            if (progress < 1) {
              requestAnimationFrame(updateCounter);
            } else {
              entry.target.textContent = target;
            }
          }

          requestAnimationFrame(updateCounter);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    counters.forEach(c => counterObserver.observe(c));
  }

  // 4. Interactive Floating PiP Overlay Sandbox (Draggable preview)
  const pipWidget = document.getElementById('floatingPipWidget');
  const desktopCanvas = document.getElementById('mockDesktopCanvas');

  if (pipWidget && desktopCanvas) {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    const dragStart = (e) => {
      // Only drag from header bar or widget body (not buttons)
      if (e.target.closest('button')) return;
      isDragging = true;
      const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
      const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;
      startX = clientX;
      startY = clientY;
      initialLeft = pipWidget.offsetLeft;
      initialTop = pipWidget.offsetTop;
      pipWidget.style.cursor = 'grabbing';
    };

    const dragMove = (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
      const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;
      const deltaX = clientX - startX;
      const deltaY = clientY - startY;

      let newLeft = initialLeft + deltaX;
      let newTop = initialTop + deltaY;

      // Bound within canvas
      const maxLeft = desktopCanvas.offsetWidth - pipWidget.offsetWidth - 10;
      const maxTop = desktopCanvas.offsetHeight - pipWidget.offsetHeight - 10;
      newLeft = Math.max(10, Math.min(newLeft, maxLeft));
      newTop = Math.max(10, Math.min(newTop, maxTop));

      pipWidget.style.left = `${newLeft}px`;
      pipWidget.style.top = `${newTop}px`;
      pipWidget.style.right = 'auto';
    };

    const dragEnd = () => {
      isDragging = false;
      pipWidget.style.cursor = 'grab';
    };

    pipWidget.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', dragMove);
    document.addEventListener('mouseup', dragEnd);

    pipWidget.addEventListener('touchstart', dragStart, { passive: true });
    document.addEventListener('touchmove', dragMove, { passive: false });
    document.addEventListener('touchend', dragEnd);

    // Minimize button in PiP header
    const pipMinBtn = document.getElementById('pipMinBtn');
    const pipBody = document.getElementById('pipBody');
    if (pipMinBtn && pipBody) {
      pipMinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = pipBody.style.display === 'none';
        pipBody.style.display = isHidden ? 'block' : 'none';
        pipMinBtn.textContent = isHidden ? '—' : '□';
      });
    }

    // Mini Keypad clicks inside PiP
    const pipKeyGrid = document.querySelector('.pip-key-grid');
    const pipResultText = document.getElementById('pipResultText');
    const pipInputText = document.getElementById('pipInputText');
    if (pipKeyGrid && pipResultText) {
      pipKeyGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('.pip-kbtn');
        if (!btn) return;
        const val = btn.textContent.trim();
        if (val === 'C') {
          pipInputText.textContent = '';
          pipResultText.textContent = '0';
        } else if (val === '=') {
          try {
            const safe = pipInputText.textContent.replace(/×/g, '*').replace(/÷/g, '/');
            const res = Function(`'use strict'; return (${safe})`)();
            pipResultText.textContent = String(res);
          } catch (err) {
            pipResultText.textContent = 'Err';
          }
        } else {
          pipInputText.textContent += val;
        }
      });
    }
  }

  // 5. Widget Theme Switcher
  const themePillBtns = document.querySelectorAll('.theme-pill-btn');
  const hsWidgetCard = document.getElementById('hsWidgetCard');

  if (themePillBtns.length > 0 && hsWidgetCard) {
    themePillBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        themePillBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const theme = btn.getAttribute('data-theme');
        hsWidgetCard.className = 'hs-widget-card';
        if (theme === 'cyber') {
          hsWidgetCard.classList.add('theme-cyber');
        } else if (theme === 'mint') {
          hsWidgetCard.classList.add('theme-mint');
        }
      });
    });
  }

  // 6. FAQ Accordion
  const faqCards = document.querySelectorAll('.faq-card');
  faqCards.forEach(card => {
    const trigger = card.querySelector('.faq-trigger');
    if (trigger) {
      trigger.addEventListener('click', () => {
        const isOpen = card.classList.contains('open');
        // Optional: close other items
        faqCards.forEach(c => c.classList.remove('open'));
        if (!isOpen) {
          card.classList.add('open');
        }
      });
    }
  });

  // 7. Interactive Feedback Form & Star Rating
  const starBtns = document.querySelectorAll('.star-btn');
  const starCaption = document.getElementById('ratingCaption');
  const fbTopicChips = document.querySelectorAll('.fb-topic-chip');
  const fbForm = document.getElementById('feedbackForm');
  const fbToastMsg = document.getElementById('fbToastMsg');
  let selectedRating = 5;

  const starLabels = [
    '1 star — Needs improvement',
    '2 stars — Fair',
    '3 stars — Good features',
    '4 stars — Very impressive!',
    '5 stars — Pure perfection! 🚀'
  ];

  starBtns.forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      const rating = parseInt(btn.getAttribute('data-star'), 10);
      highlightStars(rating);
      if (starCaption) starCaption.textContent = starLabels[rating - 1];
    });

    btn.addEventListener('mouseleave', () => {
      highlightStars(selectedRating);
      if (starCaption) starCaption.textContent = starLabels[selectedRating - 1];
    });

    btn.addEventListener('click', () => {
      selectedRating = parseInt(btn.getAttribute('data-star'), 10);
      highlightStars(selectedRating);
      if (starCaption) starCaption.textContent = starLabels[selectedRating - 1];
    });
  });

  function highlightStars(count) {
    starBtns.forEach((btn, index) => {
      if (index < count) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }
  highlightStars(5);

  fbTopicChips.forEach(chip => {
    chip.addEventListener('click', () => {
      fbTopicChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });

  if (fbForm) {
    fbForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (fbToastMsg) {
        fbToastMsg.style.display = 'block';
        fbToastMsg.textContent = '🎉 Thank you! Your feedback has been noted.';
        setTimeout(() => {
          fbForm.reset();
          fbToastMsg.style.display = 'none';
          highlightStars(5);
        }, 3500);
      }
    });
  }

  // 8. Dynamic Current Year
  const yearEl = document.getElementById('currentYear');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }
});

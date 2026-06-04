// ═══════════════════════════════════════════
// Advice Price Board — Ultra Effects Engine
// Particles, Cursor Glow, Ripple, Float Emojis
// ═══════════════════════════════════════════

(function() {
  'use strict';

  // ─── FLOATING PARTICLES ───
  function initParticles() {
    const canvas = document.createElement('canvas');
    canvas.id = 'particles-canvas';
    document.body.prepend(canvas);
    const ctx = canvas.getContext('2d');

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const particles = [];
    const PARTICLE_COUNT = 50;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 0.5,
        speedX: (Math.random() - 0.5) * 0.4,
        speedY: (Math.random() - 0.5) * 0.3 - 0.1,
        opacity: Math.random() * 0.4 + 0.1,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: Math.random() * 0.02 + 0.005
      });
    }

    let mouseX = -1000, mouseY = -1000;
    document.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach(p => {
        p.x += p.speedX;
        p.y += p.speedY;
        p.pulse += p.pulseSpeed;

        // Wrap around
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.x > canvas.width + 10) p.x = -10;
        if (p.y < -10) p.y = canvas.height + 10;
        if (p.y > canvas.height + 10) p.y = -10;

        // Mouse repulsion
        const dx = p.x - mouseX;
        const dy = p.y - mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          const force = (150 - dist) / 150 * 0.8;
          p.x += (dx / dist) * force;
          p.y += (dy / dist) * force;
        }

        const glow = Math.sin(p.pulse) * 0.3 + 0.7;
        const alpha = p.opacity * glow;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(216, 160, 140, ${alpha})`;
        ctx.fill();

        // Glow halo
        if (p.size > 1.2) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(216, 160, 140, ${alpha * 0.08})`;
          ctx.fill();
        }
      });

      // Draw connection lines between nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            const lineAlpha = (1 - dist / 120) * 0.06;
            ctx.strokeStyle = `rgba(216, 160, 140, ${lineAlpha})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      requestAnimationFrame(animate);
    }
    animate();
  }

  // ─── AURORA ORBS (injected into DOM) ───
  function initAuroraOrbs() {
    for (let i = 0; i < 3; i++) {
      const orb = document.createElement('div');
      orb.className = 'aurora-orb';
      document.body.prepend(orb);
    }
  }

  // ─── CURSOR GLOW FOLLOWER ───
  function initCursorGlow() {
    const glow = document.createElement('div');
    glow.className = 'cursor-glow';
    document.body.appendChild(glow);

    let targetX = 0, targetY = 0;
    let currentX = 0, currentY = 0;

    document.addEventListener('mousemove', e => {
      targetX = e.clientX;
      targetY = e.clientY;
    });

    function updateGlow() {
      currentX += (targetX - currentX) * 0.08;
      currentY += (targetY - currentY) * 0.08;
      glow.style.left = currentX + 'px';
      glow.style.top = currentY + 'px';
      requestAnimationFrame(updateGlow);
    }
    updateGlow();
  }

  // ─── RIPPLE EFFECT ON CLICK ───
  function initRipple() {
    document.addEventListener('click', e => {
      const target = e.target.closest('.btn, .tab, .key, .filter-btn');
      if (!target) return;

      const rect = target.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'ripple-effect';
      const size = Math.max(rect.width, rect.height) * 2;
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
      ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
      target.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    });
  }

  // ─── FLOATING EMOJI ON COPY ───
  const COPY_EMOJIS = ['📋', '✅', '✨', '🎉', '💫', '🔥', '⚡'];
  function spawnCopyEmojis(x, y) {
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        const emoji = document.createElement('div');
        emoji.className = 'float-emoji';
        emoji.textContent = COPY_EMOJIS[Math.floor(Math.random() * COPY_EMOJIS.length)];
        emoji.style.left = (x + (Math.random() - 0.5) * 80) + 'px';
        emoji.style.top = (y + (Math.random() - 0.5) * 40) + 'px';
        emoji.style.fontSize = (16 + Math.random() * 12) + 'px';
        document.body.appendChild(emoji);
        emoji.addEventListener('animationend', () => emoji.remove());
      }, i * 80);
    }
  }

  // Intercept copy operations to spawn emojis
  const _origCopyToClipboard = window.copyToClipboard;
  if (_origCopyToClipboard) {
    window.copyToClipboard = function(text, msg) {
      // Spawn emojis at cursor or center
      const x = window._lastClickX || window.innerWidth / 2;
      const y = window._lastClickY || window.innerHeight / 2;
      spawnCopyEmojis(x, y);
      return _origCopyToClipboard.call(this, text, msg);
    };
  }

  // Track last click position
  document.addEventListener('click', e => {
    window._lastClickX = e.clientX;
    window._lastClickY = e.clientY;
  });

  // ─── PARALLAX HEADER ───
  function initParallaxHeader() {
    const header = document.querySelector('header');
    if (!header) return;

    window.addEventListener('scroll', () => {
      const scrollY = window.scrollY;
      const opacity = Math.max(0.6, 1 - scrollY / 300);
      header.style.background = `rgba(26,18,22,${opacity * 0.88})`;
    }, { passive: true });
  }

  // ─── NUMBER COUNTING ANIMATION ───
  function animateNumber(el, target, duration = 800) {
    const start = parseInt(el.textContent.replace(/[^\d]/g, '')) || 0;
    if (start === target) return;
    const startTime = performance.now();

    function update(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const current = Math.round(start + (target - start) * eased);
      el.textContent = current.toLocaleString();
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }

  // Observe stat values for count-up animation
  const observer = new MutationObserver(mutations => {
    mutations.forEach(m => {
      if (m.target.classList && m.target.classList.contains('stat-value')) {
        const num = parseInt(m.target.textContent.replace(/[^\d]/g, ''));
        if (num > 0 && m.target.textContent.includes('฿')) {
          // Already formatted, skip
        }
      }
    });
  });

  // ─── SCROLL REVEAL ───
  function initScrollReveal() {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    // Observe dynamically added cards
    const bodyObserver = new MutationObserver(() => {
      document.querySelectorAll('.submodel-card:not([data-revealed])').forEach(card => {
        card.setAttribute('data-revealed', 'true');
        revealObserver.observe(card);
      });
      document.querySelectorAll('.stat-card:not([data-revealed])').forEach(card => {
        card.setAttribute('data-revealed', 'true');
        revealObserver.observe(card);
      });
    });

    bodyObserver.observe(document.body, { childList: true, subtree: true });
  }

  // ─── TYPING EFFECT FOR SEARCH ───
  function initSearchEffects() {
    document.addEventListener('focus', e => {
      if (e.target.matches('.search-wrap input')) {
        const wrap = e.target.closest('.search-wrap');
        if (wrap) {
          wrap.style.transition = 'all 0.3s ease';
          wrap.style.transform = 'scale(1.01)';
        }
      }
    }, true);

    document.addEventListener('blur', e => {
      if (e.target.matches('.search-wrap input')) {
        const wrap = e.target.closest('.search-wrap');
        if (wrap) wrap.style.transform = 'scale(1)';
      }
    }, true);
  }

  // ─── SPARKLE ON LOAD BUTTON ───
  function initLoadButtonEffects() {
    document.addEventListener('click', e => {
      const btn = e.target.closest('.btn');
      if (btn && btn.textContent.includes('โหลดราคา')) {
        // Spawn loading sparkles
        const rect = btn.getBoundingClientRect();
        for (let i = 0; i < 8; i++) {
          setTimeout(() => {
            const spark = document.createElement('div');
            spark.className = 'float-emoji';
            spark.textContent = ['⚡', '✨', '💫', '🌟', '⭐'][Math.floor(Math.random() * 5)];
            spark.style.left = (rect.left + Math.random() * rect.width) + 'px';
            spark.style.top = (rect.top + Math.random() * rect.height) + 'px';
            spark.style.fontSize = (14 + Math.random() * 10) + 'px';
            document.body.appendChild(spark);
            spark.addEventListener('animationend', () => spark.remove());
          }, i * 60);
        }
      }
    });
  }

  // ─── TILT EFFECT ON STAT CARDS ───
  function initTiltCards() {
    document.addEventListener('mousemove', e => {
      const card = e.target.closest('.stat-card');
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `perspective(500px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateY(-4px) scale(1.02)`;
    });

    document.addEventListener('mouseleave', e => {
      const card = e.target.closest('.stat-card');
      if (card) card.style.transform = '';
    }, true);
  }

  // ─── INIT ALL EFFECTS ───
  function init() {
    initParticles();
    initAuroraOrbs();
    initCursorGlow();
    initRipple();
    initParallaxHeader();
    initScrollReveal();
    initSearchEffects();
    initLoadButtonEffects();
    initTiltCards();

    console.log('✨ Effects Engine loaded — particles, aurora, ripple, glow active');
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

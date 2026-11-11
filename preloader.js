(function () {
  'use strict';
  var pre = document.querySelector('.preloader');
  if (!pre) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof window.gsap === 'undefined' || reduce) { pre.remove(); return; }

  pre.style.display = 'flex';
  gsap.set('.pl-word-inner', { yPercent: 110 });
  gsap.set('.pl-bar-fill', { scaleX: 0 });

  gsap.timeline()
    .to('.pl-bar-fill', { scaleX: 1, duration: 1.3, ease: 'power2.inOut' }, 0)
    .from('.pl-dot', { scale: 0, duration: .5, ease: 'expo.out' }, 0)
    .from('.pl-word', { width: 0, marginLeft: 0, duration: .7, ease: 'power4.inOut' }, .2)
    .to('.pl-word-inner', { yPercent: 0, duration: .6, ease: 'power4.out' }, .3)
    .to(['.pl-logo', '.pl-bar'], { y: -20, opacity: 0, duration: .35, ease: 'power3.in' }, 1.3)
    .to(pre, { yPercent: -100, duration: .75, ease: 'power4.inOut', onComplete: function () { pre.remove(); } }, 1.55)
    .add(function () { if (window.introTL) window.introTL.play(); }, 1.9);
})();

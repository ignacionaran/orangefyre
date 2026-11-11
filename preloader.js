/* Orange.Fyre — 3D preloader
   Requires (loaded before this file): gsap, three (r128). Three is optional: without WebGL the preloader still runs (text + counter). */
(function () {
  'use strict';

  var root = document.getElementById('of-preloader');
  var html = document.documentElement;
  if (!root) { html.classList.remove('is-loading'); return; }

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasGSAP = typeof window.gsap !== 'undefined';
  var hasThree = typeof window.THREE !== 'undefined';

  var WORD = 'NARAN';
  var GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#/+*%&';
  var chars = Array.prototype.slice.call(root.querySelectorAll('.of-pl-char'));
  var countEl = root.querySelector('.of-pl-count-num');
  var fillEl = root.querySelector('.of-pl-bar-fill');
  var statusEl = root.querySelector('.of-pl-status');
  var uiEl = root.querySelector('.of-pl-ui');
  var canvas = document.getElementById('of-pl-canvas');

  var state = { p: 0 };
  var fx = { dolly: 0, burst: 0 };   // exit animation parameters
  var loaded = document.readyState === 'complete';
  var finishing = false, finished = false, rafId = 0, lastScramble = 0;
  var three = null;

  window.addEventListener('load', function () { loaded = true; });

  function end() {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(rafId);
    if (three) three.dispose();
    root.remove();
    html.classList.remove('is-loading');
    window.__preloaderDone = true;
  }
  function announce() { document.dispatchEvent(new Event('preloader:done')); }

  /* ---------- No GSAP: simple fallback ---------- */
  if (!hasGSAP) {
    var go = function () { setTimeout(function () { end(); announce(); }, 600); };
    if (loaded) go(); else window.addEventListener('load', go);
    return;
  }

  /* ---------- Reduced motion: quick fade ---------- */
  if (reduce) {
    var quick = function () {
      gsap.to(root, { opacity: 0, duration: .4, onComplete: function () { end(); announce(); } });
    };
    chars.forEach(function (c, i) { c.textContent = WORD[i]; });
    if (loaded) quick(); else window.addEventListener('load', quick);
    return;
  }

  /* =====================================================
     THREE.JS SCENE
     ===================================================== */
  function initThree() {
    if (!hasThree || !canvas) return null;
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) { return null; }

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(45, 1, .1, 100);
    camera.position.z = 7;

    var ORANGE = 0xff5a00, BONE = 0xe2e1d3;
    var group = new THREE.Group();
    scene.add(group);

    /* Outer wireframe icosahedron */
    var icoGeo = new THREE.IcosahedronGeometry(1.5, 2);
    var outer = new THREE.LineSegments(
      new THREE.WireframeGeometry(icoGeo),
      new THREE.LineBasicMaterial({ color: ORANGE, transparent: true, opacity: 0 })
    );
    group.add(outer);

    /* Inner counter-rotating shape */
    var inner = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(.8, 0)),
      new THREE.LineBasicMaterial({ color: BONE, transparent: true, opacity: 0 })
    );
    group.add(inner);

    /* Vertex nodes on the outer shell */
    var nodes = new THREE.Points(
      icoGeo,
      new THREE.PointsMaterial({ color: 0xffa36b, size: .045, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    group.add(nodes);

    /* Orbital rings */
    var rings = [];
    [[2.3, .2, 0, 0], [2.7, 1.2, .6, 0], [3.1, .5, 1.1, .4]].forEach(function (cfg, i) {
      var ring = new THREE.Mesh(
        new THREE.TorusGeometry(cfg[0], .004, 8, 220),
        new THREE.MeshBasicMaterial({ color: i === 1 ? BONE : ORANGE, transparent: true, opacity: 0 })
      );
      ring.rotation.set(cfg[1], cfg[2], cfg[3]);
      ring.userData.speed = (i % 2 ? -1 : 1) * (.12 + i * .06);
      group.add(ring);
      rings.push(ring);
    });

    /* Particle shell */
    var N = 1400, pos = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      var r = 3.4 + Math.random() * 5.5;
      var th = Math.random() * Math.PI * 2;
      var ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      pos[i * 3 + 2] = r * Math.cos(ph);
    }
    var pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var dust = new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({ color: 0xff7a33, size: .022, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    scene.add(dust);

    /* Soft glow sprite */
    var gc = document.createElement('canvas'); gc.width = gc.height = 256;
    var gx = gc.getContext('2d');
    var grd = gx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, 'rgba(255,110,30,.9)');
    grd.addColorStop(.35, 'rgba(255,77,0,.28)');
    grd.addColorStop(1, 'rgba(255,77,0,0)');
    gx.fillStyle = grd; gx.fillRect(0, 0, 256, 256);
    var glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(gc), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    glow.scale.set(7, 7, 1);
    scene.add(glow);

    /* Pointer parallax */
    var mouse = { x: 0, y: 0, sx: 0, sy: 0 };
    function onMove(e) {
      mouse.x = (e.clientX / window.innerWidth - .5) * 2;
      mouse.y = (e.clientY / window.innerHeight - .5) * 2;
    }
    window.addEventListener('pointermove', onMove, { passive: true });

    function resize() {
      var w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.position.x = 0;
      camera.updateProjectionMatrix();
      var s = w < 700 ? .72 : 1;
      group.scale.setScalar(s);
    }
    window.addEventListener('resize', resize);
    resize();

    var clock = new THREE.Clock();

    function frame() {
      var t = clock.getElapsedTime();
      var p = state.p / 100;
      var ease = 1 - Math.pow(1 - Math.min(p * 1.4, 1), 3);   // builds up quickly, then holds

      mouse.sx += (mouse.x - mouse.sx) * .05;
      mouse.sy += (mouse.y - mouse.sy) * .05;

      var spin = .25 + p * 1.1 + fx.burst * 1.5;
      outer.rotation.y = t * spin;
      outer.rotation.x = Math.sin(t * .4) * .35 + mouse.sy * .35;
      inner.rotation.y = -t * (spin * 1.6);
      inner.rotation.z = t * .5;
      nodes.rotation.copy(outer.rotation);
      group.rotation.y = mouse.sx * .35;
      group.rotation.x = mouse.sy * .15;

      rings.forEach(function (r, i) {
        r.rotation.z += r.userData.speed * .01 * (1 + p * 3);
        r.rotation.x += .0015 * (i + 1);
      });
      dust.rotation.y = t * .03 + p * .6;
      dust.rotation.x = t * .012;

      var build = .25 + ease * .75 + fx.burst * 2.2;
      outer.scale.setScalar(build);
      nodes.scale.setScalar(build);
      inner.scale.setScalar(.5 + ease * .5 + Math.sin(t * 2) * .02 + fx.burst * .8);

      var fade = Math.max(0, 1 - fx.burst * 1.15);
      outer.material.opacity = (.15 + ease * .8) * fade;
      inner.material.opacity = (.1 + ease * .55) * fade;
      nodes.material.opacity = ease * .95 * fade;
      rings.forEach(function (r, i) { r.material.opacity = ease * (.5 - i * .08) * fade; r.scale.setScalar(1 + fx.burst * 1.6); });
      dust.material.opacity = (.25 + ease * .55) * Math.max(0, 1 - fx.burst * .6);
      glow.material.opacity = (.15 + ease * .55 + Math.sin(t * 3) * .04) * (1 + fx.burst * .8) * fade + fx.burst * .35;
      glow.scale.setScalar(7 + fx.burst * 6);

      camera.position.z = 7 - fx.dolly * 5.6;
      camera.position.x = mouse.sx * .25;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    }

    return {
      frame: frame,
      dispose: function () {
        window.removeEventListener('resize', resize);
        window.removeEventListener('pointermove', onMove);
        [outer, inner, nodes, dust].forEach(function (o) { o.geometry.dispose(); o.material.dispose(); });
        rings.forEach(function (r) { r.geometry.dispose(); r.material.dispose(); });
        glow.material.map.dispose(); glow.material.dispose();
        renderer.dispose();
      }
    };
  }

  three = initThree();

  /* =====================================================
     UI: counter, bar, scramble text, status
     ===================================================== */
  var STATUS = [
    [0, 'Initializing'],
    [30, 'Loading assets'],
    [62, 'Compiling visuals'],
    [90, 'Almost there'],
    [100, 'Ready']
  ];

  function scramble(p) {
    var n = chars.length;
    for (var i = 0; i < n; i++) {
      var start = 6 + (i / n) * 70;    // when letter i starts scrambling
      var lock = start + 22;           // when it locks to the real letter
      var el = chars[i];
      if (p >= lock) {
        if (el.textContent !== WORD[i]) el.textContent = WORD[i];
        el.classList.remove('is-scrambling');
      } else if (p >= start) {
        el.textContent = GLYPHS[(Math.random() * GLYPHS.length) | 0];
        el.classList.add('is-scrambling');
      } else {
        el.textContent = '';
      }
    }
  }

  function render() {
    var p = state.p;
    countEl.textContent = String(Math.round(p)).padStart(3, '0');
    fillEl.style.transform = 'scaleX(' + (p / 100) + ')';
    for (var i = STATUS.length - 1; i >= 0; i--) {
      if (p >= STATUS[i][0]) { if (statusEl.textContent !== STATUS[i][1]) statusEl.textContent = STATUS[i][1]; break; }
    }
  }

  function loop(now) {
    rafId = requestAnimationFrame(loop);
    if (now - lastScramble > 55) { lastScramble = now; if (!finishing || state.p < 100) scramble(state.p); }
    if (three) three.frame();
  }
  rafId = requestAnimationFrame(loop);

  /* =====================================================
     TIMELINE
     ===================================================== */
  gsap.set(chars, { yPercent: 0 });
  gsap.from(uiEl, { opacity: 0, duration: .8, ease: 'power2.out' });
  gsap.from('.of-pl-corner', { scale: 1.6, opacity: 0, duration: 1, stagger: .08, ease: 'power3.out' });

  function exit() {
    scramble(100);
    var tl = gsap.timeline();
    tl.to(chars, { scale: 1.06, duration: .25, stagger: .03, ease: 'power2.out', yoyo: true, repeat: 1 })
      .to(uiEl, { opacity: 0, y: -16, duration: .45, ease: 'power2.in' }, '+=.1')
      .to(fx, { burst: 1, dolly: 1, duration: 1.15, ease: 'power3.in' }, '<')
      .to(root, { clipPath: 'inset(0 0 100% 0)', duration: .95, ease: 'power4.inOut' }, '-=.25')
      .add(announce, '-=.5')
      .add(end);
  }

  function finish() {
    if (finishing) return;
    finishing = true;
    gsap.to(state, { p: 100, duration: .7, ease: 'power2.out', onUpdate: render, onComplete: exit });
  }

  function afterMinimum() {
    if (loaded) finish();
    else window.addEventListener('load', finish, { once: true });
  }

  gsap.to(state, { p: 92, duration: 2.8, ease: 'power2.inOut', onUpdate: render, onComplete: afterMinimum });
  render();

  // Safety net: never trap the visitor behind the preloader
  setTimeout(function () { if (!finishing) { loaded = true; finish(); } }, 10000);
})();

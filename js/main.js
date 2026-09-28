/* =========================================================
   1. SMOOTH SCROLL + SNAP  (Lenis)
   ---------------------------------------------------------
   Lenis does not support CSS scroll-snap, so the snapping that
   used to live in style.css is handled here by lenis/snap.

   Snap points are added manually rather than with addElements()
   so each one can be offset by the nav height — otherwise a
   snapped section's top sits underneath the sticky nav.
   ========================================================= */

(function () {
  if (typeof Lenis === 'undefined') return;

  var root = document.documentElement;

  /* Lenis honors prefers-reduced-motion on its own: it forces lerp to 1
     so scrolling tracks the input device exactly, and anchor jumps become
     instant. No need to skip initialising it. */
  var lenis = new Lenis({
    autoRaf: true,
    /* anchors:true re-enables #links, which Lenis blocks by default.
       No offset needed: .section carries scroll-margin-top, which Lenis
       already respects. Adding an offset here double-counts it. */
    anchors: true,
    allowNestedScroll: true,
    stopInertiaOnNavigate: true
  });

  window.lenis = lenis;   // handy from the console while tuning

  function navHeight() {
    return parseFloat(getComputedStyle(root).getPropertyValue('--nav-h')) || 72;
  }

  /* --- snapping, home page only --- */

  if (typeof Snap === 'undefined') return;
  if (!root.classList.contains('snap')) return;

  var sections = Array.prototype.slice.call(document.querySelectorAll('.section'));
  if (sections.length < 2) return;

  var snap = null;

  function snapEnabled() {
    /* Off on touch-width screens and when reduced motion is requested. */
    if (window.matchMedia('(max-width: 760px)').matches) return false;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    return true;
  }

  function buildSnap() {
    if (snap) {
      snap.stop();
      snap = null;
    }
    if (!snapEnabled()) return;

    snap = new Snap(lenis, {
      /* 'proximity' snaps only when you end up near a point.
         distanceThreshold is how near — '50%' means within half a
         viewport. Raise it to snap more eagerly, lower it to snap less.
         'mandatory' would force every scroll onto a section, which
         breaks sections taller than the window. */
      type: 'proximity',
      distanceThreshold: '50%',
      debounce: 400
    });

    var nav = navHeight();
    sections.forEach(function (section) {
      snap.add(Math.max(0, section.offsetTop - nav));
    });
  }

  buildSnap();

  /* Section offsets change with the window, so rebuild after a resize. */
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(buildSnap, 200);
  }, { passive: true });
})();


/* =========================================================
   2. NAV HIGHLIGHTING
   Underlines WORK or ABOUT depending on what's on screen.
   Works unchanged under Lenis, which drives the native scroll
   position rather than replacing it.
   ========================================================= */

(function () {
  var links = document.querySelectorAll('.nav__links a[href^="#"]');
  if (!links.length || !('IntersectionObserver' in window)) return;

  var map = {};
  links.forEach(function (link) {
    var section = document.querySelector(link.getAttribute('href'));
    if (section) map[section.id] = link;
  });

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      links.forEach(function (l) { l.classList.remove('is-active'); });
      if (map[entry.target.id]) map[entry.target.id].classList.add('is-active');
    });
  }, { rootMargin: '-45% 0px -45% 0px' });

  Object.keys(map).forEach(function (id) {
    observer.observe(document.getElementById(id));
  });
})();


/* =========================================================
   3. CUSTOM CURSOR
   ---------------------------------------------------------
   Hides the native cursor and follows the mouse with a dot that
   expands into a labelled circle over any element carrying a
   data-message attribute.

   The dot flips between solid black and solid white based on how
   bright the thing behind it is. Reading the actual screen pixels
   would mean rasterising the page to a canvas every frame, so
   instead it walks up from the element under the pointer, finds
   the first one with an opaque background colour, and measures
   that colour's luminance. Above 50% the backdrop counts as light
   and the dot goes black; below, the dot goes white.

   Images have no background colour to read, so mark them by hand:
     data-cursor="dark"   dark artwork -> white dot
     data-cursor="light"  light artwork -> black dot
   An explicit data-cursor always wins over the measurement.
   ========================================================= */

(function () {
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  var wide = window.matchMedia('(min-width: 761px)');
  if (!fine.matches || !wide.matches) return;

  var cursor = document.querySelector('.cursor');
  if (!cursor) return;

  var label = cursor.querySelector('.cursor__label');

  /* Class on <body> rather than a bare rule, so the native cursor is
     only hidden once we know the replacement is running. */
  document.body.classList.add('has-cursor');
  cursor.classList.add('is-light');

  var x = 0, y = 0, queued = false, lastDark = null;

  /* Perceived brightness. Green counts for most of it, blue least —
     these are the standard sRGB luminance weights. */
  function isDarkColor(r, g, b) {
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
  }

  function backdropIsDark(el) {
    while (el && el !== document.documentElement) {
      if (el.dataset && el.dataset.cursor) {
        return el.dataset.cursor === 'dark';
      }
      var bg = getComputedStyle(el).backgroundColor;
      var m = bg && bg.match(/rgba?\(([^)]+)\)/);
      if (m) {
        var parts = m[1].split(',').map(parseFloat);
        var alpha = parts.length > 3 ? parts[3] : 1;
        if (alpha > 0.5) return isDarkColor(parts[0], parts[1], parts[2]);
      }
      el = el.parentElement;
    }
    return false;   /* nothing opaque found: assume the page background */
  }

  function update() {
    queued = false;
    cursor.style.left = x + 'px';
    cursor.style.top = y + 'px';

    var under = document.elementFromPoint(x, y);
    if (!under) return;

    /* Some elements stand in their own pointer — hide the dot over them. */
    cursor.classList.toggle('is-hidden', !!under.closest('[data-cursor-hide]'));

    var dark = backdropIsDark(under);
    if (dark === lastDark) return;      /* only touch classes on a change */
    lastDark = dark;
    cursor.classList.toggle('is-dark', dark);
    cursor.classList.toggle('is-light', !dark);
  }

  document.addEventListener('mousemove', function (e) {
    x = e.clientX;
    y = e.clientY;
    if (!queued) {
      queued = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });

  /* Hide it when the pointer leaves the window entirely. */
  document.addEventListener('mouseleave', function () { cursor.classList.add('is-away'); });
  document.addEventListener('mouseenter', function () { cursor.classList.remove('is-away'); });

  document.querySelectorAll('[data-message]').forEach(function (el) {
    el.addEventListener('mouseenter', function () {
      if (label) label.textContent = el.dataset.message;
      cursor.classList.add('is-message');
    });
    el.addEventListener('mouseleave', function () {
      cursor.classList.remove('is-message');
    });
  });
})();


/* =========================================================
   4. DESIGN vs CODE SLIDER
   ---------------------------------------------------------
   Each .compare--slider holds a transparent <input type="range">
   covering the whole frame. Dragging it, or using arrow keys,
   updates the --pos custom property, which clips the top layer
   and moves the handle. No drag maths, no pointer listeners,
   no library — the browser does it, and keyboard and screen
   reader support come free.
   ========================================================= */

(function () {
  /* Set to false for click-and-drag only. */
  var FOLLOW_ON_HOVER = true;

  document.querySelectorAll('.compare--slider').forEach(function (frame) {
    var range = frame.querySelector('.compare__range');
    if (!range) return;

    function apply() {
      frame.style.setProperty('--pos', range.value + '%');
    }

    range.addEventListener('input', apply);
    apply();

    if (!FOLLOW_ON_HOVER) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    /* The divider tracks the pointer, so the handle knob reads as the
       cursor itself. Throttled to one update per frame. */
    var queued = false, px = 0, py = 0;

    frame.addEventListener('mousemove', function (e) {
      px = e.clientX;
      py = e.clientY;
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        var box = frame.getBoundingClientRect();
        var pct = ((px - box.left) / box.width) * 100;
        range.value = Math.max(0, Math.min(100, pct));
        /* The knob also follows vertically, so on a tall image it sits
           under the pointer rather than stranded at the midpoint. */
        frame.style.setProperty('--posY', (py - box.top) + 'px');
        apply();
      });
    }, { passive: true });
  });
})();
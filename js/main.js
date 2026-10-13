/* =========================================================
   1. SMOOTH SCROLL + SNAP  (Lenis)
   ---------------------------------------------------------
   Lenis does not support CSS scroll-snap, so the snapping that
   used to live in style.css is handled here by lenis/snap.

   Snap points are added manually rather than with addElements()
   so each one can be offset by the nav height — otherwise a
   snapped section's top sits underneath the sticky nav.
   ========================================================= */

/* Tab sections are one screen tall per tab. Set before the snap
   points are measured below. */
document.querySelectorAll('.tabs-scroll').forEach(function (section) {
  section.style.setProperty('--tab-count', section.querySelectorAll('.tabs__item').length);
});

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

  /* Once you're this far past the top of About, snapping switches off so
     you can keep scrolling. 0.4 = 40% of the window height. Smaller
     turns it off sooner. */
  var FREE_AFTER = 0.4;
  var aboutPoint = Infinity;

  function snapEnabled() {
    /* Off on touch-width screens and when reduced motion is requested. */
    if (window.matchMedia('(max-width: 760px)').matches) return false;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    return true;
  }

  function buildSnap() {
    if (snap) {
      snap.destroy();
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

    /* One extra point per tab after the first, so each tab settles. */
    document.querySelectorAll('.tabs-scroll').forEach(function (section) {
      var pin = section.querySelector('.tabs-scroll__pin');
      var count = section.querySelectorAll('.tabs__item').length;
      for (var i = 1; i < count; i++) {
        snap.add(section.offsetTop - nav + i * pin.offsetHeight);
      }
    });

    var about = document.getElementById('about');
    if (about) {
      aboutPoint = Math.max(0, about.offsetTop - nav);
    }
  }

  buildSnap();

  /* Switch snapping off past the free point, back on above it. */
  lenis.on('scroll', function () {
    if (!snap) return;
    if (lenis.scroll > aboutPoint + window.innerHeight * FREE_AFTER) {
      snap.stop();
    } else {
      snap.start();
    }
  });

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

    /* Label comes from the nearest data-message, read fresh each time so
       it follows changes like PLAY -> PAUSE. */
    var msgEl = under.closest('[data-message]');
    if (msgEl) {
      if (label) label.textContent = msgEl.dataset.message;
      cursor.classList.add('is-message');
    } else {
      cursor.classList.remove('is-message');
    }

    var dark = backdropIsDark(under);
    if (dark === lastDark) return;      /* only touch classes on a change */
    lastDark = dark;
    cursor.classList.toggle('is-dark', dark);
    cursor.classList.toggle('is-light', !dark);
  }

  function queue() {
    if (!queued) {
      queued = true;
      requestAnimationFrame(update);
    }
  }

  document.addEventListener('mousemove', function (e) {
    x = e.clientX;
    y = e.clientY;
    queue();
  }, { passive: true });

  /* Re-check without the mouse moving: when the page scrolls under it,
     and when a video starts or stops (media events don't bubble, so
     these listen in the capture phase). */
  window.addEventListener('scroll', queue, { passive: true });
  document.addEventListener('play', queue, true);
  document.addEventListener('pause', queue, true);

  /* Hide it when the pointer leaves the window entirely. */
  document.addEventListener('mouseleave', function () { cursor.classList.add('is-away'); });
  document.addEventListener('mouseenter', function () { cursor.classList.remove('is-away'); });

})();


/* =========================================================
   3b. SECTION DOTS
   Shows the dots only while a project section is in view, and
   fills the dot for whichever one is in the middle of the screen.
   Clicking is handled by Lenis, same as the nav anchors.
   ========================================================= */

(function () {
  var dots = document.querySelector('.dots');
  if (!dots || !('IntersectionObserver' in window)) return;

  var links = dots.querySelectorAll('a');
  var map = {};
  links.forEach(function (link) {
    var section = document.querySelector(link.getAttribute('href'));
    if (section) {
      map[section.id] = link;
    }
  });

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var link = map[entry.target.id];
      links.forEach(function (l) { l.classList.remove('is-active'); });
      if (link) {
        link.classList.add('is-active');
        dots.classList.add('is-visible');
      } else {
        dots.classList.remove('is-visible');   /* hero or about */
      }
    });
  }, { rootMargin: '-45% 0px -45% 0px' });

  document.querySelectorAll('.section').forEach(function (section) {
    observer.observe(section);
  });
})();


/* =========================================================
   4. TAB GROUP
   ---------------------------------------------------------
   Desktop: the section is one screen tall per tab and its content
   is pinned, so scrolling decides which tab is open. Clicking a
   title scrolls to that tab's spot.
   Phones: no pinning; tapping a title opens it.

   Panels: a video plays / pauses on click and the cursor label
   follows (PLAY / PAUSE). A panel that is an <a> just opens its link.
   ========================================================= */

(function () {
  var desktop = window.matchMedia('(min-width: 761px)');

  function navHeight() {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 72;
  }

  document.querySelectorAll('.tabs').forEach(function (group) {
    var section = group.closest('.tabs-scroll');
    var pin = group.closest('.tabs-scroll__pin');
    var items = group.querySelectorAll('.tabs__item');
    var panels = group.querySelectorAll('.tabs__panel');
    var count = items.length;
    var current = -1;

    function show(index) {
      if (index < 0) {
        index = 0;
      }
      if (index > count - 1) {
        index = count - 1;
      }
      if (index === current) return;
      current = index;

      items.forEach(function (item, i) {
        var on = (i === index);
        item.classList.toggle('is-active', on);
        item.querySelector('.tabs__title').setAttribute('aria-expanded', String(on));
      });

      panels.forEach(function (panel, i) {
        panel.classList.toggle('is-active', i === index);
        /* Leaving a tab stops its video. */
        var video = panel.querySelector('video');
        if (video && i !== index) {
          video.pause();
        }
      });
    }

    /* --- scroll position -> tab --- */

    function scrollDriven() {
      return section && pin && desktop.matches;
    }

    /* How far the pinned part has scrolled, in whole screens. */
    function indexFromScroll() {
      var scrolled = navHeight() - section.getBoundingClientRect().top;
      return Math.round(scrolled / pin.offsetHeight);
    }

    var queued = false;
    window.addEventListener('scroll', function () {
      if (!scrollDriven() || queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        show(indexFromScroll());
      });
    }, { passive: true });

    /* --- clicking a title --- */

    items.forEach(function (item, i) {
      item.querySelector('.tabs__title').addEventListener('click', function () {
        if (scrollDriven()) {
          var top = window.scrollY + section.getBoundingClientRect().top - navHeight();
          var target = top + i * pin.offsetHeight;
          if (window.lenis) {
            window.lenis.scrollTo(target);
          } else {
            window.scrollTo({ top: target, behavior: 'smooth' });
          }
        } else {
          show(i);
        }
      });
    });

    /* --- video panels: click to play / pause --- */

    panels.forEach(function (panel) {
      var video = panel.querySelector('video');
      if (!video) return;

      video.addEventListener('play', function () { panel.dataset.message = 'Pause'; });
      video.addEventListener('pause', function () { panel.dataset.message = 'Play'; });
      video.addEventListener('ended', function () { panel.dataset.message = 'Play'; });

      panel.addEventListener('click', function () {
        if (video.paused) {
          video.play().catch(function () {});   /* missing file: nothing happens */
        } else {
          video.pause();
        }
      });
    });

    if (scrollDriven()) {
      show(Math.max(0, indexFromScroll()));
    } else {
      show(0);
    }
  });
})();


/* =========================================================
   5. DESIGN vs CODE SLIDER
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


/* =========================================================
   6. "DESIGNER" HOVER
   Swaps the dot for a Figma-style multiplayer cursor and fills
   in the selection frame's size tag with the word's real size.
   ========================================================= */

(function () {
  var mp = document.querySelector('.mp-cursor');
  var targets = document.querySelectorAll('.sel');
  if (!targets.length) return;

  targets.forEach(function (el) {
    var size = el.querySelector('.sel__size');

    el.addEventListener('mouseenter', function () {
      if (size) {
        var box = el.getBoundingClientRect();
        size.textContent = Math.round(box.width) + ' × ' + Math.round(box.height);
      }
      if (mp) {
        mp.classList.add('is-on');
      }
    });

    el.addEventListener('mouseleave', function () {
      if (mp) {
        mp.classList.remove('is-on');
      }
    });
  });

  if (!mp) return;

  document.addEventListener('mousemove', function (e) {
    mp.style.transform = 'translate(' + e.clientX + 'px, ' + e.clientY + 'px)';
  }, { passive: true });
})();
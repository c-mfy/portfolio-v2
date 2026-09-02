// /* Underlines WORK or ABOUT in the nav depending on which section
//    is currently on screen. This is the only JavaScript on the site —
//    scrolling, snapping, and hover states are all CSS. */

// (function () {
//   var links = document.querySelectorAll('.nav__links a[href^="#"]');
//   if (!links.length || !('IntersectionObserver' in window)) return;

//   var map = {};
//   links.forEach(function (link) {
//     var section = document.querySelector(link.getAttribute('href'));
//     if (section) map[section.id] = link;
//   });

//   var observer = new IntersectionObserver(function (entries) {
//     entries.forEach(function (entry) {
//       if (!entry.isIntersecting) return;
//       links.forEach(function (l) { l.classList.remove('is-active'); });
//       if (map[entry.target.id]) map[entry.target.id].classList.add('is-active');
//     });
//   }, { rootMargin: '-45% 0px -45% 0px' });

//   Object.keys(map).forEach(function (id) {
//     observer.observe(document.getElementById(id));
//   });
// })();
(function() {
  var THRESHOLD = 120;
  var sidebarBrand = document.querySelector('.sidebar-brand');
  var wordmark = document.querySelector('.wordmark');
  function updateBrand() {
    var past = window.scrollY > THRESHOLD;
    if (sidebarBrand) {
      sidebarBrand.classList.toggle('sidebar-brand-hidden', past);
      sidebarBrand.classList.toggle('sidebar-brand-visible', !past);
    }
    if (wordmark) {
      wordmark.classList.toggle('wordmark-visible', past);
      wordmark.classList.toggle('wordmark-hidden', !past);
    }
  }
  // Skip the initial sync when a fragment will auto-scroll the page past the
  // threshold (e.g. /index2.html#archive). The server already emitted the
  // scrolled-state classes, and the browser's hash scroll will fire a scroll
  // event that keeps things in sync. If we ran updateBrand() here we'd read
  // scrollY=0, flip to the "visible" state, then the hash scroll would flip
  // back — a visible fade-in/fade-out flicker.
  if (!location.hash || location.hash === '#main-content') {
    updateBrand();
  }
  window.addEventListener('scroll', updateBrand, { passive: true });

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  function scrollBehavior() {
    return reduceMotion && reduceMotion.matches ? 'auto' : 'smooth';
  }

  document.querySelectorAll('[data-carousel]').forEach(function(carousel) {
    var track = carousel.querySelector('[data-carousel-track]');
    var prev = carousel.querySelector('.featured-carousel-prev');
    var next = carousel.querySelector('.featured-carousel-next');
    if (!track || !prev || !next) return;
    function step() {
      var firstCard = track.querySelector('.post-card');
      if (!firstCard) return 300;
      var gap = parseInt(getComputedStyle(track).columnGap || getComputedStyle(track).gap, 10) || 0;
      return firstCard.getBoundingClientRect().width + gap;
    }
    function atStart() { return track.scrollLeft <= 1; }
    function atEnd() { return track.scrollLeft >= track.scrollWidth - track.clientWidth - 1; }
    prev.addEventListener('click', function() {
      if (atStart()) {
        track.scrollTo({ left: track.scrollWidth, behavior: scrollBehavior() });
      } else {
        track.scrollBy({ left: -step(), behavior: scrollBehavior() });
      }
    });
    next.addEventListener('click', function() {
      if (atEnd()) {
        track.scrollTo({ left: 0, behavior: scrollBehavior() });
      } else {
        track.scrollBy({ left: step(), behavior: scrollBehavior() });
      }
    });
  });
})();

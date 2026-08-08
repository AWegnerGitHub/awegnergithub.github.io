/* ==========================================================================
   Andrew Wegner — site behaviour

   Every module is optional: it runs only if its markup is on the page, and
   nothing here is load-bearing. With JavaScript off the page is complete —
   the carousel shows every card, the filters are absent rather than broken,
   and the contents list is a plain anchor list.

   All scroll work is batched through requestAnimationFrame, so a scroll event
   never triggers a synchronous layout read followed by a style write.
   ========================================================================== */

(function () {
  'use strict';

  var HEADER_OFFSET = 100;

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  function all(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  /* CSS `scroll-behavior: auto` only governs scrolls that ask for `auto`; an
     explicit `behavior: 'smooth'` on a scroll call beats it. Anything here that
     scrolls the page for the reader has to ask this first, or the reduced-motion
     block in the stylesheet is silently bypassed. Kept live rather than read
     once, so a preference changed after load is honoured. */
  var motionQuery = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

  function reducedMotion() {
    return !!(motionQuery && motionQuery.matches);
  }

  function docScroll() {
    return window.pageYOffset || document.documentElement.scrollTop || 0;
  }

  function maxScroll() {
    return Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  }

  /* Coalesce every scroll/resize burst into one frame. */
  function onViewport(fn) {
    var queued = false;

    function run() {
      queued = false;
      fn();
    }

    function schedule() {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(run);
    }

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('load', schedule);
    fn();
    return schedule;
  }

  /* ----------------------------------------------------------------------
     Reading progress line in the header
     ---------------------------------------------------------------------- */

  function initProgress() {
    var bar = document.querySelector('[data-progress]');
    if (!bar) return;
    var last = -1;

    onViewport(function () {
      var pct = Math.round(Math.max(0, Math.min(100, (docScroll() / maxScroll()) * 100)));
      if (pct === last) return;
      last = pct;
      bar.style.width = pct + '%';
    });
  }

  /* ----------------------------------------------------------------------
     Homepage: the hero headshot hands off to the header as you scroll

     While the header brand is faded out it is also `visibility: hidden`, so
     it never becomes an invisible tab stop. Focus inside the header pins it
     visible regardless of scroll position.
     ---------------------------------------------------------------------- */

  function initBrandHandoff() {
    var hero = document.querySelector('[data-herobrand]');
    var brand = document.querySelector('[data-navbrandlink]');
    var mark = document.querySelector('[data-navbrand]');
    var name = document.querySelector('[data-navname]');
    if (!hero || !brand || !mark) return;

    var focused = false;

    function paint() {
      var p = focused ? 1 : Math.max(0, Math.min(1, docScroll() / 130));
      mark.style.opacity = p;
      mark.style.transform = 'translateY(' + (1 - p) * 6 + 'px)';
      if (name) name.style.opacity = p;
      brand.style.visibility = p < 0.06 ? 'hidden' : 'visible';
      hero.style.opacity = Math.max(0, 1 - p * 1.5);
    }

    var schedule = onViewport(paint);

    brand.addEventListener('focusin', function () { focused = true; paint(); });
    brand.addEventListener('focusout', function () { focused = false; schedule(); });
  }

  /* ----------------------------------------------------------------------
     Carousel — three positions, articles shift up a slot

     With no JS every card renders, which is why the controls start hidden
     and are revealed here only once rotation is actually possible.
     ---------------------------------------------------------------------- */

  function initCarousels() {
    all('[data-carousel]').forEach(function (el) {
      var key = el.getAttribute('data-carousel');
      var items = all('.carousel__item', el);
      var count = items.length;
      var controls = document.querySelector('[data-carousel-controls="' + key + '"]');
      var offset = 0;

      if (controls) {
        // Revealed only when there is something to rotate to. There is no
        // position readout: three of seven is true before the first click and
        // after every one of them, so it reported nothing and read as broken.
        controls.hidden = count <= 3;
      }

      function render() {
        items.forEach(function (item) {
          item.hidden = true;
          item.removeAttribute('data-slot');
        });
        for (var i = 0; i < Math.min(3, count); i++) {
          var item = items[(offset + i) % count];
          item.hidden = false;
          item.setAttribute('data-slot', String(i + 1));
        }
      }

      function step(dir) {
        offset = ((offset + dir) % count + count) % count;
        render();
      }

      render();

      if (count <= 3) return;

      /* Only the lead tile carries a summary, so every window through the deck
         is a different height — 24px between the shortest and the tallest at
         1280, 72px at 700. The grid is pinned to the tallest window it will
         ever show, because otherwise every rotation shunts the rest of the
         page up or down by that much. The slack lands inside the tiles, where
         `margin-top: auto` on the lead's read link absorbs it, rather than as
         a gap underneath. */
      function lockHeight() {
        var was = offset;
        var tallest = 0;
        el.style.minHeight = '';
        for (var i = 0; i < count; i++) {
          offset = i;
          render();
          if (el.offsetHeight > tallest) tallest = el.offsetHeight;
        }
        offset = was;
        render();
        el.style.minHeight = Math.ceil(tallest) + 'px';
      }

      lockHeight();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(lockHeight);

      var relock = null;
      window.addEventListener('resize', function () {
        window.clearTimeout(relock);
        relock = window.setTimeout(lockHeight, 180);
      }, { passive: true });

      /* ------------------------------------------------------------------
         Rotation

         The layout change is shown rather than covered up. Each tile is
         animated along the line it actually travels: the compact tile that
         keeps its size glides the whole distance between its two slots, and
         the one tile per rotation that changes size — the promotion into the
         lead, or the demotion out of it — cannot glide without scaling its
         own type, so it dissolves with a short nudge along that same line
         while a copy of its old rendering dissolves out of the slot it left.
         The tile dropping out of the window does the same. Every slot has
         something on it in every frame, which the previous version did not:
         it faded the component to nothing, swapped, and faded it back, and a
         blank component reads as a blink.

         Directions are not hard-coded. They are read off the slot boxes on
         each rotation, so the same code gives sideways travel where the grid
         puts the lead beside the queue and vertical travel where the narrow
         layout stacks them.

         Durations, easing and the reduced-motion policy are the stylesheet's;
         this measures, classifies, and sets start states. */
      var NUDGE = 24;                 // dissolve travel, px
      var ROTATE_MS = 260;            // outlasts the longest transition in site.css
      var settle = 0;

      function boxOf(node, base) {
        var r = node.getBoundingClientRect();
        return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
      }

      // Dominant axis of the path from `from` to `to`, as a unit step.
      function heading(to, from) {
        var dx = to.x - from.x;
        var dy = to.y - from.y;
        if (Math.abs(dx) >= Math.abs(dy)) return { x: dx < 0 ? -1 : 1, y: 0 };
        return { x: 0, y: dy < 0 ? -1 : 1 };
      }

      function shown() {
        return items.filter(function (item) { return !item.hidden; });
      }

      function clearInline() {
        items.forEach(function (item) {
          item.style.transform = '';
          item.style.opacity = '';
        });
      }

      // A copy of a tile as it looked before the swap, parked over the box it
      // occupied, inert, and dropped once it has dissolved. The copy is taken
      // before the swap, so it still carries the slot the tile was rendered
      // at — which is what decides its size, its type scale and whether it
      // shows a summary.
      function ghost(copy, at, away) {
        copy.classList.add('carousel__ghost');
        copy.removeAttribute('href');
        copy.removeAttribute('id');
        copy.setAttribute('aria-hidden', 'true');
        copy.setAttribute('tabindex', '-1');
        copy.hidden = false;
        copy.style.left = at.x + 'px';
        copy.style.top = at.y + 'px';
        copy.style.width = at.w + 'px';
        copy.style.height = at.h + 'px';
        el.appendChild(copy);
        window.setTimeout(function () {
          if (copy.parentNode) copy.parentNode.removeChild(copy);
        }, ROTATE_MS);
        return function () {
          copy.style.opacity = '0';
          copy.style.transform = 'translate(' + away.x * NUDGE + 'px,' + away.y * NUDGE + 'px)';
        };
      }

      function rotate(dir) {
        if (count <= 3) return;

        if (reducedMotion()) {
          step(dir);
          return;
        }

        /* Read first. A press landing mid-rotation is measured from wherever
           the tiles have actually got to — `getBoundingClientRect` reports the
           transformed box — so the next glide picks up from there instead of
           snapping back to rest and starting again. */
        var base = el.getBoundingClientRect();
        var was = shown().map(function (item) {
          return {
            el: item,
            slot: item.getAttribute('data-slot'),
            at: boxOf(item, base),
            copy: item.cloneNode(true)
          };
        });
        window.clearTimeout(settle);
        el.setAttribute('data-rotating', 'prime');
        clearInline();
        step(dir);
        base = el.getBoundingClientRect();

        // Slot geometry, read after the swap so it is always at rest. Reading
        // it from the boxes above would put a slot wherever a tile happened to
        // be mid-glide when a second press landed.
        var slotAt = {};
        shown().forEach(function (item) {
          slotAt[item.getAttribute('data-slot')] = boxOf(item, base);
        });

        // Promotion runs slot 2 → slot 1, demotion slot 2 → slot 3. A tile
        // leaving the window follows the first when rotating forward and the
        // second when rotating back; a tile entering it arrives from the
        // other end.
        var promote = heading(slotAt['1'], slotAt['2']);
        var demote = heading(slotAt['3'], slotAt['2']);
        var out = dir > 0 ? promote : demote;
        var into = dir > 0 ? demote : promote;

        var starts = [];
        var reveals = [];
        var covered = {};

        // `w.slot` is the slot a tile came from, and so where its copy sits;
        // `arrivesAt` is the one it is rendered at now.
        was.forEach(function (w) {
          var arrivesAt = w.el.getAttribute('data-slot');
          if (w.el.hidden) {
            covered[w.slot] = true;
            reveals.push(ghost(w.copy, w.at, out));
            return;
          }
          var now = boxOf(w.el, base);
          var dx = w.at.x - now.x;
          var dy = w.at.y - now.y;
          if (Math.abs(w.at.w - now.w) < 1 && Math.abs(w.at.h - now.h) < 1) {
            if (dx || dy) starts.push({ el: w.el, dx: dx, dy: dy });
            return;
          }
          // Changed size, so it cannot glide without scaling its own type.
          var path = heading(now, w.at);
          covered[w.slot] = true;
          reveals.push(ghost(w.copy, w.at, path));
          starts.push({ el: w.el, slot: arrivesAt, dx: -path.x * NUDGE, dy: -path.y * NUDGE });
        });

        shown().forEach(function (item) {
          for (var i = 0; i < was.length; i++) if (was[i].el === item) return;
          starts.push({
            el: item,
            slot: item.getAttribute('data-slot'),
            dx: into.x * NUDGE,
            dy: into.y * NUDGE
          });
        });

        /* A tile arriving over a copy of the tile that was there slides in
           opaque and covers it — two headlines cross-fading through each
           other is unreadable, and it was the worst thing about the version
           this replaces. Only a tile arriving on a slot that nothing is
           holding fades up, and there is at most one of those per rotation. */
        starts.forEach(function (s) {
          s.el.style.transform = 'translate(' + s.dx + 'px,' + s.dy + 'px)';
          if (s.slot && !covered[s.slot]) s.el.style.opacity = '0';
        });

        // Paint the start, then let go of it in the same frame the rotation
        // transition is switched on.
        void el.offsetWidth;
        el.setAttribute('data-rotating', dir > 0 ? 'next' : 'prev');
        clearInline();
        reveals.forEach(function (go) { go(); });

        settle = window.setTimeout(function () {
          el.removeAttribute('data-rotating');
        }, ROTATE_MS);
      }

      if (controls) {
        var prev = controls.querySelector('[data-carousel-prev]');
        var next = controls.querySelector('[data-carousel-next]');
        if (prev) prev.addEventListener('click', function () { rotate(-1); });
        if (next) next.addEventListener('click', function () { rotate(1); });
      }

      // horizontal trackpad swipe
      var acc = 0;
      var timer = null;
      el.addEventListener('wheel', function (e) {
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
        e.preventDefault();
        acc += e.deltaX;
        clearTimeout(timer);
        timer = setTimeout(function () { acc = 0; }, 220);
        if (Math.abs(acc) > 45) {
          rotate(acc > 0 ? 1 : -1);
          acc = 0;
        }
      }, { passive: false });

      // drag sideways
      var startX = null;
      var dragged = false;
      el.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        startX = e.clientX;
        dragged = false;
      });
      el.addEventListener('pointerup', function (e) {
        if (startX === null) return;
        var dx = e.clientX - startX;
        startX = null;
        if (Math.abs(dx) > 55) {
          dragged = true;
          rotate(dx < 0 ? 1 : -1);
        }
      });
      el.addEventListener('click', function (e) {
        if (dragged) {
          e.preventDefault();
          dragged = false;
        }
      }, true);
    });
  }

  /* ----------------------------------------------------------------------
     Category filters — homepage archive panel and the archives page
     ---------------------------------------------------------------------- */

  function plural(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  function initFilters() {
    all('[data-filter-scope]').forEach(function (scope) {
      var summary = scope.querySelector('[data-filter-summary]');
      var shown = scope.querySelector('[data-filter-shown]');
      var controls = scope.querySelector('[data-filter-controls]');
      var chips = [];
      var rows = [];
      var groups = [];
      var live = 'All';

      /* Re-read the DOM rather than closing over one snapshot of it: the home
         panel grows when the reader loads older posts, and those rows have to
         be filterable too. `filters:refresh` is how that module says so. */
      function rescan() {
        chips = all('[data-filter]', scope);
        rows = all('[data-category]', scope);
        groups = all('[data-filter-group]', scope);
      }

      function apply(value) {
        live = value;
        var visible = 0;

        rows.forEach(function (row) {
          var match = value === 'All' || row.getAttribute('data-category') === value;
          row.hidden = !match;
          if (match) visible++;
        });

        var liveGroups = 0;

        groups.forEach(function (group) {
          var live = all('[data-category]', group).filter(function (row) { return !row.hidden; });

          live.forEach(function (row, i) {
            row.classList.toggle('is-alt', i % 2 === 1);
          });

          group.hidden = live.length === 0;
          if (live.length) liveGroups++;

          var count = group.querySelector('[data-year-count]');
          if (count) count.textContent = plural(live.length, 'post');

          var year = group.getAttribute('data-year');
          if (year) {
            var railLink = document.querySelector('[data-toc-link="y' + year + '"]');
            if (railLink) {
              railLink.hidden = live.length === 0;
              var railCount = railLink.querySelector('[data-toc-count]');
              if (railCount) railCount.textContent = live.length;
            }
          }
        });

        if (shown) shown.textContent = visible;

        if (summary) {
          summary.textContent = value === 'All'
            ? plural(visible, 'post') + ' across ' + plural(liveGroups, 'year')
            : plural(visible, 'post') + ' in ' + value;
        }

        chips.forEach(function (chip) {
          chip.setAttribute('aria-pressed', chip.getAttribute('data-filter') === value ? 'true' : 'false');
        });
      }

      /* One delegated listener, so a chip added later works without rebinding. */
      scope.addEventListener('click', function (e) {
        var chip = e.target.closest && e.target.closest('[data-filter]');
        if (chip && scope.contains(chip)) apply(chip.getAttribute('data-filter'));
      });

      scope.addEventListener('filters:refresh', function () {
        rescan();
        apply(live);
      });

      rescan();
      if (!chips.length || !rows.length) return;

      // The chips ship hidden so a no-JS reader is never shown a control that
      // does nothing. Same contract as the carousel stepper.
      if (controls) controls.hidden = false;

      var initial = chips.filter(function (c) { return c.getAttribute('aria-pressed') === 'true'; })[0];
      apply(initial ? initial.getAttribute('data-filter') : 'All');
    });
  }

  /* ----------------------------------------------------------------------
     Home archive panel — older posts arrive in place

     The index is paginated, so the rows below the third card are only the
     first page of them. Rather than sending the reader to index2.html, this
     fetches that page, lifts its year groups out and appends them to the panel
     already on screen. Nothing about the built site changes: the paginated
     pages still exist, still carry their own pager, and are still what a
     crawler and a scripting-off reader follow.

     The next page's URL comes from <link rel="next">, in the live document to
     start with and then in each fetched one, so the walk needs no state beyond
     "what does the page I just read point at".
     ---------------------------------------------------------------------- */

  function initLoadMore() {
    var block = document.querySelector('[data-loadmore]');
    if (!block) return;

    var button = block.querySelector('[data-loadmore-btn]');
    var panel = block.closest('[data-filter-scope]');
    if (!button || !panel || !window.fetch || !window.DOMParser) return;

    var pager = document.querySelector('.pager');
    var total = document.querySelector('[data-filter-total]');
    var label = button.textContent;
    var next = nextHref(document);
    if (!next) return;

    /* JS owns paging from here, so the pager would be a second control for the
       same job — and it would disagree, since "Page 1 of 15" stops being true
       the moment page 2's rows are in this one. */
    block.hidden = false;
    if (pager) pager.hidden = true;

    function nextHref(doc) {
      var link = doc.querySelector('link[rel="next"]');
      return (link && link.getAttribute('href')) || null;
    }

    /* Move a fetched page's rows in. A year the panel already shows gains rows;
       a year it does not gains a group, placed above the control so the button
       stays at the bottom and keeps its place under the reader's cursor. */
    function absorb(doc) {
      var added = 0;

      all('.mini-year', doc).forEach(function (group) {
        var year = group.getAttribute('data-year');
        var here = year ? panel.querySelector('.mini-year[data-year="' + year + '"]') : null;
        var rows = all('.mini-row-item', group);
        if (!rows.length) return;
        added += rows.length;

        if (here) {
          var list = here.querySelector('.mini-year__rows');
          rows.forEach(function (row) { list.appendChild(row); });
        } else {
          panel.insertBefore(group, block);
        }
      });

      return added;
    }

    /* A page further down the archive can be the first to mention a category.
       The chips are built from what is on screen, so they grow with it. */
    function syncChips() {
      var controls = panel.querySelector('[data-filter-controls]');
      if (!controls) return;

      var known = all('[data-filter]', controls).map(function (chip) {
        return chip.getAttribute('data-filter');
      });

      all('[data-category]', panel).map(function (row) {
        return row.getAttribute('data-category');
      }).filter(function (cat, i, list) {
        return cat && known.indexOf(cat) === -1 && list.indexOf(cat) === i;
      }).sort().forEach(function (cat) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.setAttribute('data-filter', cat);
        chip.setAttribute('aria-pressed', 'false');
        chip.textContent = cat;

        /* Alphabetically, after All — appending instead would leave the row
           sorted per batch rather than sorted, which after fourteen loads
           reads as no order at all. */
        var before = all('[data-filter]', controls).filter(function (existing) {
          var name = existing.getAttribute('data-filter');
          return name !== 'All' && name.toLowerCase() > cat.toLowerCase();
        })[0];
        controls.insertBefore(chip, before || null);
      });
    }

    /* Disabling the focused button hands focus to <body>, so a reader who
       pressed Enter would come back to find themselves at the top of the
       document. Put it back: on the button while there is more to load, and on
       the link below it once the control has gone. */
    function settle(text, done, held) {
      button.disabled = false;
      button.textContent = text;
      if (done) block.hidden = true;
      if (!held) return;
      if (!done) {
        button.focus();
        return;
      }
      var after = panel.querySelector('.archive-panel__more a');
      if (after) after.focus();
    }

    button.addEventListener('click', function () {
      if (button.disabled || !next) return;
      var held = document.activeElement === button;
      button.disabled = true;
      button.textContent = 'Loading…';

      window.fetch(next, { credentials: 'same-origin' }).then(function (response) {
        if (!response.ok) throw new Error(response.status);
        return response.text();
      }).then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var added = absorb(doc);
        next = nextHref(doc);

        if (added) {
          syncChips();
          if (total) total.textContent = all('[data-category]', panel).length;
          /* Re-filter, which also re-counts and re-stripes: the panel is a
             different list than it was a moment ago. */
          panel.dispatchEvent(new CustomEvent('filters:refresh'));
        }

        settle(label, !next, held);
      }).catch(function () {
        /* The network is the one part of this that is not ours. Hand paging
           back to the control that does not need it. */
        settle(label, true, held);
        if (pager) pager.hidden = false;
      });
    });
  }

  /* ----------------------------------------------------------------------
     Contents rail — marks the section you are reading, jumps on click

     Targets are resolved from each link's own hash, so this works both for
     the generated article contents list and for the hand-built year list on
     the archives page.
     ---------------------------------------------------------------------- */

  function initContentsRail() {
    var rail = document.querySelector('[data-contents]');
    if (!rail) return;

    var pairs = all('a[href^="#"]', rail).map(function (link) {
      var id = decodeURIComponent(link.getAttribute('href').slice(1));
      return { link: link, target: id ? document.getElementById(id) : null };
    }).filter(function (p) { return p.target; });

    if (!pairs.length) return;

    function sync() {
      var line = docScroll() + HEADER_OFFSET + 70;
      var atEnd = docScroll() >= maxScroll() - 4;
      var active = null;

      pairs.forEach(function (p) {
        if (p.link.hidden || p.target.hidden) return;
        if (!active) active = p;
        if (p.target.getBoundingClientRect().top + docScroll() <= line) active = p;
        if (atEnd) active = p;
      });

      pairs.forEach(function (p) {
        p.link.setAttribute('data-active', active && p.link === active.link ? '1' : '0');
      });
    }

    pairs.forEach(function (p) {
      p.link.addEventListener('click', function (e) {
        e.preventDefault();
        var top = Math.max(0, p.target.getBoundingClientRect().top + docScroll() - HEADER_OFFSET);
        window.scrollTo({ top: top, behavior: reducedMotion() ? 'auto' : 'smooth' });
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', p.link.getAttribute('href'));
        }
      });
    });

    onViewport(sync);
  }

  /* ----------------------------------------------------------------------
     Categories / Tags — sort A–Z or by post count
     ---------------------------------------------------------------------- */

  function initSort() {
    var list = document.querySelector('[data-sort-list]');
    var buttons = all('[data-sort]');
    if (!list || !buttons.length) return;

    var terms = all('[data-name]', list);
    if (!terms.length) return;

    var controls = document.querySelector('[data-sort-controls]');
    if (controls) controls.hidden = false;

    function apply(mode) {
      var sorted = terms.slice().sort(function (a, b) {
        var an = a.getAttribute('data-name').toLowerCase();
        var bn = b.getAttribute('data-name').toLowerCase();
        if (mode === 'count') {
          var diff = Number(b.getAttribute('data-count')) - Number(a.getAttribute('data-count'));
          if (diff) return diff;
        }
        return an.localeCompare(bn);
      });

      sorted.forEach(function (term) { list.appendChild(term); });

      buttons.forEach(function (button) {
        button.setAttribute('aria-pressed', button.getAttribute('data-sort') === mode ? 'true' : 'false');
      });
    }

    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        apply(button.getAttribute('data-sort'));
      });
    });
  }

  /* ----------------------------------------------------------------------
     Light/dark toggle

     The inline script in <head> has already applied any saved choice before
     the first paint; this only wires the button and keeps the labelling
     honest. Nothing is written to storage until the reader presses it, so a
     first-time visitor keeps following their system setting — including when
     that setting changes while the page is open.

     Which scheme is *painted* is decided entirely in CSS. This function never
     sets a colour; it sets the one attribute the stylesheet keys off, and —
     for the length of the change only — one class that lets the stylesheet
     cross-fade it. See `crossfade()` below.
     ---------------------------------------------------------------------- */

  var THEME_KEY = 'theme';

  function initThemeToggle() {
    var button = document.querySelector('[data-theme-toggle]');
    if (!button) return;

    var root = document.documentElement;
    var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    /* The chosen scheme if there is one, otherwise whatever the system asks
       for — the same order of precedence the stylesheet applies. */
    function scheme() {
      var chosen = root.getAttribute('data-theme');
      if (chosen === 'light' || chosen === 'dark') return chosen;
      return media && media.matches ? 'dark' : 'light';
    }

    /* Name the destination, matching the glyph CSS is showing. */
    function relabel() {
      var text = 'Switch to ' + (scheme() === 'dark' ? 'light' : 'dark') + ' theme';
      button.setAttribute('aria-label', text);
      button.setAttribute('title', text);
    }

    /* Put the mobile browser's own chrome on the same ground as the page.

       partial/icon.html ships one tag per scheme, each scoped with
       `media="(prefers-color-scheme: …)"`, so with no JavaScript at all the
       browser already picks the right one — that is the whole point of the
       markup and this function must not undo it. It has exactly one job: the
       `media` attribute answers what the *system* asks for, and once the reader
       has pressed the toggle that is the wrong question. So while a choice is
       in force both tags carry the chosen scheme's colour, and whichever one
       the browser matches gives the same answer.

       The colours are read back off the tags rather than out of the token
       table. That keeps an oklch() string out of the meta tag — the previous
       version wrote one, which anything that cannot parse oklch ignored
       entirely — and it means this function never needs to know a colour.
       thoughts.md #20a. */
    var themeColorTags = all('meta[name="theme-color"][media]');
    var authoredThemeColor = {};

    function schemeOf(tag) {
      return /dark/.test(tag.getAttribute('media') || '') ? 'dark' : 'light';
    }

    themeColorTags.forEach(function (tag) {
      authoredThemeColor[schemeOf(tag)] = tag.getAttribute('content');
    });

    function paintBrowserChrome() {
      if (!themeColorTags.length) return;
      var chosen = root.getAttribute('data-theme');
      /* No choice, or a scheme with no tag of its own to borrow from: let each
         tag answer for itself and let `media` do the matching. */
      var override = (chosen === 'light' || chosen === 'dark')
        ? authoredThemeColor[chosen]
        : null;
      themeColorTags.forEach(function (tag) {
        tag.setAttribute('content', override || authoredThemeColor[schemeOf(tag)]);
      });
    }

    /* thoughts.md #20 — cross-fade the scheme change instead of swapping it.

       The duration, the property list and the reduced-motion policy all live
       in the stylesheet's "Scheme change" block; this reads the one token and
       does nothing else. --theme-fade: 0ms — which is also what the
       reduced-motion block resolves it to — means the class is never added,
       so the instant swap costs no work here and no rule there. */
    var fadeTimer = null;

    function fadeMs() {
      var raw = getComputedStyle(root).getPropertyValue('--theme-fade').trim();
      var value = parseFloat(raw);
      if (!value) return 0;
      return /ms$/.test(raw) ? value : value * 1000;
    }

    function crossfade() {
      var ms = fadeMs();
      if (!ms) return;
      root.classList.add('theme-fade');
      /* Force the style flush here. Without it the class and the attribute
         below land in one recalculation, and the transition would be asked to
         start from a scheme that was never painted. */
      getComputedStyle(root).getPropertyValue('--paper');
      window.clearTimeout(fadeTimer);
      fadeTimer = window.setTimeout(function () {
        root.classList.remove('theme-fade');
      }, ms + 50);
    }

    button.addEventListener('click', function () {
      var next = scheme() === 'dark' ? 'light' : 'dark';
      crossfade();
      root.setAttribute('data-theme', next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (e) { /* storage blocked; the choice holds for this page only */ }
      relabel();
      paintBrowserChrome();
    });

    /* No attribute means no choice has been made and the system is still in
       charge. CSS follows it on its own; these two only need re-deriving.

       Not cross-faded, and that is not an oversight: by the time this event
       runs the new ramp is already the computed style, so adding the class
       here would transition nothing — or, worse, catch the repaint halfway.
       The fade belongs to the press, which is the one ordering we control. */
    if (media && media.addEventListener) {
      media.addEventListener('change', function () {
        if (root.getAttribute('data-theme')) return;
        relabel();
        paintBrowserChrome();
      });
    }

    relabel();
    paintBrowserChrome();
  }

  /* ----------------------------------------------------------------------
     Wide tables scroll inside themselves rather than widening the article

     The region below is correct and keyboard-reachable, but on a narrow
     viewport it gave the reader nothing: a table whose last visible column
     looks exactly like its last column. Each wrapper now carries `data-more`
     naming the edges that still have content behind them — `left`, `right`,
     `both`, or the attribute absent when the whole table fits — and the
     stylesheet paints an inset shadow against those edges alone.

     It reports rather than decorates: it is the only signal that columns
     exist off-screen, so it is *not* suppressed under reduced motion. That
     matches what the stylesheet's reduced-motion block already does — it
     removes movement and keeps the border and shadow transitions.
     microinteractions.md §3.
     ---------------------------------------------------------------------- */

  /* Widths here are fractional (`border-collapse` on a percentage-width table),
     so a region one third of a pixel narrower than its table is not cut off and
     must not claim to be. */
  var TABLE_SLACK = 2;

  function paintTableEdges(wrap) {
    var hidden = wrap.scrollWidth - wrap.clientWidth;
    var left = hidden > TABLE_SLACK && wrap.scrollLeft > TABLE_SLACK;
    var right = hidden > TABLE_SLACK && wrap.scrollLeft < hidden - TABLE_SLACK;
    var more = left && right ? 'both' : left ? 'left' : right ? 'right' : '';

    if (!more) {
      if (wrap.hasAttribute('data-more')) wrap.removeAttribute('data-more');
    } else if (wrap.getAttribute('data-more') !== more) {
      wrap.setAttribute('data-more', more);
    }
  }

  function initTableScroll() {
    var wraps = [];

    all('.prose table').forEach(function (table) {
      var parent = table.parentNode;
      var wrap;
      if (parent && parent.classList && parent.classList.contains('table-scroll')) {
        wrap = parent;
      } else {
        wrap = document.createElement('div');
        wrap.className = 'table-scroll';
        wrap.setAttribute('tabindex', '0');
        wrap.setAttribute('role', 'region');
        wrap.setAttribute('aria-label', 'Table');
        table.parentNode.insertBefore(wrap, table);
        wrap.appendChild(table);
      }
      wraps.push(wrap);
    });

    if (!wraps.length) return;

    /* Coalesced to one frame, and every region is measured on each pass. A
       resize moves all of them and a scroll moves one, but the measurement is
       two layout reads and no writes, so telling the two cases apart would buy
       a second code path and nothing else. `onViewport` is not reused here
       because these are element scroll events, not the window's. */
    var queued = false;

    function repaint() {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(function () {
        queued = false;
        wraps.forEach(paintTableEdges);
      });
    }

    wraps.forEach(function (wrap) {
      wrap.addEventListener('scroll', repaint, { passive: true });
      paintTableEdges(wrap);
    });
    window.addEventListener('resize', repaint, { passive: true });

    /* Column widths move when the webfont swaps in, which is enough to turn a
       table that fitted into one that does not. Same reason the carousel
       re-locks its height there. */
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(repaint);
  }

  ready(function () {
    initThemeToggle();
    initProgress();
    initBrandHandoff();
    initCarousels();
    initFilters();
    initLoadMore();
    initContentsRail();
    initSort();
    initTableScroll();
  });
})();

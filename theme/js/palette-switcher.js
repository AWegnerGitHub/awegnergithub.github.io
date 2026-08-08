/* ==========================================================================
   Palette switcher — TEMPORARY. thoughts.md #26.

   Self-contained: nothing in site.js knows this exists, and this touches
   nothing site.js owns except one attribute it does not read (`data-palette`)
   and the theme-color tags, which it hands back correct rather than stale —
   see paintBrowserChrome() below for why that is not optional.

   The palette is applied by the inline script in partial/palette_switcher_head
   .html, before the first paint. By the time this runs the page is already in
   the chosen ground; the job here is the control, the persistence and the two
   things CSS cannot keep honest on its own.

   Removal list: partial/palette_switcher.html.
   ========================================================================== */

(function () {
  'use strict';

  var KEY = 'palette';
  var OPEN_KEY = 'palette-open';

  /* The shipped ground carries no `data-palette` attribute, because site.css's
     :root *is* it — an attribute saying so would be a second way to state the
     same thing, and the one that goes stale. Which palette that is comes from
     the generated option list rather than from a constant here, so it follows
     PALETTES.md when the default moves. Chalk replaced Cream on 2026-07-29. */
  var DEFAULT_FALLBACK = 'chalk';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    var box = document.querySelector('[data-palette-switch]');
    if (!box) return;

    var root = document.documentElement;
    var radios = Array.prototype.slice.call(
      box.querySelectorAll('input[type="radio"][name="palette"]')
    );
    if (!radios.length) return;

    var nowName = box.querySelector('[data-palette-now]');
    var nowSwatch = box.querySelector('[data-palette-now-swatch]');

    var marker = box.querySelector('[data-palette-default]');
    var DEFAULT = (marker && marker.getAttribute('data-palette-default')) || DEFAULT_FALLBACK;

    function current() {
      return root.getAttribute('data-palette') || DEFAULT;
    }

    function labelOf(value) {
      var input = box.querySelector('input[value="' + value + '"]');
      var name = input && input.parentNode.querySelector('.palette-switch__name');
      /* The name is a text node followed by the descriptor's own element. The
         summary has room for the first of those, minus its parenthetical —
         "Cream (shipped)" does not fit in a 128px chip and "Cream" is the part
         that identifies it. */
      var text = name && name.firstChild && name.firstChild.nodeValue;
      return (text || value).replace(/\s*\(.*?\)/, '').trim();
    }

    /* ----------------------------------------------------------------------
       The browser chrome colour

       partial/icon.html authors one theme-color tag per scheme and site.js
       keeps them pointed at whichever scheme is live. Both are the *shipped*
       ground's paper, so under any other palette the phone's toolbar would sit
       against a page it no longer matches — and `tools/browser/theme-color.mjs`
       asserts the tag equals the painted --paper, an invariant this feature
       would otherwise quietly break.

       The rule below has two halves and the second one is the one that matters:
       with no palette in force this must put the tags back exactly as site.js
       would leave them, not merely stop writing to them. The first version
       overwrote both tags at init regardless, which under Chrome's dark default
       stamped the dark hex onto the light tag — caught by that suite, which is
       what it is for.

       The value is read back off a 1x1 canvas rather than written from the
       token table: --paper is an oklch() string, site.js's contract is that no
       oklch ever reaches a meta tag, and the canvas is what resolves one to the
       eight-bit colour the browser will actually paint.
       ---------------------------------------------------------------------- */

    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    var ctx = canvas.getContext && canvas.getContext('2d', { willReadFrequently: true });

    function paperHex() {
      if (!ctx) return null;
      var paper = getComputedStyle(root).getPropertyValue('--paper').trim();
      if (!paper) return null;
      /* An unparseable colour leaves fillStyle at its previous value, so the
         previous value is a sentinel no ground could be. A browser that paints
         oklch in CSS but cannot parse it here returns magenta, and this returns
         null rather than a wrong colour. */
      ctx.fillStyle = '#ff00ff';
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, 1, 1);
      var d = ctx.getImageData(0, 0, 1, 1).data;
      if (d[0] === 255 && d[1] === 0 && d[2] === 255) return null;
      return '#' + [d[0], d[1], d[2]].map(function (n) {
        return (n < 16 ? '0' : '') + n.toString(16);
      }).join('');
    }

    var tags = Array.prototype.slice.call(
      document.querySelectorAll('meta[name="theme-color"]')
    );

    function schemeOf(tag) {
      return /dark/.test(tag.getAttribute('media') || '') ? 'dark' : 'light';
    }

    /* What partial/icon.html wrote, stamped by the inline script in
       partial/palette_switcher_head.html before anything else could edit it. */
    var authored = {};
    tags.forEach(function (tag) {
      authored[schemeOf(tag)] = tag.getAttribute('data-authored');
    });

    function paintBrowserChrome() {
      if (!tags.length) return;

      if (current() === DEFAULT) {
        /* No palette in force. Restate site.js's rule rather than leaving
           whatever this function last wrote: `media` answers what the system
           asks for, and an explicit scheme choice makes that the wrong
           question, so a choice puts its own colour on both tags. */
        var chosen = root.getAttribute('data-theme');
        var override = (chosen === 'light' || chosen === 'dark')
          ? authored[chosen]
          : null;
        tags.forEach(function (tag) {
          var value = override || authored[schemeOf(tag)];
          if (value) tag.setAttribute('content', value);
        });
        return;
      }

      var hex = paperHex();
      if (!hex) return;
      tags.forEach(function (tag) { tag.setAttribute('content', hex); });
    }

    /* site.js rewrites both tags from its own table on every theme press, and
       it runs first. Rather than race it, correct the result: an attribute
       mutation callback is a microtask, so it lands after the press handler has
       finished. Also covers the OS flipping scheme under a page nobody
       touched. */
    if (window.MutationObserver) {
      new MutationObserver(paintBrowserChrome).observe(root, {
        attributes: true,
        attributeFilter: ['data-theme', 'data-palette']
      });
    }

    /* ---------------------------------------------------------------------- */

    function apply(value, persist) {
      if (value === DEFAULT) root.removeAttribute('data-palette');
      else root.setAttribute('data-palette', value);

      if (nowName) nowName.textContent = labelOf(value);
      if (nowSwatch) nowSwatch.setAttribute('data-palette', value);

      if (persist) {
        try {
          if (value === DEFAULT) localStorage.removeItem(KEY);
          else localStorage.setItem(KEY, value);
        } catch (e) { /* storage blocked; the choice holds for this page only */ }
      }
    }

    radios.forEach(function (radio) {
      radio.addEventListener('change', function () {
        if (radio.checked) apply(radio.value, true);
      });
    });

    /* The disclosure state is worth keeping too: comparing two grounds means
       reloading pages, and re-opening the panel every time is the kind of
       friction that stops the comparison being made. */
    box.addEventListener('toggle', function () {
      try {
        localStorage.setItem(OPEN_KEY, box.open ? '1' : '0');
      } catch (e) { /* storage blocked */ }
    });

    var stored = null;
    try {
      stored = localStorage.getItem(OPEN_KEY);
    } catch (e) { /* storage blocked */ }
    /* Closed on a first visit. Open, the panel is 208px wide and there is no
       window on which that clears the text column — on the home page it lands
       across the headline. The collapsed chip names itself ("Ground / Cream"),
       which is enough to say what it is, and one press opens it for as long as
       the comparison lasts. */
    box.open = stored === '1';

    /* Adopt whatever the pre-paint script applied: the markup ships with the
       shipped ground checked, and a saved palette has already been written to
       <html> by the time this runs. `false` — the value came out of storage,
       there is nothing to put back. */
    var live = current();
    var match = box.querySelector('input[value="' + live + '"]');
    if (match) match.checked = true;
    apply(match ? live : DEFAULT, false);
    paintBrowserChrome();
  });
})();

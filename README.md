# dfamaya.github.io

Static site for dfamaya's Wear OS apps: a home page, a landing page for Brief,
and per-app privacy policies and support. Plain HTML, CSS and a little vanilla
JS. No build step.

Published at: <https://enriquedfa.github.io/dfamaya/>

## Pages

- `index.html` — home page (lists all apps)
- `style.css` — shared styles (header, buttons, text pages, footer)
- `assets/favicon.svg` — site icon

### Brief

- `brief/index.html` — landing page with the live watch demo
- `brief/privacy.html` — privacy policy (text mirrors `docs/PRIVACY_POLICY.md`
  in the Brief repo; only the layout lives here)
- `brief/brief.css` — landing page + watch demo styles (also used on the home page)
- `brief/demo.js` — the demo: one glance state drawn on every surface
- `brief/icon.svg`, `brief/icon-180.png` — Brief's icon, redrawn from the app's
  launcher vectors
- `brief/og.png` — link preview image (1200×630)
- `brief/img/` — phone app screenshots (dark and light; the watch's Bluetooth
  name is painted out)

### Wear OS Watch Faces

- `watchfaces/index.html` — app overview
- `watchfaces/privacy.html` — privacy policy (covers all watch faces by dfamaya)
- `watchfaces/support.html` — support / contact info

### Redirect stubs

The watch-face pages used to live at the repo root. To keep any URLs already
submitted to Google Play working, the old paths now redirect to their new home:

- `privacy.html` → `watchfaces/privacy.html`
- `support.html` → `watchfaces/support.html`

## The Brief page

`brief/demo.js` runs one glance state and draws it on every surface on the
page at once: the three complication slots on the watch face, the tile and the
phone widget. The clock, the event countdown and the song position are live.

- **The story.** The hero and the list of sources share one section. The watch
  is `position: sticky` (beside the list on desktop, pinned under the header
  on phones), and whichever step is nearest the middle of the screen takes
  over the watch. Above the list it cycles on its own, like the app's
  onboarding. Tapping a step or a source button shows it too.
- **Which surfaces exist** is decided by markup (`data-cx`, `data-surface`,
  `data-chip`, `data-step`, `data-clock`, `data-tilt`), so the same script runs
  the landing page and the small watch on the home page.
- **What each slot shows** (title vs. text line, icon, uppercase short text,
  the weather ring's marker dot) follows the watch's `ComplicationRenderer`.
  The widget follows the real phone widget: badge, two lines, and a pill,
  play/pause or progress bar when the glance has one.
- **Colour.** Each source has its tone-30 / tone-90 pair from the phone app's
  `Theme.kt`. The page, the chips and the watch face all ease to the current
  source's colour.
- **Icons** are an inline SVG sprite built from the watch app's own
  `res/drawable` Material Symbols, plus a few rounded symbols for the page.
- It pauses when it's off screen or the tab is hidden, has a pause button, and
  uses a plain crossfade for people who prefer reduced motion.

To change the sample content, edit the `SOURCES` array at the top of
`demo.js`.

### Newer web platform features in use

Most are progressive: a browser without one just skips the effect. The
exception is `light-dark()`, which the colour tokens depend on; it needs Chrome
or Edge 123, Safari 17.5 or Firefox 120 (all from 2024).

- Cross-document **view transitions** (`@view-transition`): the header stays
  put between pages, and the Brief watch and icon morph from the home page
  into the Brief page.
- **Scroll-driven animations**: the header's bottom border, sections fading
  in, and the watch crown turning as you scroll.
- **`scroll-state()` container queries**: the pinned watch tucks in slightly
  once it's stuck on a phone.
- **`light-dark()`** colour tokens with `color-scheme`, **relative colour
  syntax** (`oklch(from …)`) to lift the pastel source tones on the black
  dial, and **`@property`** so those colours can transition.
- **Container query units** (`cqw`) size everything on the watch face from the
  dial's width.
- **`interpolate-size`** + `::details-content` for FAQ answers that open
  smoothly, and `<details name>` so only one is open at a time.

## Play Store URLs

When submitting an app on Google Play, use:

**Wear OS Watch Faces**

- Privacy policy URL: `https://enriquedfa.github.io/dfamaya/watchfaces/privacy.html`
- Support / website URL: `https://enriquedfa.github.io/dfamaya/watchfaces/support.html`

**Brief**

- Privacy policy URL: `https://enriquedfa.github.io/dfamaya/brief/privacy.html`
- Website URL: `https://enriquedfa.github.io/dfamaya/brief/`

**Contact email:** `developerdfa@gmail.com`

## Google Play links

- Developer page (all apps): <https://play.google.com/store/apps/developer?id=Enrique+Amaya>
- Brief: <https://play.google.com/store/apps/details?id=com.dfamaya.briefcomplication>
- Wear OS Watch Faces: <https://play.google.com/store/apps/details?id=com.dfamaya.watchsky>

## Adding another app

1. Create a folder for the app (e.g. `myapp/`).
2. Add `myapp/index.html` and `myapp/privacy.html`, linking `../style.css`.
   Copy the header from `watchfaces/index.html`: the `crumbs` block, two or
   three `nav-links`, and the `head-cta` store button. Keep the header to one
   row: check it at 360px wide.
3. Add an `app-card` for it in the Apps section of `index.html`.
4. List its Play Store link above.

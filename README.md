# dfamaya.github.io

Static site for dfamaya's Wear OS apps: a home page, landing pages for Brief
and the WatchSky watch face, and per-app privacy policies and support. Plain
HTML, CSS and a little vanilla JS. No build step.

Published at: <https://enriquedfa.github.io/dfamaya/>

## Pages

- `index.html` — home page (lists all apps)
- `style.css` — shared styles (header, buttons, text pages, footer, and the
  watch itself: case, strap, crown and dial, used by both apps)
- `assets/favicon.svg` — site icon

### Brief

- `brief/index.html` — landing page with the live watch demo
- `brief/privacy.html` — privacy policy (text mirrors `docs/PRIVACY_POLICY.md`
  in the Brief repo; only the layout lives here)
- `brief/brief.css` — landing page + Brief's face styles (also used on the home page)
- `brief/demo.js` — the demo: one glance state drawn on every surface
- `brief/icon.svg`, `brief/icon-180.png` — Brief's icon, redrawn from the app's
  launcher vectors
- `brief/og.png` — link preview image (1200×630)
- `brief/img/` — phone app screenshots (dark and light; the watch's Bluetooth
  name is painted out)

### Wear OS Watch Faces (WatchSky)

- `watchfaces/index.html` — WatchSky landing page with a live copy of the face
  and its settings
- `watchfaces/privacy.html` — privacy policy (covers all watch faces by dfamaya)
- `watchfaces/support.html` — support / contact info
- `watchfaces/watchsky.js` — draws the face (also on the home page) and wires
  up the page's controls
- `watchfaces/watchsky.css` — landing page + face styles
- `watchfaces/img/` — assets from the WatchSky repo: the Play Store icon, the
  face's `preview.png` (shown until the script runs), the weather glyphs and
  the editor icons, under their drawable names
- `watchfaces/og.png` — link preview image (1200×630)

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
  `data-chip`, `data-step`, `data-clock`, `data-tilt`, `data-song-toggle`),
  so the same script runs the landing page and the small watch on the home
  page.
- **What each slot shows** (title vs. text line, icon, uppercase short text,
  the weather ring's marker dot) follows the watch's `ComplicationRenderer`.
  The tile follows `BriefTileRenderer` (Material 3 `primaryLayout`): a title,
  one card layout per source, the edge button or "Updated" line, and the rim
  progress ring for music and events. The widget follows the real phone
  widget: badge, two lines, and a pill, play/pause or progress bar when the
  glance has one.
- **Colour.** Each source has its tone-30 / tone-90 pair from the phone app's
  `Theme.kt`. The page glow, the chips and the watch face all ease to the
  current source's colour. The headline gradient stays fixed, so no glance
  can wash it out.
- **Icons** are an inline SVG sprite built from the watch app's own
  `res/drawable` Material Symbols, plus a few rounded symbols for the page.
- It pauses when it's off screen or the tab is hidden, has a pause button, and
  uses a plain crossfade for people who prefer reduced motion.
- **Running order.** The demo cycles Calendar → Notifications → Weather →
  Now playing → Phone battery → Reminders → Default (`RUN_ORDER` in
  `demo.js`). That's deliberately not the app's priority order, which the
  numbered list on the page shows: music comes fourth so a few glances go by
  before the song kicks in.
- **The song.** The first time "Now playing" comes up, the page starts
  Apple's official 30-second preview of Night Tapes · storm, streamed
  straight from Apple's servers (it is never hosted in this repo) and
  credited with a link to Apple Music in the Now playing step, the same
  approach as tryalcove.com. Browsers only let a page start sound after the
  visitor has clicked or tapped something, so for most first visits the
  music turn runs silently: the small play button beside the watch pulses,
  and the song starts on the next music turn once they've interacted.
  It plays at a low volume (`SONG_VOLUME`) and starts by itself at most once
  per visit (never with Data Saver on). The sound belongs to the music
  glance: it fades out when another glance takes over and comes back when
  music does, until someone pauses it. While it plays the watch holds on
  music, the watch, tile and widget follow the real position, the
  complication's glyph flips between play and pause like the watch app's,
  and the Media Session API puts the track in the phone's own media
  controls. Tapping the watch, or the small button at its lower right (only
  there during the music turn), plays or pauses. Only a page with
  `data-song-autoplay` starts the song by itself, so the small watch on the
  home page stays silent. Browsers that can't play AAC never see any of it.
  The track details are the `SONG` object in `demo.js`; a preview URL can
  change, so if it ever 404s, look the song up again with the iTunes Search
  API (`https://itunes.apple.com/search?term=night+tapes+storm&entity=song`).

To change the sample content, edit the `SOURCES` array at the top of
`demo.js`.

## The WatchSky page

`watchfaces/watchsky.js` redraws the watch face from the WatchSky repo's
`watchface/src/main/res/raw/watchface.xml` into an SVG with the watch's own
450×450 canvas. Coordinates, colours and timings are copied as they are, so
the two read side by side:

- **The sky** is the XML's base gradient plus ten layers, each fading in over
  its slice of the day, anchored to the sunrise or sunset hour. Layers 4–8
  swap palette by weather (clear, partly cloudy, overcast, stormy). The
  slider's track is the same sky, sampled across 24 hours.
- **The sun or moon** rides the dashed arc with the XML's orbit maths. Live
  moon phase is worked out from the date.
- **The settings** (weather, moon phase, middle bar, sunrise, sunset, date,
  border shadow, always-on) are real radios and checkboxes, drawn with the
  watch editor's own icons.
- The bottom complication shows a made-up calendar (`EVENTS` in the script).

If the face changes in the WatchSky repo (a new palette, a new setting), make
the same change here: the constants at the top of `watchsky.js` mirror the
XML. The face stops ticking while it's off screen or the tab is hidden.

### Newer web platform features in use

Most are progressive: a browser without one just skips the effect. The
exception is `light-dark()`, which the colour tokens depend on; it needs Chrome
or Edge 123, Safari 17.5 or Firefox 120 (all from 2024).

- Cross-document **view transitions** (`@view-transition`): the header stays
  put between pages, and the Brief and WatchSky watches and icons morph from
  the home page into their pages.
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

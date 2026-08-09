# dfamaya.github.io

Static site for dfamaya's Wear OS apps — a landing page plus per-app privacy
policies and support.

Published at: <https://enriquedfa.github.io/dfamaya/>

## Pages

- `index.html` — landing page (lists all apps)
- `style.css` — shared styles

### Wear OS Watch Faces

- `watchfaces/index.html` — app overview
- `watchfaces/privacy.html` — privacy policy (covers all watch faces by dfamaya)
- `watchfaces/support.html` — support / contact info

### Brief

- `brief/index.html` — app overview
- `brief/privacy.html` — privacy policy

### Redirect stubs

The watch-face pages used to live at the repo root. To keep any URLs already
submitted to Google Play working, the old paths now redirect to their new home:

- `privacy.html` → `watchfaces/privacy.html`
- `support.html` → `watchfaces/support.html`

## Play Store URLs

When submitting an app on Google Play, use:

**Wear OS Watch Faces**

- Privacy policy URL: `https://dfamaya.github.io/watchfaces/privacy.html`
- Support / website URL: `https://dfamaya.github.io/watchfaces/support.html` (or the root)

**Brief**

- Privacy policy URL: `https://dfamaya.github.io/brief/privacy.html`
- Support / website URL: `https://dfamaya.github.io/brief/` (or the root)

**Contact email:** `developerdfa@gmail.com`

> **Heads up — verify the base URL.** These examples assume the site is served
> at `https://dfamaya.github.io/`. This repo currently has no `CNAME`, so if it
> is owned by the `enriquedfa` account it actually publishes under
> `https://enriquedfa.github.io/dfamaya.github.io/…`. Use whichever base
> actually resolves, then append the paths above. The old root `privacy.html` /
> `support.html` URLs still redirect to the `watchfaces/` versions.

## Google Play links

- Developer page (all apps): <https://play.google.com/store/apps/developer?id=Enrique+Amaya>
- Brief: <https://play.google.com/store/apps/details?id=com.dfamaya.briefcomplication>
- Wear OS Watch Faces: <https://play.google.com/store/apps/details?id=com.dfamaya.watchsky>

Each app page and the landing page link out to its Play Store listing via the
`.btn.btn-store` button (styled in `style.css`) and a matching `nav-store`
pill in the header nav.

## Adding another app

1. Create a folder for the app (e.g. `myapp/`).
2. Add `myapp/index.html` (overview) and `myapp/privacy.html` (policy),
   referencing `../style.css` for styles.
3. Add a card linking to it in the “Apps” section of `index.html`, including
   a `.btn.btn-store` button pointing at its Play Store listing.
4. Add a `nav-store` pill to the app's own header nav, and list the app's
   Play Store link above.

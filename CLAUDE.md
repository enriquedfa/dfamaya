# CLAUDE.md

Static site (plain HTML, CSS, vanilla JS, no build step). `README.md` covers
the pages, the design system and how each landing page mirrors its app.

## Preview links

After pushing a branch, always give the maintainer a raw.githack preview link
for each page you changed, so they can open it without merging:

    https://raw.githack.com/enriquedfa/dfamaya/<branch>/<path>

e.g. `https://raw.githack.com/enriquedfa/dfamaya/main/watchfaces/index.html`.
Use the full `index.html` path (githack doesn't resolve folder URLs). Branch
names with `/` go in as they are.

## Checking a change

Serve the repo root (`python3 -m http.server`) and load the page in Chromium
(Playwright is available in the cloud sandbox) to check for console errors and
to screenshot the watch faces. The WatchSky and Spiralis pages mirror their
repos' `watchface.xml`; corroborate against that source, not memory.

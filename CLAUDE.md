# CLAUDE.md

Static site (plain HTML, CSS, vanilla JS, no build step). `README.md` covers
the pages, the design system and how each landing page mirrors its app.

## Preview links

After pushing a branch, always give the maintainer a raw.githack preview link
for each page you changed, so they can open it without merging:

    https://raw.githack.com/enriquedfa/dfamaya/<branch>/<path>

e.g. `https://raw.githack.com/enriquedfa/dfamaya/main/watchfaces/`. Folder
URLs serve their `index.html`, and branch names with `/` go in as they are.
Check the link returns 200 before handing it over.

## Public repo

This repo is public and GitHub Pages serves all of it; the apps' own repos
are private. Never commit secrets (keys, tokens, keystores, passwords,
signing or Play Console details, private emails), and keep out the secret
sauce: show what an app does, not how it's built. No app source, generators
or build tooling, private docs, prompts, research notes or unreleased plans,
and no links to the private repos from a page. A demo may mirror an app's
look and behaviour; its assets come from what ships or is already public.
Details in `README.md#public-repo`. When unsure, ask before committing.

## Checking a change

Serve the repo root (`python3 -m http.server`) and load the page in Chromium
(Playwright is available in the cloud sandbox) to check for console errors and
to screenshot the watch faces. The WatchSky, Spiralis and Concentric+ pages
mirror their repos' `watchface.xml`; corroborate against that source, not
memory.

<!-- SPDX-License-Identifier: MIT -->
# just-house-paint-website

The website of [Just House Paint](https://github.com/delebash/just-house-paint) — a free desktop app that shows your
own house in real paint colors before you buy paint. It is served at
<https://delebash.github.io/just-house-paint-website/>.

Built with [Astro](https://astro.build/) and, for the user docs, [Starlight](https://starlight.astro.build/) — the
stack of JustWrite's site (`justwrite-website`), which it follows. Its look is built on the paints of the house in its
first picture: Evergreen Fog, Pure White and Naval. Young Serif for the headings, Schibsted Grotesk for the text.

## What is where

| Path | What |
|---|---|
| `src/pages/index.astro` | the overview: the painted house to compare, how it works, the AI photo, the paints and schemes, the questions |
| `src/pages/features.astro` | everything the app does, and every screen |
| `src/layouts/Base.astro` | the header, the footer (the photos' credits, the paint disclaimer), the light/dark switch, the full-size screenshot |
| `src/components/` | `BeforeAfter` (the compare line), `Chip` (a paint chip) |
| `src/styles/` | `global.css` (the tokens), `starlight-brand.css` (the same look in the docs), `fonts.css` |
| `src/assets/screens/`, `src/assets/photos/` | the app's screenshots and the photos — taken by `scripts/capture.js` |
| `scripts/sync-docs.js`, `scripts/deploy.js`, `.github/workflows/deploy.yml` | the family's website parts — the kit's `just-core/website/` files, copied as they are (the family guard checks): the app's user docs into Starlight (`src/content/docs/docs/`, gitignored), `npm run deploy`, and the GitHub Pages build |
| `package.json` `justSite` | the app (`delebash/just-house-paint`, beside this repo) and this site's repository, which the scripts read |

## The docs and publishing

The docs are the app's own `docs/*.md`, never copied by hand: `npm run build` takes them from the app's latest
release (its `docs.tar.gz`, or the tag's source for a release made before the app attached it); `npm run dev` from
`../just-house-paint/docs`. The site is published only when you say so: **`npm run deploy`** names the release whose
docs go live, asks, then runs this repository's own workflow (your `gh` login — no token anywhere). Nothing builds by
itself: no push, no schedule, no other repository's workflow starts it.

## Commands

```bash
npm install
npm run dev        # the site on localhost:4321, the docs from ../just-house-paint/docs
npm run build      # into dist/, the docs from the app's latest release
npm run preview    # dist/ served locally
npm run deploy     # publish it on GitHub Pages (asks first; --yes to skip the question)
```

## The pictures

Every screenshot is the real app. `npm run capture -- --data-dir <folder>` drives Just House Paint's desktop window
(the unpacked build in `../just-house-paint`, against its server on that data folder) and writes the screenshots and
photos into `src/assets/`. The data folder must hold **only photos that may be published** — the three Wikimedia
Commons houses this site credits, each with a design — never anyone's own house. The script's header says the steps.

## Licence

The site's code is MIT (`LICENSE`); what it took from `justwrite-website` is listed in `NOTICE.md`. The house photos
are CC BY-SA (credited on every page and in `NOTICE.md`), and the pictures made from them — the screenshots, the
painted and AI photos — are shared under CC BY-SA 4.0.

// SPDX-License-Identifier: MIT
// The site: the overview and features pages (src/pages), and the user docs on Starlight at /docs/ — the app's own
// docs/*.md, synced from its latest release by scripts/sync-docs.js. On justwrite-website's config (NOTICE.md).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

const ROOT = dirname(fileURLToPath(import.meta.url));
const BASE = "/just-house-paint-website";

// The docs' sidebar is the app's Help order — docs/toc.json, copied by sync-docs. It is gitignored and may be
// absent (a fresh clone before any release), so then the sidebar lists whatever pages exist. The first entries lead
// back to the site's own pages: Starlight replaces the site's chrome on its routes.
function docsSidebar() {
  const siteLinks = [
    { label: "← Overview", link: `${BASE}/` },
    { label: "← Features", link: `${BASE}/features/` },
  ];
  try {
    const toc = JSON.parse(readFileSync(resolve(ROOT, "src/data/docs-toc.json"), "utf8"));
    return [...siteLinks, ...toc.map((g) => ({ label: g.group, items: g.items.map((item) => ({ slug: `docs/${item.slug}` })) }))];
  } catch {
    return [...siteLinks, { label: "Docs", autogenerate: { directory: "docs" } }];
  }
}

// The docs keep the site's light/dark choice: the site's pages store theirs as `jhp-theme`, Starlight its own as
// `starlight-theme`; without this, moving between them flips the theme. Runs before paint.
const THEME_BRIDGE = `
try {
  var site = localStorage.getItem('jhp-theme');
  var sl = localStorage.getItem('starlight-theme');
  if (site && site !== sl) { localStorage.setItem('starlight-theme', site); document.documentElement.dataset.theme = site; }
  else if (sl && !site) { localStorage.setItem('jhp-theme', sl); }
} catch (e) {}
`.trim();

export default defineConfig({
  site: "https://delebash.github.io",
  base: BASE,
  integrations: [
    starlight({
      title: "Just House Paint",
      description: "Just House Paint's user documentation.",
      logo: { src: "./src/assets/mark.svg", replacesTitle: false },
      favicon: "/favicon.svg",
      customCss: ["./src/styles/fonts.css", "./src/styles/starlight-brand.css"],
      sidebar: docsSidebar(),
      head: [{ tag: "script", content: THEME_BRIDGE }],
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/delebash/just-house-paint" }],
      lastUpdated: false,
      credits: false,
    }),
  ],
  compressHTML: true,
  devToolbar: { enabled: false },
});

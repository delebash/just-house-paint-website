#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Pulls Just House Paint's user docs into Starlight's docs collection (src/content/docs/docs/, gitignored). From
// justwrite-website's scripts/sync-docs (MIT — NOTICE.md), for this app. Two modes:
//
//   node scripts/sync-docs.js --from local
//     Copies ../just-house-paint/docs/ (the app's repo beside this one, for local work). With --silent-if-missing,
//     no such folder is not an error.
//
//   node scripts/sync-docs.js --from release [--tag v0.2.0]
//     Downloads docs.tar.gz from a release of the app (the latest by default; --tag pins one). The CI mode: the
//     site serves the docs of the latest RELEASE, not of the app's main branch. The app's release attaches the
//     file while the release is still a draft, so a published release always has it.
//
// Each page gets Starlight's frontmatter (its title from its first heading, its description from toc.json's hint)
// and its links to sibling pages (`(foo.md)`) become the site's routes. toc.json — the app's Help order — is copied
// to src/data/docs-toc.json, which astro.config.js turns into the sidebar.

import { execFileSync } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = resolve(ROOT, "src/content/docs/docs");
const TOC_TARGET = resolve(ROOT, "src/data/docs-toc.json");
const APP_REPO = "delebash/just-house-paint";
const LOCAL_APP = resolve(ROOT, "..", "just-house-paint", "docs");

// The links' absolute base: astro.config.js's `base`. Relative forms break under GitHub Pages' trailing slashes
// (./slug from /docs/foo/ is /docs/foo/slug).
async function readDocsBase() {
  const conf = await readFile(resolve(ROOT, "astro.config.js"), "utf8");
  const m = conf.match(/base:\s*['"]([^'"]+)['"]/);
  return `${(m ? m[1] : "").replace(/\/$/, "")}/docs`;
}

function arg(name, hasValue = false) {
  const i = process.argv.indexOf(name);
  if (i < 0) return hasValue ? null : false;
  return hasValue ? process.argv[i + 1] : true;
}
const FROM = arg("--from", true);
const TAG = arg("--tag", true);
const SILENT_IF_MISSING = arg("--silent-if-missing");

if (FROM !== "local" && FROM !== "release") {
  console.error("Usage: sync-docs --from <local|release> [--tag v0.2.0] [--silent-if-missing]");
  process.exit(1);
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const titleOf = (markdown, fallback) => markdown.match(/^#\s+(.+?)\s*$/m)?.[1] ?? fallback;
// enough for a double-quoted YAML string
const escapeYaml = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

// [text](foo.md) → [text](<base>/docs/foo/), with its #anchor; README.md → the docs' index
function rewriteLinks(markdown, docsBase) {
  return markdown.replace(/\]\(([^)\s]+?)\.md(#[^)]*)?\)/g, (_, file, anchor = "") => {
    const slug = basename(file) === "README" ? "" : basename(file);
    return `](${docsBase}/${slug ? `${slug}/` : ""}${anchor})`;
  });
}

async function processFile(srcPath, docsBase, hints) {
  const fileName = basename(srcPath);
  const slug = fileName === "README.md" ? "index" : fileName.replace(/\.md$/, "");
  const raw = await readFile(srcPath, "utf8");
  const title = titleOf(raw, slug);
  // The leading comment (SPDX) and H1 go: Starlight renders the frontmatter's title. `[^\r\n]*`, not `.+`: in a
  // CRLF checkout `.` stops at the \r and the H1 stayed (justwrite-website's finding — every title twice).
  const stripped = raw.replace(/^<!--[^]*?-->\s*/, "").replace(/^#\s+[^\r\n]*\r?\n+/, "");
  const hint = hints.get(slug);
  const frontmatter = `---\ntitle: "${escapeYaml(title)}"\n${hint ? `description: "${escapeYaml(hint)}"\n` : ""}---\n\n`;
  await writeFile(join(TARGET, `${slug}.md`), frontmatter + rewriteLinks(stripped, docsBase));
  return slug;
}

// toc.json across, and slug → hint for the pages' descriptions
async function syncToc(dir) {
  const src = join(dir, "toc.json");
  if (!(await exists(src))) throw new Error(`no toc.json in ${dir} — the app's Help order, which the sidebar follows`);
  await mkdir(dirname(TOC_TARGET), { recursive: true });
  await cp(src, TOC_TARGET);
  const hints = new Map();
  for (const group of JSON.parse(await readFile(src, "utf8"))) for (const item of group.items) if (item.hint) hints.set(item.slug, item.hint);
  return hints;
}

async function syncFromDir(dir) {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
  if (!files.length) throw new Error(`no .md files in ${dir}`);
  const hints = await syncToc(dir);
  await rm(TARGET, { recursive: true, force: true });
  await mkdir(TARGET, { recursive: true });
  const docsBase = await readDocsBase();
  const slugs = [];
  for (const f of files) slugs.push(await processFile(join(dir, f), docsBase, hints));
  return slugs;
}

async function fromLocal() {
  if (!(await exists(LOCAL_APP))) {
    if (SILENT_IF_MISSING) {
      console.log(`sync-docs: ${LOCAL_APP} not found — skipped (--silent-if-missing).`);
      return [];
    }
    throw new Error(`no app docs at ${LOCAL_APP}: clone ${APP_REPO} beside this repo, or use --from release`);
  }
  console.log(`sync-docs: copying from ${LOCAL_APP}`);
  return syncFromDir(LOCAL_APP);
}

async function fromRelease() {
  let tag = TAG;
  if (!tag) {
    console.log(`sync-docs: the latest release of ${APP_REPO}…`);
    const res = await fetch(`https://api.github.com/repos/${APP_REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) {
      if (SILENT_IF_MISSING && res.status === 404) {
        console.log("sync-docs: no release yet — skipped (--silent-if-missing).");
        return [];
      }
      throw new Error(`GitHub API ${res.status} ${res.statusText}`);
    }
    tag = (await res.json()).tag_name;
    if (!tag) throw new Error("the latest release has no tag_name");
  }
  // staged in the repo, not os.tmpdir(): on Windows that can carry a \\?\ prefix a spawned tar can't take as its
  // cwd (justwrite-website's finding); .docs-cache is gitignored
  const tmpDir = resolve(ROOT, ".docs-cache");
  await rm(tmpDir, { recursive: true, force: true });
  await mkdir(tmpDir, { recursive: true });
  const unpack = async (res) => {
    await writeFile(join(tmpDir, "in.tar.gz"), Buffer.from(await res.arrayBuffer()));
    execFileSync("tar", ["-xzf", "in.tar.gz"], { cwd: tmpDir, stdio: "inherit" });
  };

  const url = `https://github.com/${APP_REPO}/releases/download/${tag}/docs.tar.gz`;
  console.log(`sync-docs: docs.tar.gz from ${APP_REPO}@${tag}`);
  const res = await fetch(url);
  if (res.ok) {
    await unpack(res);
    return syncFromDir(join(tmpDir, "docs"));
  }
  if (res.status !== 404) throw new Error(`download failed: ${res.status} ${res.statusText} from ${url}`);
  // A release made before the app attached docs.tar.gz (v0.1.3 and earlier): the same docs from the release's own
  // tagged source — still the released docs, never the main branch's.
  const src = `https://codeload.github.com/${APP_REPO}/tar.gz/refs/tags/${tag}`;
  console.log(`sync-docs: ${tag} has no docs.tar.gz — its docs from the tag's source`);
  const tagged = await fetch(src);
  if (!tagged.ok) {
    if (SILENT_IF_MISSING && tagged.status === 404) {
      console.log(`sync-docs: no source for ${tag} either — skipped (--silent-if-missing).`);
      return [];
    }
    throw new Error(`download failed: ${tagged.status} ${tagged.statusText} from ${src}`);
  }
  await unpack(tagged);
  // GitHub's source archive holds one folder, <repo>-<version>
  const top = (await readdir(tmpDir, { withFileTypes: true })).find((d) => d.isDirectory());
  if (!top) throw new Error(`${src} held no folder`);
  return syncFromDir(join(tmpDir, top.name, "docs"));
}

try {
  const slugs = FROM === "local" ? await fromLocal() : await fromRelease();
  if (slugs.length) console.log(`sync-docs: ${slugs.length} pages in src/content/docs/docs/ — ${slugs.join(", ")}`);
} catch (err) {
  console.error("sync-docs failed:", err.message);
  process.exit(1);
}

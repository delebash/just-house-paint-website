#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// The site's pictures, taken from the real app: Just House Paint's desktop window (its unpacked build) against its
// server on a data folder that holds ONLY photos that may be published — the three Wikimedia Commons houses
// (NOTICE.md), each with a design saved — never anyone's own house. Writes src/assets/screens/*.webp and
// src/assets/photos/{before,after,ai}.jpg (the photo as taken, the app's Save image of the first house's design,
// and its latest AI photo, at most 2000 px wide); Astro's image pipeline sizes them for the site.
//
//   1. in ../just-house-paint: npm run build:unpacked
//   2. its server on that data folder:  npm run server -- --data-dir <folder>
//   3. here:  npm run capture -- --data-dir <folder> [--app ../just-house-paint]
//
// The window's own server stays off (JUSTHOUSEPAINT_DEV_NO_SERVER): it uses the one above, on the app's port.
// Native dialogs aren't opened: Save image is answered in the main process with the file to write.
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1];
};
const APP = path.resolve(ROOT, arg("--app", "../just-house-paint"));
const DATA = arg("--data-dir");
if (!DATA || !existsSync(path.join(DATA, "houses"))) {
  console.error("Usage: npm run capture -- --data-dir <a data folder with only publishable photos> [--app ../just-house-paint]");
  process.exit(1);
}
const SCREENS = path.join(ROOT, "src/assets/screens");
const PHOTOS = path.join(ROOT, "src/assets/photos");
mkdirSync(SCREENS, { recursive: true });
mkdirSync(PHOTOS, { recursive: true });

// Playwright's Electron driver and the app's own Electron, from the app's packages
const { _electron } = await import(pathToFileURL(path.join(APP, "e2e/node_modules/playwright-core/index.mjs")).href);
const { default: ELECTRON } = await import(pathToFileURL(path.join(APP, "src-electron/node_modules/electron/index.js")).href);
const env = { ...process.env, JUSTHOUSEPAINT_DEV_NO_SERVER: "1", JUST_HOUSE_PAINT_DATA_DIR: DATA };
delete env.ELECTRON_RUN_AS_NODE;
delete env.DEV_URL;
const app = await _electron.launch({ executablePath: ELECTRON, args: [path.join(APP, "dist/electron/UnPackaged")], cwd: APP, env });
const page = await app.firstWindow();
await page.waitForLoadState("domcontentloaded");
// the window's size for every picture: a common laptop screen's
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  w.unmaximize();
  w.setContentSize(1440, 900);
  w.center();
});

const api = (p, init) => page.evaluate(async ([u, i]) => (await fetch(`http://127.0.0.1:17499/v1${u}`, i)).json(), [p, init]);
const settle = (ms = 900) => page.waitForTimeout(ms);
const shot = async (name) => {
  await settle();
  await sharp(await page.screenshot()).webp({ quality: 92 }).toFile(path.join(SCREENS, `${name}.webp`));
  console.log("  ", name);
};
// a photo for the site: at most 2000 px wide, as JPEG
const photo = (from, name) => sharp(from).resize({ width: 2000, withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(PHOTOS, name));
/** Go to `hash`; "Leave the colors on screen?" answered with Leave. */
const go = async (hash, ready) => {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
  const leave = page.getByRole("button", { name: "Leave", exact: true });
  if (await leave.isVisible({ timeout: 800 }).catch(() => false)) await leave.click();
  await page.locator(ready).first().waitFor({ timeout: 30_000 });
};
const tab = (name) => page.getByRole("tab", { name, exact: true }).click();
const radio = (group, name) => page.getByRole("radiogroup", { name: group }).getByRole("radio", { name, exact: true }).click();

const houses = await api("/houses");
const list = houses.items || houses;
const first = list.find((h) => h.name === "White house with shutters") || list[0];
const designs = await api(`/houses/${first.id}/designs`);
const design = (designs.items || designs)[0];
if (!design) throw new Error(`${first.name} has no design — save one first`);

console.log("→ Your houses");
await go("#/", ".houses__card");
await shot("your-houses");

console.log("→ the house: its parts");
await go(`#/house/${first.id}`, ".house-canvas canvas");
await tab("Parts");
await radio("Outlines", "All parts");
await shot("house-parts");

console.log("→ the house: its design painted");
await tab("Designs");
await page.locator(".designs__open", { hasText: design.name }).first().click();
await radio("Outlines", "Off");
await tab("Parts");
await shot("house-painted");

console.log("→ the house: compared with the photo");
await page.getByLabel("Compare with", { exact: true }).click();
await page.getByRole("option", { name: "The photo as taken" }).click();
await shot("house-compare");
await page.getByLabel("Compare with", { exact: true }).click();
await page.getByRole("option", { name: "Nothing" }).click();

console.log("→ the house: the Colors and Schemes tabs");
await tab("Colors");
await shot("house-colors");
await tab("Schemes");
await shot("house-schemes");

console.log("→ the house: its AI photo");
await tab("Designs");
const view = page.locator(".designs__view").first();
if (await view.isVisible().catch(() => false)) {
  await view.click();
  await page.getByRole("dialog").waitFor();
  await settle(1500);
  await shot("house-ai-photo");
  // the modal's own ✕ and its footer's Close share the name: the footer's
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).last().click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
}

console.log("→ the house: Save image");
const saved = path.join(tmpdir(), `jhp-site-after-${process.pid}.jpg`);
await app.evaluate(({ dialog }, file) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
}, saved);
await page.getByRole("button", { name: "Save image", exact: true }).click();
for (let i = 0; i < 60 && !existsSync(saved); i++) await settle(500);
if (!existsSync(saved)) throw new Error("Save image wrote nothing");
await settle(1000);
await photo(saved, "after.jpg");
rmSync(saved, { force: true });

console.log("→ Paint colors, AI, Settings");
await go("#/colors", ".colors-page, main");
await settle(1500);
await shot("paint-colors");
await go("#/ai", "main");
await settle(1500);
await shot("ai");
await go("#/settings", "main");
await shot("settings");

await app.close();

// the photo as taken and the latest AI photo, from the data folder as they are
const dir = path.join(DATA, "houses", first.id);
const original = readdirSync(dir).find((f) => f.startsWith("original."));
await photo(path.join(dir, original), "before.jpg");
const renders = path.join(dir, "renders");
const latest = readdirSync(renders)
  .map((f) => ({ f, t: statSync(path.join(renders, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t)[0];
if (latest) await photo(path.join(renders, latest.f), "ai.jpg");
console.log("done:", SCREENS, PHOTOS);

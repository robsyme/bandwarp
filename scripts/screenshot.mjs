// Dev utility: screenshot a page of this app after all canvases render and
// no "Processing" text remains. Usage:
//   node scripts/screenshot.mjs <url-or-path> <out.png> [minCanvases]
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const [target, out = "shot.png", minCanvases = "1"] = process.argv.slice(2);
const url = target.includes("://") ? target : pathToFileURL(target).href;

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 1250, height: 1500 });
page.on("console", (m) => console.log("console:", m.text()));
page.on("pageerror", (e) => console.log("pageerror:", e.message));
await page.goto(url);
await page.waitForFunction(
  (n) => document.querySelectorAll("canvas").length >= n && !document.body.textContent.includes("Processing"),
  { timeout: 90000, polling: 500 },
  Number(minCanvases),
);
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: out });
await browser.close();
console.log("wrote", out);

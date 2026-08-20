// Dev utility: drive the Workspace through steps 1-6 on the bundled Gel 4B
// example, exercising the correction gestures, and screenshot each step.
// Usage: node scripts/walkthrough.mjs <dist/index.html> <outDir>
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const [target = "dist/index.html", outDir = "shots"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
page.on("pageerror", (e) => console.log("pageerror:", e.message));
await page.goto(pathToFileURL(target).href);

const clickButton = (label) =>
  page.evaluate((l) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes(l));
    if (!b) throw new Error(`no button: ${l}`);
    b.click();
  }, label);

const goStep = (n) =>
  page.evaluate((i) => document.querySelectorAll(".check .st")[i].click(), n - 1);

// Busy work (rectify/detect) surfaces as a chip in the top bar, but only
// after async state settles — wait for it to show up before waiting it out.
const idle = async () => {
  await page
    .waitForFunction(() => document.querySelector(".top .chip"), { timeout: 3000, polling: 50 })
    .catch(() => {});
  await page.waitForFunction(() => !document.querySelector(".top .chip"), {
    timeout: 120000,
    polling: 300,
  });
};

const shot = async (name) => {
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log("wrote", `${outDir}/${name}.png`);
};

const stageBox = () => page.$(".stagebox canvas").then((c) => c.boundingBox());
const drag = async (b, fx0, fy0, fx1, fy1) => {
  await page.mouse.move(b.x + fx0 * b.width, b.y + fy0 * b.height);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++)
    await page.mouse.move(
      b.x + (fx0 + ((fx1 - fx0) * i) / 8) * b.width,
      b.y + (fy0 + ((fy1 - fy0) * i) / 8) * b.height,
    );
  await page.mouse.up();
};

// Step 1: load the example photo; rectification + detection run in workers.
await clickButton("Load example");
await idle();

// Step 2: drag the four corner handles from their 3% inset defaults onto the
// plate corners (positions eyeballed from Gel 4B).
await goStep(2);
let b = await stageBox();
const targets = [
  [0.03, 0.03, 0.158, 0.004],
  [0.97, 0.03, 0.982, 0.002],
  [0.97, 0.97, 0.985, 0.887],
  [0.03, 0.97, 0.152, 0.882],
];
for (const [fx0, fy0, fx1, fy1] of targets) {
  await drag(b, fx0, fy0, fx1, fy1);
  await idle(); // each release re-rectifies
}
await shot("2-corners");

// Step 3: mark the lower developed region (the labeled one on this plate).
await goStep(3);
b = await stageBox();
await drag(b, 0.035, 0.37, 0.965, 0.955); // inside the plate's dark edges
await idle();
await shot("3-region");

await goStep(4);
await shot("4-lanes");

const laneCount = await page.evaluate(() => document.querySelectorAll(".side table tr").length - 1);
console.log("lanes detected:", laneCount);

// Gesture: right-click adds a lane at the pointer.
b = await stageBox();
await page.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.7, { button: "right" });
const laneCount2 = await page.evaluate(() => document.querySelectorAll(".side table tr").length - 1);
console.log("after right-click add:", laneCount2);

await goStep(5);
await shot("5-compounds");
const rows = await page.evaluate(() =>
  [...document.querySelectorAll(".side input")].map((i) => i.value).filter((v) => v.startsWith("Compound")),
);
console.log("compound rows:", rows);

await goStep(6);
await shot("6-bands");
const bandCount = () =>
  page.evaluate(() =>
    [...document.querySelectorAll(".side table tr")]
      .slice(1)
      .reduce((s, tr) => s + Number(tr.lastElementChild.textContent || 0), 0),
  );
const before = await bandCount();

// Gesture: click the first band dot to remove it.
const dot = await page.evaluate(() => {
  const c = document.querySelector(".stagebox svg circle[fill^='#']");
  const r = c.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.click(dot.x, dot.y);
const after = await bandCount();
console.log(`bands: ${before} -> ${after} after clicking a dot off`);

await goStep(7);
await shot("7-stub");
await browser.close();

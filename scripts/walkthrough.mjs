// Dev utility: drive the Workspace through the full operator flow on the
// bundled Gel 4B example — corners, region, standards labelling, correction
// gestures, quantification, CSV export, and an Analysis File save/reopen
// round-trip — screenshotting each step.
// Usage: node scripts/walkthrough.mjs <dist/index.html> <outDir>
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
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
const cdp = await page.createCDPSession();
await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: outDir });
await page.goto(pathToFileURL(target).href);

const clickButton = (label) =>
  page.evaluate((l) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes(l));
    if (!b) throw new Error(`no button: ${l}`);
    b.click();
  }, label);

const goStep = async (n) => {
  await page.evaluate((i) => document.querySelectorAll(".check .st")[i].click(), n - 1);
  await new Promise((r) => setTimeout(r, 300));
};

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
const laneCount = () =>
  page.evaluate(() => document.querySelectorAll(".side table tr").length - 1);
console.log("lanes detected:", await laneCount());

// Gestures: right-click adds a lane at the far right, then remove it again.
b = await stageBox();
await page.mouse.click(b.x + b.width * 0.94, b.y + b.height * 0.7, { button: "right" });
console.log("after right-click add:", await laneCount());
await page.evaluate(() => {
  const rows = document.querySelectorAll(".side table tr");
  rows[rows.length - 1].querySelector("button").click();
});
console.log("after delete:", await laneCount());

// Label the Dilution Series: lanes 10-16 carry 0.25..4 µg on Gel 4B.
const SERIES = ["0.25", "0.5", "1", "1.5", "2", "3", "4"];
for (let i = 0; i < SERIES.length; i++) {
  const row = 10 + i; // 1-based table row index (row 0 is the header)
  await page.evaluate((r) => {
    document.querySelectorAll(".side table tr")[r].querySelector("input[type=checkbox]").click();
  }, row);
  await new Promise((r) => setTimeout(r, 50));
  await page.evaluate(
    (r, v) => {
      const tr = document.querySelectorAll(".side table tr")[r];
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      const [label, , amount] = tr.querySelectorAll("input:not([type=checkbox])").length
        ? [tr.querySelectorAll("td")[1].querySelector("input"), null, tr.querySelectorAll("td")[3].querySelector("input")]
        : [];
      set.call(label, v);
      label.dispatchEvent(new Event("input", { bubbles: true }));
      set.call(amount, v);
      amount.dispatchEvent(new Event("input", { bubbles: true }));
    },
    row,
    SERIES[i],
  );
}
await shot("4-lanes");

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
const dot = await page.evaluate(() => {
  const c = document.querySelector(".stagebox svg circle[fill^='#']");
  const r = c.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.click(dot.x, dot.y);
console.log(`bands: ${before} -> ${await bandCount()} after clicking a dot off`);

// Step 7: profile of a standards lane; drag one integration bound.
await goStep(7);
await page.evaluate(() => {
  const sel = document.querySelector(".side select");
  const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
  set.call(sel, "13"); // lane 13 = standard "1.5"
  sel.dispatchEvent(new Event("change", { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 300));
await shot("7-profiles");

await goStep(8);
await shot("8-calibration");
console.log(
  "calibration:",
  await page.evaluate(() =>
    [...document.querySelectorAll(".side svg text")]
      .map((t) => t.textContent)
      .filter((t) => t.includes("r²")),
  ),
);

await goStep(9);
await shot("9-results");
await clickButton("Export CSV");
await clickButton("Save Analysis File");
await new Promise((r) => setTimeout(r, 1500));
const files = readdirSync(outDir);
const csvName = files.find((f) => f.endsWith(".results.csv"));
const jsonName = files.find((f) => f.endsWith(".analysis.json"));
console.log("downloads:", csvName, jsonName);
const csv = readFileSync(`${outDir}/${csvName}`, "utf8");
const csvLines = csv.trim().split("\n");
console.log("csv rows:", csvLines.length - 2, "| header:", csvLines[1]);
console.log("sample std row:", csvLines.find((l) => l.includes(",true,")));
console.log("censored rows:", csvLines.filter((l) => l.includes("above_top_standard")).length);
console.log("nd rows:", csvLines.filter((l) => l.endsWith(",nd")).length);

// Round-trip: fresh page, open the saved Analysis File, results reappear.
await page.goto(pathToFileURL(target).href);
const opener = await page.$(".top input[type=file]");
await opener.uploadFile(`${outDir}/${jsonName}`);
await page.waitForFunction(
  () => document.querySelectorAll(".side table tr").length > 50,
  { timeout: 60000, polling: 300 },
);
console.log(
  "restored results rows:",
  await page.evaluate(() => document.querySelectorAll(".side table tr").length - 1),
);
await shot("10-restored");

await browser.close();

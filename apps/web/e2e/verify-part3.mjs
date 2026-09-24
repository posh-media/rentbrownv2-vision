// Part-3 verification: SSR hydration, console errors, scenario switch, screenshots.
// Production server must run on :3100.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3100";
const OUT = "C:/dev/_rentbrown_reference/screens/web-part3";
mkdirSync(OUT, { recursive: true });

const errors = [];
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  if (/hydrat|did not match/i.test(m.text())) errors.push(`hydration(${m.type()}): ${m.text()}`);
});

// 1. /explore — SSR content, zero console errors / hydration warnings
await page.goto(`${BASE}/explore`, { waitUntil: "networkidle" });
await page.waitForSelector("text=The Terraces", { timeout: 15000 });
console.log("explore loaded");

// 2. /opportunities/[slug] — same
await page.goto(`${BASE}/opportunities/the-terraces-ikoyi`, { waitUntil: "networkidle" });
await page.waitForSelector("text=One slot, shown separately", { timeout: 15000 });
console.log("opportunity detail loaded");

// 3. Scenario switch via toolbar → empty state → switch back
await page.goto(`${BASE}/explore`, { waitUntil: "networkidle" });
await page.waitForSelector("text=The Terraces", { timeout: 15000 });
await page.waitForTimeout(1500); // let hydration settle

async function pickScenario(name) {
  for (let i = 0; i < 3; i += 1) {
    // The dropdown stays open after a radio selection and aria-hides the app
    // shell (including the trigger), so close it before and after each attempt.
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /Prototype settings/ }).click();
    try {
      await page.getByRole("radio", { name }).click({ timeout: 5000 });
      await page.keyboard.press("Escape");
      return;
    } catch {
      await page.keyboard.press("Escape");
    }
  }
  throw new Error(`Could not pick scenario ${name}`);
}

await pickScenario("No open opportunities");
await page.waitForSelector("text=No open opportunities right now", { timeout: 15000 });
console.log("no-opportunities empty state shown");
await pickScenario("Established investor");
await page.waitForSelector("text=The Terraces", { timeout: 15000 });
console.log("default scenario restored");

// 4. Screenshots — /referrals + /referrals/history at 1440 and 390
for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${BASE}/referrals`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=How rewards work", { timeout: 15000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/referrals-${width}.png`, fullPage: true });
  console.log(`screenshot referrals-${width}.png`);

  await page.goto(`${BASE}/referrals/history`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Referral history", { timeout: 15000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/referrals-history-${width}.png`, fullPage: true });
  console.log(`screenshot referrals-history-${width}.png`);
}

await browser.close();
if (errors.length) {
  console.log(`\nERRORS (${errors.length}):`);
  for (const e of errors) console.log(" -", e);
  process.exit(1);
}
console.log("\nNO CONSOLE ERRORS / HYDRATION WARNINGS");

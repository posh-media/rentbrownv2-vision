// Walkthrough + screenshots for web part 1.
// Usage: node e2e/walkthrough.mjs  (dev server must run on :3000)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "C:/dev/_rentbrown_reference/screens/web-part1";
mkdirSync(OUT, { recursive: true });

const widths = [1440, 820, 390];
const log = (...a) => console.log("•", ...a);

async function shot(page, name, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}-${width}.png`, fullPage: true });
  log(`screenshot ${name}-${width}.png`);
}

async function shotAllWidths(page, name) {
  for (const w of widths) await shot(page, name, w);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.log("CONSOLE ERROR:", m.text());
});

// 1. Login
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill("#email", "ada@example.com");
await page.fill("#password", "password123");
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForURL("**/dashboard", { timeout: 15000 });
log("login → dashboard");

// 2. Dashboard
await page.waitForSelector("text=Total portfolio value", { timeout: 15000 });
await shotAllWidths(page, "dashboard");

// 3. Explore + filter
await page.goto(`${BASE}/explore`, { waitUntil: "networkidle" });
await page.waitForSelector("text=opportunit", { timeout: 15000 });
await shotAllWidths(page, "explore");
await page.getByRole("radio", { name: "Nearing capacity" }).click();
await page.waitForTimeout(800);
await shot(page, "explore-filtered", 1440);

// 4. Opportunity details
await page.goto(`${BASE}/opportunities/the-terraces-ikoyi`, { waitUntil: "networkidle" });
await page.waitForSelector("text=One slot, shown separately", { timeout: 15000 });
await shotAllWidths(page, "opportunity-details");

// 5. Checkout — wallet + PIN
await page.goto(`${BASE}/checkout/rnd_terraces_2`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Number of slots", { timeout: 15000 });
// Wallet covers exactly 1 slot (₦146,250 available vs ₦100,000/slot) — keep 1 slot.
await page.getByRole("radio", { name: /Wallet/ }).click();
await page.locator("input[type=checkbox]").check();
await shotAllWidths(page, "checkout");
await page.setViewportSize({ width: 1440, height: 900 });
const pinBtn = page.getByRole("button", { name: "Confirm with transaction PIN" });
try {
  await pinBtn.click({ timeout: 15000 });
} catch {
  console.log("PIN button not actionable. Aside text:", (await page.locator("aside").innerText()).slice(0, 600));
  throw new Error("pin button missing/disabled");
}
await page.waitForSelector("text=Confirm with transaction PIN", { timeout: 5000 });
// Enter PIN via per-cell inputs
const cells = page.locator("[role=group] input");
for (let i = 0; i < 6; i++) await cells.nth(i).fill(String(i + 1));
// onComplete auto-submits — just wait for navigation.
await page.waitForURL("**/payment/**", { timeout: 20000 });
log("checkout → payment", page.url());

// 6. Payment success (mock settles PENDING→CONFIRMING→SUCCESSFUL over time)
try {
  await page.waitForSelector("text=Investment confirmed", { timeout: 90000 });
} catch {
  console.log("TIMEOUT waiting for success. Main text:", (await page.locator("main").innerText()).slice(0, 800));
  throw new Error("payment did not settle");
}
await shotAllWidths(page, "payment-success");
const paymentUrl = page.url();

// 7. Bank transfer → pending (exercise slot stepper here: 2 × ₦25,000)
await page.goto(`${BASE}/checkout/rnd_harbour_1`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Number of slots", { timeout: 15000 });
await page.getByRole("button", { name: "Increase slots" }).click();
await page.waitForTimeout(700);
await page.getByRole("radio", { name: /Bank transfer/ }).click();
await page.locator("input[type=checkbox]").check();
await page.getByRole("button", { name: "Continue to payment" }).click();
await page.waitForURL("**/payment/**", { timeout: 20000 });
await page.waitForSelector("text=Waiting for your transfer", { timeout: 15000 });
await shot(page, "payment-pending", 1440);

// 8. Preview states
await page.goto(`${paymentUrl}?state=failed`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Payment was not completed", { timeout: 10000 });
await shot(page, "payment-failed", 1440);

// 9. Scenario: new-investor (empty dashboard)
await page.evaluate(() => localStorage.setItem("rb.scenario", "new-investor"));
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
await page.waitForSelector("text=No investments yet", { timeout: 15000 });
await shot(page, "dashboard-empty-new-investor", 1440);

// 10. Scenario: no-opportunities
await page.evaluate(() => localStorage.setItem("rb.scenario", "no-opportunities"));
await page.goto(`${BASE}/explore`, { waitUntil: "networkidle" });
await page.waitForSelector("text=opportunit", { timeout: 15000 });
await shot(page, "explore-no-open", 1440);

// 11. Scenario: signed-out → guest header + dashboard redirect
await page.evaluate(() => localStorage.setItem("rb.scenario", "signed-out"));
await page.goto(`${BASE}/explore`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Sign in", { timeout: 15000 });
await shot(page, "explore-guest", 1440);
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
await page.waitForURL("**/login**", { timeout: 15000 });
log("signed-out redirect works:", page.url());

// 12. Failure simulation: getDashboard
await page.evaluate(() => {
  localStorage.setItem("rb.scenario", "default");
  localStorage.setItem("rb.failing", JSON.stringify(["getDashboard"]));
});
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
await page.waitForSelector("text=couldn't load your dashboard", { timeout: 15000 });
await shot(page, "dashboard-error", 1440);
await page.getByRole("button", { name: "Retry" }).click();
await page.waitForTimeout(1000);
log("error panel + retry rendered");

await browser.close();
console.log("DONE — screenshots in", OUT);

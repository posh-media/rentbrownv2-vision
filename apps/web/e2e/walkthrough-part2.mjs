// Part-2 walkthrough + screenshots. Dev server must run on :3000.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "C:/dev/_rentbrown_reference/screens/web-part2";
mkdirSync(OUT, { recursive: true });

const widths = [1440, 820, 390];
const log = (...a) => console.log("•", ...a);

async function shot(page, name, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}-${width}.png`, fullPage: true });
  log(`screenshot ${name}-${width}.png`);
}
const shotAll = (page, name) => widths.reduce((p, w) => p.then(() => shot(page, name, w)), Promise.resolve());
const scenario = (page, s) => page.evaluate((v) => localStorage.setItem("rb.scenario", v), s);

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE:", m.text()); });

// Login
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill("#email", "ada@example.com");
await page.fill("#password", "password123");
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForURL("**/dashboard", { timeout: 15000 });
log("login ok");

// Portfolio + tabs
await page.goto(`${BASE}/portfolio`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Active principal", { timeout: 15000 });
await shotAll(page, "portfolio");
await page.getByRole("tab", { name: "Matured" }).click();
await page.waitForTimeout(700);
await shot(page, "portfolio-matured", 1440);

// Investment detail — active
await page.goto(`${BASE}/portfolio/inv_terraces_2`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Investment record", { timeout: 15000 });
await shotAll(page, "investment-detail-active");

// Investment detail — matured
await page.goto(`${BASE}/portfolio/inv_wuse_2`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Principal and profit credited", { timeout: 15000 });
await shotAll(page, "investment-detail-matured");

// Investment detail — payment pending
await page.goto(`${BASE}/portfolio/inv_harbour_pending`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Awaiting your bank transfer", { timeout: 15000 });
await shot(page, "investment-detail-pending", 1440);

// Wallet
await page.goto(`${BASE}/wallet`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Available balance", { timeout: 15000 });
await shotAll(page, "wallet");

// Transaction detail sheet (desktop → Dialog)
await page.locator("button", { hasText: "Wallet deposit" }).first().click();
await page.waitForSelector("text=Date/time", { timeout: 8000 });
await shot(page, "transaction-detail", 1440);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

// Transactions + filters
await page.goto(`${BASE}/wallet/transactions`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Transaction history", { timeout: 15000 });
await shotAll(page, "transactions");
await page.getByRole("radio", { name: "Successful" }).click().catch(async () => {
  await page.getByRole("button", { name: "Successful" }).click();
});
await page.waitForTimeout(700);
await shot(page, "transactions-filtered", 1440);

// Deposit flow
await page.goto(`${BASE}/wallet/deposit`, { waitUntil: "networkidle" });
await page.waitForSelector("text=How much would you like to add?", { timeout: 15000 });
await page.getByRole("button", { name: "₦50,000", exact: true }).click();
await page.getByRole("button", { name: "Continue", exact: true }).click();
await page.waitForSelector("text=Choose a method", { timeout: 8000 });
await page.getByRole("button", { name: /Continue · ₦50,000/ }).click();
await page.waitForURL("**/wallet/deposit/**", { timeout: 20000 });
await page.waitForSelector("text=Make your transfer", { timeout: 15000 });
await shotAll(page, "deposit-instructions");
log("deposit flow ok:", page.url());

// Withdraw flow
await page.goto(`${BASE}/wallet/withdraw`, { waitUntil: "networkidle" });
await page.waitForSelector("text=How much would you like to withdraw?", { timeout: 15000 });
await page.locator("input[inputmode=decimal]").fill("50,000");
await page.waitForSelector("text=You will receive", { timeout: 10000 });
await page.getByRole("button", { name: "Continue", exact: true }).click();
await page.waitForSelector("text=Choose a destination", { timeout: 8000 });
await page.getByRole("button", { name: "Review withdrawal" }).click();
await page.waitForSelector("text=Review your withdrawal", { timeout: 8000 });
await shotAll(page, "withdraw-review");
await page.getByRole("button", { name: "Confirm with transaction PIN" }).click();
await page.locator("[role=group] input").nth(0).fill("1");
for (let i = 1; i < 6; i++) await page.locator("[role=group] input").nth(i).fill(String(i + 1));
await page.waitForURL("**/wallet/withdrawals/**", { timeout: 20000 });
await page.waitForSelector("text=Under review", { timeout: 15000 });
await shotAll(page, "withdrawal-status");
log("withdraw flow ok:", page.url());

// Withdraw blocked: below minimum
await page.goto(`${BASE}/wallet/withdraw`, { waitUntil: "networkidle" });
await page.waitForSelector("text=How much would you like to withdraw?", { timeout: 15000 });
await page.locator("input[inputmode=decimal]").fill("1,000");
await page.waitForSelector("text=Can't withdraw this amount", { timeout: 10000 });
await shot(page, "withdraw-below-minimum", 1440);

// Withdraw blocked: insufficient
await page.locator("input[inputmode=decimal]").fill("500,000");
await page.waitForSelector("text=exceeds your available balance", { timeout: 10000 });
await shot(page, "withdraw-insufficient", 1440);

// Notifications + mark all read
await page.goto(`${BASE}/notifications`, { waitUntil: "networkidle" });
await page.waitForSelector("h1:has-text('Notifications')", { timeout: 15000 });
await page.getByRole("button", { name: "Mark all as read" }).click();
await page.waitForTimeout(800);
await shotAll(page, "notifications");

// Referrals + history
await page.goto(`${BASE}/referrals`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Your referral code", { timeout: 15000 });
await shotAll(page, "referrals");
await page.goto(`${BASE}/referrals/history`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Referral history", { timeout: 15000 });
await shot(page, "referrals-history", 1440);

// Account
await page.goto(`${BASE}/account`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Member since", { timeout: 15000 });
await shotAll(page, "account");
await page.goto(`${BASE}/account/profile`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Profile & personal details", { timeout: 15000 });
await shot(page, "account-profile", 1440);
await page.goto(`${BASE}/account/security`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Transaction PIN", { timeout: 15000 });
await shotAll(page, "security");
await page.goto(`${BASE}/account/settings`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Notification preferences", { timeout: 15000 });
await shotAll(page, "settings");

// KYC scenarios
await page.goto(`${BASE}/account/kyc`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Verification steps", { timeout: 15000 });
await shot(page, "kyc-verified", 1440);
await scenario(page, "kyc-pending");
await page.goto(`${BASE}/account/kyc`, { waitUntil: "networkidle" });
await page.waitForSelector("text=under review", { timeout: 15000 });
await shot(page, "kyc-pending", 1440);
await scenario(page, "kyc-rejected");
await page.goto(`${BASE}/account/kyc`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Action required", { timeout: 15000 });
await shotAll(page, "kyc-rejected");
await scenario(page, "new-investor");
await page.goto(`${BASE}/account/kyc`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Not started", { timeout: 15000 });
await shot(page, "kyc-not-started", 1440);

// new-investor withdraw → KYC required
await page.goto(`${BASE}/wallet/withdraw`, { waitUntil: "networkidle" });
await page.waitForSelector("text=How much would you like to withdraw?", { timeout: 15000 });
await page.locator("input[inputmode=decimal]").fill("10,000");
await page.waitForSelector("text=Identity verification is required", { timeout: 10000 });
await shot(page, "withdraw-kyc-required", 1440);

// Help
await scenario(page, "default");
await page.goto(`${BASE}/help`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Help & tutorials", { timeout: 15000 });
await shot(page, "help", 1440);

// Legal (guest-allowed: signed-out)
await scenario(page, "signed-out");
await page.goto(`${BASE}/legal/terms`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Terms of service", { timeout: 15000 });
await shotAll(page, "legal");
await page.goto(`${BASE}/faq`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Questions, answered plainly", { timeout: 15000 });
await page.getByRole("button", { name: "Are returns guaranteed?" }).click();
await page.waitForTimeout(500);
await shot(page, "faq-guest", 1440);
await page.goto(`${BASE}/how-it-works`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Investing, step by step", { timeout: 15000 });
await shot(page, "how-it-works-guest", 1440);

await browser.close();
console.log("DONE — screenshots in", OUT);

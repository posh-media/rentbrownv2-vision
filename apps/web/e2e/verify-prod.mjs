// Production-build smoke test for all three Next apps.
// Servers must be running: site :3003, web :3000, admin :3002.
import { chromium } from "playwright";

const SUITES = [
  {
    name: "site",
    base: "http://localhost:3003",
    routes: ["/", "/explore", "/explore/the-terraces-ikoyi", "/about", "/trust", "/learn", "/faq", "/legal/terms"],
    notFound: "/this-page-does-not-exist",
  },
  {
    name: "web",
    base: "http://localhost:3000",
    // public + auth routes only (authed routes redirect to /login — proxy guard)
    routes: ["/", "/explore", "/opportunities/the-terraces-ikoyi", "/login", "/signup", "/forgot-password", "/how-it-works", "/faq"],
    notFound: "/this-page-does-not-exist",
  },
  {
    name: "admin",
    base: "http://localhost:3002",
    routes: ["/login"], // all other routes should redirect here when unauthenticated
    notFound: "/this-page-does-not-exist",
  },
];

const browser = await chromium.launch();
let failures = 0;

for (const suite of SUITES) {
  console.log(`\n=== ${suite.name} (${suite.base}) ===`);
  for (const width of suite.name === "site" ? [1440, 390] : [1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(`PAGEERROR ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`CONSOLE ${m.text()}`);
    });
    page.on("requestfailed", (r) => {
      const url = r.url();
      if (!url.includes("favicon")) errors.push(`REQFAIL ${url} ${r.failure()?.errorText}`);
    });
    if (width === 1440) {
      for (const route of suite.routes) {
        const res = await page.goto(`${suite.base}${route}`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => null);
        const status = res?.status() ?? "NAV-ERR";
        const title = await page.title();
        console.log(`  ${route.padEnd(42)} ${status}  "${title.slice(0, 60)}"`);
      }
      const res404 = await page.goto(`${suite.base}${suite.notFound}`, { waitUntil: "networkidle" });
      const status404 = res404?.status();
      const bodyText = await page.textContent("body");
      const branded = /RentBrown|isn’t on the plan|not found|404/i.test(bodyText ?? "");
      console.log(`  404 ${suite.notFound.padEnd(28)} ${status404} branded=${branded}`);
      if (!branded) failures++;
    } else {
      // mobile viewport: home + 404
      await page.goto(`${suite.base}/`, { waitUntil: "networkidle" });
      console.log(`  [390px] / rendered`);
      await page.goto(`${suite.base}${suite.notFound}`, { waitUntil: "networkidle" });
      console.log(`  [390px] 404 rendered`);
    }
    // Chrome always logs "Failed to load resource: 404" for the document's own
    // 404 status on the intentional not-found navigation — not a real error.
    const filtered = errors.filter(
      (e) => !/favicon|net::ERR_ABORTED|Failed to load resource: the server responded with a status of 404/.test(e),
    );
    if (filtered.length) {
      failures++;
      console.log(`  ERRORS (${width}px):`, filtered.slice(0, 8));
    } else {
      console.log(`  console clean @${width}px`);
    }
    await ctx.close();
  }
}

// Admin: verify unauthenticated redirect behavior on protected routes
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  for (const route of ["/dashboard", "/users", "/kyc", "/finance/withdrawals", "/audit"]) {
    const res = await page.goto(`http://localhost:3002${route}`, { waitUntil: "networkidle" });
    const url = page.url();
    const redirected = url.includes("/login");
    console.log(`  admin ${route.padEnd(28)} ${res?.status()} → ${redirected ? "redirected to /login" : url}`);
    if (!redirected) failures++;
  }
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} FAILURES`);
process.exit(failures ? 1 : 0);

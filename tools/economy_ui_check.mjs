import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";
import { DEFAULT_ECONOMY } from "../server/economy/config.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({
  root,
  server: { host: "127.0.0.1", port: 0, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    args: [
      "--use-gl=swiftshader",
      "--enable-webgl",
      "--no-sandbox",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let saved;
  const config = structuredClone(DEFAULT_ECONOMY);
  config.items.catalog = [
    {
      id: "veteran",
      kind: "character",
      earningEnabled: true,
      earningMultiplier: "1",
      rarity: "rare",
      bonusPercent: "5",
      priceE: "100",
    },
  ];
  const summary = {
    matchId: "b2ed2de5-351a-4e65-a788-757a30136d51",
    score: 2450,
    eligibleScore: "2100",
    baseE: "21",
    itemBonus: "3.15",
    survivalBonus: "5.25",
    bossRewards: "50",
    winReward: "25",
    finalE: "104.40",
    balance: "8525.90",
    finalized: true,
  };
  await page.route("**/api/e/**", async (r) => {
    const path = new URL(r.request().url()).pathname;
    let body;
    if (path.endsWith("/admin/config")) {
      if (r.request().method() === "POST") {
        saved = r.request().postDataJSON();
        body = { revision: 2 };
      } else body = { config, revision: 1 };
    } else if (path.endsWith("/admin/review")) body = { flags: [] };
    else if (path.endsWith("/history"))
      body = {
        summaries: [summary],
        transactions: [
          {
            created_at: new Date().toISOString(),
            type: "MATCH_EARNING",
            amount: "104.40",
            new_balance: "8525.90",
            description: "<img src=x onerror=alert(1)>",
          },
        ],
      };
    else
      body = {
        balance: "8525.90",
        sessionE: "132.70",
        dailyE: "3420",
        dailyCap: "5000",
        earningEnabled: true,
        admin: true,
        catalog: config.items.catalog,
        equipment: [],
        ownedSkins: [{ id: "veteran", kind: "character" }],
      };
    await r.fulfill({ json: body });
  });
  await page.goto(server.resolvedUrls.local[0] + "economy-admin");
  await page.locator("#admin").waitFor({ state: "visible" });
  await page.getByLabel("E PER 100 SCORE", { exact: true }).fill("1.25");
  await page
    .getByRole("button", { name: "Save economy configuration" })
    .click();
  assert.equal(saved.config.E_PER_100_SCORE, "1.25");
  assert.equal(saved.revision, 1);
  if (process.env.E_UI_SHOTS) {
    fs.mkdirSync(process.env.E_UI_SHOTS, { recursive: true });
    await page.screenshot({ path: process.env.E_UI_SHOTS + "/e-admin.png" });
  }
  await page.goto(server.resolvedUrls.local[0] + "earnings");
  await page.locator("#account").waitFor({ state: "visible" });
  assert.equal(await page.locator("#balance").textContent(), "8,525.90 E");
  assert.equal(await page.locator("#ledger img").count(), 0);
  if (process.env.E_UI_SHOTS)
    await page.screenshot({ path: process.env.E_UI_SHOTS + "/e-account.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(
    () => window.__game?.previewCharacter?.userData.isEvCharacter,
    null,
    { timeout: 120000 },
  );
  await page.evaluate(async (s) => {
    const { EarningsUI } = await import("/src/ui/EarningsUI.js");
    window.eProbe = new EarningsUI();
    eProbe.update({
      ...s,
      sessionE: "132.7",
      dailyE: "3420",
      dailyCap: "5000",
      guest: false,
      lastSummary: s,
    });
  }, summary);
  assert(await page.locator("#e-summary").isVisible());
  assert(
    (await page.locator(".e-summary-rows").textContent()).includes("104.40 E"),
  );
  if (process.env.E_UI_SHOTS)
    await page.screenshot({
      path: process.env.E_UI_SHOTS + "/e-summary-mobile.png",
    });
  assert.deepEqual(errors, []);
  console.log(
    "E UI passed: admin decimal settings, protected-API presentation, escaped ledger, mobile layout and conditional earnings summary",
  );
} finally {
  await browser?.close();
  await server.close();
}

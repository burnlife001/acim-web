#!/usr/bin/env bun
// M4 E2E: PWA —— manifest 可达、SW 注册、全量预缓存完成、断网后可读
// 前提: bun scripts/serve.mjs 已在 PREVIEW_BASE (默认 http://localhost:4173) 运行
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const base = process.env.PREVIEW_BASE ?? "http://localhost:4173";
const out = (f) => join(fileURLToPath(new URL("../e2e-out/", import.meta.url)), f);
let failed = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failed++;
};

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--no-sandbox", "--disable-proxy-server"],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on("pageerror", (e) => { console.log("[pageerror]", e.message); failed++; });

const manifest = await page.goto(`${base}/manifest.webmanifest`);
check("manifest.webmanifest 可达", manifest.status() === 200);

await page.goto(`${base}/`, { waitUntil: "networkidle0" });
await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true), { timeout: 10000 });
check("Service Worker 注册并激活", true);

// 等全量预缓存完成（filelist 内容 + 11 shell）
await page.waitForFunction(
  async () => {
    const ks = await caches.keys();
    if (!ks.length) return false;
    const c = await caches.open(ks[0]);
    return (await c.keys()).length >= 755;
  },
  { timeout: 60000, polling: 500 },
);
const cacheCount = await page.evaluate(async () => {
  const ks = await caches.keys();
  return (await (await caches.open(ks[0])).keys()).length;
});
check("全量预缓存完成", cacheCount >= 755, `${cacheCount} 条缓存`);

// 断网 → 整页重载文章页，应由 SW 缓存兜底
await page.setOfflineMode(true);
await page.goto(`${base}/#/01.正文/${encodeURIComponent("第01章、奇迹的真谛/01. 奇迹原则.md")}`, { waitUntil: "networkidle0" });
await page.waitForSelector("article h1", { timeout: 8000 });
const h1 = await page.$eval("article h1", (e) => e.textContent);
check("断网后文章可读", h1 === "01. 奇迹原则", h1);
await page.screenshot({ path: out("9-offline.png") });
await page.setOfflineMode(false);

await browser.close();
console.log(failed ? `\n${failed} 项失败` : "\n全部通过");
process.exit(failed ? 1 : 0);

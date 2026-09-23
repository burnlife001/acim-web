#!/usr/bin/env bun
// 回归验证：文档页再次搜索后，点击指向当前文档的结果必须关闭搜索层
// 复现路径：搜索「何谓世界」→ 点结果进文档 → 文档页点 🔍 → 再点同一文档的结果
import puppeteer from "puppeteer-core";

const base = process.env.PREVIEW_BASE ?? "http://localhost:4173";
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

await page.goto(`${base}/`, { waitUntil: "networkidle0" });

// 第一次：搜索并进入文档
await page.click("#search-btn");
await page.type("#search-input", "何谓世界");
await page.waitForSelector(".hit", { timeout: 20000 });
await page.click(".hit");
await page.waitForSelector("article h1", { timeout: 5000 });
const hash1 = await page.evaluate(() => location.hash);
check("首次点击结果进入文档", hash1.startsWith("#/") && hash1.length > 2, hash1);

// 第二次：文档页再开搜索（输入框保留上次查询，自动出结果）
await page.click("#search-btn");
await page.waitForSelector("#search-ov.open", { timeout: 3000 });
await page.waitForSelector(".hit", { timeout: 20000 });

// 点击指向「当前同一文档」的结果（hash 不变，不触发 hashchange）
// 注意比较口径：href 属性是原始中文，location.hash 是百分号编码，统一解码后再比
const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
// 先在旧 article 上打标记并下滚：route() 重跑会重建 article（标记消失）且滚回顶部
await page.evaluate(() => {
  document.querySelector("article").dataset.stamp = "old";
  window.scrollTo(0, 300);
});
const sameHit = await page.evaluate((h) => {
  const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
  const a = [...document.querySelectorAll("a.hit")].find((x) => dec(x.getAttribute("href")) === dec(h));
  if (a) { a.click(); return true; }
  return false;
}, hash1);
check("结果中存在当前文档的链接", sameHit, hash1);

let state = null;
try {
  await page.waitForFunction(
    () => !document.querySelector("#search-ov.open") &&
          document.querySelector("article") &&
          !document.querySelector("article").dataset.stamp,
    { timeout: 5000 },
  );
  state = await page.evaluate(() => ({ scrollY: window.scrollY, hash: location.hash }));
} catch {}
check("点击同文档结果等效重新进入（关层+正文重渲染）", !!state);
if (state) {
  check("hash 未变", dec(state.hash) === dec(hash1), state.hash);
  check("滚动回顶（与首页进入同效）", state.scrollY === 0, `scrollY=${state.scrollY}`);
}

// 顺带验证：点击指向「其他文档」的结果仍正常跳转
await page.click("#search-btn");
await page.waitForSelector(".hit", { timeout: 20000 });
const other = await page.evaluate((h) => {
  const a = [...document.querySelectorAll("a.hit")].find((x) => x.getAttribute("href") !== h);
  if (a) { a.click(); return a.getAttribute("href"); }
  return null;
}, hash1);
await new Promise((r) => setTimeout(r, 600));
const state2 = await page.evaluate(() => ({
  overlayOpen: !!document.querySelector("#search-ov.open"),
  hash: location.hash,
  h1: document.querySelector("article h1")?.textContent || "",
}));
check("点击其他文档结果正常跳转并关层", !!other && !state2.overlayOpen && dec(state2.hash) === dec(other), `${other} → ${state2.h1}`);

await browser.close();
console.log(failed ? `\n${failed} 项失败` : "\n全部通过");
process.exit(failed ? 1 : 0);

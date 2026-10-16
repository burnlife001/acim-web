#!/usr/bin/env bun
// M2 E2E: 全文搜索 —— 索引懒加载、跨书结果、范围筛选、命中高亮、点击跳转
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

await page.goto(`${base}/`, { waitUntil: "networkidle0" });
await page.click("#search-btn");
await page.waitForSelector("#search-ov.open", { timeout: 3000 });
check("搜索层打开", true);

// 输入查询 → 等索引懒加载 + 出结果
await page.type("#search-input", "宽恕");
await page.waitForSelector(".hit", { timeout: 20000 });
const stats = await page.evaluate(() => ({
  hits: document.querySelectorAll(".hit").length,
  books: [...new Set([...document.querySelectorAll(".hit .b")].map((e) => e.textContent))],
  marks: document.querySelectorAll(".hit mark").length,
  first: document.querySelector(".hit .t").textContent,
}));
check("「宽恕」有结果", stats.hits > 0, `${stats.hits} 条`);
check("结果跨书", stats.books.length >= 2, stats.books.join("/"));
check("片段含高亮", stats.marks > 0, `${stats.marks} 处 mark`);
await page.screenshot({ path: out("6-search.png") });

// 范围筛选：只看正文
await page.click('[data-scope="01.正文"]');
await page.waitForFunction(
  () => [...document.querySelectorAll(".hit .b")].every((e) => e.textContent === "01.正文"),
  { timeout: 5000 },
);
check("筛选后全部为 01.正文", true);
await page.screenshot({ path: out("7-search-text.png") });

// 点击第一条 → 跳转文章并关闭搜索层
await page.click(".hit");
await page.waitForSelector("article h1", { timeout: 5000 });
const gone = await page.evaluate(() => !document.querySelector("#search-ov.open"));
check("点击结果后跳转并关闭搜索层", gone, await page.title());

// 无结果提示
await page.click("#search-btn");
await page.evaluate(() => (document.querySelector("#search-input").value = ""));
await page.type("#search-input", "zzqxyz");
await new Promise((r) => setTimeout(r, 500));
const empty = await page.$eval("#results", (e) => e.textContent);
check("无结果有提示", empty.includes("没有找到"), empty.trim());

await browser.close();
console.log(failed ? `\n${failed} 项失败` : "\n全部通过");
process.exit(failed ? 1 : 0);

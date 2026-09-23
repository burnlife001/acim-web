#!/usr/bin/env bun
// M1 E2E: 首页卡片 → 书目录取 → 文章渲染 → 侧边栏高亮/翻页 → 截图
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

// 1. 首页
await page.goto(`${base}/`, { waitUntil: "networkidle0" });
await page.waitForSelector(".cards .card", { timeout: 5000 });
await new Promise((r) => setTimeout(r, 600)); // 等篇数异步填充
const cards = await page.$$eval(".cards .card", (els) =>
  els.map((e) => ({ name: e.querySelector("b").textContent, meta: e.querySelector(".meta").textContent })));
check("首页 5 本书", cards.length === 5, JSON.stringify(cards));
check("首页向上按钮禁用", await page.evaluate(() => document.querySelector("#nav-up").disabled));
// 侧边栏在首页也应显示五本书的树
await page.waitForSelector("#side > details > summary", { timeout: 5000 });
const sideBooks = await page.$$eval("#side > details > summary", (els) => els.map((e) => e.textContent));
check("首页侧边栏 = 五本书的树", sideBooks.length === 5, sideBooks.join("/"));
await page.screenshot({ path: out("1-home.png") });

// 1.5 首页卡片"续读"应直接跳正文（回归：曾跳到目录页）
await page.evaluate(() => localStorage.setItem("acim:pos:01.正文", "第01章、奇迹的真谛/01. 奇迹原则.md"));
await page.reload({ waitUntil: "networkidle0" });
await page.waitForSelector('[data-book="01.正文"] .resume', { timeout: 5000 });
await page.click('[data-book="01.正文"] .resume');
await page.waitForSelector("article h1", { timeout: 5000 });
const resumeH1 = await page.$eval("article h1", (e) => e.textContent);
check("首页续读直跳正文 H1 = 01. 奇迹原则", resumeH1 === "01. 奇迹原则", resumeH1);
check("续读后 hash 指向正文", decodeURIComponent(await page.evaluate(() => location.hash)) === "#/01.正文/第01章、奇迹的真谛/01. 奇迹原则.md");
await page.evaluate(() => localStorage.removeItem("acim:pos:01.正文"));
await page.goto(`${base}/`, { waitUntil: "networkidle0" });
await page.waitForSelector(".cards .card", { timeout: 5000 });
await new Promise((r) => setTimeout(r, 600));

// 2. 进入正文 → 目录页
await page.click('[data-book="01.正文"]');
await page.waitForSelector(".toc", { timeout: 5000 });
const tocLinks = await page.$$eval('.toc a[href^="#/01.正文/"]', (els) => els.length);
check("正文目录页链接数 = 269", tocLinks === 269, `实际 ${tocLinks}`);
const sideCount = await page.$$eval("#side a", (els) => els.length);
check("侧边栏叶子数 = 269 + 返回链接", sideCount === 270, `实际 ${sideCount}`);
await page.screenshot({ path: out("2-toc.png") });

// 3. 点第一章第一节 → 文章页（H1 内嵌于文件）
await page.goto(`${base}/#/01.正文/${encodeURIComponent("第01章、奇迹的真谛/01. 奇迹原则.md")}`, { waitUntil: "networkidle0" });
await page.waitForSelector("article h1", { timeout: 5000 });
const h1 = await page.$eval("article h1", (e) => e.textContent);
check("文章 H1 = 01. 奇迹原则", h1 === "01. 奇迹原则", h1);
const active = await page.$eval("#side a.on", (e) => e.textContent).catch(() => null);
check("侧边栏高亮当前篇", active === "01. 奇迹原则", String(active));
const pn = await page.$$eval(".pn a", (els) => els.map((e) => e.textContent.trim()));
check("有下一篇", pn.length === 2 && pn[1].includes("02."), JSON.stringify(pn));
check("进度已记忆", (await page.evaluate(() => localStorage.getItem("acim:pos:01.正文"))) === "第01章、奇迹的真谛/01. 奇迹原则.md");
await page.screenshot({ path: out("3-article.png") });

// 4. 练习手册深层路径（三位数课号）+ 抽屉分组自动展开
await page.goto(`${base}/#/02.练习手册/${encodeURIComponent("01.上篇/006. 我烦恼，是因为我看到了根本不存在的事物.md")}`, { waitUntil: "networkidle0" });
await page.waitForSelector("article h1", { timeout: 5000 });
const wActive = await page.$eval("#side a.on", (e) => e.textContent).catch(() => null);
check("练习手册第 6 课高亮", (wActive || "").startsWith("006."), String(wActive));
const truncInfo = await page.$eval("#side a.on", (e) => ({ text: e.textContent, title: e.getAttribute("title") }));
check(
  "长课名截断为 15 字 + …",
  truncInfo.text.length === 16 && truncInfo.text.endsWith("…") && truncInfo.title.length > 15,
  `"${truncInfo.text}" ← title "${truncInfo.title}"`,
);
const openDetails = await page.$$eval("#side details[open] > summary", (els) => els.map((e) => e.textContent));
check("01.上篇分组自动展开", openDetails.includes("01.上篇"), JSON.stringify(openDetails));
await page.screenshot({ path: out("4-lesson.png") });

// 4.5 向上按钮：正文页 → 书目录 → 全部书籍（当前在练习手册 006 课）
check("文章页向上可用", await page.$eval("#nav-up", (b) => !b.disabled));
await page.click("#nav-up");
await page.waitForSelector(".toc", { timeout: 5000 });
check("向上 → 练习手册目录", decodeURIComponent(await page.evaluate(() => location.hash)) === "#/02.练习手册");
await page.click("#nav-up");
await page.waitForSelector(".cards .card", { timeout: 5000 });
check("再向上 → 全部书籍", (await page.evaluate(() => location.hash)) === "#/");
check("首页向上禁用", await page.$eval("#nav-up", (b) => b.disabled));

// 5. front matter 文件（00.导言）→ 自动补 H1
await page.goto(`${base}/#/01.正文/${encodeURIComponent("00.导言.md")}`, { waitUntil: "networkidle0" });
await page.waitForSelector("article h1", { timeout: 5000 });
const fmH1 = await page.$eval("article h1", (e) => e.textContent);
check("front matter 文件补 H1 = 00.导言", fmH1 === "00.导言", fmH1);

// 6. 夜间模式
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
await page.goto(`${base}/#/01.正文/${encodeURIComponent("第01章、奇迹的真谛/01. 奇迹原则.md")}`, { waitUntil: "networkidle0" });
await page.waitForSelector("article h1", { timeout: 5000 });
const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
check("夜间模式背景为黑", bg === "rgb(0, 0, 0)", bg);
await page.screenshot({ path: out("5-dark.png") });

// 7. 桌面端首页：侧边栏常驻显示
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await page.goto(`${base}/`, { waitUntil: "networkidle0" });
await page.waitForSelector("#side > details > summary", { timeout: 5000 });
await page.screenshot({ path: out("0-desktop-home.png") });
await page.goto(`${base}/#/02.练习手册/${encodeURIComponent("01.上篇/006. 我烦恼，是因为我看到了根本不存在的事物.md")}`, { waitUntil: "networkidle0" });
await page.waitForSelector("article h1", { timeout: 5000 });
await page.screenshot({ path: out("0-desktop-lesson.png") });

await browser.close();
console.log(failed ? `\n${failed} 项失败` : "\n全部通过");
process.exit(failed ? 1 : 0);

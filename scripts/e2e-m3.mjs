#!/usr/bin/env bun
// M3 E2E: 今日 .ics 日历导入（2 按钮放当前课；删除改由 iOS 快捷指令承担，网页不管）
// 前提: bun scripts/serve.mjs 已在 PREVIEW_BASE (默认 http://localhost:4173) 运行
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { readFileSync as rfs } from "node:fs";

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
await page.waitForSelector("#today .ics[data-d='0']", { timeout: 5000 });
const emptyInfo = await page.evaluate(() => ({
  ics: document.querySelectorAll("#today .ics").length,
  icsDisabled: document.querySelectorAll("#today .ics:disabled").length,
  others: document.querySelectorAll("#today a, #today input, #today details, #today .main, #today .del").length,
}));
check("框内恰好 2 个导入按钮", emptyInfo.ics === 2, `得 ${emptyInfo.ics}`);
check("框内无链接/日期框/折叠/删除按钮", emptyInfo.others === 0, `得 ${emptyInfo.others}`);
check("无进度时两按钮也可用", emptyInfo.icsDisabled === 0, `禁用 ${emptyInfo.icsDisabled}`);

// 无续读项时点击 → 自动落到第一课，且 acim:pos:02.练习手册 被设为 001 课
const grabIcsEarly = (sel) => page.evaluate((s) => new Promise((resolve, reject) => {
  const orig = URL.createObjectURL;
  const timer = setTimeout(() => { URL.createObjectURL = orig; reject(new Error("grabIcs 超时")); }, 5000);
  URL.createObjectURL = (b) => {
    clearTimeout(timer);
    URL.createObjectURL = orig;
    b.text().then(resolve, reject);
    return "blob:fake";
  };
  URL.revokeObjectURL = () => {};
  document.querySelector(s).click();
}), sel);
const icsFirst = await grabIcsEarly('#today .ics[data-d="0"]');
const posAfter = await page.evaluate(() => localStorage.getItem("acim:pos:02.练习手册"));
check("无进度点击后 ics 为第1课", !!icsFirst && icsFirst.includes("第1课"), icsFirst ? "" : "未产出 ics");
check("无进度点击后续读被设为第一课", !!posAfter && /(?:^|\/)001\./.test(posAfter), posAfter || "未设置");
await page.evaluate(() => localStorage.removeItem("acim:pos:02.练习手册"));

// 续读指向导言（非课号 .md）：也可导入日程，用默认早晚两次提醒，且不覆盖用户阅读位置
await page.evaluate(() => localStorage.setItem("acim:pos:02.练习手册", "00.导言.md"));
await page.reload({ waitUntil: "networkidle0" });
await page.waitForSelector("#today .ics[data-d='0']", { timeout: 5000 });
const introIcs = await grabIcsEarly('#today .ics[data-d="0"]');
const introPos = await page.evaluate(() => localStorage.getItem("acim:pos:02.练习手册"));
const introEvents = introIcs ? (introIcs.match(/BEGIN:VEVENT/g) || []).length : 0;
check("导言续读可导入 ics", !!introIcs, introIcs ? "" : "未产出 ics");
check("导言 ics 标题为文件名", !!introIcs && introIcs.includes("SUMMARY:00.导言"), "");
check("导言 ics 早晚两次提醒", introEvents === 2 && introIcs.includes("T070000") && introIcs.includes("T220000"), `事件数 ${introEvents}`);
check("导言续读位置未被改动", introPos === "00.导言.md", introPos || "");

// 练习进度 = 第 11 课（acim:pos:02.练习手册 指向 011 课文件）→ 今天/明天均为第 11 课，仅日期不同
await page.evaluate(() => localStorage.setItem("acim:pos:02.练习手册", "01.上篇/011. 我那无意义的念头，显示给我一个无意义的世界.md"));
await page.reload({ waitUntil: "networkidle0" });
await page.waitForSelector("#today .ics[data-d='0']", { timeout: 5000 });
const boxInfo = await page.evaluate(() => ({
  disabled: document.querySelectorAll("#today .ics:disabled").length,
  labels: [...document.querySelectorAll("#today .ics")].map((b) => b.textContent.trim()),
}));
check("有进度时两按钮可用", boxInfo.disabled === 0, `禁用 ${boxInfo.disabled}`);
check("按钮文案 = 导入为今天/明天日历", boxInfo.labels[0] === "导入为今天日历" && boxInfo.labels[1] === "导入为明天日历", boxInfo.labels.join(" / "));
await page.screenshot({ path: out("8-today.png") });

// .ics：拦截 createObjectURL 校验两个按钮的产物
const csvLines = rfs(new URL("../src/books/ics.csv", import.meta.url), "utf8").trim().split("\n").slice(1);
const timesOf = (lesson) => csvLines[lesson - 1].split(",")[1].split(";").filter(Boolean);

// 注意：evaluate 内无法返回函数供外部反复调用，改为逐次 evaluate。
// 且 downloadDayIcs 是 async（内部 await fetch ics.csv），createObjectURL 在微任务里才被调用，
// 所以钩子必须挂到 Promise 上等 blob 产出，不能点完同步读 captured（旧 RRULE 版是同步生成才可行）。
const grabIcs = (sel) => page.evaluate((s) => new Promise((resolve, reject) => {
  const orig = URL.createObjectURL;
  const timer = setTimeout(() => { URL.createObjectURL = orig; reject(new Error("grabIcs 超时")); }, 5000);
  URL.createObjectURL = (b) => {
    clearTimeout(timer);
    URL.createObjectURL = orig;
    b.text().then(resolve, reject);
    return "blob:fake";
  };
  URL.revokeObjectURL = () => {};
  document.querySelector(s).click();
}), sel);

// 进度 = 第 11 课 → 今天/明天的 .ics 都是第 11 课内容，仅日期不同
const today = new Date(); today.setHours(0, 0, 0, 0);
const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const tmr = new Date(today.getTime() + 86400000);

const vevents = (ics) => (ics || "").match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
const actives = (ics) => vevents(ics).filter((b) => !b.includes("STATUS:CANCELLED"));
const cancels = (ics) => vevents(ics).filter((b) => b.includes("STATUS:CANCELLED"));
const uidsOf = (blocks) => new Set(blocks.map((b) => (b.match(/UID:(\S+)/) || [])[1]));

const icsToday = await grabIcs('#today .ics[data-d="0"]');
const icsTmr = await grabIcs('#today .ics[data-d="1"]');

for (const [label, ics, lesson, dstr] of [["今天", icsToday, 11, ymd(today)], ["明天", icsTmr, 11, ymd(tmr)]]) {
  const n = timesOf(lesson).length;
  const act = actives(ics);
  const all = vevents(ics);
  check(`${label}.ics 新增事件数 = csv 第${lesson}课时间数(${n})`, act.length === n, `得 ${act.length}`);
  check(`${label}.ics 每新增含 VALARM`, act.every((b) => b.includes("BEGIN:VALARM")), "");
  check(`${label}.ics UID 全局唯一`, uidsOf(all).size === all.length, `${uidsOf(all).size}/${all.length}`);
  check(`${label}.ics 新增日期 = ${dstr}`, act.every((b) => b.includes(`DTSTART:${dstr}T`)), "");
  check(`${label}.ics DTSTART==DTEND(0 时长)`, all.every((b) => { const m = b.match(/DTSTART:(\S+)\r?\nDTEND:(\S+)/); return m && m[1] === m[2]; }), "");
  check(`${label}.ics 含 DTSTAMP(UTC)`, all.every((b) => /DTSTAMP:\d{8}T\d{6}Z/.test(b)), "");
  check(`${label}.ics 不含 METHOD/RRULE`, !!ics && !ics.includes("METHOD:") && !ics.includes("RRULE"), "");
  check(`${label}.ics 无取消项`, cancels(ics).length === 0, `得 ${cancels(ics).length}`);
}
if (icsToday) writeFileSync(out("acim-today.ics"), icsToday);
if (icsTmr) writeFileSync(out("acim-tomorrow.ics"), icsTmr);

await browser.close();
console.log(failed ? `\n${failed} 项失败` : "\n全部通过");
process.exit(failed ? 1 : 0);

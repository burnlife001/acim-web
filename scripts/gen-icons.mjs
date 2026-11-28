#!/usr/bin/env bun
// 生成 PWA 图标：puppeteer 渲染蓝底白字「奇」，截图出 PNG。无需图片依赖。
// 用法: bun scripts/gen-icons.mjs
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const OUT = fileURLToPath(new URL("../src/icons/", import.meta.url));

// 幂等：icons 已存在则跳过 puppeteer 渲染（Cloudflare Linux 构建机无 Chrome）
const targets = ["icon-512.png", "icon-192.png", "apple-touch-icon.png"];
if (targets.every((f) => existsSync(join(OUT, f)))) {
  console.log("icons 已存在,跳过 puppeteer 渲染(删 src/icons/*.png 可强制重画)");
  process.exit(0);
}

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--no-sandbox", "--disable-proxy-server"],
});
const page = await browser.newPage();

// [文件名, 尺寸, 圆角]（apple-touch-icon 由 iOS 自行裁圆角，给直角满幅）
const icons = [
  ["icon-512.png", 512, 0.18],
  ["icon-192.png", 192, 0.18],
  ["apple-touch-icon.png", 180, 0],
];
for (const [name, size, radius] of icons) {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0">
    <div style="width:${size}px;height:${size}px;background:#0a84ff;border-radius:${size * radius}px;
      display:flex;align-items:center;justify-content:center;
      color:#fff;font:600 ${size * 0.55}px 'PingFang SC','Microsoft YaHei',sans-serif">奇</div>
  </body>`);
  await page.screenshot({ path: join(OUT, name) });
  console.log(`${name} ${size}x${size}`);
}
await browser.close();

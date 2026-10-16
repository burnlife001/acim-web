#!/usr/bin/env bun
// 静态预览服务：src/ 即站点根。用法: bun scripts/serve.mjs [port]
import { fileURLToPath } from "node:url";
import { normalize, join } from "node:path";

const ROOT = fileURLToPath(new URL("../src", import.meta.url));
const PORT = Number(process.argv[2]) || 4173;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};

Bun.serve({
  port: PORT,
  async fetch(req) {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (p.endsWith("/")) p += "index.html";
    const full = normalize(join(ROOT, p));
    if (!full.startsWith(ROOT)) return new Response("403", { status: 403 });
    const file = Bun.file(full);
    if (!(await file.exists())) return new Response("404", { status: 404 });
    const ext = p.slice(p.lastIndexOf("."));
    return new Response(file, {
      headers: { "content-type": MIME[ext] ?? "application/octet-stream" },
    });
  },
});
console.log(`预览: http://localhost:${PORT}  (根目录 ${ROOT})`);

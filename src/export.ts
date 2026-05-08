/**
 * Memoria 导出模块 (v2.0.3)
 * 支持 Markdown / HTML / JSON 三种格式
 */
import { App, normalizePath, Notice } from "obsidian";
import { Memo } from "./types";

export type ExportFormat = "md" | "html" | "json";

export async function exportMemos(
  app: App,
  format: ExportFormat,
  memos: Memo[],
  filterDesc: string,
  exportFolder: string,
) {
  if (memos.length === 0) throw new Error("没有可导出的笔记");
  const folder = normalizePath(exportFolder);
  await ensureFolder(app, folder);
  const now = new Date();
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const fileName = `memoria-export-${ts}.${format}`;
  const filePath = `${folder}/${fileName}`;

  let content: string;
  switch (format) {
    case "md": content = buildMdExport(memos, filterDesc); break;
    case "html": content = buildHtmlExport(memos, filterDesc); break;
    case "json": content = buildJsonExport(memos, filterDesc); break;
    default: throw new Error("未知格式");
  }
  await app.vault.create(filePath, content);
  new Notice(`✓ 已导出 ${memos.length} 条到 ${filePath}`);
  return filePath;
}

async function ensureFolder(app: App, path: string) {
  if (!app.vault.getAbstractFileByPath(path)) {
    await app.vault.createFolder(path);
  }
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function buildJsonExport(memos: Memo[], filterDesc: string): string {
  const data = memos.map(m => ({
    date: m.date,
    time: m.time,
    content: m.content,
    tags: m.tags.filter(t => t !== "置顶" && t !== "收藏"),
    isPinned: m.isPinned,
    isStarred: m.isStarred,
    hasImage: m.hasImage,
    hasLink: m.hasLink,
    file: m.file,
  }));
  return JSON.stringify({ exportedAt: new Date().toISOString(), filter: filterDesc, count: memos.length, memos: data }, null, 2);
}

function buildMdExport(memos: Memo[], filterDesc: string): string {
  const now = new Date();
  const lines = [
    "---",
    `exported_by: Memoria`,
    `exported_at: ${now.toISOString()}`,
    `count: ${memos.length}`,
    `filter: ${filterDesc}`,
    "---", "",
    `# Memoria 导出 · ${filterDesc}`,
    "",
    `> 导出于 ${now.toLocaleString()}，共 ${memos.length} 条`,
    "",
  ];
  const byDate = new Map<string, Memo[]>();
  for (const m of memos) {
    const arr = byDate.get(m.date) ?? [];
    arr.push(m);
    byDate.set(m.date, arr);
  }
  for (const date of [...byDate.keys()].sort().reverse()) {
    lines.push(`## ${date}`);
    lines.push("");
    const dayMemos = byDate.get(date) ?? [];
    dayMemos.sort((a, b) => b.time.localeCompare(a.time));
    for (const m of dayMemos) {
      lines.push(`- ${m.time}`);
      const indented = m.content.split("\n").map(l => l === "" ? "" : `  ${l}`).join("\n");
      lines.push(indented);
      lines.push("");
    }
  }
  return lines.join("\n");
}

function buildHtmlExport(memos: Memo[], filterDesc: string): string {
  const now = new Date();
  const byDate = new Map<string, Memo[]>();
  for (const m of memos) {
    const arr = byDate.get(m.date) ?? [];
    arr.push(m);
    byDate.set(m.date, arr);
  }

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  let cardsHtml = "";
  for (const date of [...byDate.keys()].sort().reverse()) {
    const dayMemos = byDate.get(date) ?? [];
    dayMemos.sort((a, b) => b.time.localeCompare(a.time));
    const wd = weekdays[new Date(date + "T00:00:00").getDay()];
    cardsHtml += `<div class="day-group">
      <div class="day-head">${date} ${wd} · ${dayMemos.length} memos</div>`;
    for (const m of dayMemos) {
      const tags = m.tags.filter(t => t !== "置顶" && t !== "收藏");
      const tagsHtml = tags.map(t => `<span class="tag">#${t}</span>`).join("");
      const bodyHtml = renderInlineMd(m.content);
      cardsHtml += `<div class="card">
        <div class="card-time">${m.time}</div>
        <div class="card-body">${bodyHtml}</div>
        ${tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : ""}
      </div>`;
    }
    cardsHtml += "</div>";
  }

  const tagCount = new Set(memos.flatMap(m => m.tags.filter(t => t !== "置顶" && t !== "收藏"))).size;
  const dayCount = new Set(memos.map(m => m.date)).size;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Memoria Export - ${filterDesc}</title>
<style>
:root {
  --bg: #fbfaf7; --bg-card: #ffffff; --fg: #2c2a28; --fg-muted: #8a857f;
  --fg-dim: #b5b0a9; --accent: #c08a5a; --tag-bg: #f0ebe3; --tag-fg: #7a5c3a;
  --border: rgba(0,0,0,0.06); --shadow: 0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.03);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #17171a; --bg-card: #1e1e22; --fg: #e0ddda; --fg-muted: #8a8580;
    --fg-dim: #6b6763; --accent: #d4a572; --tag-bg: #2a2520; --tag-fg: #c9965a;
    --border: rgba(255,255,255,0.06); --shadow: 0 1px 3px rgba(0,0,0,0.15);
  }
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--fg); line-height: 1.6; }
.container { max-width: 720px; margin: 0 auto; padding: 48px 24px; }
.brand { font-size: 24px; font-weight: 700; color: var(--accent); }
.subtitle { font-size: 14px; color: var(--fg-muted); margin: 4px 0 8px; }
.stats { display: flex; gap: 24px; margin: 24px 0 32px; font-size: 13px; color: var(--fg-dim); }
.day-group { margin-bottom: 32px; }
.day-head { font-size: 13px; font-weight: 600; color: var(--accent); padding: 8px 4px 12px; border-bottom: 1px solid var(--border); margin-bottom: 12px; }
.card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 16px 20px; margin-bottom: 12px; box-shadow: var(--shadow); transition: transform 0.15s; }
.card:hover { transform: translateY(-2px); }
.card-time { font-size: 12px; color: var(--fg-dim); margin-bottom: 8px; }
.card-body { font-size: 14px; line-height: 1.7; }
.card-body p { margin: 0.4em 0; }
.card-body code { padding: 1px 5px; background: var(--tag-bg); border-radius: 3px; font-size: 0.9em; }
.card-body blockquote { margin: 0.5em 0; padding: 4px 12px; border-left: 3px solid var(--accent); color: var(--fg-muted); }
.card-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.tag { padding: 2px 10px; background: var(--tag-bg); color: var(--tag-fg); border-radius: 999px; font-size: 11px; }
.footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--border); font-size: 12px; color: var(--fg-dim); }
@media (max-width: 600px) { .container { padding: 24px 16px; } }
@media print { body { background: #fff; } .card { box-shadow: none; break-inside: avoid; } }
</style>
</head>
<body>
<div class="container">
  <div class="brand">Memoria</div>
  <div class="subtitle">${filterDesc}</div>
  <div class="stats">
    <span>${memos.length} memos</span>
    <span>${dayCount} days</span>
    <span>${tagCount} tags</span>
  </div>
  ${cardsHtml}
  <div class="footer">Exported at ${now.toLocaleString()} by Memoria</div>
</div>
</body>
</html>`;
}

/** 内联 Markdown 渲染为 HTML */
function renderInlineMd(text: string): string {
  let html = escapeHtml(text);
  // 粗体
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // 斜体
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // 行内代码
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  // 链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // 换行
  html = html.replace(/\n/g, "<br>");
  return html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

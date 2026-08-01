var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => MemoriaPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian13 = require("obsidian");

// src/types.ts
var DEFAULT_SETTINGS = {
  folder: "Memoria",
  attachmentFolder: "Memoria/attachments",
  clearAfterSave: true,
  pageSize: 50,
  showSidebarTags: false,
  useTrash: true,
  exportTheme: "auto",
  collapseLineLimit: 8,
  dailyGoal: 5,
  trashMaxItems: 300,
  density: "cozy",
  enableVimKeys: false,
  enableMoodColoring: false,
  enableSmartReview: true,
  language: "auto",
  savedFilters: [],
  promoteFolder: "Memoria/notes"
};
var VIEW_TYPE_MEMORIA = "memoria-view";
var VIEW_TYPE_STATS = "memoria-stats-view";
var VIEW_TYPE_YEAR = "memoria-year-view";
var VIEW_TYPE_TRASH = "memoria-trash-view";
var VIEW_TYPE_TAG_TOOLS = "memoria-tag-tools-view";
var TAG_PINNED = "\u7F6E\u9876";
var TAG_STARRED = "\u6536\u85CF";
var RESERVED_TAGS = /* @__PURE__ */ new Set([TAG_PINNED, TAG_STARRED]);

// src/store.ts
var import_obsidian2 = require("obsidian");

// src/tag-rewrite.ts
var TAG_RE = /#([A-Za-z0-9_一-鿿][A-Za-z0-9_一-鿿/]*)/g;
function extractTagsFromContent(content) {
  const tags = /* @__PURE__ */ new Set();
  visitEditableLines(content, (line) => {
    const protectedRanges = getProtectedRanges(line);
    TAG_RE.lastIndex = 0;
    let match;
    while ((match = TAG_RE.exec(line)) !== null) {
      if (!isProtected(match.index, protectedRanges)) tags.add(match[1]);
    }
    return line;
  });
  return [...tags];
}
function replaceTagInContent(content, oldTag, newTag) {
  const next = visitEditableLines(content, (line) => replaceTagsInLine(line, oldTag, newTag));
  if (newTag !== null) return next;
  return compactLines(next) || "\uFF08\u6807\u7B7E\u5DF2\u79FB\u9664\uFF09";
}
function stripDisplayTags(content) {
  const tags = [];
  let changed = false;
  const text = visitEditableLines(content, (line) => {
    const protectedRanges = getProtectedRanges(line);
    TAG_RE.lastIndex = 0;
    return line.replace(TAG_RE, (match, tag, offset) => {
      if (isProtected(offset, protectedRanges)) return match;
      if (!tags.includes(tag)) tags.push(tag);
      changed = true;
      return "";
    });
  });
  if (!changed) return { text: content, tags };
  return { text: compactLines(text), tags };
}
function visitEditableLines(content, transform) {
  const lines = content.split("\n");
  let inFence = false;
  return lines.map((line) => {
    if (isFenceLine(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;
    return transform(line);
  }).join("\n");
}
function replaceTagsInLine(line, oldTag, newTag) {
  const protectedRanges = getProtectedRanges(line);
  TAG_RE.lastIndex = 0;
  return line.replace(TAG_RE, (match, tag, offset) => {
    if (isProtected(offset, protectedRanges)) return match;
    if (tag === oldTag) return newTag ? `#${newTag}` : "";
    if (tag.startsWith(oldTag + "/")) return newTag ? `#${newTag}${tag.slice(oldTag.length)}` : "";
    return match;
  });
}
function getProtectedRanges(line) {
  const ranges = [];
  addInlineCodeRanges(line, ranges);
  addWikiLinkRanges(line, ranges);
  addMarkdownDestinationRanges(line, ranges);
  addBareUrlRanges(line, ranges);
  return mergeRanges(ranges);
}
function addInlineCodeRanges(line, ranges) {
  let i = 0;
  while (i < line.length) {
    if (line[i] !== "`") {
      i++;
      continue;
    }
    const start = i;
    while (i < line.length && line[i] === "`") i++;
    const ticks = line.slice(start, i);
    const end = line.indexOf(ticks, i);
    if (end < 0) break;
    ranges.push([start, end + ticks.length]);
    i = end + ticks.length;
  }
}
function addWikiLinkRanges(line, ranges) {
  let start = line.indexOf("[[");
  while (start >= 0) {
    const end = line.indexOf("]]", start + 2);
    if (end < 0) break;
    ranges.push([start, end + 2]);
    start = line.indexOf("[[", end + 2);
  }
}
function addMarkdownDestinationRanges(line, ranges) {
  let start = line.indexOf("](");
  while (start >= 0) {
    let depth = 1;
    let i = start + 2;
    while (i < line.length && depth > 0) {
      if (line[i] === "\\") {
        i += 2;
        continue;
      }
      if (line[i] === "(") depth++;
      else if (line[i] === ")") depth--;
      i++;
    }
    if (depth === 0) ranges.push([start + 2, i - 1]);
    start = line.indexOf("](", i);
  }
}
function addBareUrlRanges(line, ranges) {
  const urlRe = /\b(?:https?|file|obsidian):\/\/[^\s<>()]+/gi;
  let match;
  while ((match = urlRe.exec(line)) !== null) ranges.push([match.index, match.index + match[0].length]);
}
function mergeRanges(ranges) {
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (!last || range[0] > last[1]) merged.push([...range]);
    else last[1] = Math.max(last[1], range[1]);
  }
  return merged;
}
function isProtected(index, ranges) {
  return ranges.some(([start, end]) => index >= start && index < end);
}
function isFenceLine(line) {
  return /^\s*(?:```|~~~)/.test(line);
}
function compactLines(text) {
  return text.split("\n").map((l) => l.replace(/[ \t]+$/g, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// src/parser.ts
var WEEKDAYS = ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"];
var DATE_HEAD_RE = /^##\s+(\d{4}-\d{2}-\d{2})(?:\s+.+)?$/;
var TIME_LINE_RE = /^-\s+(\d{2}:\d{2})\s?(.*)$/;
function parseMemos(filePath, content) {
  var _a;
  const lines = content.split(/\r?\n/);
  const memos = [];
  let currentDate = "";
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const dateMatch = line.match(DATE_HEAD_RE);
    if (dateMatch) {
      currentDate = dateMatch[1];
      i++;
      continue;
    }
    const timeMatch = line.match(TIME_LINE_RE);
    if (timeMatch && currentDate) {
      const time = timeMatch[1];
      const firstLine = (_a = timeMatch[2]) != null ? _a : "";
      const startLine = i;
      const contentLines = [firstLine];
      i++;
      while (i < lines.length) {
        const next = lines[i];
        if (TIME_LINE_RE.test(next) || DATE_HEAD_RE.test(next) || /^#\s+\d{4}\s*$/.test(next)) break;
        if (next.startsWith("  ")) {
          contentLines.push(next.slice(2));
          i++;
          continue;
        }
        if (next.trim() === "") {
          const peek = lines[i + 1];
          if (peek !== void 0 && peek.startsWith("  ")) {
            contentLines.push("");
            i++;
            continue;
          }
          break;
        }
        break;
      }
      const endLine = i - 1;
      while (contentLines.length && contentLines[0].trim() === "") contentLines.shift();
      while (contentLines.length && contentLines[contentLines.length - 1].trim() === "") contentLines.pop();
      const memoContent = contentLines.join("\n");
      const tags = extractTags(memoContent);
      const taskState = checkTasks(memoContent);
      memos.push({
        file: filePath,
        date: currentDate,
        time,
        datetime: buildDatetime(currentDate, time),
        content: memoContent,
        tags,
        hasImage: checkHasImage(memoContent),
        hasLink: checkHasLink(memoContent),
        isPinned: tags.includes(TAG_PINNED),
        isStarred: tags.includes(TAG_STARRED),
        hasOpenTask: taskState.open,
        hasClosedTask: taskState.closed,
        range: [startLine, endLine]
      });
      continue;
    }
    i++;
  }
  return memos;
}
function buildDatetime(dateStr, timeStr) {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  const [h, min] = timeStr.split(":").map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d, h, min, 0, 0);
}
function extractTags(content) {
  return extractTagsFromContent(content);
}
function checkHasImage(content) {
  return !!(/!\[[^\]]*\]\([^)]+\)/.test(content) || /!\[\[[^\]]+\.(png|jpe?g|gif|webp|svg|bmp|avif)(\|[^\]]*)?\]\]/i.test(content));
}
function checkHasLink(content) {
  const stripped = content.replace(/```[\s\S]*?```/g, "").replace(/~~~[\s\S]*?~~~/g, "").replace(/`[^`\n]*`/g, "").replace(/!\[[^\]]*\]\([^)]+\)/g, "").replace(/!\[\[[^\]]+\]\]/g, "");
  return !!(/\[[^\]]+\]\([^)]+\)/.test(stripped) || /\[\[[^\]]+\]\]/.test(stripped) || /https?:\/\/[^\s)]+/.test(stripped));
}
function formatDate(date) {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function formatTime(date) {
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}
function getWeekday(date) {
  return WEEKDAYS[date.getDay()];
}
function buildMemoBlock(time, content) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  while (lines.length && lines[0].trim() === "") lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  if (lines.length === 0) return `- ${time}`;
  const indented = lines.map((l) => l.trim() === "" ? "" : `  ${l}`).join("\n");
  return `- ${time}
${indented}`;
}
function normalizeForRender(content) {
  const lines = content.split("\n");
  const result = [];
  let inFence = false;
  const isTable = (l) => /^\s*\|.*\|\s*$/.test(l);
  const isHeading = (l) => /^#{1,6}\s/.test(l);
  const isHRule = (l) => /^\s*(?:---|\*\*\*|___)\s*$/.test(l);
  const isBlockquote = (l) => /^\s*>/.test(l);
  const isFence = (l) => /^\s*(?:```|~~~)/.test(l);
  const lastNonBlank = () => {
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i].trim() !== "") return result[i];
    }
    return "";
  };
  const ensureBlankBefore = () => {
    if (result.length > 0 && result[result.length - 1].trim() !== "") result.push("");
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = i < lines.length - 1 ? lines[i + 1] : "";
    if (isFence(line) && !inFence) {
      ensureBlankBefore();
      result.push(line);
      inFence = true;
      continue;
    }
    if (inFence) {
      result.push(line);
      if (isFence(line)) {
        inFence = false;
        if (next.trim() !== "") result.push("");
      }
      continue;
    }
    if (isHeading(line)) {
      ensureBlankBefore();
      result.push(line);
      if (next.trim() !== "") result.push("");
      continue;
    }
    if (isHRule(line) && lines[i > 0 ? i - 1 : 0].trim() !== "" && !isHeading(lastNonBlank())) {
      ensureBlankBefore();
      result.push(line);
      if (next.trim() !== "") result.push("");
      continue;
    }
    if (isTable(line) && (i === 0 || !isTable(lines[i - 1])) && lines[i > 0 ? i - 1 : 0].trim() !== "") {
      ensureBlankBefore();
      result.push(line);
      continue;
    }
    if (isTable(line)) {
      result.push(line);
      if (next.trim() !== "" && !isTable(next)) result.push("");
      continue;
    }
    if (isBlockquote(line) && (i === 0 || !isBlockquote(lines[i - 1])) && lines[i > 0 ? i - 1 : 0].trim() !== "") {
      ensureBlankBefore();
      result.push(line);
      continue;
    }
    result.push(line);
  }
  return result.join("\n");
}
function checkTasks(content) {
  const openRe = /(?:^|\n)\s*[-*+]\s+\[ \]\s/;
  const closedRe = /(?:^|\n)\s*[-*+]\s+\[[xX]\]\s/;
  return { open: openRe.test(content), closed: closedRe.test(content) };
}
function htmlToMarkdown(html) {
  if (!isHtmlContent(html)) return "";
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const md = nodeToMd(doc.body);
    return md.trim();
  } catch (e) {
    return "";
  }
}
function isHtmlContent(text) {
  return /<\/?(strong|b|em|i|a|h[1-6]|ul|ol|li|blockquote|pre|code|img|hr)[\s>]/i.test(text);
}
function nodeToMd(node, indent = 0) {
  var _a, _b, _c, _d, _e, _f;
  if (node.nodeType === Node.TEXT_NODE) {
    return ((_a = node.textContent) != null ? _a : "").replace(/\s+/g, " ").replace(/([\\`*_{}[\]()#+\-.!])/g, "\\$1");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node;
  const tag = el.tagName;
  const children = Array.from(el.childNodes);
  const inner = () => children.map((c) => nodeToMd(c, indent)).join("");
  switch (tag) {
    case "BR":
      return "\n";
    case "HR":
      return "\n---\n";
    case "STRONG":
    case "B":
      return "**" + inner().replace(/\\([*_])/g, "$1") + "**";
    case "EM":
    case "I":
      return "*" + inner().replace(/\\([*_])/g, "$1") + "*";
    case "CODE":
      return "`" + ((_b = el.textContent) != null ? _b : "") + "`";
    case "PRE":
      return "\n```\n" + ((_c = el.textContent) != null ? _c : "") + "\n```\n";
    case "A": {
      const href = (_d = el.getAttribute("href")) != null ? _d : "";
      const text = inner();
      return href ? `[${text}](${href})` : text;
    }
    case "IMG": {
      const src = (_e = el.getAttribute("src")) != null ? _e : "";
      const alt = (_f = el.getAttribute("alt")) != null ? _f : "";
      return src ? `![${alt}](${src})` : "";
    }
    case "H1":
      return "\n# " + inner() + "\n";
    case "H2":
      return "\n## " + inner() + "\n";
    case "H3":
      return "\n### " + inner() + "\n";
    case "H4":
      return "\n#### " + inner() + "\n";
    case "H5":
      return "\n##### " + inner() + "\n";
    case "H6":
      return "\n###### " + inner() + "\n";
    case "BLOCKQUOTE":
      return "\n" + inner().trim().split("\n").map((l) => "> " + l).join("\n") + "\n";
    case "UL": {
      let result = "\n";
      Array.from(el.children).forEach((li) => {
        if (li.tagName === "LI") {
          const prefix = "  ".repeat(indent);
          const liText = Array.from(li.childNodes).map((c) => nodeToMd(c, indent + 1)).join("").trim();
          result += `${prefix}- ${liText}
`;
        }
      });
      return result;
    }
    case "OL": {
      let result = "\n", num = 1;
      Array.from(el.children).forEach((li) => {
        if (li.tagName === "LI") {
          const prefix = "  ".repeat(indent);
          const liText = Array.from(li.childNodes).map((c) => nodeToMd(c, indent + 1)).join("").trim();
          result += `${prefix}${num}. ${liText}
`;
          num++;
        }
      });
      return result;
    }
    case "LI":
      return inner();
    case "P":
    case "DIV":
    case "SECTION":
    case "ARTICLE":
      return "\n" + inner() + "\n";
    case "SCRIPT":
    case "STYLE":
    case "NOSCRIPT":
      return "";
    default:
      return inner();
  }
}

// src/vault.ts
var import_obsidian = require("obsidian");
async function ensureFolder(app, path) {
  const normalized = (0, import_obsidian.normalizePath)(path).replace(/\/+$/, "");
  if (!normalized) return;
  const parts = normalized.split("/");
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const existing = app.vault.getAbstractFileByPath(current);
    if (existing) {
      if (!(existing instanceof import_obsidian.TFolder)) throw new Error(`\u8DEF\u5F84\u5DF2\u5B58\u5728\u4F46\u4E0D\u662F\u6587\u4EF6\u5939: ${current}`);
      continue;
    }
    await app.vault.createFolder(current);
  }
}

// src/store.ts
var MemoStore = class {
  constructor(app, settings) {
    this.app = app;
    this.settings = settings;
    this.memos = [];
    this.listeners = [];
    this.loading = false;
    /** v2.0.3: 防 reloadFile 竞态 */
    this.reloadLocks = /* @__PURE__ */ new Map();
  }
  onChange(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
  emit() {
    for (const l of this.listeners) l();
  }
  /** v2.0.3: 公开通知变更（供 year-view 等使用） */
  notifyChange() {
    this.emit();
  }
  getAll() {
    return this.memos;
  }
  async reloadAll() {
    if (this.loading) return;
    this.loading = true;
    try {
      const files = this.collectFiles();
      const results = await Promise.all(files.map(async (f) => {
        const content = await this.app.vault.read(f);
        return parseMemos(f.path, content);
      }));
      const all = [];
      for (const arr of results) all.push(...arr);
      this.sortMemos(all);
      this.memos = all;
      this.emit();
    } finally {
      this.loading = false;
    }
  }
  /** v2.0.3: 竞态安全版 reloadFile */
  async reloadFile(file) {
    if (!this.isInFolder(file)) return;
    const key = file.path;
    const existing = this.reloadLocks.get(key);
    if (existing && existing.running) {
      existing.pending = true;
      return;
    }
    const lock = { running: true, pending: false };
    this.reloadLocks.set(key, lock);
    try {
      do {
        lock.pending = false;
        const current = this.app.vault.getAbstractFileByPath(key);
        if (!(current instanceof import_obsidian2.TFile)) break;
        const content = await this.app.vault.read(current);
        const parsed = parseMemos(current.path, content);
        this.memos = this.memos.filter((m) => m.file !== current.path);
        this.memos.push(...parsed);
        this.sortMemos(this.memos);
        this.emit();
      } while (lock.pending);
    } finally {
      this.reloadLocks.delete(key);
    }
  }
  removeFile(filePath) {
    const prev = this.memos.length;
    this.memos = this.memos.filter((m) => m.file !== filePath);
    if (this.memos.length !== prev) this.emit();
  }
  sortMemos(memos) {
    memos.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      const diff = b.datetime.getTime() - a.datetime.getTime();
      if (diff !== 0) return diff;
      if (a.file !== b.file) return a.file < b.file ? 1 : -1;
      return b.range[0] - a.range[0];
    });
  }
  /** v2.0.3: 忽略 _ 前缀文件（_trash.md 等） */
  collectFiles() {
    const folder = (0, import_obsidian2.normalizePath)(this.settings.folder);
    const exportsPrefix = `${folder}/exports/`;
    return this.app.vault.getMarkdownFiles().filter((f) => {
      if (f.name.startsWith("_")) return false;
      if (f.path.startsWith(exportsPrefix)) return false;
      return f.path === `${folder}/${f.name}` || f.path.startsWith(`${folder}/`);
    });
  }
  isInFolder(file) {
    if (file.name.startsWith("_")) return false;
    const folder = (0, import_obsidian2.normalizePath)(this.settings.folder);
    if (file.path.startsWith(`${folder}/exports/`)) return false;
    return file.path.startsWith(`${folder}/`);
  }
  async addMemo(content, date = /* @__PURE__ */ new Date()) {
    content = content.trim();
    if (!content) return;
    const year = date.getFullYear().toString();
    const dateStr = formatDate(date);
    const timeStr = formatTime(date);
    const weekday = getWeekday(date);
    const folder = (0, import_obsidian2.normalizePath)(this.settings.folder);
    await ensureFolder(this.app, folder);
    const filePath = `${folder}/${year}.md`;
    const existing = this.app.vault.getAbstractFileByPath(filePath);
    if (existing) {
      const raw = await this.app.vault.read(existing);
      const updated = this.insertMemoIntoYear(raw, year, dateStr, weekday, timeStr, content);
      await this.app.vault.modify(existing, updated);
    } else {
      await this.app.vault.create(
        filePath,
        `# ${year}

## ${dateStr} ${weekday}

${buildMemoBlock(timeStr, content)}

`
      );
    }
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file) await this.reloadFile(file);
  }
  async editMemo(memo, newContent) {
    newContent = newContent.trim();
    if (!newContent) return;
    const file = this.app.vault.getAbstractFileByPath(memo.file);
    if (!file) return;
    const raw = await this.app.vault.read(file);
    const lines = raw.split(/\r?\n/);
    const [start, end] = this.locateMemoRange(file.path, raw, memo);
    const newBlock = buildMemoBlock(memo.time, newContent).split("\n");
    lines.splice(start, end - start + 1, ...newBlock);
    await this.app.vault.modify(file, lines.join("\n"));
    await this.reloadFile(file);
  }
  locateMemoRange(filePath, raw, memo) {
    const parsed = parseMemos(filePath, raw);
    const sameRange = parsed.find(
      (m) => m.range[0] === memo.range[0] && m.range[1] === memo.range[1] && m.date === memo.date && m.time === memo.time && m.content === memo.content
    );
    if (sameRange) return sameRange.range;
    const reparsed = parsed.filter(
      (m) => m.date === memo.date && m.time === memo.time && m.content === memo.content
    );
    if (reparsed.length === 0) throw new Error("\u6587\u4EF6\u5185\u5BB9\u5DF2\u53D8\u66F4\uFF0C\u627E\u4E0D\u5230\u539F\u7B14\u8BB0\u4F4D\u7F6E\uFF0C\u8BF7\u5173\u95ED\u7F16\u8F91\u540E\u5237\u65B0\u91CD\u8BD5");
    reparsed.sort((a, b) => {
      const da = Math.abs(a.range[0] - memo.range[0]);
      const db = Math.abs(b.range[0] - memo.range[0]);
      return da !== db ? da - db : a.range[0] - b.range[0];
    });
    return reparsed[0].range;
  }
  /** v2.0.3: 编辑笔记内容 + 时间（可跨日/跨年） */
  async editMemoDateTime(memo, newDate, newContent) {
    const file = this.app.vault.getAbstractFileByPath(memo.file);
    if (!file) throw new Error("\u627E\u4E0D\u5230\u539F\u7B14\u8BB0\u6587\u4EF6");
    const content = (newContent != null ? newContent : memo.content).trim();
    if (!content) throw new Error("\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A");
    const year = newDate.getFullYear().toString();
    const dateStr = formatDate(newDate);
    const timeStr = formatTime(newDate);
    const weekday = getWeekday(newDate);
    if (dateStr === memo.date && timeStr === memo.time && content === memo.content) return;
    const raw = await this.app.vault.read(file);
    const lines = raw.split(/\r?\n/);
    const [start, end] = this.locateMemoRange(file.path, raw, memo);
    lines.splice(start, end - start + 1);
    this.removeOrphanDateHeaders(lines);
    await this.app.vault.modify(file, this.compactBlankLines(lines).join("\n"));
    const folder = (0, import_obsidian2.normalizePath)(this.settings.folder);
    await ensureFolder(this.app, folder);
    const newPath = `${folder}/${year}.md`;
    if (newPath === file.path) {
      const newRaw = await this.app.vault.read(file);
      const updated = this.insertMemoIntoYear(newRaw, year, dateStr, weekday, timeStr, content);
      await this.app.vault.modify(file, updated);
      await this.reloadFile(file);
    } else {
      const targetFile = this.app.vault.getAbstractFileByPath(newPath);
      if (targetFile) {
        const targetRaw = await this.app.vault.read(targetFile);
        const updated = this.insertMemoIntoYear(targetRaw, year, dateStr, weekday, timeStr, content);
        await this.app.vault.modify(targetFile, updated);
      } else {
        await this.app.vault.create(
          newPath,
          `# ${year}

## ${dateStr} ${weekday}

${buildMemoBlock(timeStr, content)}

`
        );
      }
      await this.reloadFile(file);
      const newFile = this.app.vault.getAbstractFileByPath(newPath);
      if (newFile) await this.reloadFile(newFile);
    }
  }
  async deleteMemo(memo) {
    const file = this.app.vault.getAbstractFileByPath(memo.file);
    if (!file) return;
    const raw = await this.app.vault.read(file);
    const lines = raw.split(/\r?\n/);
    const [start, end] = this.locateMemoRange(file.path, raw, memo);
    if (this.settings.useTrash) {
      try {
        await this.appendToTrash(memo);
      } catch (e) {
        console.error("[Memoria] \u5199\u5165\u56DE\u6536\u7AD9\u5931\u8D25\uFF08\u5C06\u7EE7\u7EED\u6267\u884C\u5220\u9664\uFF09:", e);
      }
    }
    lines.splice(start, end - start + 1);
    this.removeOrphanDateHeaders(lines);
    await this.app.vault.modify(file, this.compactBlankLines(lines).join("\n"));
    await this.reloadFile(file);
  }
  removeOrphanDateHeaders(lines) {
    const dateHeadRe = /^##\s+\d{4}-\d{2}-\d{2}(?:\s+.+)?$/;
    const memoLineRe = /^- \d{2}:\d{2}/;
    const headingRe = /^#{1,2}\s+/;
    const toRemove = [];
    for (let i = 0; i < lines.length; i++) {
      if (!dateHeadRe.test(lines[i])) continue;
      let hasMemo = false;
      for (let j = i + 1; j < lines.length && !headingRe.test(lines[j]); j++) {
        if (memoLineRe.test(lines[j])) {
          hasMemo = true;
          break;
        }
      }
      if (!hasMemo) toRemove.push(i);
    }
    for (let i = toRemove.length - 1; i >= 0; i--) lines.splice(toRemove[i], 1);
  }
  async appendToTrash(memo) {
    const folder = (0, import_obsidian2.normalizePath)(this.settings.folder);
    await ensureFolder(this.app, folder);
    const trashPath = this.getTrashFilePath();
    const now = /* @__PURE__ */ new Date();
    const timestamp = `${formatDate(now)} ${formatTime(now)}`;
    const indented = memo.content.split("\n").map((l) => l === "" ? "" : `  ${l}`).join("\n");
    const entry = `
## \u5DF2\u5220\u9664 ${timestamp}

- \u6765\u6E90\uFF1A\`${memo.file}\` \xB7 \u539F\u65F6\u95F4 ${memo.date} ${memo.time}
${indented}
`;
    const existing = this.app.vault.getAbstractFileByPath(trashPath);
    if (!existing) {
      await this.app.vault.create(
        trashPath,
        "# Memoria \u56DE\u6536\u7AD9\n\n> \u8FD9\u91CC\u4FDD\u5B58\u88AB\u5220\u9664\u7684\u7B14\u8BB0\u3002\u505C\u7528\u63D2\u4EF6\u540E\u4F9D\u7136\u53EF\u8BFB\uFF0C\u53EF\u624B\u52A8\u6062\u590D\u6216\u6E05\u7A7A\u3002\n> \u8BE5\u6587\u4EF6\u4E0D\u4F1A\u88AB Memoria \u4E3B\u89C6\u56FE\u8BC6\u522B\u4E3A\u666E\u901A\u7B14\u8BB0\u3002\n" + entry
      );
    } else {
      let raw = await this.app.vault.read(existing);
      raw = raw + entry;
      raw = this.trimTrashToLimit(raw, this.settings.trashMaxItems);
      await this.app.vault.modify(existing, raw);
    }
  }
  getTrashFilePath() {
    const folder = (0, import_obsidian2.normalizePath)(this.settings.folder);
    return `${folder}/_trash.md`;
  }
  /** 2026-06-03: 回收站 UI 入口统一走这里，避免视图层手动解析 _trash.md 导致恢复定位出错 */
  async getTrashItems() {
    const file = this.app.vault.getAbstractFileByPath(this.getTrashFilePath());
    if (!(file instanceof import_obsidian2.TFile)) return [];
    const raw = await this.app.vault.read(file);
    return this.parseTrashItems(raw);
  }
  /** 2026-06-03: 恢复先插回年份文件，再移除回收站条目；顺序反过来会增加误删风险 */
  async restoreTrashItem(id) {
    const item = await this.findTrashItem(id);
    const date = buildDatetime(item.originalDate, item.originalTime);
    await this.addMemo(item.content, date);
    await this.removeTrashItem(id);
    return item;
  }
  /** 2026-06-03: 清空回收站保留文件说明，方便用户知道这个文件仍是 Memoria 的安全兜底 */
  async clearTrash() {
    const folder = (0, import_obsidian2.normalizePath)(this.settings.folder);
    await ensureFolder(this.app, folder);
    const trashPath = this.getTrashFilePath();
    const header = "# Memoria \u56DE\u6536\u7AD9\n\n> \u8FD9\u91CC\u4FDD\u5B58\u88AB\u5220\u9664\u7684\u7B14\u8BB0\u3002\u505C\u7528\u63D2\u4EF6\u540E\u4F9D\u7136\u53EF\u8BFB\uFF0C\u53EF\u624B\u52A8\u6062\u590D\u6216\u6E05\u7A7A\u3002\n> \u8BE5\u6587\u4EF6\u4E0D\u4F1A\u88AB Memoria \u4E3B\u89C6\u56FE\u8BC6\u522B\u4E3A\u666E\u901A\u7B14\u8BB0\u3002\n";
    const existing = this.app.vault.getAbstractFileByPath(trashPath);
    if (existing instanceof import_obsidian2.TFile) await this.app.vault.modify(existing, header);
    else await this.app.vault.create(trashPath, header);
  }
  async findTrashItem(id) {
    const items = await this.getTrashItems();
    const item = items.find((x) => x.id === id);
    if (!item) throw new Error("\u56DE\u6536\u7AD9\u6761\u76EE\u5DF2\u53D8\u66F4\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5");
    return item;
  }
  async removeTrashItem(id) {
    const file = this.app.vault.getAbstractFileByPath(this.getTrashFilePath());
    if (!(file instanceof import_obsidian2.TFile)) throw new Error("\u627E\u4E0D\u5230\u56DE\u6536\u7AD9\u6587\u4EF6");
    const raw = await this.app.vault.read(file);
    const items = this.parseTrashItems(raw);
    const item = items.find((x) => x.id === id);
    if (!item) throw new Error("\u56DE\u6536\u7AD9\u6761\u76EE\u5DF2\u53D8\u66F4\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5");
    const lines = raw.split(/\r?\n/);
    lines.splice(item.range[0], item.range[1] - item.range[0] + 1);
    await this.app.vault.modify(file, this.compactBlankLines(lines).join("\n"));
    return item;
  }
  parseTrashItems(raw) {
    var _a, _b, _c;
    const lines = raw.split(/\r?\n/);
    const items = [];
    const headRe = /^##\s+已删除\s+(.+)$/;
    const metaRe = /^-\s+来源：`([^`]+)`\s+·\s+原时间\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/;
    for (let i = 0; i < lines.length; i++) {
      const head = lines[i].match(headRe);
      if (!head) continue;
      const metaOffset = findMetaOffset((_a = lines[i + 1]) != null ? _a : "", (_b = lines[i + 2]) != null ? _b : "");
      if (metaOffset < 0) continue;
      const metaLine = (_c = lines[i + metaOffset]) != null ? _c : "";
      const meta = metaLine.match(metaRe);
      if (!meta) continue;
      let end = lines.length - 1;
      for (let j = i + 1; j < lines.length; j++) {
        if (headRe.test(lines[j])) {
          end = j - 1;
          break;
        }
      }
      const contentStart = i + metaOffset + 1;
      const contentLines = lines.slice(contentStart, end + 1).map((l) => l.startsWith("  ") ? l.slice(2) : l);
      while (contentLines.length && contentLines[0].trim() === "") contentLines.shift();
      while (contentLines.length && contentLines[contentLines.length - 1].trim() === "") contentLines.pop();
      const content = contentLines.join("\n");
      const id = `${head[1]}|${meta[1]}|${meta[2]}|${meta[3]}|${i}|${hashString(content)}`;
      items.push({
        id,
        deletedAt: head[1],
        sourceFile: meta[1],
        originalDate: meta[2],
        originalTime: meta[3],
        content,
        range: [i, end]
      });
    }
    return items.reverse();
  }
  compactBlankLines(lines) {
    const cleaned = [];
    let blanks = 0;
    for (const line of lines) {
      if (line.trim() === "") {
        blanks++;
        if (blanks <= 2) cleaned.push(line);
      } else {
        blanks = 0;
        cleaned.push(line);
      }
    }
    while (cleaned.length > 1 && cleaned[cleaned.length - 1].trim() === "" && cleaned[cleaned.length - 2].trim() === "") cleaned.pop();
    return cleaned;
  }
  /** v2.0.3: 回收站上限裁剪 */
  trimTrashToLimit(raw, limit) {
    if (!limit || limit <= 0) return raw;
    const lines = raw.split(/\r?\n/);
    const trashHeadRe = /^##\s+已删除\s+/;
    const indices = [];
    for (let i = 0; i < lines.length; i++) if (trashHeadRe.test(lines[i])) indices.push(i);
    if (indices.length <= limit) return raw;
    const cutoff = indices[indices.length - limit];
    const headerEnd = indices[0];
    const header = lines.slice(0, headerEnd);
    const tail = lines.slice(cutoff);
    while (header.length && header[header.length - 1].trim() === "") header.pop();
    return header.join("\n") + "\n\n" + tail.join("\n");
  }
  async togglePinned(memo) {
    await this.toggleReservedTag(memo, TAG_PINNED);
  }
  async toggleStarred(memo) {
    await this.toggleReservedTag(memo, TAG_STARRED);
  }
  async toggleReservedTag(memo, tag) {
    const hasTag = memo.tags.includes(tag);
    let newContent;
    if (hasTag) {
      const re = new RegExp(`\\s*#${escapeRegex(tag)}(?![A-Za-z0-9_\\u4e00-\\u9fff/])`, "g");
      newContent = memo.content.replace(re, "");
      newContent = newContent.split("\n").map((l) => l.replace(/[ \t]+$/, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
      if (newContent === "") newContent = `\uFF08\u5DF2\u53D6\u6D88${tag}\uFF09`;
    } else {
      const lines = memo.content.split("\n");
      if (lines.length === 0 || lines[0].trim() === "") lines[0] = `#${tag}`;
      else lines[0] = `${lines[0].replace(/\s+$/, "")} #${tag}`;
      newContent = lines.join("\n");
    }
    await this.editMemo(memo, newContent);
  }
  async saveImageAttachment(data, ext) {
    const folder = (0, import_obsidian2.normalizePath)(this.settings.attachmentFolder);
    await ensureFolder(this.app, folder);
    const now = /* @__PURE__ */ new Date();
    const ts = now.getFullYear().toString() + pad(now.getMonth() + 1) + pad(now.getDate()) + "-" + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
    const rand = Math.random().toString(36).slice(2, 6);
    const cleanExt = (ext || "png").replace(/^\./, "").toLowerCase();
    const filePath = `${folder}/memoria-${ts}-${rand}.${cleanExt}`;
    await this.app.vault.createBinary(filePath, data);
    return filePath;
  }
  getTagStats() {
    var _a;
    const counts = /* @__PURE__ */ new Map();
    for (const memo of this.memos) {
      const seen = /* @__PURE__ */ new Set();
      for (const tag of memo.tags) {
        if (RESERVED_TAGS.has(tag) || seen.has(tag)) continue;
        counts.set(tag, ((_a = counts.get(tag)) != null ? _a : 0) + 1);
        seen.add(tag);
      }
    }
    return [...counts.entries()].map(([name, memoCount]) => ({ name, memoCount })).sort((a, b) => b.memoCount - a.memoCount || a.name.localeCompare(b.name));
  }
  async renameTag(oldTag, newTag) {
    const from = normalizeTagName(oldTag);
    const to = normalizeTagName(newTag);
    if (!from || !to) throw new Error("\u6807\u7B7E\u4E0D\u80FD\u4E3A\u7A7A");
    if (RESERVED_TAGS.has(from) || RESERVED_TAGS.has(to)) throw new Error("\u7F6E\u9876\u3001\u6536\u85CF\u662F\u4FDD\u7559\u6807\u7B7E\uFF0C\u4E0D\u80FD\u5728\u6807\u7B7E\u6574\u7406\u5DE5\u5177\u4E2D\u6539\u540D");
    if (from === to) return 0;
    return await this.rewriteTagsAcrossMemos((content) => replaceTagInContent(content, from, to));
  }
  async removeTag(tag) {
    const target = normalizeTagName(tag);
    if (!target) throw new Error("\u6807\u7B7E\u4E0D\u80FD\u4E3A\u7A7A");
    if (RESERVED_TAGS.has(target)) throw new Error("\u7F6E\u9876\u3001\u6536\u85CF\u662F\u4FDD\u7559\u6807\u7B7E\uFF0C\u4E0D\u80FD\u5728\u6807\u7B7E\u6574\u7406\u5DE5\u5177\u4E2D\u5220\u9664");
    return await this.rewriteTagsAcrossMemos((content) => replaceTagInContent(content, target, null));
  }
  /** 2026-06-03: 标签整理批量改写只替换 memo 内容块，避免误改年份标题、回收站和导出文件 */
  async rewriteTagsAcrossMemos(transform) {
    const files = this.collectFiles();
    let changedMemos = 0;
    for (const file of files) {
      const raw = await this.app.vault.read(file);
      const memos = parseMemos(file.path, raw).sort((a, b) => b.range[0] - a.range[0]);
      if (!memos.length) continue;
      const lines = raw.split(/\r?\n/);
      let changedFile = false;
      for (const memo of memos) {
        const nextContent = transform(memo.content);
        if (nextContent === memo.content) continue;
        const nextTags = extractTags(nextContent);
        if (nextTags.join("\0") === memo.tags.join("\0")) continue;
        const block = buildMemoBlock(memo.time, nextContent).split("\n");
        lines.splice(memo.range[0], memo.range[1] - memo.range[0] + 1, ...block);
        changedFile = true;
        changedMemos++;
      }
      if (changedFile) {
        await this.app.vault.modify(file, lines.join("\n"));
        await this.reloadFile(file);
      }
    }
    return changedMemos;
  }
  /** 2026-06-03: memo 转正式笔记保留来源字段，便于后续排查跨文件生成或重复创建问题 */
  async promoteMemoToNote(memo, title, folder) {
    const targetFolder = (0, import_obsidian2.normalizePath)(folder.trim() || this.settings.promoteFolder || "Memoria/notes");
    await ensureFolder(this.app, targetFolder);
    const safeTitle = sanitizeFileName(title.trim() || memo.content.split("\n")[0] || "Memoria memo");
    const baseName = `${memo.date}-${memo.time.replace(":", "")}-${safeTitle}`.slice(0, 100);
    const filePath = await this.getUniqueMarkdownPath(targetFolder, baseName);
    const content = this.buildPromotedNoteContent(memo, title.trim() || safeTitle);
    await this.app.vault.create(filePath, content);
    return filePath;
  }
  async getUniqueMarkdownPath(folder, baseName) {
    let filePath = `${folder}/${baseName}.md`;
    let idx = 2;
    while (this.app.vault.getAbstractFileByPath(filePath)) {
      filePath = `${folder}/${baseName}-${idx}.md`;
      idx++;
    }
    return filePath;
  }
  buildPromotedNoteContent(memo, title) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const sourceFile = memo.file.replace(/\\/g, "/");
    const body = memo.content.trim();
    return [
      "---",
      "source: Memoria",
      `promoted_at: ${now}`,
      `memo_date: ${memo.date}`,
      `memo_time: ${memo.time}`,
      `memo_file: ${JSON.stringify(sourceFile)}`,
      "---",
      "",
      `# ${title}`,
      "",
      `> \u6765\u6E90\uFF1AMemoria \xB7 ${memo.date} ${memo.time}`,
      "",
      "## \u539F\u6587",
      "",
      body,
      ""
    ].join("\n");
  }
  insertMemoIntoYear(raw, year, dateStr, weekday, time, content) {
    const lines = raw.split(/\r?\n/);
    const yearHead = `# ${year}`;
    const memoBlock = buildMemoBlock(time, content);
    let yearIdx = lines.findIndex((l) => l.trim() === yearHead);
    if (yearIdx < 0) {
      if (lines.length && lines[0].trim() !== "") lines.unshift("", yearHead, "");
      else lines.unshift(yearHead, "");
      yearIdx = lines.findIndex((l) => l.trim() === yearHead);
    }
    const dateRe = new RegExp(`^##\\s+${dateStr}(?:\\s+.+)?$`);
    const dateIdx = lines.findIndex((l) => dateRe.test(l));
    if (dateIdx >= 0) {
      let sectionEnd = lines.length;
      for (let i = dateIdx + 1; i < lines.length; i++) {
        if (/^#{1,2}\s+/.test(lines[i])) {
          sectionEnd = i;
          break;
        }
      }
      const timeLineRe = /^-\s+(\d{2}:\d{2})(?:\s|$)/;
      let insertIdx = -1;
      for (let i = dateIdx + 1; i < sectionEnd; i++) {
        const m = lines[i].match(timeLineRe);
        if (m && m[1] > time) {
          insertIdx = i;
          break;
        }
      }
      if (insertIdx >= 0) {
        let pos = insertIdx;
        while (pos > dateIdx + 1 && lines[pos - 1].trim() === "") pos--;
        lines.splice(pos, 0, memoBlock, "");
        return lines.join("\n");
      }
      const insertAt = this.trimTrailingBlank(lines, dateIdx + 1, sectionEnd);
      lines.splice(insertAt, 0, "", memoBlock);
      return lines.join("\n");
    }
    const laterDateRe = /^##\s+(\d{4}-\d{2}-\d{2})/;
    const yearHeadRe = /^#\s+\d{4}\s*$/;
    let insertBefore = -1;
    let yearSectionEnd = lines.length;
    for (let i = yearIdx + 1; i < lines.length; i++) {
      if (yearHeadRe.test(lines[i])) {
        yearSectionEnd = i;
        break;
      }
    }
    for (let i = yearIdx + 1; i < yearSectionEnd; i++) {
      const m = lines[i].match(laterDateRe);
      if (m && m[1] > dateStr) {
        insertBefore = i;
        break;
      }
    }
    const newSection = ["", `## ${dateStr} ${weekday}`, "", memoBlock, ""];
    if (insertBefore === -1) {
      if (yearSectionEnd < lines.length) {
        let pos = yearSectionEnd;
        while (pos > yearIdx + 1 && lines[pos - 1].trim() === "") pos--;
        lines.splice(pos, 0, "", ...newSection.slice(1));
      } else {
        while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
        lines.push("", `## ${dateStr} ${weekday}`, "", memoBlock, "");
      }
    } else {
      lines.splice(insertBefore, 0, ...newSection);
    }
    return lines.join("\n");
  }
  trimTrailingBlank(lines, start, end) {
    let last = start;
    for (let i = start; i < end; i++) {
      if (lines[i].trim() !== "") last = i + 1;
    }
    return last;
  }
};
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function findMetaOffset(line1, line2) {
  const metaRe = /^-\s+来源：`([^`]+)`\s+·\s+原时间\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/;
  if (metaRe.test(line1)) return 1;
  if (metaRe.test(line2)) return 2;
  return -1;
}
function pad(n) {
  return n.toString().padStart(2, "0");
}
function sanitizeFileName(name) {
  return name.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Memoria memo";
}
function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
function normalizeTagName(tag) {
  const normalized = tag.trim().replace(/^#/, "").replace(/\/+$/, "");
  if (!normalized) return "";
  if (!/^[A-Za-z0-9_一-鿿][A-Za-z0-9_一-鿿/]*$/.test(normalized)) {
    throw new Error("\u6807\u7B7E\u53EA\u80FD\u5305\u542B\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u4E0B\u5212\u7EBF\u3001\u4E2D\u6587\u548C /");
  }
  return normalized;
}

// src/view.ts
var import_obsidian7 = require("obsidian");

// src/tag-suggest.ts
var import_obsidian3 = require("obsidian");
var _TagSuggest = class _TagSuggest {
  constructor(app, textarea) {
    this.app = app;
    this.textarea = textarea;
    this.dropdown = null;
    this.items = [];
    this.active = 0;
    this.rangeStart = 0;
    this.cachedTags = null;
    this.cacheTime = 0;
    this.metaChangeRef = null;
    this.handleInput = () => {
      const trigger = this.detectTrigger();
      if (!trigger) {
        this.close();
        return;
      }
      this.rangeStart = trigger.start;
      const allTags = this.collectAllTags();
      this.items = this.matchTags(allTags, trigger.query);
      if (this.items.length === 0) {
        this.close();
        return;
      }
      this.active = 0;
      this.render();
    };
    this.handleBlur = () => {
      setTimeout(() => this.close(), 150);
    };
    this.handleKeydown = (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (!this.dropdown) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.active = (this.active + 1) % this.items.length;
        this.refreshActive();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.active = (this.active - 1 + this.items.length) % this.items.length;
        this.refreshActive();
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        e.stopPropagation();
        this.applySelected();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.close();
      }
    };
    this.textarea.addEventListener("input", this.handleInput);
    this.textarea.addEventListener("keydown", this.handleKeydown, true);
    this.textarea.addEventListener("blur", this.handleBlur);
    this.textarea.addEventListener("scroll", () => this.close());
    const ref = this.app.metadataCache.on("changed", () => {
      this.cachedTags = null;
    });
    this.metaChangeRef = { unref: () => this.app.metadataCache.offref(ref) };
  }
  destroy() {
    this.textarea.removeEventListener("input", this.handleInput);
    this.textarea.removeEventListener("keydown", this.handleKeydown, true);
    this.textarea.removeEventListener("blur", this.handleBlur);
    if (this.metaChangeRef) {
      this.metaChangeRef.unref();
      this.metaChangeRef = null;
    }
    this.close();
  }
  detectTrigger() {
    var _a;
    const pos = (_a = this.textarea.selectionStart) != null ? _a : 0;
    const val = this.textarea.value;
    let i = pos - 1;
    while (i >= 0) {
      const ch = val[i];
      if (ch === "#") {
        const before = i === 0 ? " " : val[i - 1];
        if (/[\s\n\r,，。.!?！？（(]/.test(before) || i === 0) {
          const query = val.slice(i + 1, pos);
          if (/^[A-Za-z0-9_一-鿿/]*$/.test(query)) return { start: i, query };
        }
        return null;
      }
      if (/[\s\n\r]/.test(ch) || !/[A-Za-z0-9_一-鿿/]/.test(ch)) return null;
      i--;
    }
    return null;
  }
  /** v2.0.3: 带 30s TTL 缓存的标签收集 */
  collectAllTags() {
    var _a, _b;
    if (this.cachedTags && Date.now() - this.cacheTime < _TagSuggest.CACHE_TTL_MS) {
      return this.cachedTags;
    }
    const counts = /* @__PURE__ */ new Map();
    const cache = this.app.metadataCache;
    for (const file of this.app.vault.getMarkdownFiles()) {
      const meta = cache.getFileCache(file);
      if (!meta) continue;
      for (const tag of (_a = (0, import_obsidian3.getAllTags)(meta)) != null ? _a : []) {
        const name = tag.replace(/^#/, "");
        if (name) counts.set(name, ((_b = counts.get(name)) != null ? _b : 0) + 1);
      }
    }
    const result = [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    this.cachedTags = result;
    this.cacheTime = Date.now();
    return result;
  }
  matchTags(tags, query) {
    if (!query) return tags.slice(0, 8).map((t2) => t2.name);
    const q = query.toLowerCase();
    const starts = [];
    const contains = [];
    for (const t2 of tags) {
      const n = t2.name.toLowerCase();
      if (n === q) continue;
      if (n.startsWith(q)) starts.push(t2);
      else if (n.includes(q) || n.split("/").some((p) => p.startsWith(q))) contains.push(t2);
    }
    return [...starts, ...contains].slice(0, 8).map((t2) => t2.name);
  }
  render() {
    if (!this.dropdown) {
      this.dropdown = document.body.createDiv({ cls: "memoria-tag-suggest" });
      this.dropdown.addEventListener("mousedown", (e) => e.preventDefault());
    }
    this.dropdown.empty();
    this.items.forEach((name, i) => {
      const item = this.dropdown.createDiv({
        cls: "memoria-tag-suggest-item" + (i === this.active ? " active" : "")
      });
      (0, import_obsidian3.setIcon)(item.createSpan({ cls: "memoria-tag-suggest-icon" }), "hash");
      item.createSpan({ cls: "memoria-tag-suggest-name", text: name });
      item.addEventListener("click", () => {
        this.active = i;
        this.applySelected();
      });
    });
    this.position();
  }
  refreshActive() {
    if (!this.dropdown) return;
    const items = this.dropdown.querySelectorAll(".memoria-tag-suggest-item");
    items.forEach((el, i) => el.toggleClass("active", i === this.active));
    const activeItem = items[this.active];
    activeItem == null ? void 0 : activeItem.scrollIntoView({ block: "nearest" });
  }
  position() {
    if (!this.dropdown) return;
    const rect = this.textarea.getBoundingClientRect();
    this.dropdown.style.top = `${rect.bottom + 4}px`;
    this.dropdown.style.left = `${rect.left + 4}px`;
    this.dropdown.style.minWidth = `${Math.min(rect.width, 280)}px`;
  }
  applySelected() {
    var _a;
    if (!this.dropdown || !this.items.length) return;
    const tag = this.items[this.active];
    const val = this.textarea.value;
    const pos = (_a = this.textarea.selectionStart) != null ? _a : 0;
    const before = val.slice(0, this.rangeStart);
    const after = val.slice(pos);
    const insert = `#${tag} `;
    this.textarea.value = before + insert + after;
    const newPos = before.length + insert.length;
    this.textarea.setSelectionRange(newPos, newPos);
    this.textarea.focus();
    this.close();
  }
  close() {
    var _a;
    (_a = this.dropdown) == null ? void 0 : _a.remove();
    this.dropdown = null;
    this.items = [];
    this.active = 0;
  }
};
_TagSuggest.CACHE_TTL_MS = 3e4;
var TagSuggest = _TagSuggest;

// src/image.ts
var import_obsidian4 = require("obsidian");

// src/i18n.ts
var zhCN = {
  "sidebar.views": "\u89C6\u56FE",
  "sidebar.search": "\u68C0\u7D22",
  "sidebar.tags": "\u6807\u7B7E",
  "sidebar.all": "\u5168\u90E8\u7B14\u8BB0",
  "sidebar.pinned": "\u7F6E\u9876",
  "sidebar.starred": "\u6536\u85CF",
  "sidebar.today": "\u4ECA\u5929",
  "sidebar.week": "\u672C\u5468",
  "sidebar.todo": "\u5F85\u529E",
  "sidebar.review": "\u56DE\u987E",
  "sidebar.noTag": "\u65E0\u6807\u7B7E",
  "sidebar.withImage": "\u6709\u56FE\u7247",
  "sidebar.withLink": "\u6709\u94FE\u63A5",
  "sidebar.random": "\u968F\u673A",
  "sidebar.section.views": "\u89C6\u56FE",
  "sidebar.section.search": "\u68C0\u7D22\u5F0F",
  "sidebar.section.years": "\u5E74\u4EFD",
  "sidebar.section.tags": "\u6807\u7B7E",
  "input.placeholder": "\u6B64\u523B\uFF0C\u4F60\u5728\u60F3\u4EC0\u4E48\uFF1F",
  "input.editPlaceholder": "\u7F16\u8F91 {date} {time} \u7684\u7B14\u8BB0\uFF08Esc \u53D6\u6D88\uFF09",
  "input.autoTagPlaceholder": "\u6B64\u523B\uFF0C\u4F60\u5728\u60F3\u4EC0\u4E48\uFF1F\uFF08\u4F1A\u81EA\u52A8\u52A0 #{tag}\uFF09",
  "input.submit": "\u53D1\u9001",
  "input.cancel": "\u53D6\u6D88",
  "input.editTimeTitle": "\u4FEE\u6539\u8FD9\u6761\u7B14\u8BB0\u7684\u65F6\u95F4\uFF08\u5E74/\u6708/\u65E5 \u65F6:\u5206\uFF09",
  "date.today": "\u4ECA\u5929",
  "date.yesterday": "\u6628\u5929",
  "weekday.0": "\u5468\u65E5",
  "weekday.1": "\u5468\u4E00",
  "weekday.2": "\u5468\u4E8C",
  "weekday.3": "\u5468\u4E09",
  "weekday.4": "\u5468\u56DB",
  "weekday.5": "\u5468\u4E94",
  "weekday.6": "\u5468\u516D",
  "list.totalCount": "\u5171 {n} \u6761",
  "list.dailyGoalProgress": "\u76EE\u6807 {goal} \u6761\uFF0C\u5DF2\u8BB0 {done} \u6761",
  "list.dailyGoalDone": "\u76EE\u6807 {goal} \u6761\uFF0C\u5F53\u524D\u5DF2\u5B8C\u6210 {done} \u6761",
  "list.dailyGoalExceed": "\u76EE\u6807 {goal} \u6761\uFF0C\u5F53\u524D\u5DF2\u5B8C\u6210 {done} \u6761\uFF08\u8D85\u989D {extra}\uFF09",
  "list.pinnedHead": "\u7F6E\u9876  \u5171 {n} \u6761",
  "list.presetPinned": "\u{1F4CC} \u7F6E\u9876",
  "list.presetStarred": "\u2B50 \u6536\u85CF",
  "list.presetRandom": "\u{1F3B2} \u968F\u673A 5 \u6761",
  "list.presetOnThisDay": "\u{1F570}\uFE0F \u5F80\u5E74\u7684\u4ECA\u5929",
  "list.loadMore": "\u2193 \u6EDA\u52A8\u52A0\u8F7D\u66F4\u591A\uFF08\u8FD8\u6709 {n} \u6761\uFF09",
  "notice.saved": "\u2713 \u5DF2\u8BB0\u4E0B",
  "notice.updated": "\u2713 \u5DF2\u66F4\u65B0",
  "notice.updatedWithTime": "\u2713 \u5DF2\u66F4\u65B0\uFF08\u542B\u65F6\u95F4\uFF09",
  "notice.deleted": "\u5DF2\u5220\u9664",
  "notice.imageFailed": "\u56FE\u7247\u4FDD\u5B58\u5931\u8D25\uFF1A{msg}",
  "notice.saveFailed": "\u4FDD\u5B58\u5931\u8D25\uFF1A{msg}",
  "notice.invalidTime": "\u65F6\u95F4\u683C\u5F0F\u4E0D\u5408\u6CD5\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9",
  "notice.exportEmpty": "\u5F53\u524D\u7B5B\u9009\u6CA1\u6709\u53EF\u5BFC\u51FA\u7684\u7B14\u8BB0",
  "notice.exportFailed": "\u5BFC\u51FA\u5931\u8D25\uFF1A{msg}",
  "notice.exportDone": "\u2713 \u5DF2\u5BFC\u51FA {n} \u6761\u5230 {path}",
  "notice.dailyGoalDone": "\u{1F389} \u4ECA\u65E5\u6253\u5361\u5B8C\u6210\uFF01\u5DF2\u8BB0 {n} \u6761\uFF5E",
  "notice.checkFailed": "\u52FE\u9009\u5931\u8D25\uFF1A{msg}",
  "notice.copied": "\u5DF2\u590D\u5236",
  "notice.quoted": "\u5DF2\u5F15\u7528\uFF0C\u7EE7\u7EED\u8865\u5145\u60F3\u6CD5\u5427",
  "notice.pinned": "\u2713 \u5DF2\u7F6E\u9876",
  "notice.unpinned": "\u5DF2\u53D6\u6D88\u7F6E\u9876",
  "notice.starred": "\u2713 \u5DF2\u6536\u85CF",
  "notice.unstarred": "\u5DF2\u53D6\u6D88\u6536\u85CF",
  "notice.confirmDelete": "\u786E\u5B9A\u5220\u9664\u8FD9\u6761\u7B14\u8BB0\u5417\uFF1F",
  "notice.confirmDeleteOk": "\u786E\u8BA4\u5220\u9664",
  "notice.deletedTrash": "\u5DF2\u5220\u9664 \xB7 \u53EF\u5728 _trash.md \u6062\u590D",
  "notice.normalizing": "\u6B63\u5728\u89C4\u8303\u5316\u2026",
  "notice.normalizeDone": "\u2713 \u5DF2\u89C4\u8303\u5316 {n} \u6761\u7B14\u8BB0",
  "notice.normalizeFailed": "\u89C4\u8303\u5316\u5931\u8D25\uFF1A{msg}",
  "notice.normalizeConfirm": "\u5C06\u91CD\u5199\u6240\u6709 Memoria \u7B14\u8BB0\u7684 md \u683C\u5F0F\u4EE5\u4FEE\u590D\u6E32\u67D3\u95EE\u9898\u3002\n\u5EFA\u8BAE\u5148\u5907\u4EFD Memoria \u6587\u4EF6\u5939\u3002\n\n\u786E\u5B9A\u7EE7\u7EED\u5417\uFF1F",
  "card.pinnedMark": "\u5DF2\u7F6E\u9876",
  "card.starredMark": "\u5DF2\u6536\u85CF",
  "card.pin": "\u7F6E\u9876",
  "card.unpin": "\u53D6\u6D88\u7F6E\u9876",
  "card.star": "\u6536\u85CF",
  "card.unstar": "\u53D6\u6D88\u6536\u85CF",
  "card.edit": "\u7F16\u8F91",
  "card.delete": "\u5220\u9664",
  "card.quote": "\u5F15\u7528",
  "card.copyLink": "\u590D\u5236\u94FE\u63A5",
  "card.copySource": "\u590D\u5236\u539F\u6587",
  "card.exportImage": "\u4FDD\u5B58\u56FE\u7247",
  "card.openSource": "\u6253\u5F00\u539F\u6587",
  "card.exportMd": "\u5BFC\u51FA\u4E3A Markdown",
  "card.exportHtml": "\u5BFC\u51FA\u4E3A HTML",
  "card.exportJson": "\u5BFC\u51FA\u4E3A JSON",
  "card.exportTooltip": "\u5BFC\u51FA\u5F53\u524D\u7B5B\u9009\u7ED3\u679C",
  "search.placeholder": "\u641C\u7D22\u7B14\u8BB0...",
  "search.noResult": "\u6CA1\u6709\u5339\u914D\u7684\u7B14\u8BB0",
  "empty.default": "\u8FD9\u91CC\u8FD8\u6CA1\u6709\u7B14\u8BB0\u54E6",
  "empty.defaultSub": "\u5728\u9876\u90E8\u8F93\u5165\u6846\u5199\u4E0B\u4F60\u7684\u7B2C\u4E00\u4E2A\u60F3\u6CD5\u5427\uFF5E",
  "empty.onThisDay": "\u5F80\u5E74\u7684\u4ECA\u5929\u8FD8\u6CA1\u6709\u8BB0\u5F55",
  "empty.onThisDaySub": "\u8981\u770B\u770B\u968F\u673A\u7684 5 \u6761\u65E7\u7B14\u8BB0\u5417\uFF1F",
  "empty.onThisDayBtn": " \u968F\u673A 5 \u6761",
  "empty.onThisDayMeta": "\u518D\u62BD\u4E00\u6B21",
  "empty.onThisDayBackToReview": " \u56DE\u5230\u5F80\u5E74\u4ECA\u5929",
  "empty.todo": "\u6CA1\u6709\u672A\u5B8C\u6210\u7684\u5F85\u529E",
  "empty.todoSub": "\u6240\u6709 `- [ ]` \u90FD\u52FE\u4E0A\u4E86\uFF0C\u6216\u8005\u4F60\u8FD8\u6CA1\u5199\u8FC7\u4EFB\u4F55\u5F85\u529E\u3002\u5728\u7B14\u8BB0\u91CC\u5199 `- [ ] \u8981\u505A\u7684\u4E8B` \u5C31\u80FD\u5728\u8FD9\u91CC\u770B\u5230\u3002",
  "meta.reroll": " \u6362\u4E00\u6279",
  "meta.backToOnThisDay": " \u56DE\u5230\u5F80\u5E74\u4ECA\u5929",
  "density.toggle": "\u5207\u6362\u89C6\u56FE\u5BC6\u5EA6",
  "density.cozy": "\u5BBD\u677E",
  "density.compact": "\u7D27\u51D1",
  "stats.memos": "\u7B14\u8BB0",
  "stats.tags": "\u6807\u7B7E",
  "stats.days": "\u5929\u6570",
  "stats.dailyGoal": "\u6BCF\u65E5\u76EE\u6807",
  "toolbar.yearPanorama": "\u5E74\u5EA6\u5168\u666F\u56FE",
  "toolbar.statsReport": "\u6570\u636E\u62A5\u544A",
  "toolbar.toggleSidebar": "\u5207\u6362\u4FA7\u680F",
  "toolbar.toCalendar": "\u5207\u6362\u4E3A\u6708\u5386",
  "toolbar.toHeatmap": "\u5207\u6362\u4E3A\u70ED\u529B\u56FE",
  "toolbar.insertTag": "\u63D2\u5165\u6807\u7B7E #",
  "toolbar.insertImage": "\u63D2\u5165\u56FE\u7247",
  "toolbar.insertUL": "\u63D2\u5165\u65E0\u5E8F\u5217\u8868",
  "toolbar.insertOL": "\u63D2\u5165\u6709\u5E8F\u5217\u8868",
  "toolbar.insertTask": "\u63D2\u5165\u4EFB\u52A1\u5217\u8868",
  "toolbar.insertTable": "\u63D2\u5165\u8868\u683C",
  "toolbar.quote": "\u5F15\u7528",
  "toolbar.more": "\u66F4\u591A\u64CD\u4F5C",
  "settings.title": "Memoria \u8BBE\u7F6E",
  "settings.folder.name": "\u7B14\u8BB0\u6587\u4EF6\u5939",
  "settings.folder.desc": "Memoria \u5728\u6B64\u6587\u4EF6\u5939\u4E0B\u8BFB\u5199 YYYY.md \u6587\u4EF6\uFF08\u76F8\u5BF9 vault \u6839\u76EE\u5F55\uFF09",
  "settings.attachFolder.name": "\u56FE\u7247\u9644\u4EF6\u6587\u4EF6\u5939",
  "settings.attachFolder.desc": "\u7C98\u8D34/\u62D6\u62FD/\u9009\u62E9\u7684\u56FE\u7247\u4F1A\u4FDD\u5B58\u5230\u6B64\u76EE\u5F55\uFF08\u76F8\u5BF9 vault \u6839\u76EE\u5F55\uFF09",
  "settings.sidebarTags.name": "\u5728\u4FA7\u8FB9\u680F\u663E\u793A\u6807\u7B7E\u6811",
  "settings.sidebarTags.desc": "\u9ED8\u8BA4\u5173\u95ED\u3002Obsidian \u53F3\u4FA7\u680F\u5DF2\u6709\u6807\u7B7E\u9762\u677F\uFF0C\u91CD\u590D\u5C55\u793A\u610F\u4E49\u4E0D\u5927\u3002\u5173\u95ED\u540E\u53EF\u5728\u5361\u7247\u5E95\u90E8\u70B9\u51FB\u6807\u7B7E\u80F6\u56CA\u7B5B\u9009\uFF0C\u6216\u5728\u641C\u7D22\u6846\u8F93\u5165\u300C#\u6807\u7B7E\u540D\u300D\u7B5B\u9009\u3002",
  "settings.clearAfterSave.name": "\u53D1\u9001\u540E\u6E05\u7A7A\u8F93\u5165\u6846",
  "settings.pageSize.name": "\u6BCF\u6B21\u52A0\u8F7D\u6761\u6570",
  "settings.pageSize.desc": "\u7011\u5E03\u6D41\u6BCF\u6B21\u5C55\u793A\u591A\u5C11\u6761\uFF0C\u6EDA\u52A8\u5230\u5E95\u81EA\u52A8\u52A0\u8F7D\u66F4\u591A",
  "settings.useTrash.name": "\u5220\u9664\u65F6\u4FDD\u7559\u5230\u56DE\u6536\u7AD9",
  "settings.useTrash.desc": "\u5F00\u542F\u540E\uFF0C\u5220\u9664\u7684\u7B14\u8BB0\u4F1A\u8FFD\u52A0\u5230 <\u7B14\u8BB0\u6587\u4EF6\u5939>/_trash.md\uFF08\u800C\u4E0D\u662F\u5F7B\u5E95\u6D88\u5931\uFF09\uFF0C\u4FBF\u4E8E\u8BEF\u5220\u540E\u624B\u52A8\u6062\u590D\u3002\u5173\u95ED = \u5F7B\u5E95\u5220\u9664\u3002",
  "settings.trashMax.name": "\u56DE\u6536\u7AD9\u6700\u5927\u6761\u6570",
  "settings.trashMax.desc": "_trash.md \u4FDD\u7559\u7684\u6700\u5927\u7B14\u8BB0\u6570\uFF0C\u8D85\u51FA\u540E\u81EA\u52A8\u4E22\u5F03\u6700\u65E7\u7684\u3002\u9632\u6B62\u957F\u671F\u4F7F\u7528\u540E\u56DE\u6536\u7AD9\u6587\u4EF6\u53D8\u5F97\u8FC7\u5927\u5F71\u54CD\u6027\u80FD\u3002",
  "settings.trash.100": "100 \u6761",
  "settings.trash.300": "300 \u6761\uFF08\u63A8\u8350\uFF09",
  "settings.trash.500": "500 \u6761",
  "settings.trash.1000": "1000 \u6761",
  "settings.trash.3000": "3000 \u6761",
  "settings.trash.0": "\u4E0D\u9650\u5236\uFF08\u4E0D\u63A8\u8350\uFF09",
  "settings.exportTheme.name": "\u5BFC\u51FA\u56FE\u7247 \xB7 \u80CC\u666F\u4E3B\u9898",
  "settings.exportTheme.desc": "\u4FDD\u5B58\u5361\u7247\u56FE\u7247\u65F6\u7684\u80CC\u666F\u6837\u5F0F\u30028 \u79CD\u7CBE\u9009\u4E3B\u9898 + \u8DDF\u968F Obsidian \u660E\u6697\u8272 + \u968F\u673A\u3002",
  "settings.exportTheme.auto": "\u{1F3AD} \u8DDF\u968F Obsidian \u660E\u6697",
  "settings.exportTheme.random": "\u{1F3B2} \u6BCF\u6B21\u968F\u673A",
  "settings.exportTheme.paper": "\u{1F4C4} \u7EB8\u5F20\u767D",
  "settings.exportTheme.kraft": "\u{1F7EB} \u725B\u76AE\u7EB8",
  "settings.exportTheme.mint": "\u{1F33F} \u8584\u8377\u7EFF",
  "settings.exportTheme.peach": "\u{1F351} \u871C\u6843\u7C89",
  "settings.exportTheme.sky": "\u2601\uFE0F \u6674\u7A7A\u84DD",
  "settings.exportTheme.lavender": "\u{1F49C} \u85B0\u8863\u8349",
  "settings.exportTheme.midnight": "\u{1F319} \u5348\u591C\u84DD",
  "settings.exportTheme.charcoal": "\u26AB \u6728\u70AD\u9ED1",
  "settings.collapse.name": "\u957F\u7B14\u8BB0\u81EA\u52A8\u6298\u53E0",
  "settings.collapse.desc": "\u8D85\u8FC7\u8BBE\u5B9A\u884C\u6570\u7684\u7B14\u8BB0\u4F1A\u81EA\u52A8\u6298\u53E0\uFF0C\u5E95\u90E8\u663E\u793A\u300C\u7EE7\u7EED\u9605\u8BFB\u300D\u6309\u94AE\u3002\u56FE\u7247\u59CB\u7EC8\u5B8C\u6574\u663E\u793A\uFF0C\u53EA\u6298\u53E0\u6587\u5B57\u90E8\u5206\u3002",
  "settings.collapse.0": "\u6C38\u4E0D\u6298\u53E0",
  "settings.collapse.4": "4 \u884C",
  "settings.collapse.6": "6 \u884C",
  "settings.collapse.8": "8 \u884C\uFF08\u63A8\u8350\uFF09",
  "settings.collapse.12": "12 \u884C",
  "settings.collapse.20": "20 \u884C",
  "settings.dailyGoal.name": "\u6BCF\u65E5\u76EE\u6807\u7B14\u8BB0\u6570",
  "settings.dailyGoal.desc": "\u5DE6\u4FA7\u680F\u70ED\u529B\u56FE\u4E0B\u65B9\u7684\u8FDB\u5EA6\u6761\u6EE1\u503C\u3002\u8BB0\u5F55\u8D8A\u7B80\u5355\u8D8A\u5BB9\u6613\u575A\u6301\uFF0C\u5EFA\u8BAE 3-7 \u6761\u3002",
  "settings.heading.newFeatures": "\u529F\u80FD\u5F00\u5173",
  "settings.density.name": "\u89C6\u56FE\u5BC6\u5EA6",
  "settings.density.desc": "\u7D27\u51D1\u6A21\u5F0F\u6BCF\u5F20\u5361\u53EA\u663E\u793A\u524D\u51E0\u884C\uFF0C\u9002\u5408\u5FEB\u901F\u6D4F\u89C8 1000+ \u6761\u7B14\u8BB0\uFF1B\u5BBD\u677E\u6A21\u5F0F\u662F\u9ED8\u8BA4",
  "settings.density.cozy": "\u5BBD\u677E",
  "settings.density.compact": "\u7D27\u51D1",
  "settings.vim.name": "\u542F\u7528 Vim \u5FEB\u6377\u952E",
  "settings.vim.desc": "j/k \u4E0A\u4E0B\u5207\u6362\u5361\u7247\uFF0CEnter \u7F16\u8F91\uFF0C/ \u641C\u7D22\uFF0Ci \u5199\u65B0\u7B14\u8BB0\uFF0Cgg/G \u8DF3\u9996\u5C3E\uFF0CEsc \u6E05\u9009\u4E2D",
  "settings.mood.name": "\u542F\u7528\u60C5\u611F\u8272\u5F69\u53EF\u89C6\u5316",
  "settings.mood.desc": "\u6839\u636E\u5185\u5BB9\u5173\u952E\u8BCD\uFF0C\u5728\u5361\u7247\u5DE6\u8FB9\u663E\u793A 3px \u8272\u6761\u30027 \u79CD\u7EF4\u5EA6\uFF1A\u5F00\u5FC3(\u91D1)\u3001\u611F\u52A8(\u7C89)\u3001\u9F13\u52B1(\u6A59)\u3001\u4F4E\u843D(\u84DD\u7070)\u3001\u70E6\u8E81(\u7EA2\u8910)\u3001\u5BB3\u6015(\u6697\u7D2B)\u3001\u75B2\u60EB(\u7070\u68D5)\u3002\u57FA\u4E8E\u5173\u952E\u8BCD\u8BCD\u5178\uFF0C\u4F1A\u6709\u8BEF\u5224\u3002",
  "settings.smartReview.name": "\u542F\u7528\u667A\u80FD\u56DE\u987E",
  "settings.smartReview.desc": "\u300C\u968F\u673A 5 \u6761\u300D\u6539\u7528\u52A0\u6743\u7B97\u6CD5\u6311\u9009\uFF1A\u8D8A\u4E45\u6CA1\u7FFB\u8FC7\u7684\u8D8A\u4F18\u5148\u3001\u548C\u4ECA\u5929\u6807\u7B7E/\u60C5\u7EEA\u547C\u5E94\u7684\u52A0\u5206",
  "settings.language.name": "\u8BED\u8A00",
  "settings.language.desc": "auto \u4F1A\u8DDF\u968F Obsidian \u8BED\u8A00\uFF1B\u624B\u52A8\u5207\u6362\u5373\u65F6\u751F\u6548\uFF08\u9700\u91CD\u5F00 Memoria \u89C6\u56FE\uFF09",
  "settings.language.auto": "\u81EA\u52A8\uFF08\u8DDF\u968F Obsidian\uFF09",
  "settings.language.zh": "\u7B80\u4F53\u4E2D\u6587",
  "settings.language.en": "English",
  "settings.heading.about": "\u5173\u4E8E",
  "settings.about.p1": "Memoria \u2014 \u6D6E\u58A8\u5F0F\u788E\u7247\u7B14\u8BB0\u63D2\u4EF6\u3002\u6240\u6709\u7B14\u8BB0\u4EE5\u7EAF Markdown \u683C\u5F0F\u5B58\u50A8\uFF08",
  "settings.about.p2": "\uFF09\uFF0C\u505C\u7528\u63D2\u4EF6\u540E\u4F60\u7684\u7B14\u8BB0\u4F9D\u7136\u5B8C\u6574\u53EF\u8BFB\u3002",
  "settings.repo.name": "GitHub \u4ED3\u5E93",
  "settings.repo.desc": "\u67E5\u770B\u6E90\u7801\u3001\u53CD\u9988\u95EE\u9898\u3001\u63D0\u51FA\u5EFA\u8BAE\uFF0C\u90FD\u5728\u8FD9\u91CC\u89C1",
  "settings.repo.btn": "\u6253\u5F00\u4ED3\u5E93",
  "settings.version": "\u5F53\u524D\u7248\u672C\uFF1Av{ver}",
  "settings.promoteFolder.name": "\u6B63\u5F0F\u7B14\u8BB0\u8F93\u51FA\u76EE\u5F55",
  "settings.promoteFolder.desc": "\u4ECE memo \u8F6C\u4E3A\u72EC\u7ACB Markdown \u7B14\u8BB0\u65F6\u9ED8\u8BA4\u4FDD\u5B58\u5230\u6B64\u76EE\u5F55\uFF08\u76F8\u5BF9 vault \u6839\u76EE\u5F55\uFF09\u3002",
  "common.confirm": "\u786E\u5B9A",
  "common.cancel": "\u53D6\u6D88",
  "common.close": "\u5173\u95ED",
  "common.refresh": "\u5237\u65B0",
  "common.loading": "\u52A0\u8F7D\u4E2D\u2026",
  "toolbar.trash": "\u56DE\u6536\u7AD9",
  "toolbar.tagTools": "\u6807\u7B7E\u6574\u7406",
  "toolbar.openTrashCmd": "\u6253\u5F00 Memoria \u56DE\u6536\u7AD9",
  "toolbar.openTagToolsCmd": "\u6253\u5F00 Memoria \u6807\u7B7E\u6574\u7406",
  "toolbar.quickCaptureCmd": "{submit}\uFF08\u5F39\u7A97\uFF09",
  "toolbar.moreActions": "\u66F4\u591A\u64CD\u4F5C",
  "input.hint": "Ctrl+Enter \xB7 \u62D6\u62FD/\u7C98\u8D34\u56FE\u7247",
  "input.timeChipTitle": "\u5DE6\u952E\u9009\u62E9\u65F6\u95F4 \xB7 \u53F3\u952E\u91CD\u7F6E\u4E3A\u5F53\u524D\u65F6\u95F4",
  "input.tableInsert": "\u70B9\u51FB\u683C\u5B50\u76F4\u63A5\u63D2\u5165",
  "input.tableSize": "0 \xD7 0",
  "card.promote": "\u8F6C\u4E3A\u6B63\u5F0F\u7B14\u8BB0",
  "promote.title": "\u6807\u9898",
  "promote.folder": "\u8F93\u51FA\u76EE\u5F55",
  "promote.hint": "\u4F1A\u521B\u5EFA\u72EC\u7ACB Markdown \u6587\u4EF6\uFF0C\u5E76\u4FDD\u7559\u539F memo \u6765\u6E90\u4FE1\u606F\u3002",
  "promote.create": "\u521B\u5EFA\u5E76\u6253\u5F00",
  "promote.requireTitle": "\u8BF7\u5148\u586B\u5199\u6807\u9898",
  "promote.created": "\u5DF2\u521B\u5EFA\u6B63\u5F0F\u7B14\u8BB0\uFF1A{path}",
  "promote.failed": "\u521B\u5EFA\u5931\u8D25\uFF1A{msg}",
  "list.readMore": " \u7EE7\u7EED\u9605\u8BFB",
  "list.collapse": " \u6536\u8D77",
  "sidebar.saveFilter": "\u4FDD\u5B58\u7B5B\u9009",
  "sidebar.saveCurrentFilter": "\u4FDD\u5B58\u5F53\u524D\u7B5B\u9009",
  "sidebar.deleteFilter": "\u5220\u9664\u7B5B\u9009\u5668",
  "notice.filterDeleted": "\u5DF2\u5220\u9664\u7B5B\u9009\u5668",
  "filter.saveTitle": "\u4FDD\u5B58\u5F53\u524D\u7B5B\u9009",
  "filter.namePlaceholder": "\u7B5B\u9009\u5668\u540D\u79F0",
  "filter.save": "\u4FDD\u5B58",
  "filter.requireName": "\u8BF7\u5148\u586B\u5199\u7B5B\u9009\u5668\u540D\u79F0",
  "notice.filterSaved": "\u7B5B\u9009\u5668\u5DF2\u4FDD\u5B58",
  // 回收站视图
  "trash.viewTitle": "Memoria \u56DE\u6536\u7AD9",
  "trash.openFile": "\u6253\u5F00 _trash.md",
  "trash.clear": "\u6E05\u7A7A\u56DE\u6536\u7AD9",
  "trash.clearConfirm": "\u786E\u5B9A\u6E05\u7A7A\u56DE\u6536\u7AD9\u4E2D\u7684 {n} \u6761\u8BB0\u5F55\u5417\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002",
  "trash.cleared": "\u56DE\u6536\u7AD9\u5DF2\u6E05\u7A7A",
  "trash.clearFailed": "\u6E05\u7A7A\u5931\u8D25\uFF1A{msg}",
  "trash.searchPlaceholder": "\u641C\u7D22\u5DF2\u5220\u9664\u7B14\u8BB0\u3001\u6765\u6E90\u6587\u4EF6\u6216\u65E5\u671F",
  "trash.total": "\u5171 {n} \u6761\u5DF2\u5220\u9664\u8BB0\u5F55",
  "trash.noMatch": "\u6CA1\u6709\u5339\u914D\u7684\u5220\u9664\u8BB0\u5F55",
  "trash.empty": "\u56DE\u6536\u7AD9\u662F\u7A7A\u7684",
  "trash.emptySub": "\u5220\u9664 memo \u540E\uFF0C\u5982\u679C\u542F\u7528\u4E86\u56DE\u6536\u7AD9\uFF0C\u4F1A\u5728\u8FD9\u91CC\u770B\u5230\u5B83\u4EEC\u3002",
  "trash.originalTime": "\u539F\u65F6\u95F4 {date} {time}",
  "trash.deletedAt": "\u5220\u9664\u4E8E {deletedAt} \xB7 {source}",
  "trash.restore": " \u6062\u590D",
  "trash.restored": "\u5DF2\u6062\u590D\u5230\u539F\u65E5\u671F",
  "trash.restoreFailed": "\u6062\u590D\u5931\u8D25\uFF1A{msg}",
  "trash.purge": " \u6C38\u4E45\u5220\u9664",
  "trash.purgeConfirm": "\u786E\u5B9A\u4ECE\u56DE\u6536\u7AD9\u6C38\u4E45\u5220\u9664\u8FD9\u6761\u8BB0\u5F55\u5417\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002",
  "trash.purged": "\u5DF2\u6C38\u4E45\u5220\u9664",
  "trash.deleteFailed": "\u5220\u9664\u5931\u8D25\uFF1A{msg}",
  "trash.loadFailed": "\u56DE\u6536\u7AD9\u8BFB\u53D6\u5931\u8D25\uFF1A{msg}",
  "trash.fileMissing": "\u56DE\u6536\u7AD9\u6587\u4EF6\u8FD8\u4E0D\u5B58\u5728",
  // 标签整理视图
  "tagTools.viewTitle": "Memoria \u6807\u7B7E\u6574\u7406",
  "tagTools.tagCount": "{n} \u4E2A\u6807\u7B7E",
  "tagTools.lowFreqCount": "{n} \u4E2A\u4F4E\u9891\u6807\u7B7E",
  "tagTools.searchPlaceholder": "\u641C\u7D22\u6807\u7B7E",
  "tagTools.total": "\u5171 {n} \u4E2A\u6807\u7B7E",
  "tagTools.noMatch": "\u6CA1\u6709\u5339\u914D\u7684\u6807\u7B7E",
  "tagTools.empty": "\u8FD8\u6CA1\u6709\u53EF\u6574\u7406\u7684\u6807\u7B7E",
  "tagTools.emptySub": "\u7F6E\u9876\u548C\u6536\u85CF\u662F\u4FDD\u7559\u6807\u7B7E\uFF0C\u4E0D\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002",
  "tagTools.memoCount": "{n} \u6761 memo",
  "tagTools.rename": " \u91CD\u547D\u540D/\u5408\u5E76",
  "tagTools.remove": " \u79FB\u9664",
  "tagTools.renameTitle": "\u91CD\u547D\u540D\u6216\u5408\u5E76 #{tag}",
  "tagTools.newName": "\u65B0\u6807\u7B7E\u540D",
  "tagTools.namePlaceholder": "\u4F8B\u5982\uFF1A\u9879\u76EE/\u6BD5\u4E1A\u8BBE\u8BA1",
  "tagTools.renameHint": "\u4F1A\u540C\u65F6\u5904\u7406 #{tag} \u53CA\u5176\u5B50\u6807\u7B7E\uFF0C\u9884\u8BA1\u5F71\u54CD {n} \u6761 memo\u3002\u82E5\u65B0\u6807\u7B7E\u5DF2\u5B58\u5728\uFF0C\u5219\u76F8\u5F53\u4E8E\u5408\u5E76\u6807\u7B7E\u3002",
  "tagTools.execute": "\u6267\u884C",
  "tagTools.renameConfirm": "\u786E\u5B9A\u5C06 #{old} \u91CD\u547D\u540D/\u5408\u5E76\u4E3A #{next} \u5417\uFF1F\u9884\u8BA1\u5F71\u54CD {n} \u6761 memo\u3002",
  "tagTools.renamed": "\u5DF2\u66F4\u65B0 {n} \u6761 memo",
  "tagTools.updateFailed": "\u6807\u7B7E\u66F4\u65B0\u5931\u8D25\uFF1A{msg}",
  "tagTools.removeConfirm": "\u786E\u5B9A\u4ECE {n} \u6761 memo \u4E2D\u79FB\u9664 #{tag} \u53CA\u5176\u5B50\u6807\u7B7E\u5417\uFF1F\u6B64\u64CD\u4F5C\u4F1A\u6539\u5199 Markdown\u3002",
  "tagTools.removed": "\u5DF2\u4ECE {n} \u6761 memo \u4E2D\u79FB\u9664\u6807\u7B7E",
  "tagTools.removeFailed": "\u6807\u7B7E\u79FB\u9664\u5931\u8D25\uFF1A{msg}",
  "tagTools.loadFailed": "\u6807\u7B7E\u6574\u7406\u52A0\u8F7D\u5931\u8D25\uFF1A{msg}",
  // 数据报告视图
  "stats.viewTitle": "Memoria \u6570\u636E\u62A5\u544A",
  "stats.chars": "\u5B57",
  "stats.yearHeatmap": "\u{1F525} \u5168\u5E74\u6D3B\u8DC3\u5EA6",
  "stats.prevYear": "\u4E0A\u4E00\u5E74",
  "stats.nextYear": "\u4E0B\u4E00\u5E74",
  "stats.yearLabel": "{year} \u5E74",
  "stats.monthlyTitle": "\u{1F4C5} \u6708\u5EA6\u5206\u5E03",
  "stats.monthLabel": "{month}\u6708",
  "stats.dayCount": "{date}  {count} \u6761",
  "stats.yearTotal": "{year} \u5E74\u5171 {total} \u6761",
  "stats.low": "\u5C11 ",
  "stats.high": " \u591A",
  "stats.tagCloud": "\u2601\uFE0F \u6807\u7B7E\u4E91",
  "stats.topTags": "\u{1F3F7}\uFE0F \u6700\u5E38\u7528\u6807\u7B7E Top 10",
  "stats.noTags": "\u6682\u65E0\u6807\u7B7E",
  "stats.hourlyTitle": "\u23F0 \u4E00\u5929\u4E2D\u4F60\u4EC0\u4E48\u65F6\u5019\u5199\u5F97\u6700\u591A",
  "stats.hourlySub": "\u57FA\u4E8E {n} \u6761\u5386\u53F2\u7B14\u8BB0\u7D2F\u8BA1",
  "stats.hourTitle": "{hour}:00 \u2014 {count} \u6761",
  "stats.highlights": "\u{1F31F} \u6709\u8DA3\u7684\u53D1\u73B0",
  // 年度全景视图
  "year.viewTitle": "Memoria \u5E74\u5EA6\u5168\u666F",
  "year.prevYear": "\u4E0A\u4E00\u5E74",
  "year.nextYear": "\u4E0B\u4E00\u5E74",
  "year.today": "\u4ECA\u5E74",
  "year.memos": "{n} \u6761\u7B14\u8BB0",
  "year.activeDays": "{n} \u6D3B\u8DC3\u5929",
  // 月历组件（单字星期共用）
  "calendar.prevMonth": "\u4E0A\u4E2A\u6708",
  "calendar.nextMonth": "\u4E0B\u4E2A\u6708",
  "calendar.title": "{year}\u5E74{month}\u6708",
  "calendar.wd.0": "\u65E5",
  "calendar.wd.1": "\u4E00",
  "calendar.wd.2": "\u4E8C",
  "calendar.wd.3": "\u4E09",
  "calendar.wd.4": "\u56DB",
  "calendar.wd.5": "\u4E94",
  "calendar.wd.6": "\u516D",
  // 图片灯箱
  "image.prev": "\u4E0A\u4E00\u5F20",
  "image.next": "\u4E0B\u4E00\u5F20",
  "notice.imageSaved": "\u56FE\u7247\u5DF2\u4FDD\u5B58: {name}",
  "input.dateLabel": "{month}\u6708{day}\u65E5",
  "filter.saveHint": "\u5C06\u4FDD\u5B58\uFF1A{desc}",
  "stats.moreCount": "...\u8FD8\u6709 {n} \u6761",
  "stats.monthBarTitle": "{key}: {count} \u6761",
  "stats.tagCountTitle": "{count} \u6761"
};
var enUS = {
  "sidebar.views": "Views",
  "sidebar.search": "Search",
  "sidebar.tags": "Tags",
  "sidebar.all": "All notes",
  "sidebar.pinned": "Pinned",
  "sidebar.starred": "Starred",
  "sidebar.today": "Today",
  "sidebar.week": "This week",
  "sidebar.todo": "To-do",
  "sidebar.review": "Review",
  "sidebar.noTag": "No tag",
  "sidebar.withImage": "With image",
  "sidebar.withLink": "With link",
  "sidebar.random": "Random",
  "sidebar.section.views": "Views",
  "sidebar.section.search": "Queries",
  "sidebar.section.years": "Years",
  "sidebar.section.tags": "Tags",
  "input.placeholder": "What's on your mind?",
  "input.editPlaceholder": "Editing memo from {date} {time} (Esc to cancel)",
  "input.autoTagPlaceholder": "What's on your mind? (auto-tagged #{tag})",
  "input.submit": "Send",
  "input.cancel": "Cancel",
  "input.editTimeTitle": "Change this memo's date & time",
  "date.today": "Today",
  "date.yesterday": "Yesterday",
  "weekday.0": "Sun",
  "weekday.1": "Mon",
  "weekday.2": "Tue",
  "weekday.3": "Wed",
  "weekday.4": "Thu",
  "weekday.5": "Fri",
  "weekday.6": "Sat",
  "list.totalCount": "{n} memos",
  "list.dailyGoalProgress": "Goal {goal}, done {done}",
  "list.dailyGoalDone": "Goal {goal}, done {done}",
  "list.dailyGoalExceed": "Goal {goal}, done {done} (+{extra} over)",
  "list.pinnedHead": "Pinned  ({n})",
  "list.presetPinned": "\u{1F4CC} Pinned",
  "list.presetStarred": "\u2B50 Starred",
  "list.presetRandom": "\u{1F3B2} Random 5",
  "list.presetOnThisDay": "\u{1F570}\uFE0F On this day (past years)",
  "list.loadMore": "\u2193 Scroll for more ({n} remaining)",
  "notice.saved": "\u2713 Saved",
  "notice.updated": "\u2713 Updated",
  "notice.updatedWithTime": "\u2713 Updated (with time)",
  "notice.deleted": "Deleted",
  "notice.imageFailed": "Image save failed: {msg}",
  "notice.saveFailed": "Save failed: {msg}",
  "notice.invalidTime": "Invalid datetime, please re-select",
  "notice.exportEmpty": "No memos to export in current filter",
  "notice.exportFailed": "Export failed: {msg}",
  "notice.exportDone": "\u2713 Exported {n} memos to {path}",
  "notice.dailyGoalDone": "\u{1F389} Daily goal reached! {n} memos today ~",
  "notice.checkFailed": "Check failed: {msg}",
  "notice.copied": "Copied",
  "notice.quoted": "Quoted, feel free to continue",
  "notice.pinned": "\u2713 Pinned",
  "notice.unpinned": "Unpinned",
  "notice.starred": "\u2713 Starred",
  "notice.unstarred": "Unstarred",
  "notice.confirmDelete": "Delete this memo?",
  "notice.confirmDeleteOk": "Confirm delete",
  "notice.deletedTrash": "Deleted \xB7 restorable in _trash.md",
  "notice.normalizing": "Normalizing\u2026",
  "notice.normalizeDone": "\u2713 Normalized {n} memos",
  "notice.normalizeFailed": "Normalize failed: {msg}",
  "notice.normalizeConfirm": "This will rewrite all Memoria notes to fix rendering issues.\nPlease backup your Memoria folder first.\n\nContinue?",
  "card.pinnedMark": "Pinned",
  "card.starredMark": "Starred",
  "card.pin": "Pin",
  "card.unpin": "Unpin",
  "card.star": "Star",
  "card.unstar": "Unstar",
  "card.edit": "Edit",
  "card.delete": "Delete",
  "card.quote": "Quote",
  "card.copyLink": "Copy link",
  "card.copySource": "Copy source",
  "card.exportImage": "Save as image",
  "card.openSource": "Open source file",
  "card.exportMd": "Export as Markdown",
  "card.exportHtml": "Export as HTML",
  "card.exportJson": "Export as JSON",
  "card.exportTooltip": "Export current filter results",
  "search.placeholder": "Search memos",
  "search.noResult": "No matching memos",
  "empty.default": "No memos yet",
  "empty.defaultSub": "Write your first thought in the top input box ~",
  "empty.onThisDay": "Nothing from past years on this day",
  "empty.onThisDaySub": "How about 5 random old memos?",
  "empty.onThisDayBtn": " Random 5",
  "empty.onThisDayMeta": "Reshuffle",
  "empty.onThisDayBackToReview": " Back to on-this-day",
  "empty.todo": "No open to-dos",
  "empty.todoSub": "All `- [ ]` checked off, or you haven't written any yet. Put `- [ ] something` in a memo to see it here.",
  "meta.reroll": " Shuffle",
  "meta.backToOnThisDay": " Back to on-this-day",
  "density.toggle": "Toggle view density",
  "density.cozy": "Cozy",
  "density.compact": "Compact",
  "stats.memos": "memos",
  "stats.tags": "tags",
  "stats.days": "days",
  "stats.dailyGoal": "Daily goal",
  "toolbar.yearPanorama": "Year panorama",
  "toolbar.statsReport": "Stats report",
  "toolbar.toggleSidebar": "Toggle sidebar",
  "toolbar.toCalendar": "Switch to calendar",
  "toolbar.toHeatmap": "Switch to heatmap",
  "toolbar.insertTag": "Insert tag #",
  "toolbar.insertImage": "Insert image",
  "toolbar.insertUL": "Insert bullet list",
  "toolbar.insertOL": "Insert numbered list",
  "toolbar.insertTask": "Insert task list",
  "toolbar.insertTable": "Insert table",
  "toolbar.quote": "Quote",
  "toolbar.more": "More actions",
  "settings.title": "Memoria Settings",
  "settings.folder.name": "Memo folder",
  "settings.folder.desc": "Memoria reads/writes YYYY.md files under this folder (relative to vault root)",
  "settings.attachFolder.name": "Image attachment folder",
  "settings.attachFolder.desc": "Pasted/dragged/picked images are saved here (relative to vault root)",
  "settings.sidebarTags.name": "Show tag tree in sidebar",
  "settings.sidebarTags.desc": `Default off. Obsidian's right sidebar already has a tag panel, so this is usually redundant. Without it you can still click tag pills on cards to filter, or type "#tag" in the search bar.`,
  "settings.clearAfterSave.name": "Clear input after send",
  "settings.pageSize.name": "Page size",
  "settings.pageSize.desc": "How many memos to render per batch; scroll to bottom auto-loads more",
  "settings.useTrash.name": "Keep deleted in trash",
  "settings.useTrash.desc": "When on, deleted memos are appended to <memo-folder>/_trash.md instead of disappearing. Off = permanent delete.",
  "settings.trashMax.name": "Trash max items",
  "settings.trashMax.desc": "Maximum memos kept in _trash.md; oldest are discarded when exceeded. Prevents the trash file growing too large over time.",
  "settings.trash.100": "100 items",
  "settings.trash.300": "300 items (recommended)",
  "settings.trash.500": "500 items",
  "settings.trash.1000": "1000 items",
  "settings.trash.3000": "3000 items",
  "settings.trash.0": "Unlimited (not recommended)",
  "settings.exportTheme.name": "Card image \xB7 background theme",
  "settings.exportTheme.desc": "Background style when saving a card as image. 8 presets + follow Obsidian light/dark + random.",
  "settings.exportTheme.auto": "\u{1F3AD} Follow Obsidian",
  "settings.exportTheme.random": "\u{1F3B2} Random each time",
  "settings.exportTheme.paper": "\u{1F4C4} Paper white",
  "settings.exportTheme.kraft": "\u{1F7EB} Kraft",
  "settings.exportTheme.mint": "\u{1F33F} Mint",
  "settings.exportTheme.peach": "\u{1F351} Peach",
  "settings.exportTheme.sky": "\u2601\uFE0F Sky blue",
  "settings.exportTheme.lavender": "\u{1F49C} Lavender",
  "settings.exportTheme.midnight": "\u{1F319} Midnight",
  "settings.exportTheme.charcoal": "\u26AB Charcoal",
  "settings.collapse.name": "Auto-collapse long memos",
  "settings.collapse.desc": 'Memos exceeding the line limit are auto-collapsed with a "Continue reading" button. Images are always fully shown; only text is folded.',
  "settings.collapse.0": "Never collapse",
  "settings.collapse.4": "4 lines",
  "settings.collapse.6": "6 lines",
  "settings.collapse.8": "8 lines (recommended)",
  "settings.collapse.12": "12 lines",
  "settings.collapse.20": "20 lines",
  "settings.dailyGoal.name": "Daily goal",
  "settings.dailyGoal.desc": "Full value for the progress bar under the heatmap. Simple records are easier to sustain; 3-7 is recommended.",
  "settings.heading.newFeatures": "Feature toggles",
  "settings.density.name": "View density",
  "settings.density.desc": "Compact shows only first few lines per card; cozy is the default",
  "settings.density.cozy": "Cozy",
  "settings.density.compact": "Compact",
  "settings.vim.name": "Enable Vim keys",
  "settings.vim.desc": "j/k to navigate, Enter to edit, / to search, i to write, gg/G for first/last, Esc to clear",
  "settings.mood.name": "Enable mood coloring",
  "settings.mood.desc": "Show 3px color strip on card left based on keywords. 7 moods: happy (gold), touched (pink), inspired (orange), sad (blue-gray), angry (brick), fear (purple), tired (tan). Keyword-based, expect some miss-matches.",
  "settings.smartReview.name": "Enable smart review",
  "settings.smartReview.desc": '"Random 5" will use weighted picking: older memos get priority, tag/mood echoes with today get boost',
  "settings.language.name": "Language",
  "settings.language.desc": "Auto follows Obsidian's locale; manual switch takes effect after reopening Memoria view",
  "settings.language.auto": "Auto (follow Obsidian)",
  "settings.language.zh": "\u7B80\u4F53\u4E2D\u6587",
  "settings.language.en": "English",
  "settings.heading.about": "About",
  "settings.about.p1": "Memoria \u2014 a floating-memo plugin. All memos are stored as plain Markdown (",
  "settings.about.p2": "), so your notes stay fully readable even if you disable the plugin.",
  "settings.repo.name": "GitHub repository",
  "settings.repo.desc": "Source code, issues and feature requests \u2014 all here",
  "settings.repo.btn": "Open repo",
  "settings.version": "Current version: v{ver}",
  "settings.promoteFolder.name": "Promote output folder",
  "settings.promoteFolder.desc": "Where memos are saved when promoted to standalone Markdown notes (relative to vault root).",
  "common.confirm": "OK",
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.refresh": "Refresh",
  "common.loading": "Loading\u2026",
  "toolbar.trash": "Trash",
  "toolbar.tagTools": "Tag tools",
  "toolbar.openTrashCmd": "Open Memoria trash",
  "toolbar.openTagToolsCmd": "Open Memoria tag tools",
  "toolbar.quickCaptureCmd": "{submit} (popup)",
  "toolbar.moreActions": "More actions",
  "input.hint": "Ctrl+Enter \xB7 drag/paste images",
  "input.timeChipTitle": "Left-click to pick time \xB7 Right-click to reset to now",
  "input.tableInsert": "Click a cell to insert",
  "input.tableSize": "0 \xD7 0",
  "card.promote": "Promote to note",
  "promote.title": "Title",
  "promote.folder": "Output folder",
  "promote.hint": "Creates a standalone Markdown file, keeping the original memo source info.",
  "promote.create": "Create & open",
  "promote.requireTitle": "Please fill in a title first",
  "promote.created": "Note created: {path}",
  "promote.failed": "Creation failed: {msg}",
  "list.readMore": " Read more",
  "list.collapse": " Collapse",
  "sidebar.saveFilter": "Saved filters",
  "sidebar.saveCurrentFilter": "Save current filter",
  "sidebar.deleteFilter": "Delete filter",
  "notice.filterDeleted": "Filter deleted",
  "filter.saveTitle": "Save current filter",
  "filter.namePlaceholder": "Filter name",
  "filter.save": "Save",
  "filter.requireName": "Please enter a filter name",
  "notice.filterSaved": "Filter saved",
  // Trash view
  "trash.viewTitle": "Memoria Trash",
  "trash.openFile": "Open _trash.md",
  "trash.clear": "Clear trash",
  "trash.clearConfirm": "Clear all {n} records in trash? This cannot be undone.",
  "trash.cleared": "Trash cleared",
  "trash.clearFailed": "Clear failed: {msg}",
  "trash.searchPlaceholder": "Search deleted memos, source file or date",
  "trash.total": "{n} deleted records",
  "trash.noMatch": "No matching deleted records",
  "trash.empty": "Trash is empty",
  "trash.emptySub": "Deleted memos will show up here when trash is enabled.",
  "trash.originalTime": "Original time {date} {time}",
  "trash.deletedAt": "Deleted at {deletedAt} \xB7 {source}",
  "trash.restore": " Restore",
  "trash.restored": "Restored to original date",
  "trash.restoreFailed": "Restore failed: {msg}",
  "trash.purge": " Purge",
  "trash.purgeConfirm": "Permanently delete this record from trash? This cannot be undone.",
  "trash.purged": "Purged",
  "trash.deleteFailed": "Delete failed: {msg}",
  "trash.loadFailed": "Failed to read trash: {msg}",
  "trash.fileMissing": "Trash file does not exist yet",
  // Tag tools view
  "tagTools.viewTitle": "Memoria Tag Tools",
  "tagTools.tagCount": "{n} tags",
  "tagTools.lowFreqCount": "{n} low-frequency tags",
  "tagTools.searchPlaceholder": "Search tags",
  "tagTools.total": "{n} tags total",
  "tagTools.noMatch": "No matching tags",
  "tagTools.empty": "No tags to organize yet",
  "tagTools.emptySub": "Pinned and starred are reserved tags and won't appear here.",
  "tagTools.memoCount": "{n} memos",
  "tagTools.rename": " Rename/Merge",
  "tagTools.remove": " Remove",
  "tagTools.renameTitle": "Rename or merge #{tag}",
  "tagTools.newName": "New tag name",
  "tagTools.namePlaceholder": "e.g. project/graduation",
  "tagTools.renameHint": "Processes #{tag} and its subtags, affecting about {n} memos. If the new tag exists, tags are merged.",
  "tagTools.execute": "Apply",
  "tagTools.renameConfirm": "Rename/merge #{old} to #{next}? About {n} memos affected.",
  "tagTools.renamed": "Updated {n} memos",
  "tagTools.updateFailed": "Tag update failed: {msg}",
  "tagTools.removeConfirm": "Remove #{tag} and its subtags from {n} memos? This rewrites Markdown.",
  "tagTools.removed": "Removed tag from {n} memos",
  "tagTools.removeFailed": "Tag removal failed: {msg}",
  "tagTools.loadFailed": "Failed to load tag tools: {msg}",
  // Stats view
  "stats.viewTitle": "Memoria Stats",
  "stats.chars": "chars",
  "stats.yearHeatmap": "\u{1F525} Yearly activity",
  "stats.prevYear": "Previous year",
  "stats.nextYear": "Next year",
  "stats.yearLabel": "{year}",
  "stats.monthlyTitle": "\u{1F4C5} Monthly distribution",
  "stats.monthLabel": "{month}",
  "stats.dayCount": "{date}  {count} memos",
  "stats.yearTotal": "{total} memos in {year}",
  "stats.low": "Low ",
  "stats.high": " High",
  "stats.tagCloud": "\u2601\uFE0F Tag cloud",
  "stats.topTags": "\u{1F3F7}\uFE0F Top 10 tags",
  "stats.noTags": "No tags yet",
  "stats.hourlyTitle": "\u23F0 When do you write the most",
  "stats.hourlySub": "Based on {n} historical memos",
  "stats.hourTitle": "{hour}:00 \u2014 {count} memos",
  "stats.highlights": "\u{1F31F} Fun facts",
  // Year overview view
  "year.viewTitle": "Memoria Year Overview",
  "year.prevYear": "Previous year",
  "year.nextYear": "Next year",
  "year.today": "This year",
  "year.memos": "{n} memos",
  "year.activeDays": "{n} active days",
  // Calendar component (single-char weekdays, shared)
  "calendar.prevMonth": "Previous month",
  "calendar.nextMonth": "Next month",
  "calendar.title": "{year}/{month}",
  "calendar.wd.0": "S",
  "calendar.wd.1": "M",
  "calendar.wd.2": "T",
  "calendar.wd.3": "W",
  "calendar.wd.4": "T",
  "calendar.wd.5": "F",
  "calendar.wd.6": "S",
  // Image lightbox
  "image.prev": "Previous",
  "image.next": "Next",
  "notice.imageSaved": "Image saved: {name}",
  "input.dateLabel": "{month}/{day}",
  "filter.saveHint": "Will save: {desc}",
  "stats.moreCount": "...{n} more",
  "stats.monthBarTitle": "{key}: {count} memos",
  "stats.tagCountTitle": "{count} memos"
};
var currentLang = "zh-CN";
var activeDict = zhCN;
function resolveLang(language) {
  var _a, _b, _c;
  if (language === "zh-CN") return "zh-CN";
  if (language === "en-US") return "en-US";
  try {
    const ml = (_c = (_b = (_a = window.moment) == null ? void 0 : _a.locale) == null ? void 0 : _b.call(_a)) != null ? _c : "";
    if (ml.startsWith("zh")) return "zh-CN";
    if (ml.startsWith("en")) return "en-US";
  } catch (e) {
  }
  try {
    const dl = document.documentElement.lang.toLowerCase();
    if (dl.startsWith("zh")) return "zh-CN";
    if (dl.startsWith("en")) return "en-US";
  } catch (e) {
  }
  return "zh-CN";
}
function setLang(language) {
  currentLang = resolveLang(language);
  activeDict = currentLang === "en-US" ? enUS : zhCN;
}
function t(key, params) {
  let text = activeDict[key];
  if (text === void 0) text = zhCN[key];
  if (text === void 0) return key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text;
}

// src/image.ts
var WIKILINK_IMG_RE = /!\[\[([^\]]+?)(?:\|([^\]]*))?\]\]/g;
var MD_IMG_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;
function isImageExt(ext) {
  return /^(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(ext);
}
function extractImages(app, content, filePath) {
  const images = [];
  let text = content.replace(WIKILINK_IMG_RE, (match, path, alt) => {
    var _a;
    const name = path.trim();
    const ext = ((_a = name.split(".").pop()) != null ? _a : "").toLowerCase();
    if (!isImageExt(ext)) return match;
    const file = app.metadataCache.getFirstLinkpathDest(name, filePath);
    if (!(file instanceof import_obsidian4.TFile)) return match;
    images.push({ vaultPath: file.path, src: app.vault.getResourcePath(file), alt: alt != null ? alt : file.basename });
    return "";
  });
  text = text.replace(MD_IMG_RE, (match, alt, src) => {
    var _a;
    const url = src.trim();
    const ext = (_a = url.split(/[?#]/)[0].split(".").pop()) != null ? _a : "";
    if (!isImageExt(ext) && !url.startsWith("data:image/")) return match;
    let resolvedSrc = url;
    if (!url.startsWith("http") && !url.startsWith("data:")) {
      const file = app.metadataCache.getFirstLinkpathDest(url, filePath);
      if (file instanceof import_obsidian4.TFile) resolvedSrc = app.vault.getResourcePath(file);
    }
    images.push({ src: resolvedSrc, alt: alt || "image" });
    return "";
  });
  text = text.split("\n").map((l) => l.replace(/\s+$/, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text, images };
}
function renderImageGrid(container, images, onClickImage) {
  if (images.length === 0) return;
  const grid = container.createDiv({
    cls: `memoria-img-grid memoria-img-grid-${Math.min(images.length, 9)}`
  });
  images.slice(0, 9).forEach((img, i) => {
    const cell = grid.createDiv({ cls: "memoria-img-cell" });
    cell.createEl("img", {
      cls: "memoria-img",
      attr: { src: img.src, alt: img.alt, loading: "lazy" }
    }).addEventListener("click", (e) => {
      e.stopPropagation();
      onClickImage(i);
    });
    if (i === 8 && images.length > 9) {
      const overlay = cell.createDiv({ cls: "memoria-img-overlay" });
      overlay.setText(`+${images.length - 9}`);
      overlay.addEventListener("click", (e) => {
        e.stopPropagation();
        onClickImage(8);
      });
    }
  });
}
function showLightbox(images, initialIndex) {
  let current = initialIndex;
  const backdrop = document.body.createDiv({ cls: "memoria-lightbox" });
  const stage = backdrop.createDiv({ cls: "memoria-lightbox-stage" });
  const img = stage.createEl("img", { cls: "memoria-lightbox-img" });
  const counter = backdrop.createDiv({ cls: "memoria-lightbox-counter" });
  const closeBtn = backdrop.createEl("button", {
    cls: "memoria-lightbox-close",
    text: "\xD7",
    attr: { "aria-label": t("common.close") }
  });
  const prevBtn = backdrop.createEl("button", {
    cls: "memoria-lightbox-nav memoria-lightbox-prev",
    text: "\u2039",
    attr: { "aria-label": t("image.prev") }
  });
  const nextBtn = backdrop.createEl("button", {
    cls: "memoria-lightbox-nav memoria-lightbox-next",
    text: "\u203A",
    attr: { "aria-label": t("image.next") }
  });
  const update = () => {
    img.src = images[current].src;
    img.alt = images[current].alt;
    counter.setText(`${current + 1} / ${images.length}`);
    prevBtn.style.visibility = current > 0 ? "visible" : "hidden";
    nextBtn.style.visibility = current < images.length - 1 ? "visible" : "hidden";
  };
  update();
  const close = () => {
    backdrop.remove();
    document.removeEventListener("keydown", onKey);
  };
  const prev = () => {
    if (current > 0) {
      current--;
      update();
    }
  };
  const next = () => {
    if (current < images.length - 1) {
      current++;
      update();
    }
  };
  closeBtn.addEventListener("click", close);
  prevBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    prev();
  });
  nextBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    next();
  });
  backdrop.addEventListener("click", (e) => {
    (e.target === backdrop || e.target === stage) && close();
  });
  img.addEventListener("click", (e) => {
    e.stopPropagation();
    next();
  });
  const onKey = (e) => {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") prev();
    else if (e.key === "ArrowRight") next();
  };
  document.addEventListener("keydown", onKey);
}

// src/calendar.ts
var import_obsidian5 = require("obsidian");
var WEEKDAY_KEYS = ["calendar.wd.0", "calendar.wd.1", "calendar.wd.2", "calendar.wd.3", "calendar.wd.4", "calendar.wd.5", "calendar.wd.6"];
function renderCalendar(container, memos, state, initialYear, initialMonth) {
  var _a;
  const today = /* @__PURE__ */ new Date();
  let year = initialYear != null ? initialYear : today.getFullYear();
  let month = initialMonth != null ? initialMonth : today.getMonth();
  const el = container.createDiv({ cls: "memoria-calendar" });
  const dateCounts = /* @__PURE__ */ new Map();
  for (const m of memos) dateCounts.set(m.date, ((_a = dateCounts.get(m.date)) != null ? _a : 0) + 1);
  const render = () => {
    var _a2;
    el.empty();
    const head = el.createDiv({ cls: "memoria-cal-head" });
    const prevBtn = head.createEl("button", { cls: "memoria-cal-nav", attr: { "aria-label": t("calendar.prevMonth") } });
    (0, import_obsidian5.setIcon)(prevBtn, "chevron-left");
    head.createDiv({ cls: "memoria-cal-title", text: t("calendar.title", { year, month: month + 1 }) }).addEventListener("click", () => {
      year = today.getFullYear();
      month = today.getMonth();
      render();
    });
    const nextBtn = head.createEl("button", { cls: "memoria-cal-nav", attr: { "aria-label": t("calendar.nextMonth") } });
    (0, import_obsidian5.setIcon)(nextBtn, "chevron-right");
    prevBtn.addEventListener("click", () => {
      month === 0 ? (month = 11, year--) : month--;
      render();
    });
    nextBtn.addEventListener("click", () => {
      month === 11 ? (month = 0, year++) : month++;
      render();
    });
    const weekHead = el.createDiv({ cls: "memoria-cal-week-head" });
    for (let w = 0; w < WEEKDAY_KEYS.length; w++) weekHead.createDiv({ cls: "memoria-cal-wday", text: t(WEEKDAY_KEYS[w]) });
    const grid = el.createDiv({ cls: "memoria-cal-grid" });
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startOffset = firstDay.getDay();
    for (let i = 0; i < startOffset; i++) grid.createDiv({ cls: "memoria-cal-cell empty" });
    const todayStr = formatCalDate(today);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = formatCalDate(new Date(year, month, d));
      const count = (_a2 = dateCounts.get(dateStr)) != null ? _a2 : 0;
      const cell = grid.createDiv({
        cls: "memoria-cal-cell" + (count > 0 ? " has-memo" : "") + (dateStr === todayStr ? " is-today" : "") + (dateStr === state.activeDate ? " is-active" : ""),
        attr: { title: count > 0 ? t("stats.dayCount", { date: dateStr, count }) : dateStr }
      });
      cell.createDiv({ cls: "memoria-cal-num", text: String(d) });
      if (count > 0) {
        const dot = cell.createDiv({ cls: "memoria-cal-dot" });
        dot.addClass(`level-${count < 2 ? 1 : count < 4 ? 2 : count < 7 ? 3 : 4}`);
      }
      cell.addEventListener("click", () => state.onPickDate(dateStr));
    }
  };
  render();
  return {
    element: el,
    setMonth: (y, m) => {
      year = y;
      month = m;
      render();
    }
  };
}
function formatCalDate(date) {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// src/search.ts
function parseSearch(raw) {
  const tokens = {
    includeTerms: [],
    excludeTerms: [],
    includeTags: [],
    excludeTags: [],
    afterDate: null,
    beforeDate: null,
    raw: raw.trim()
  };
  if (!tokens.raw) return tokens;
  const parts = tokens.raw.split(/\s+/).filter((p) => p.length > 0);
  for (let part of parts) {
    const neg = part.startsWith("-") && part.length > 1;
    const cleaned = neg ? part.slice(1) : part;
    const timeMatch = cleaned.match(/^(after|before|date):(.+)$/i);
    if (timeMatch) {
      const range = parseDateRange(timeMatch[2]);
      if (range) {
        const kind = timeMatch[1].toLowerCase();
        if (kind === "after") {
          tokens.afterDate = latest(tokens.afterDate, range.start);
        } else {
          if (kind === "before") {
          } else {
            tokens.afterDate = latest(tokens.afterDate, range.start);
          }
          tokens.beforeDate = earliest(tokens.beforeDate, range.end);
        }
        continue;
      }
    }
    if (cleaned.startsWith("#") && cleaned.length > 1) {
      const tag = cleaned.slice(1);
      if (neg) tokens.excludeTags.push(tag);
      else tokens.includeTags.push(tag);
      continue;
    }
    if (neg) tokens.excludeTerms.push(cleaned);
    else tokens.includeTerms.push(cleaned);
  }
  return tokens;
}
function parseDateRange(raw) {
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const y = m[1], mo = m[2].padStart(2, "0"), d = m[3].padStart(2, "0");
    return { start: `${y}-${mo}-${d}`, end: `${y}-${mo}-${d}` };
  }
  m = raw.match(/^(\d{4})-(\d{1,2})$/);
  if (m) {
    const y = parseInt(m[1], 10), mo = parseInt(m[2], 10);
    if (mo < 1 || mo > 12) return null;
    const lastDay = new Date(y, mo, 0).getDate();
    return {
      start: `${y}-${mo.toString().padStart(2, "0")}-01`,
      end: `${y}-${mo.toString().padStart(2, "0")}-${lastDay.toString().padStart(2, "0")}`
    };
  }
  m = raw.match(/^(\d{4})$/);
  if (m) return { start: `${m[1]}-01-01`, end: `${m[1]}-12-31` };
  return null;
}
function latest(a, b) {
  if (!a) return b;
  return a > b ? a : b;
}
function earliest(a, b) {
  if (!a) return b;
  return a < b ? a : b;
}
function matchesSearch(content, tags, date, search) {
  if (search.raw === "") return true;
  const lower = content.toLowerCase();
  for (const term of search.includeTerms) {
    if (!lower.includes(term.toLowerCase())) return false;
  }
  for (const term of search.excludeTerms) {
    if (lower.includes(term.toLowerCase())) return false;
  }
  for (const tag of search.includeTags) {
    if (!tags.some((t2) => t2 === tag || t2.startsWith(tag + "/"))) return false;
  }
  for (const tag of search.excludeTags) {
    if (tags.some((t2) => t2 === tag || t2.startsWith(tag + "/"))) return false;
  }
  if (search.afterDate && date < search.afterDate) return false;
  if (search.beforeDate && date > search.beforeDate) return false;
  return true;
}

// src/mood.ts
var moodDict = {
  happy: [
    "\u5F00\u5FC3",
    "\u9AD8\u5174",
    "\u5FEB\u4E50",
    "\u6B23\u559C",
    "\u5174\u594B",
    "\u723D",
    "\u54C8\u54C8",
    "\u563B\u563B",
    "\u6EE1\u8DB3",
    "\u5E78\u798F",
    "\u60CA\u559C",
    "\u68D2",
    "\u592A\u68D2",
    "\u8D5E",
    "\u597D\u73A9",
    "\u6709\u610F\u601D",
    "\u4E50",
    "\u563F\u563F",
    "\u54C7",
    "\u592A\u597D\u4E86",
    "\u771F\u597D",
    "nice",
    "yyds",
    "happy",
    "joy",
    "awesome",
    "great",
    "love",
    "amazing",
    "wonderful",
    "excited",
    "yay",
    "lol",
    "haha"
  ],
  touched: [
    "\u611F\u52A8",
    "\u6E29\u6696",
    "\u6696\u5FC3",
    "\u6CEA\u76EE",
    "\u5FC3\u52A8",
    "\u6CBB\u6108",
    "\u6E29\u99A8",
    "\u611F\u6168",
    "\u6000\u5FF5",
    "\u60F3\u5FF5",
    "\u601D\u5FF5",
    "\u96BE\u5FD8",
    "\u611F\u6FC0",
    "\u611F\u8C22",
    "\u4E0D\u820D",
    "\u7737\u604B",
    "touched",
    "moved",
    "warm",
    "heartwarming",
    "nostalgic",
    "miss",
    "grateful"
  ],
  inspired: [
    "\u52A0\u6CB9",
    "\u51B2",
    "\u51B2\u51B2\u51B2",
    "\u5965\u5229\u7ED9",
    "\u71C3\u8D77\u6765\u4E86",
    "\u6253\u9E21\u8840",
    "\u52A8\u529B",
    "\u575A\u6301",
    "\u52AA\u529B",
    "\u4E0D\u653E\u5F03",
    "\u7A81\u7834",
    "\u81EA\u4FE1",
    "\u52C7\u6562",
    "\u9F13\u52B1",
    "\u9F13\u821E",
    "\u52C7\u6C14",
    "\u76F8\u4FE1\u81EA\u5DF1",
    "\u4F60\u53EF\u4EE5\u7684",
    "\u6211\u53EF\u4EE5",
    "\u62FC\u4E86",
    "\u5E72\u4E86",
    "\u6491\u4F4F",
    "\u632F\u4F5C",
    "\u632F\u594B",
    "\u6602\u626C",
    "\u6597\u5FD7",
    "\u529B\u91CF",
    "\u5E0C\u671B",
    "\u524D\u8FDB",
    "\u5411\u524D",
    "\u6210\u957F",
    "\u7A81\u7834\u81EA\u6211",
    "\u6311\u6218",
    "\u51FA\u53D1",
    "\u542F\u7A0B",
    "\u641E\u8D77",
    "go",
    "inspired",
    "motivated",
    "encourage",
    "encouraged",
    "brave",
    "courage",
    "go for it",
    "you got this",
    "keep going",
    "never give up",
    "let's go",
    "hustle",
    "grit",
    "hope"
  ],
  sad: [
    "\u96BE\u8FC7",
    "\u4F24\u5FC3",
    "\u5931\u843D",
    "\u4F4E\u843D",
    "\u6CAE\u4E27",
    "\u6291\u90C1",
    "\u5B64\u72EC",
    "\u5BC2\u5BDE",
    "\u5FC3\u788E",
    "\u9057\u61BE",
    "\u53EF\u60DC",
    "\u540E\u6094",
    "\u54ED\u4E86",
    "\u54ED\u6CE3",
    "\u6D41\u6CEA",
    "\u6CEA\u6C34",
    "\u773C\u6CEA",
    "emo",
    "\u4E27",
    "\u60B2\u4F24",
    "\u60B2\u75DB",
    "\u54C0\u4F24",
    "\u5FC3\u9178",
    "\u75DB\u82E6",
    "\u96BE\u53D7",
    "\u59D4\u5C48",
    "\u5931\u671B",
    "\u7EDD\u671B",
    "\u5FC3\u75BC",
    "sad",
    "lonely",
    "depressed",
    "down",
    "heartbroken",
    "regret",
    "cry",
    "crying",
    "tears",
    "grief",
    "sorrow",
    "miserable"
  ],
  angry: [
    "\u70E6",
    "\u70E6\u8E81",
    "\u6124\u6012",
    "\u751F\u6C14",
    "\u607C\u706B",
    "\u65E0\u8BED",
    "\u5D29\u6E83",
    "\u8BA8\u538C",
    "\u90C1\u95F7",
    "\u6293\u72C2",
    "\u6C14\u6B7B",
    "\u6C14\u4EBA",
    "\u8349",
    "\u9760",
    "\u5367\u69FD",
    "\u6C14\u70B8",
    "angry",
    "annoyed",
    "frustrated",
    "hate",
    "ugh",
    "wtf",
    "damn",
    "mad"
  ],
  fear: [
    "\u5BB3\u6015",
    "\u6050\u60E7",
    "\u6050\u6016",
    "\u5413\u4EBA",
    "\u5413\u6B7B",
    "\u5413\u5230",
    "\u60CA\u5413",
    "\u60CA\u6050",
    "\u4E0D\u5B89",
    "\u62C5\u5FE7",
    "\u62C5\u5FC3",
    "\u5FD0\u5FD1",
    "\u7126\u8651",
    "\u7D27\u5F20",
    "\u60CA\u614C",
    "\u5FC3\u614C",
    "\u6BDB\u9AA8\u609A\u7136",
    "\u80C6\u602F",
    "\u80C6\u6218\u5FC3\u60CA",
    "\u6050\u614C",
    "\u614C\u4E71",
    "\u60F6\u60F6",
    "afraid",
    "scared",
    "fear",
    "terrifying",
    "horror",
    "anxious",
    "worried",
    "nervous",
    "panic",
    "frightened"
  ],
  tired: [
    "\u7D2F",
    "\u597D\u7D2F",
    "\u592A\u7D2F",
    "\u75B2\u60EB",
    "\u75B2\u5026",
    "\u7CBE\u75B2\u529B\u5C3D",
    "\u7B4B\u75B2\u529B\u5C3D",
    "\u56F0",
    "\u56F0\u4E86",
    "\u60F3\u7761",
    "\u6CA1\u52B2",
    "\u65E0\u529B",
    "\u5026\u6020",
    "\u56F0\u5026",
    "\u72AF\u56F0",
    "\u4E4F\u529B",
    "\u6194\u60B4",
    "\u56F0\u5F97\u4E0D\u884C",
    "tired",
    "exhausted",
    "sleepy",
    "drained",
    "worn out",
    "burnout",
    "burnt out"
  ],
  neutral: []
};
var moodRes = {};
function getMoodRe(type) {
  if (!moodRes[type]) {
    const words = moodDict[type];
    const escaped = words.map(
      (w) => /^[\x00-\x7F]+$/.test(w) ? `\\b${escapeRegex2(w)}\\b` : escapeRegex2(w)
    );
    moodRes[type] = new RegExp(escaped.join("|"), "gi");
  }
  return moodRes[type];
}
function detectMood(content) {
  if (!content) return "neutral";
  const scores = {
    happy: 0,
    touched: 0,
    inspired: 0,
    sad: 0,
    angry: 0,
    fear: 0,
    tired: 0
  };
  for (const type of Object.keys(scores)) {
    if (type === "neutral") continue;
    const re = getMoodRe(type);
    re.lastIndex = 0;
    const matched = content.match(re);
    if (matched) scores[type] = matched.length;
  }
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [top, second] = sorted;
  if (top[1] === 0 || top[1] === second[1]) return "neutral";
  return top[0];
}
function moodClass(mood) {
  return `memoria-mood-${mood}`;
}
function escapeRegex2(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/export.ts
var import_obsidian6 = require("obsidian");
async function exportMemos(app, format, memos, filterDesc, exportFolder) {
  if (memos.length === 0) throw new Error("\u6CA1\u6709\u53EF\u5BFC\u51FA\u7684\u7B14\u8BB0");
  const folder = (0, import_obsidian6.normalizePath)(exportFolder);
  await ensureFolder(app, folder);
  const now = /* @__PURE__ */ new Date();
  const ts = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}`;
  const fileName = `memoria-export-${ts}.${format}`;
  const filePath = `${folder}/${fileName}`;
  let content;
  switch (format) {
    case "md":
      content = buildMdExport(memos, filterDesc);
      break;
    case "html":
      content = buildHtmlExport(memos, filterDesc);
      break;
    case "json":
      content = buildJsonExport(memos, filterDesc);
      break;
    default:
      throw new Error("\u672A\u77E5\u683C\u5F0F");
  }
  await app.vault.create(filePath, content);
  new import_obsidian6.Notice(`\u2713 \u5DF2\u5BFC\u51FA ${memos.length} \u6761\u5230 ${filePath}`);
  return filePath;
}
function pad2(n) {
  return n.toString().padStart(2, "0");
}
function buildJsonExport(memos, filterDesc) {
  const data = memos.map((m) => ({
    date: m.date,
    time: m.time,
    content: m.content,
    tags: m.tags.filter((t2) => t2 !== "\u7F6E\u9876" && t2 !== "\u6536\u85CF"),
    isPinned: m.isPinned,
    isStarred: m.isStarred,
    hasImage: m.hasImage,
    hasLink: m.hasLink,
    file: m.file
  }));
  return JSON.stringify({ exportedAt: (/* @__PURE__ */ new Date()).toISOString(), filter: filterDesc, count: memos.length, memos: data }, null, 2);
}
function buildMdExport(memos, filterDesc) {
  var _a, _b;
  const now = /* @__PURE__ */ new Date();
  const lines = [
    "---",
    `exported_by: Memoria`,
    `exported_at: ${now.toISOString()}`,
    `count: ${memos.length}`,
    `filter: ${JSON.stringify(filterDesc)}`,
    "---",
    "",
    `# Memoria \u5BFC\u51FA \xB7 ${filterDesc}`,
    "",
    `> \u5BFC\u51FA\u4E8E ${now.toLocaleString()}\uFF0C\u5171 ${memos.length} \u6761`,
    ""
  ];
  const byDate = /* @__PURE__ */ new Map();
  for (const m of memos) {
    const arr = (_a = byDate.get(m.date)) != null ? _a : [];
    arr.push(m);
    byDate.set(m.date, arr);
  }
  for (const date of [...byDate.keys()].sort().reverse()) {
    lines.push(`## ${date}`);
    lines.push("");
    const dayMemos = (_b = byDate.get(date)) != null ? _b : [];
    dayMemos.sort((a, b) => b.time.localeCompare(a.time));
    for (const m of dayMemos) {
      lines.push(`- ${m.time}`);
      const indented = m.content.split("\n").map((l) => l === "" ? "" : `  ${l}`).join("\n");
      lines.push(indented);
      lines.push("");
    }
  }
  return lines.join("\n");
}
function buildHtmlExport(memos, filterDesc) {
  var _a, _b;
  const now = /* @__PURE__ */ new Date();
  const safeFilterDesc = escapeHtml(filterDesc);
  const byDate = /* @__PURE__ */ new Map();
  for (const m of memos) {
    const arr = (_a = byDate.get(m.date)) != null ? _a : [];
    arr.push(m);
    byDate.set(m.date, arr);
  }
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let cardsHtml = "";
  for (const date of [...byDate.keys()].sort().reverse()) {
    const dayMemos = (_b = byDate.get(date)) != null ? _b : [];
    dayMemos.sort((a, b) => b.time.localeCompare(a.time));
    const wd = weekdays[(/* @__PURE__ */ new Date(date + "T00:00:00")).getDay()];
    cardsHtml += `<div class="day-group">
      <div class="day-head">${escapeHtml(date)} ${escapeHtml(wd)} \xB7 ${dayMemos.length} memos</div>`;
    for (const m of dayMemos) {
      const tags = m.tags.filter((t2) => t2 !== "\u7F6E\u9876" && t2 !== "\u6536\u85CF");
      const tagsHtml = tags.map((t2) => `<span class="tag">#${escapeHtml(t2)}</span>`).join("");
      const bodyHtml = renderInlineMd(m.content);
      cardsHtml += `<div class="card">
        <div class="card-time">${escapeHtml(m.time)}</div>
        <div class="card-body">${bodyHtml}</div>
        ${tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : ""}
      </div>`;
    }
    cardsHtml += "</div>";
  }
  const tagCount = new Set(memos.flatMap((m) => m.tags.filter((t2) => t2 !== "\u7F6E\u9876" && t2 !== "\u6536\u85CF"))).size;
  const dayCount = new Set(memos.map((m) => m.date)).size;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Memoria Export - ${safeFilterDesc}</title>
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
  <div class="subtitle">${safeFilterDesc}</div>
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
function renderInlineMd(text) {
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, label, href) => `<a href="${safeHref(href)}" rel="noopener noreferrer">${label}</a>`
  );
  html = html.replace(/\n/g, "<br>");
  return html;
}
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function safeHref(href) {
  const decoded = decodeHtmlEntities(href).trim();
  if (!decoded) return "#";
  const hasProtocol = /^[a-z][a-z0-9+.-]*:/i.test(decoded);
  const allowedProtocol = /^(https?:|mailto:|obsidian:)/i.test(decoded);
  if (hasProtocol && !allowedProtocol) return "#";
  return escapeHtml(decoded);
}
function decodeHtmlEntities(s) {
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

// src/view.ts
var _MemoriaView = class _MemoriaView extends import_obsidian7.ItemView {
  constructor(leaf, store, settings, saveSettings) {
    super(leaf);
    this.saveSettings = saveSettings;
    this.filter = {
      tag: null,
      year: null,
      date: null,
      keyword: "",
      preset: "all",
      searchTokens: { includeTerms: [], excludeTerms: [], includeTags: [], excludeTags: [], afterDate: null, beforeDate: null, raw: "" }
    };
    this.unsubscribe = null;
    this.childComponent = new import_obsidian7.Component();
    this.tagsExpanded = false;
    this.tagSuggest = null;
    this.overviewMode = "heatmap";
    this.editingMemo = null;
    this.activeSavedFilterId = null;
    this.timeOverride = null;
    this.timeOverrideBeforeEdit = null;
    this.timeTickHandle = null;
    /**
     * 性能：memo → 派生渲染结果缓存。
     * store 每次 reload 都会生成新的 Memo 对象，WeakMap 自动失效，无一致性问题。
     */
    this.renderCache = /* @__PURE__ */ new WeakMap();
    this.moodCache = /* @__PURE__ */ new WeakMap();
    this.editBannerEl = null;
    this.timeChipEl = null;
    this.store = store;
    this.settings = settings;
    this.pageLimit = this.getInitialPageLimit();
  }
  getInitialPageLimit() {
    return Math.max(10, this.settings.pageSize || 50);
  }
  getViewType() {
    return VIEW_TYPE_MEMORIA;
  }
  getDisplayText() {
    return "Memoria";
  }
  getIcon() {
    return "feather";
  }
  async onOpen() {
    this.contentEl.addClass("memoria-root");
    this.buildLayout();
    this.unsubscribe = this.store.onChange(() => this.renderAll());
    try {
      await this.store.reloadAll();
    } catch (e) {
      console.error("[Memoria] reloadAll failed:", e);
    }
    const draft = this.loadDraft();
    if (draft) this.inputEl.value = draft;
    this.autoResizeInput();
    this.renderAll();
  }
  async onClose() {
    var _a, _b;
    (_a = this.unsubscribe) == null ? void 0 : _a.call(this);
    (_b = this.tagSuggest) == null ? void 0 : _b.destroy();
    this.tagSuggest = null;
    this.stopTimeTick();
    this.childComponent.unload();
  }
  /** 打开（或聚焦已存在）的指定类型视图 leaf */
  openLeaf(type) {
    const existing = this.app.workspace.getLeavesOfType(type);
    if (existing.length) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    void leaf.setViewState({ type, active: true }).then(() => this.app.workspace.revealLeaf(leaf));
  }
  buildLayout() {
    const root = this.contentEl;
    root.empty();
    root.addClass("memoria-container");
    const shell = root.createDiv({ cls: "memoria-shell" });
    this.sidebarEl = shell.createDiv({ cls: "memoria-sidebar" });
    shell.createDiv({ cls: "memoria-sidebar-overlay" }).addEventListener("click", () => this.toggleSidebar(false));
    const main = shell.createDiv({ cls: "memoria-main" });
    const topbar = main.createDiv({ cls: "memoria-topbar" });
    const title = topbar.createDiv({ cls: "memoria-topbar-title" });
    (0, import_obsidian7.setIcon)(title.createSpan({ cls: "memoria-logo" }), "feather");
    title.createSpan({ cls: "memoria-brand", text: "Memoria" });
    const searchWrap = topbar.createDiv({ cls: "memoria-search-wrap" });
    (0, import_obsidian7.setIcon)(searchWrap.createDiv({ cls: "memoria-search-icon" }), "search");
    this.searchEl = searchWrap.createEl("input", {
      cls: "memoria-search",
      attr: { placeholder: t("search.placeholder"), type: "text" }
    });
    this.searchEl.addEventListener("input", () => {
      this.filter.keyword = this.searchEl.value.trim();
      this.filter.searchTokens = parseSearch(this.filter.keyword);
      this.activeSavedFilterId = null;
      this.pageLimit = this.getInitialPageLimit();
      this.renderList();
    });
    const tools = topbar.createDiv({ cls: "memoria-topbar-tools" });
    const refreshBtn = tools.createEl("button", { cls: "memoria-icon-btn", attr: { "aria-label": t("common.refresh") } });
    (0, import_obsidian7.setIcon)(refreshBtn, "refresh-cw");
    refreshBtn.addEventListener("click", () => this.store.reloadAll());
    const statsBtn = tools.createEl("button", { cls: "memoria-icon-btn", attr: { "aria-label": t("toolbar.statsReport") } });
    (0, import_obsidian7.setIcon)(statsBtn, "bar-chart-3");
    statsBtn.addEventListener("click", () => this.openLeaf(VIEW_TYPE_STATS));
    const yearBtn = tools.createEl("button", {
      cls: "memoria-icon-btn",
      attr: { "aria-label": t("toolbar.yearPanorama"), title: t("toolbar.yearPanorama") }
    });
    (0, import_obsidian7.setIcon)(yearBtn, "calendar-days");
    yearBtn.addEventListener("click", () => this.openLeaf(VIEW_TYPE_YEAR));
    const trashBtn = tools.createEl("button", {
      cls: "memoria-icon-btn",
      attr: { "aria-label": t("toolbar.trash"), title: t("toolbar.trash") }
    });
    (0, import_obsidian7.setIcon)(trashBtn, "trash-2");
    trashBtn.addEventListener("click", () => this.openLeaf(VIEW_TYPE_TRASH));
    const tagToolsBtn = tools.createEl("button", {
      cls: "memoria-icon-btn",
      attr: { "aria-label": t("toolbar.tagTools"), title: t("toolbar.tagTools") }
    });
    (0, import_obsidian7.setIcon)(tagToolsBtn, "tags");
    tagToolsBtn.addEventListener("click", () => this.openLeaf(VIEW_TYPE_TAG_TOOLS));
    const densityBtn = tools.createEl("button", {
      cls: "memoria-icon-btn",
      attr: { "aria-label": t("density.toggle"), title: t("density.toggle") }
    });
    (0, import_obsidian7.setIcon)(densityBtn, this.settings.density === "cozy" ? "scan" : "expand");
    densityBtn.addEventListener("click", () => {
      this.settings.density = this.settings.density === "cozy" ? "compact" : "cozy";
      (0, import_obsidian7.setIcon)(densityBtn, this.settings.density === "cozy" ? "scan" : "expand");
      this.listEl.toggleClass("is-compact", this.settings.density === "compact");
      this.saveSettings();
      this.renderList();
    });
    const exportBtn = tools.createEl("button", {
      cls: "memoria-icon-btn",
      attr: { "aria-label": t("card.exportTooltip"), title: t("card.exportTooltip") }
    });
    (0, import_obsidian7.setIcon)(exportBtn, "download");
    exportBtn.addEventListener("click", (e) => this.showExportMenu(e));
    const menuBtn = topbar.createEl("button", {
      cls: "memoria-icon-btn memoria-sidebar-toggle",
      attr: { "aria-label": t("toolbar.toggleSidebar") }
    });
    (0, import_obsidian7.setIcon)(menuBtn, "menu");
    menuBtn.addEventListener("click", () => this.toggleSidebar(!this.contentEl.hasClass("memoria-sidebar-open")));
    this.buildInputCard(main);
    const listCls = "memoria-list" + (this.settings.density === "compact" ? " is-compact" : "");
    this.listEl = main.createDiv({ cls: listCls });
    this.listEl.addEventListener("scroll", () => {
      if (this.listEl.scrollTop + this.listEl.clientHeight >= this.listEl.scrollHeight - 200) {
        const filtered = this.getFilteredMemos();
        if (this.pageLimit < filtered.length) {
          this.pageLimit += this.getInitialPageLimit();
          this.renderList();
        }
      }
    });
  }
  buildInputCard(parent) {
    const card = parent.createDiv({ cls: "memoria-input-card" });
    this.inputEl = card.createEl("textarea", {
      cls: "memoria-input",
      attr: { placeholder: t("input.placeholder") }
    });
    this.tagSuggest = new TagSuggest(this.app, this.inputEl);
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        this.submitMemo();
      } else if (e.key === "Escape" && this.editingMemo) {
        e.preventDefault();
        this.exitEditMode();
      } else if (e.key === "Tab") {
        if (this.handleListIndent(e.shiftKey)) e.preventDefault();
      } else if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        if (this.handleListContinuation()) e.preventDefault();
      }
    });
    this.inputEl.addEventListener("input", () => {
      if (!this.editingMemo) this.saveDraft(this.inputEl.value);
      this.autoResizeInput();
    });
    this.inputEl.addEventListener("paste", async (e) => {
      var _a, _b;
      const html = (_a = e.clipboardData) == null ? void 0 : _a.getData("text/html");
      if (html) {
        const md = htmlToMarkdown(html);
        if (md) {
          e.preventDefault();
          this.insertAtCursor(md);
          return;
        }
      }
      const items = (_b = e.clipboardData) == null ? void 0 : _b.items;
      if (items) {
        for (const item of Array.from(items)) {
          if (item.kind === "file" && item.type.startsWith("image/")) {
            e.preventDefault();
            const file = item.getAsFile();
            if (file) await this.handleImageFile(file);
            return;
          }
        }
      }
    });
    this.inputEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      this.inputEl.addClass("dragging");
    });
    this.inputEl.addEventListener("dragleave", () => this.inputEl.removeClass("dragging"));
    this.inputEl.addEventListener("drop", async (e) => {
      var _a, _b;
      e.preventDefault();
      this.inputEl.removeClass("dragging");
      for (const file of Array.from((_b = (_a = e.dataTransfer) == null ? void 0 : _a.files) != null ? _b : [])) {
        if (file.type.startsWith("image/")) await this.handleImageFile(file);
      }
    });
    const toolbar = card.createDiv({ cls: "memoria-input-toolbar" });
    const tools = toolbar.createDiv({ cls: "memoria-input-tools" });
    const tagBtn = tools.createEl("button", { cls: "memoria-tool-btn", attr: { "aria-label": t("toolbar.insertTag") } });
    (0, import_obsidian7.setIcon)(tagBtn, "hash");
    tagBtn.addEventListener("click", () => this.insertAtCursor("#"));
    const imgBtn = tools.createEl("button", { cls: "memoria-tool-btn", attr: { "aria-label": t("toolbar.insertImage") } });
    (0, import_obsidian7.setIcon)(imgBtn, "image");
    imgBtn.addEventListener("click", () => this.pickImageFromDisk());
    const listBtn = tools.createEl("button", { cls: "memoria-tool-btn", attr: { "aria-label": t("toolbar.insertUL") } });
    (0, import_obsidian7.setIcon)(listBtn, "list");
    listBtn.addEventListener("click", () => this.insertListAtCursor("- "));
    const orderedBtn = tools.createEl("button", { cls: "memoria-tool-btn", attr: { "aria-label": t("toolbar.insertOL") } });
    (0, import_obsidian7.setIcon)(orderedBtn, "list-ordered");
    orderedBtn.addEventListener("click", () => this.insertOrderedListAtCursor());
    const taskBtn = tools.createEl("button", { cls: "memoria-tool-btn", attr: { "aria-label": t("toolbar.insertTask") } });
    (0, import_obsidian7.setIcon)(taskBtn, "square-check");
    taskBtn.addEventListener("click", () => this.insertListAtCursor("- [ ] "));
    const tableBtn = tools.createEl("button", { cls: "memoria-tool-btn", attr: { "aria-label": t("toolbar.insertTable") } });
    (0, import_obsidian7.setIcon)(tableBtn, "table");
    tableBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showTablePicker(tableBtn);
    });
    tools.createSpan({ cls: "memoria-input-hint", text: t("input.hint") });
    const submitWrap = toolbar.createDiv({ cls: "memoria-submit-wrap" });
    const cancelBtn = submitWrap.createEl("button", { cls: "memoria-cancel-btn memoria-hidden", text: t("common.cancel") });
    cancelBtn.addEventListener("click", () => this.exitEditMode());
    this.editBannerEl = cancelBtn;
    this.timeChipEl = submitWrap.createDiv({
      cls: "memoria-time-chip",
      attr: { title: t("input.timeChipTitle") }
    });
    this.timeChipEl.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openTimePicker();
    });
    this.timeChipEl.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.timeOverride = null;
      this.refreshTimeChip();
    });
    this.refreshTimeChip();
    this.timeTickHandle = window.setInterval(() => {
      if (this.timeOverride === null) this.refreshTimeChip();
    }, 3e4);
    const sendBtn = submitWrap.createEl("button", { cls: "memoria-submit-btn", text: t("input.submit") });
    sendBtn.addEventListener("click", () => this.submitMemo());
  }
  getEffectiveDate() {
    var _a, _b, _c, _d, _e;
    const now = /* @__PURE__ */ new Date();
    const baseDateText = (_b = (_a = this.editingMemo) == null ? void 0 : _a.date) != null ? _b : this.filter.date;
    const baseDate = baseDateText ? /* @__PURE__ */ new Date(baseDateText + "T00:00:00") : now;
    if (this.timeOverride === null && !baseDateText) return now;
    const fallbackTime = (_d = (_c = this.editingMemo) == null ? void 0 : _c.time) != null ? _d : `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    const [h, m] = ((_e = this.timeOverride) != null ? _e : fallbackTime).split(":").map((n) => parseInt(n, 10));
    const d = new Date(baseDate);
    d.setHours(h, m, 0, 0);
    return d;
  }
  refreshTimeChip() {
    if (!this.timeChipEl) return;
    const d = this.getEffectiveDate();
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    const isDateOverridden = this.editingMemo !== null || this.filter.date !== null;
    if (isDateOverridden) {
      const mmdd = t("input.dateLabel", { month: d.getMonth() + 1, day: d.getDate() });
      this.timeChipEl.setText(`${mmdd} ${hh}:${mm}`);
    } else {
      this.timeChipEl.setText(`${hh}:${mm}`);
    }
    this.timeChipEl.toggleClass("is-overridden", this.timeOverride !== null || isDateOverridden);
  }
  stopTimeTick() {
    if (this.timeTickHandle !== null) {
      window.clearInterval(this.timeTickHandle);
      this.timeTickHandle = null;
    }
  }
  openTimePicker() {
    const existing = document.querySelector(".memoria-time-picker");
    if (existing) {
      existing.remove();
      return;
    }
    const now = /* @__PURE__ */ new Date();
    let h;
    let m;
    if (this.timeOverride !== null) {
      const [oh, om] = this.timeOverride.split(":").map((n) => parseInt(n, 10));
      h = oh;
      m = om;
    } else if (this.editingMemo) {
      const [oh, om] = this.editingMemo.time.split(":").map((n) => parseInt(n, 10));
      h = oh;
      m = om;
    } else {
      h = now.getHours();
      m = now.getMinutes();
    }
    const picker = document.body.createDiv({ cls: "memoria-time-picker" });
    const label = picker.createDiv({ cls: "memoria-time-picker-label" });
    const cols = picker.createDiv({ cls: "memoria-time-picker-cols" });
    const hourCol = cols.createDiv({ cls: "memoria-time-picker-col memoria-time-picker-hours" });
    const minuteCol = cols.createDiv({ cls: "memoria-time-picker-col memoria-time-picker-minutes" });
    const hourCells = [];
    const minuteCells = [];
    const updateLabel = () => {
      label.setText(`${h.toString().padStart(2, "0")} : ${m.toString().padStart(2, "0")}`);
    };
    const commit = () => {
      this.timeOverride = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
      this.refreshTimeChip();
    };
    for (let i = 0; i < 24; i++) {
      const cell = hourCol.createDiv({
        cls: "memoria-time-picker-cell" + (i === h ? " is-active" : ""),
        text: i.toString().padStart(2, "0")
      });
      cell.addEventListener("click", () => {
        h = i;
        hourCells.forEach((c, j) => c.toggleClass("is-active", j === i));
        updateLabel();
        commit();
      });
      hourCells.push(cell);
    }
    for (let i = 0; i < 60; i++) {
      const cell = minuteCol.createDiv({
        cls: "memoria-time-picker-cell" + (i === m ? " is-active" : ""),
        text: i.toString().padStart(2, "0")
      });
      cell.addEventListener("click", () => {
        m = i;
        minuteCells.forEach((c, j) => c.toggleClass("is-active", j === i));
        updateLabel();
        commit();
      });
      minuteCells.push(cell);
    }
    updateLabel();
    const anchor = this.timeChipEl;
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      picker.style.left = `${Math.round(rect.left)}px`;
      picker.style.top = `${Math.round(rect.top - 8)}px`;
      picker.style.transform = "translateY(-100%)";
    }
    requestAnimationFrame(() => {
      var _a, _b;
      (_a = hourCells[h]) == null ? void 0 : _a.scrollIntoView({ block: "center" });
      (_b = minuteCells[m]) == null ? void 0 : _b.scrollIntoView({ block: "center" });
    });
    setTimeout(() => {
      const onOutside = (e) => {
        if (!picker.contains(e.target) && e.target !== anchor && !(anchor == null ? void 0 : anchor.contains(e.target))) {
          picker.remove();
          document.removeEventListener("mousedown", onOutside, true);
        }
      };
      document.addEventListener("mousedown", onOutside, true);
    }, 0);
  }
  insertAtCursor(text) {
    var _a, _b;
    const el = this.inputEl;
    const start = (_a = el.selectionStart) != null ? _a : el.value.length;
    const end = (_b = el.selectionEnd) != null ? _b : el.value.length;
    el.value = el.value.slice(0, start) + text + el.value.slice(end);
    const pos = start + text.length;
    el.setSelectionRange(pos, pos);
    el.focus();
    if (!this.editingMemo) this.saveDraft(el.value);
    this.autoResizeInput();
  }
  insertListAtCursor(prefix) {
    var _a;
    const el = this.inputEl;
    const pos = (_a = el.selectionStart) != null ? _a : el.value.length;
    const before = el.value.slice(0, pos);
    const atLineStart = pos === 0 || before.endsWith("\n");
    this.insertAtCursor(atLineStart ? prefix : `
${prefix}`);
  }
  insertOrderedListAtCursor() {
    var _a;
    const el = this.inputEl;
    const pos = (_a = el.selectionStart) != null ? _a : el.value.length;
    const before = el.value.slice(0, pos);
    const atLineStart = pos === 0 || before.endsWith("\n");
    const lines = (atLineStart ? before.replace(/\n$/, "") : before).split("\n");
    const orderedRe = /^(\d+)\.\s/;
    let nextNum = 1;
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (line.trim() === "") break;
      const m = line.match(orderedRe);
      if (m) {
        nextNum = parseInt(m[1], 10) + 1;
        break;
      }
      break;
    }
    const prefix = `${nextNum}. `;
    this.insertAtCursor(atLineStart ? prefix : `
${prefix}`);
  }
  handleListIndent(unindent) {
    var _a;
    const el = this.inputEl;
    const pos = (_a = el.selectionStart) != null ? _a : 0;
    const val = el.value;
    const lineStart = val.lastIndexOf("\n", pos - 1) + 1;
    let lineEnd = val.indexOf("\n", pos);
    if (lineEnd === -1) lineEnd = val.length;
    const line = val.slice(lineStart, lineEnd);
    if (!/^(\s*)(?:[-*]\s+\[[ xX]\]\s|[-*]\s|\d+\.\s)/.test(line)) return false;
    let newLine;
    let cursorDelta;
    if (unindent) {
      if (line.startsWith("  ")) {
        newLine = line.slice(2);
        cursorDelta = -2;
      } else if (line.startsWith(" ")) {
        newLine = line.slice(1);
        cursorDelta = -1;
      } else return true;
    } else {
      newLine = "  " + line;
      cursorDelta = 2;
    }
    el.value = val.slice(0, lineStart) + newLine + val.slice(lineEnd);
    const newPos = Math.max(lineStart, pos + cursorDelta);
    el.setSelectionRange(newPos, newPos);
    if (!this.editingMemo) this.saveDraft(el.value);
    this.autoResizeInput();
    return true;
  }
  handleListContinuation() {
    var _a;
    const el = this.inputEl;
    const pos = (_a = el.selectionStart) != null ? _a : 0;
    if (el.selectionStart !== el.selectionEnd) return false;
    const val = el.value;
    const lineStart = val.lastIndexOf("\n", pos - 1) + 1;
    let lineEnd = val.indexOf("\n", pos);
    if (lineEnd === -1) lineEnd = val.length;
    const line = val.slice(lineStart, lineEnd);
    if (pos !== lineEnd) return false;
    const taskRe = /^(\s*)([-*]\s+)\[[ xX]\](\s+)(.*)$/;
    const bulletRe = /^(\s*)([-*]\s+)(.*)$/;
    const orderedRe = /^(\s*)(\d+)(\.\s+)(.*)$/;
    const taskMatch = line.match(taskRe);
    if (taskMatch) {
      const [, indent, marker, sp, content] = taskMatch;
      if (content === "") this.replaceLineAndInsertNewline(lineStart, lineEnd);
      else this.insertAtCursor(`
${indent}${marker}[ ]${sp}`);
      return true;
    }
    const orderedMatch = line.match(orderedRe);
    if (orderedMatch) {
      const [, indent, num, sp, content] = orderedMatch;
      if (content === "") this.replaceLineAndInsertNewline(lineStart, lineEnd);
      else {
        const nextNum = parseInt(num, 10) + 1;
        this.insertAtCursor(`
${indent}${nextNum}${sp}`);
      }
      return true;
    }
    const bulletMatch = line.match(bulletRe);
    if (bulletMatch) {
      const [, indent, marker, content] = bulletMatch;
      if (content === "") this.replaceLineAndInsertNewline(lineStart, lineEnd);
      else this.insertAtCursor(`
${indent}${marker}`);
      return true;
    }
    return false;
  }
  replaceLineAndInsertNewline(lineStart, lineEnd) {
    const el = this.inputEl;
    const val = el.value;
    el.value = val.slice(0, lineStart) + "\n" + val.slice(lineEnd);
    const newPos = lineStart + 1;
    el.setSelectionRange(newPos, newPos);
    if (!this.editingMemo) this.saveDraft(el.value);
    this.autoResizeInput();
  }
  autoResizeInput() {
    const el = this.inputEl;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }
  draftKey() {
    try {
      return `${_MemoriaView.DRAFT_KEY_PREFIX}:${this.app.vault.getName()}`;
    } catch (e) {
      return _MemoriaView.DRAFT_KEY_PREFIX;
    }
  }
  saveDraft(text) {
    try {
      const key = this.draftKey();
      if (text.trim() === "") window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, text);
    } catch (e) {
    }
  }
  loadDraft() {
    var _a;
    try {
      return (_a = window.localStorage.getItem(this.draftKey())) != null ? _a : "";
    } catch (e) {
      return "";
    }
  }
  clearDraft() {
    try {
      window.localStorage.removeItem(this.draftKey());
    } catch (e) {
    }
  }
  showTablePicker(anchor) {
    const existing = document.querySelector(".memoria-table-picker");
    if (existing) {
      existing.remove();
      return;
    }
    const isMobile = import_obsidian7.Platform.isMobile;
    const size = isMobile ? 5 : 6;
    const picker = document.body.createDiv({ cls: "memoria-table-picker" + (isMobile ? " is-mobile" : "") });
    const label = picker.createDiv({
      cls: "memoria-table-picker-label",
      text: isMobile ? t("input.tableInsert") : t("input.tableSize")
    });
    const grid = picker.createDiv({ cls: "memoria-table-picker-grid" });
    const cells = [];
    for (let r = 0; r < size; r++) {
      cells[r] = [];
      for (let c = 0; c < size; c++) {
        const cell = grid.createDiv({ cls: "memoria-table-picker-cell" });
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);
        if (isMobile) cell.createSpan({ cls: "memoria-table-picker-cell-text", text: `${r + 1}\xD7${c + 1}` });
        cells[r][c] = cell;
      }
    }
    let hoverRow = 0, hoverCol = 0;
    const highlight = (r, c) => {
      hoverRow = r;
      hoverCol = c;
      for (let i = 0; i < size; i++)
        for (let j = 0; j < size; j++)
          cells[i][j].toggleClass("is-active", i <= r && j <= c);
      label.setText(`${r + 1} \xD7 ${c + 1}`);
    };
    grid.addEventListener("mouseover", (e) => {
      var _a, _b;
      const target = e.target;
      if (!target.hasClass("memoria-table-picker-cell")) return;
      highlight(parseInt((_a = target.dataset.row) != null ? _a : "0"), parseInt((_b = target.dataset.col) != null ? _b : "0"));
    });
    grid.addEventListener("click", (e) => {
      if (e.target.hasClass("memoria-table-picker-cell")) {
        this.insertTable(hoverRow + 1, hoverCol + 1);
        picker.remove();
      }
    });
    const rect = anchor.getBoundingClientRect();
    picker.style.left = `${Math.round(rect.left)}px`;
    picker.style.top = `${Math.round(rect.bottom + 6)}px`;
    setTimeout(() => {
      const onOutside = (e) => {
        if (!picker.contains(e.target) && e.target !== anchor) {
          picker.remove();
          document.removeEventListener("mousedown", onOutside, true);
        }
      };
      document.addEventListener("mousedown", onOutside, true);
    }, 0);
  }
  insertTable(rows, cols) {
    var _a;
    const header = "| " + Array(cols).fill("  ").join(" | ") + " |";
    const sep = "| " + Array(cols).fill("--").join(" | ") + " |";
    const dataRows = Array(Math.max(0, rows - 1)).fill(null).map(() => "| " + Array(cols).fill("  ").join(" | ") + " |");
    const tableLines = [header, sep, ...dataRows];
    const el = this.inputEl;
    const val = el.value;
    const pos = (_a = el.selectionStart) != null ? _a : val.length;
    const before = val.slice(0, pos);
    let prefix = "";
    let suffix = "";
    if (before.length > 0 && !before.endsWith("\n\n")) prefix = before.endsWith("\n") ? "\n" : "\n\n";
    const after = val.slice(pos);
    if (after && !after.startsWith("\n")) suffix = "\n\n";
    this.insertAtCursor(prefix + tableLines.join("\n") + suffix);
  }
  pickImageFromDisk() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.addEventListener("change", async () => {
      var _a;
      for (const file of Array.from((_a = input.files) != null ? _a : [])) await this.handleImageFile(file);
    });
    input.click();
  }
  async handleImageFile(file) {
    var _a;
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const data = await file.arrayBuffer();
      const savedPath = await this.store.saveImageAttachment(data, ext);
      const name = (_a = savedPath.split("/").pop()) != null ? _a : savedPath;
      const link = `![[${name}]]`;
      const val = this.inputEl.value;
      if (val && !/\n$/.test(val)) this.insertAtCursor("\n" + link + "\n");
      else this.insertAtCursor(link + "\n");
      new import_obsidian7.Notice(t("notice.imageSaved", { name }));
    } catch (e) {
      console.error(e);
      new import_obsidian7.Notice(t("notice.imageFailed", { msg: e instanceof Error ? e.message : String(e) }));
    }
  }
  async submitMemo() {
    const text = this.inputEl.value.trim();
    if (!text) return;
    try {
      if (this.editingMemo) {
        const effectiveDate = this.getEffectiveDate();
        if (toDateStr(effectiveDate) === this.editingMemo.date && toTimeStr(effectiveDate) === this.editingMemo.time) {
          await this.store.editMemo(this.editingMemo, text);
          new import_obsidian7.Notice(t("notice.updated"));
        } else {
          await this.store.editMemoDateTime(this.editingMemo, effectiveDate, text);
          new import_obsidian7.Notice(t("notice.updatedWithTime"));
        }
        this.exitEditMode();
      } else {
        let finalText = text;
        if (this.filter.tag && !this.editingMemo) {
          const ft = this.filter.tag;
          const autoRe = new RegExp(`#${escapeRegex3(ft)}(?:/|$)`);
          if (!autoRe.test(finalText)) {
            finalText = finalText.replace(/\s+$/, "") + `
#${ft}`;
          }
        }
        await this.store.addMemo(finalText, this.getEffectiveDate());
        new import_obsidian7.Notice(t("notice.saved"));
        if (this.settings.clearAfterSave) {
          this.inputEl.value = "";
          this.clearDraft();
        }
      }
      this.autoResizeInput();
    } catch (e) {
      console.error(e);
      new import_obsidian7.Notice(t("notice.saveFailed", { msg: e instanceof Error ? e.message : String(e) }));
    }
  }
  toggleSidebar(open) {
    this.contentEl.toggleClass("memoria-sidebar-open", open);
  }
  enterEditMode(memo) {
    if (this.inputEl.value.trim() && !this.editingMemo) this.saveDraft(this.inputEl.value);
    if (!this.editingMemo) this.timeOverrideBeforeEdit = this.timeOverride;
    this.editingMemo = memo;
    this.timeOverride = memo.time;
    this.inputEl.value = memo.content;
    this.inputEl.focus();
    this.inputEl.setSelectionRange(this.inputEl.value.length, this.inputEl.value.length);
    this.updateEditBanner();
    this.autoResizeInput();
  }
  exitEditMode() {
    this.editingMemo = null;
    this.timeOverride = this.timeOverrideBeforeEdit;
    this.timeOverrideBeforeEdit = null;
    this.inputEl.value = this.loadDraft();
    this.updateEditBanner();
    this.autoResizeInput();
  }
  updateEditBanner() {
    var _a, _b;
    if (!this.editBannerEl) return;
    const card = this.inputEl.closest(".memoria-input-card");
    if (this.editingMemo) {
      this.editBannerEl.removeClass("memoria-hidden");
      card == null ? void 0 : card.addClass("is-editing");
      this.inputEl.setAttr("placeholder", t("input.editPlaceholder", { date: this.editingMemo.date, time: this.editingMemo.time }));
      (_a = this.timeChipEl) == null ? void 0 : _a.removeClass("memoria-hidden");
      this.refreshTimeChip();
    } else {
      this.editBannerEl.addClass("memoria-hidden");
      card == null ? void 0 : card.removeClass("is-editing");
      this.inputEl.setAttr("placeholder", t("input.placeholder"));
      (_b = this.timeChipEl) == null ? void 0 : _b.removeClass("memoria-hidden");
      this.refreshTimeChip();
    }
  }
  renderAll() {
    this.renderSidebar();
    this.renderList();
  }
  renderSidebar() {
    var _a, _b;
    this.sidebarEl.empty();
    const all = this.store.getAll();
    const uniqueTags = /* @__PURE__ */ new Set();
    const uniqueDates = /* @__PURE__ */ new Set();
    let imgCount = 0, linkCount = 0, pinnedCount = 0, starredCount = 0, noTagCount = 0, onThisDayCount = 0, openTaskCount = 0;
    const todayStr = toDateStr(/* @__PURE__ */ new Date());
    const todayMMDD = todayStr.slice(5);
    for (const m of all) {
      for (const t2 of m.tags) if (!RESERVED_TAGS.has(t2)) uniqueTags.add(t2);
      uniqueDates.add(m.date);
      if (m.hasImage) imgCount++;
      if (m.hasLink) linkCount++;
      if (m.isPinned) pinnedCount++;
      if (m.isStarred) starredCount++;
      if (m.date.slice(5) === todayMMDD && m.date !== todayStr) onThisDayCount++;
      if (m.tags.filter((t2) => !RESERVED_TAGS.has(t2)).length === 0) noTagCount++;
      if (m.hasOpenTask) openTaskCount++;
    }
    const statsEl = this.sidebarEl.createDiv({ cls: "memoria-stats" });
    this.renderStatItem(statsEl, all.length.toString(), t("stats.memos"));
    this.renderStatItem(statsEl, uniqueTags.size.toString(), t("stats.tags"));
    this.renderStatItem(statsEl, uniqueDates.size.toString(), t("stats.days"));
    this.renderOverview(this.sidebarEl, all);
    if (this.settings.dailyGoal > 0) {
      const todayMemos = all.filter((m) => m.date === todayStr);
      const done = todayMemos.length;
      const goal = this.settings.dailyGoal;
      const pct = Math.min(100, Math.round(done / goal * 100));
      const isDone = done >= goal && goal > 0;
      const row = this.sidebarEl.createDiv({ cls: "memoria-daily-goal-row" + (isDone ? " is-done" : "") });
      const wrap = row.createDiv({ cls: "memoria-daily-goal" });
      wrap.addEventListener("click", () => {
        this.filter.preset = "today";
        this.filter.tag = null;
        this.filter.year = null;
        this.filter.date = null;
        this.pageLimit = this.getInitialPageLimit();
        this.renderAll();
      });
      wrap.setAttr("title", t("list.dailyGoalProgress", { goal, done }));
      const bar = wrap.createDiv({ cls: "memoria-daily-goal-bar" });
      bar.createDiv({ cls: "memoria-daily-goal-fill", attr: { style: `width:${pct}%` } });
      const actions = row.createDiv({ cls: "memoria-daily-goal-actions" });
      const switchBtn = actions.createEl("button", {
        cls: "memoria-icon-btn memoria-daily-goal-switch",
        attr: { "aria-label": this.overviewMode === "heatmap" ? t("toolbar.toCalendar") : t("toolbar.toHeatmap") }
      });
      (0, import_obsidian7.setIcon)(switchBtn, this.overviewMode === "heatmap" ? "calendar" : "activity");
      switchBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.overviewMode = this.overviewMode === "heatmap" ? "calendar" : "heatmap";
        this.renderSidebar();
      });
    } else {
      const row = this.sidebarEl.createDiv({ cls: "memoria-daily-goal-row" });
      const actions = row.createDiv({ cls: "memoria-daily-goal-actions" });
      const switchBtn = actions.createEl("button", {
        cls: "memoria-icon-btn memoria-daily-goal-switch",
        attr: { "aria-label": this.overviewMode === "heatmap" ? t("toolbar.toCalendar") : t("toolbar.toHeatmap") }
      });
      (0, import_obsidian7.setIcon)(switchBtn, this.overviewMode === "heatmap" ? "calendar" : "activity");
      switchBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.overviewMode = this.overviewMode === "heatmap" ? "calendar" : "heatmap";
        this.renderSidebar();
      });
    }
    this.sidebarEl.createDiv({ cls: "memoria-sidebar-section", text: t("sidebar.section.views") });
    const navItems = [
      { key: "all", icon: "layout-grid", text: t("sidebar.all"), count: all.length },
      { key: "pinned", icon: "pin", text: t("sidebar.pinned"), count: pinnedCount },
      { key: "starred", icon: "star", text: t("sidebar.starred"), count: starredCount },
      { key: "today", icon: "calendar", text: t("sidebar.today") },
      { key: "week", icon: "calendar-days", text: t("sidebar.week") },
      { key: "todo", icon: "square-check", text: t("sidebar.todo"), count: openTaskCount },
      { key: "on-this-day", icon: "history", text: t("list.presetOnThisDay"), count: onThisDayCount },
      { key: "random", icon: "shuffle", text: t("sidebar.random") }
    ];
    for (const item of navItems) this.renderNavItem(item.key, item.icon, item.text, item.count);
    this.sidebarEl.createDiv({ cls: "memoria-sidebar-section", text: t("sidebar.section.search") });
    this.renderNavItem("no-tag", "tag", t("sidebar.noTag"), noTagCount);
    this.renderNavItem("with-image", "image", t("sidebar.withImage"), imgCount);
    this.renderNavItem("with-link", "link", t("sidebar.withLink"), linkCount);
    this.renderSavedFilters();
    const yearCounts = /* @__PURE__ */ new Map();
    for (const m of all) {
      const y = m.date.substring(0, 4);
      yearCounts.set(y, ((_a = yearCounts.get(y)) != null ? _a : 0) + 1);
    }
    if (yearCounts.size) {
      this.sidebarEl.createDiv({ cls: "memoria-sidebar-section", text: t("sidebar.section.years") });
      for (const [y, cnt] of [...yearCounts.entries()].sort((a, b) => b[0] < a[0] ? -1 : 1)) {
        const item = this.sidebarEl.createDiv({
          cls: "memoria-nav-item" + (this.filter.year === y ? " active" : "")
        });
        (0, import_obsidian7.setIcon)(item.createDiv({ cls: "memoria-nav-icon" }), "calendar");
        item.createSpan({ cls: "memoria-nav-text", text: y });
        item.createSpan({ cls: "memoria-nav-count", text: String(cnt) });
        item.addEventListener("click", () => {
          this.filter.year = this.filter.year === y ? null : y;
          this.filter.preset = "all";
          this.activeSavedFilterId = null;
          this.pageLimit = this.getInitialPageLimit();
          this.renderAll();
        });
      }
    }
    if (this.settings.showSidebarTags) {
      const tagMap = /* @__PURE__ */ new Map();
      for (const m of all) for (const t2 of m.tags) if (!RESERVED_TAGS.has(t2)) tagMap.set(t2, ((_b = tagMap.get(t2)) != null ? _b : 0) + 1);
      if (tagMap.size) {
        const section = this.sidebarEl.createDiv({ cls: "memoria-sidebar-section memoria-section-collapsible" });
        section.createSpan({ cls: "memoria-section-arrow", text: this.tagsExpanded ? "\u25BE" : "\u25B8" });
        section.createSpan({ text: `${t("sidebar.section.tags")} (${tagMap.size})` });
        section.addEventListener("click", () => {
          this.tagsExpanded = !this.tagsExpanded;
          this.renderSidebar();
        });
        if (this.tagsExpanded) {
          this.renderTagTree(this.sidebarEl, this.buildTagTree(tagMap), 0);
        }
      }
    }
  }
  renderNavItem(key, icon, text, count) {
    const active = !this.activeSavedFilterId && this.filter.preset === key && !this.filter.tag && !this.filter.year;
    const item = this.sidebarEl.createDiv({ cls: "memoria-nav-item" + (active ? " active" : "") });
    (0, import_obsidian7.setIcon)(item.createDiv({ cls: "memoria-nav-icon" }), icon);
    item.createSpan({ cls: "memoria-nav-text", text });
    if (count !== void 0) item.createSpan({ cls: "memoria-nav-count", text: String(count) });
    item.addEventListener("click", () => {
      this.filter.preset = key;
      this.filter.tag = null;
      this.filter.year = null;
      this.filter.date = null;
      this.activeSavedFilterId = null;
      if (key === "random") this.filter.randomSeed = Date.now();
      this.pageLimit = this.getInitialPageLimit();
      this.renderAll();
    });
  }
  renderSavedFilters() {
    var _a;
    this.sidebarEl.createDiv({ cls: "memoria-sidebar-section", text: t("sidebar.saveFilter") });
    const saveItem = this.sidebarEl.createDiv({ cls: "memoria-nav-item memoria-save-filter-action" });
    (0, import_obsidian7.setIcon)(saveItem.createDiv({ cls: "memoria-nav-icon" }), "bookmark-plus");
    saveItem.createSpan({ cls: "memoria-nav-text", text: t("sidebar.saveCurrentFilter") });
    saveItem.addEventListener("click", () => this.showSaveFilterModal());
    for (const filter of (_a = this.settings.savedFilters) != null ? _a : []) {
      const item = this.sidebarEl.createDiv({
        cls: "memoria-nav-item memoria-saved-filter-item" + (this.activeSavedFilterId === filter.id ? " active" : "")
      });
      (0, import_obsidian7.setIcon)(item.createDiv({ cls: "memoria-nav-icon" }), "bookmark");
      item.createSpan({ cls: "memoria-nav-text", text: filter.name });
      const deleteBtn = item.createEl("button", { cls: "memoria-saved-filter-delete", attr: { "aria-label": t("sidebar.deleteFilter") } });
      (0, import_obsidian7.setIcon)(deleteBtn, "x");
      item.addEventListener("click", () => this.applySavedFilter(filter));
      deleteBtn.addEventListener("click", async (e) => {
        var _a2;
        e.stopPropagation();
        this.settings.savedFilters = ((_a2 = this.settings.savedFilters) != null ? _a2 : []).filter((x) => x.id !== filter.id);
        if (this.activeSavedFilterId === filter.id) this.activeSavedFilterId = null;
        await this.saveSettings();
        this.renderSidebar();
        new import_obsidian7.Notice(t("notice.filterDeleted"));
      });
    }
  }
  /** 2026-06-03: 保存完整筛选快照，排查结果不一致时优先对照这里和 parseSearch 的输出 */
  currentFilterSnapshot(name) {
    return {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      preset: this.filter.preset,
      tag: this.filter.tag,
      year: this.filter.year,
      date: this.filter.date,
      keyword: this.filter.keyword
    };
  }
  applySavedFilter(saved) {
    this.filter = {
      tag: saved.tag,
      year: saved.year,
      date: saved.date,
      keyword: saved.keyword,
      preset: saved.preset || "all",
      searchTokens: parseSearch(saved.keyword)
    };
    this.activeSavedFilterId = saved.id;
    this.searchEl.value = saved.keyword;
    this.pageLimit = this.getInitialPageLimit();
    this.refreshTimeChip();
    this.renderAll();
  }
  showSaveFilterModal() {
    const backdrop = document.body.createDiv({ cls: "memoria-modal-backdrop" });
    const modal = backdrop.createDiv({ cls: "memoria-modal memoria-text-modal" });
    modal.createDiv({ cls: "memoria-modal-title", text: t("filter.saveTitle") });
    const input = modal.createEl("input", {
      cls: "memoria-modal-input",
      attr: { type: "text", placeholder: t("filter.namePlaceholder") },
      value: this.describeFilterOnly()
    });
    const hint = modal.createDiv({ cls: "memoria-modal-hint" });
    hint.setText(t("filter.saveHint", { desc: this.describeFilterOnly() }));
    const btns = modal.createDiv({ cls: "memoria-modal-btns" });
    const cancelBtn = btns.createEl("button", { text: t("common.cancel") });
    const saveBtn = btns.createEl("button", { text: t("filter.save"), cls: "mod-cta" });
    const close = () => backdrop.remove();
    const submit = async () => {
      var _a;
      const name = input.value.trim();
      if (!name) {
        new import_obsidian7.Notice(t("filter.requireName"));
        return;
      }
      this.settings.savedFilters = [...(_a = this.settings.savedFilters) != null ? _a : [], this.currentFilterSnapshot(name)];
      await this.saveSettings();
      close();
      this.renderSidebar();
      new import_obsidian7.Notice(t("notice.filterSaved"));
    };
    cancelBtn.addEventListener("click", close);
    saveBtn.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
      else if (e.key === "Escape") close();
    });
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });
    setTimeout(() => {
      input.focus();
      input.select();
    }, 20);
  }
  renderStatItem(parent, num, label) {
    const el = parent.createDiv({ cls: "memoria-stat" });
    el.createDiv({ cls: "memoria-stat-num", text: num });
    el.createDiv({ cls: "memoria-stat-label", text: label });
  }
  renderOverview(parent, memos) {
    const wrap = parent.createDiv({ cls: "memoria-overview" }).createDiv({ cls: "memoria-overview-content" });
    if (this.overviewMode === "heatmap") {
      this.renderHeatmap(wrap, memos);
    } else {
      renderCalendar(wrap, memos, {
        activeDate: this.filter.date,
        onPickDate: (date) => {
          this.filter.date = this.filter.date === date ? null : date;
          this.filter.preset = "all";
          this.activeSavedFilterId = null;
          this.pageLimit = this.getInitialPageLimit();
          this.refreshTimeChip();
          this.renderAll();
        }
      });
    }
  }
  renderHeatmap(parent, memos) {
    var _a, _b, _c;
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const gridStart = new Date(startOfWeek);
    gridStart.setDate(startOfWeek.getDate() - 13 * 7);
    const dateCounts = /* @__PURE__ */ new Map();
    const dateMemos = /* @__PURE__ */ new Map();
    for (const m of memos) {
      dateCounts.set(m.date, ((_a = dateCounts.get(m.date)) != null ? _a : 0) + 1);
      const arr = (_b = dateMemos.get(m.date)) != null ? _b : [];
      arr.push(m);
      dateMemos.set(m.date, arr);
    }
    const heatmap = parent.createDiv({ cls: "memoria-heatmap" });
    let tooltip = null;
    const showTooltip = (cell, dateStr, count) => {
      var _a2;
      if (count === 0) return;
      tooltip == null ? void 0 : tooltip.remove();
      const dayMemos = (_a2 = dateMemos.get(dateStr)) != null ? _a2 : [];
      tooltip = document.body.createDiv({ cls: "memoria-heatmap-tooltip" });
      tooltip.style.position = "fixed";
      tooltip.style.zIndex = "10001";
      const head = tooltip.createDiv({ cls: "memoria-heatmap-tooltip-head" });
      head.createSpan({ text: dateStr });
      head.createSpan({ cls: "memoria-heatmap-tooltip-count", text: t("list.totalCount", { n: count }) });
      const show = dayMemos.slice(0, 3);
      for (const m of show) {
        const row = tooltip.createDiv({ cls: "memoria-heatmap-tooltip-row" });
        row.createSpan({ cls: "memoria-heatmap-tooltip-time", text: m.time });
        row.createSpan({ cls: "memoria-heatmap-tooltip-text", text: m.content.split("\n")[0] });
      }
      if (dayMemos.length > 3) {
        tooltip.createDiv({ cls: "memoria-heatmap-tooltip-more", text: t("stats.moreCount", { n: dayMemos.length - 3 }) });
      }
      const rect = cell.getBoundingClientRect();
      tooltip.style.left = `${Math.round(rect.right + 8)}px`;
      tooltip.style.top = `${Math.round(rect.top)}px`;
    };
    const hideTooltip = () => {
      tooltip == null ? void 0 : tooltip.remove();
      tooltip = null;
    };
    for (let col = 0; col < 14; col++) {
      const colEl = heatmap.createDiv({ cls: "memoria-heatmap-col" });
      for (let row = 0; row < 7; row++) {
        const date = new Date(gridStart);
        date.setDate(gridStart.getDate() + col * 7 + row);
        const dateStr = toDateStr(date);
        const count = (_c = dateCounts.get(dateStr)) != null ? _c : 0;
        const level = count === 0 ? 0 : count < 2 ? 1 : count < 4 ? 2 : count < 7 ? 3 : 4;
        const cell = colEl.createDiv({
          cls: `memoria-heatmap-cell level-${level}`,
          attr: { title: count > 0 ? "" : t("stats.dayCount", { date: dateStr, count: 0 }) }
        });
        if (count > 0) {
          cell.addEventListener("mouseenter", () => showTooltip(cell, dateStr, count));
          cell.addEventListener("mouseleave", hideTooltip);
        }
        if (date > today) cell.addClass("future");
      }
    }
  }
  buildTagTree(tagMap) {
    const root = { name: "", full: "", count: 0, self: 0, children: /* @__PURE__ */ new Map() };
    for (const [tag, cnt] of tagMap) {
      const parts = tag.split("/");
      let node = root;
      let path = "";
      for (const part of parts) {
        path = path ? `${path}/${part}` : part;
        if (!node.children.has(part)) {
          node.children.set(part, { name: part, full: path, count: 0, self: 0, children: /* @__PURE__ */ new Map() });
        }
        node = node.children.get(part);
      }
      node.self += cnt;
    }
    const sumCount = (n) => {
      let total = n.self;
      for (const child of n.children.values()) total += sumCount(child);
      n.count = total;
      return total;
    };
    sumCount(root);
    return root;
  }
  renderTagTree(parent, node, depth) {
    const children = [...node.children.values()].sort((a, b) => b.count - a.count);
    for (const child of children) {
      const wrap = parent.createDiv({ cls: "memoria-tag-node" });
      const item = wrap.createDiv({
        cls: "memoria-nav-item memoria-tag-item" + (this.filter.tag === child.full ? " active" : "")
      });
      item.style.paddingLeft = `${12 + depth * 14}px`;
      item.createDiv({ cls: "memoria-nav-icon" }).setText("#");
      item.createSpan({ cls: "memoria-nav-text", text: child.name });
      item.createSpan({ cls: "memoria-nav-count", text: String(child.count) });
      item.addEventListener("click", () => {
        this.filter.tag = this.filter.tag === child.full ? null : child.full;
        this.filter.preset = "all";
        this.activeSavedFilterId = null;
        this.pageLimit = this.getInitialPageLimit();
        this.renderAll();
      });
      if (child.children.size) this.renderTagTree(wrap, child, depth + 1);
    }
  }
  getFilteredMemos() {
    var _a;
    let memos = this.store.getAll();
    memos = memos.filter((m) => {
      if (this.filter.year && !m.date.startsWith(this.filter.year)) return false;
      if (this.filter.date && m.date !== this.filter.date) return false;
      if (this.filter.tag && !m.tags.some((x) => x === this.filter.tag || x.startsWith(this.filter.tag + "/"))) return false;
      if (!matchesSearch(m.content, m.tags, m.date, this.filter.searchTokens)) return false;
      return true;
    });
    const todayStr = toDateStr(/* @__PURE__ */ new Date());
    if (this.filter.preset === "today") {
      memos = memos.filter((m) => m.date === todayStr);
    } else if (this.filter.preset === "week") {
      const weekStart = /* @__PURE__ */ new Date();
      weekStart.setDate(weekStart.getDate() - (weekStart.getDay() + 6) % 7);
      weekStart.setHours(0, 0, 0, 0);
      memos = memos.filter((m) => m.datetime >= weekStart);
    } else if (this.filter.preset === "on-this-day") {
      const today = /* @__PURE__ */ new Date();
      const mmdd = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      memos = memos.filter((m) => m.date.slice(5) === mmdd && m.date !== todayStr);
    } else if (this.filter.preset === "todo") {
      memos = memos.filter((m) => m.hasOpenTask);
    } else if (this.filter.preset === "no-tag") {
      memos = memos.filter((m) => m.tags.filter((t2) => !RESERVED_TAGS.has(t2)).length === 0);
    } else if (this.filter.preset === "with-image") {
      memos = memos.filter((m) => m.hasImage);
    } else if (this.filter.preset === "with-link") {
      memos = memos.filter((m) => m.hasLink);
    } else if (this.filter.preset === "pinned") {
      memos = memos.filter((m) => m.isPinned);
    } else if (this.filter.preset === "starred") {
      memos = memos.filter((m) => m.isStarred);
    } else if (this.filter.preset === "random" && memos.length) {
      memos = seededShuffle(memos, Math.min(5, memos.length), (_a = this.filter.randomSeed) != null ? _a : 1);
    }
    return memos;
  }
  renderList() {
    var _a;
    this.listEl.empty();
    this.childComponent.unload();
    this.childComponent = new import_obsidian7.Component();
    this.childComponent.load();
    const filtered = this.getFilteredMemos();
    const meta = this.listEl.createDiv({ cls: "memoria-list-meta" });
    meta.createDiv({ cls: "memoria-list-meta-left", text: this.describeFilter(filtered.length) });
    if (this.filter.preset === "random") {
      const rerollBtn = meta.createEl("button", { cls: "memoria-meta-btn" });
      (0, import_obsidian7.setIcon)(rerollBtn.createSpan(), "shuffle");
      rerollBtn.createSpan({ text: t("meta.reroll") });
      rerollBtn.addEventListener("click", () => {
        this.filter.randomSeed = Date.now();
        this.renderList();
      });
    }
    if (filtered.length === 0) {
      const empty = this.listEl.createDiv({ cls: "memoria-empty" });
      if (this.filter.preset === "todo") {
        empty.createDiv({ cls: "memoria-empty-emoji", text: "\u2705" });
        empty.createDiv({ cls: "memoria-empty-text", text: t("empty.todo") });
        empty.createDiv({ cls: "memoria-empty-sub", text: t("empty.todoSub") });
      } else if (this.filter.preset === "on-this-day") {
        empty.createDiv({ cls: "memoria-empty-emoji", text: "\u{1F570}\uFE0F" });
        empty.createDiv({ cls: "memoria-empty-text", text: t("empty.onThisDay") });
        empty.createDiv({ cls: "memoria-empty-sub", text: t("empty.onThisDaySub") });
      } else {
        empty.createDiv({ cls: "memoria-empty-emoji", text: "\u{1F4ED}" });
        empty.createDiv({ cls: "memoria-empty-text", text: t("empty.default") });
        empty.createDiv({ cls: "memoria-empty-sub", text: t("empty.defaultSub") });
      }
      return;
    }
    const page = filtered.slice(0, this.pageLimit);
    const pinned = page.filter((m) => m.isPinned);
    const unpinned = page.filter((m) => !m.isPinned);
    if (pinned.length) {
      const group = this.listEl.createDiv({ cls: "memoria-day-group memoria-pin-group" });
      const head = group.createDiv({ cls: "memoria-day-head memoria-pin-head" });
      (0, import_obsidian7.setIcon)(head.createSpan({ cls: "memoria-pin-head-icon" }), "pin");
      head.createSpan({ text: t("list.pinnedHead", { n: pinned.length }) });
      for (const m of pinned) this.renderMemoCard(group, m);
    }
    const byDate = /* @__PURE__ */ new Map();
    for (const m of unpinned) {
      const arr = (_a = byDate.get(m.date)) != null ? _a : [];
      arr.push(m);
      byDate.set(m.date, arr);
    }
    const todayStr = toDateStr(/* @__PURE__ */ new Date());
    const yesterday = /* @__PURE__ */ new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = toDateStr(yesterday);
    for (const [date, dayMemos] of byDate) {
      const group = this.listEl.createDiv({ cls: "memoria-day-group" });
      const head = group.createDiv({ cls: "memoria-day-head" });
      const wd = t(`weekday.${(/* @__PURE__ */ new Date(date + "T00:00:00")).getDay()}`);
      let label = `${date}  ${wd}`;
      if (date === todayStr) label = `${t("date.today")}  ${wd}`;
      else if (date === yesterdayStr) label = `${t("date.yesterday")}  ${wd}`;
      head.setText(label);
      for (const m of dayMemos) this.renderMemoCard(group, m);
    }
    if (this.pageLimit < filtered.length) {
      this.listEl.createDiv({ cls: "memoria-load-more" }).setText(t("list.loadMore", { n: filtered.length - this.pageLimit }));
    }
  }
  getPresetLabel(preset) {
    var _a;
    const presetLabels = {
      today: t("sidebar.today"),
      week: t("sidebar.week"),
      random: t("sidebar.random"),
      "on-this-day": t("list.presetOnThisDay"),
      todo: "\u{1F4CB} " + t("sidebar.todo"),
      "no-tag": t("sidebar.noTag"),
      "with-image": t("sidebar.withImage"),
      "with-link": t("sidebar.withLink"),
      pinned: t("list.presetPinned"),
      starred: t("list.presetStarred")
    };
    return (_a = presetLabels[preset]) != null ? _a : preset;
  }
  describeFilter(count) {
    const parts = [];
    if (this.filter.preset !== "all") parts.push(this.getPresetLabel(this.filter.preset));
    if (this.filter.year) parts.push(this.filter.year);
    if (this.filter.date) parts.push(`\u{1F4C5} ${this.filter.date}`);
    if (this.filter.tag) parts.push(`#${this.filter.tag}`);
    if (this.filter.keyword) parts.push(`\u300C${this.filter.keyword}\u300D`);
    return `${parts.length ? parts.join(" \xB7 ") + " \xB7 " : ""}${t("list.totalCount", { n: count })}`;
  }
  renderMemoCard(parent, memo) {
    var _a;
    let bodyText = "";
    let images = [];
    const cached = this.renderCache.get(memo);
    if (cached) {
      bodyText = cached.bodyText;
      images = cached.images;
    } else {
      const { text } = this.stripTags(memo.content);
      const extracted = extractImages(this.app, text, memo.file);
      bodyText = extracted.text;
      images = extracted.images;
      this.renderCache.set(memo, { bodyText, images });
    }
    let mood = "neutral";
    if (this.settings.enableMoodColoring) {
      mood = (_a = this.moodCache.get(memo)) != null ? _a : detectMood(memo.content);
      this.moodCache.set(memo, mood);
    }
    const moodCls = mood !== "neutral" ? ` ${moodClass(mood)}` : "";
    const card = parent.createDiv({
      cls: "memoria-card" + (memo.isPinned ? " is-pinned" : "") + (memo.isStarred ? " is-starred" : "") + (this.editingMemo === memo ? " is-editing" : "") + moodCls
    });
    card.addEventListener("dblclick", (e) => {
      const target = e.target;
      if (!target.closest(".memoria-img-cell") && target.tagName !== "A") this.enterEditMode(memo);
    });
    const head = card.createDiv({ cls: "memoria-card-head" });
    const timeWrap = head.createDiv({ cls: "memoria-card-time-wrap" });
    if (memo.isPinned) {
      const pin = timeWrap.createSpan({ cls: "memoria-card-pin" });
      (0, import_obsidian7.setIcon)(pin, "pin");
      pin.setAttr("aria-label", t("card.pinnedMark"));
    }
    if (memo.isStarred) {
      const star = timeWrap.createSpan({ cls: "memoria-card-star" });
      (0, import_obsidian7.setIcon)(star, "star");
      star.setAttr("aria-label", t("card.starredMark"));
    }
    timeWrap.createSpan({ cls: "memoria-card-time", text: `${memo.date} ${memo.time}` });
    const moreBtn = head.createDiv({ cls: "memoria-card-actions" }).createEl("button", { cls: "memoria-icon-btn", attr: { "aria-label": t("toolbar.moreActions") } });
    (0, import_obsidian7.setIcon)(moreBtn, "more-horizontal");
    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showMemoMenu(e, memo);
    });
    if (bodyText.trim()) {
      const body = card.createDiv({ cls: "memoria-card-body" });
      import_obsidian7.MarkdownRenderer.render(this.app, normalizeForRender(bodyText), body, memo.file, this.childComponent);
      this.bindTaskCheckboxes(body, memo, bodyText);
      this.wrapWideTables(body);
      const lineLimit = this.settings.collapseLineLimit;
      if (lineLimit > 0) {
        const textLines = bodyText.split("\n").filter((l) => l.trim() !== "").length;
        if (textLines > lineLimit) {
          body.addClass("is-collapsed");
          body.style.setProperty("--memoria-collapse-max", `${lineLimit * 1.6}em`);
          const toggle = body.createDiv({ cls: "memoria-collapse-toggle" });
          const iconSpan = toggle.createSpan({ cls: "memoria-collapse-icon" });
          (0, import_obsidian7.setIcon)(iconSpan, "chevron-down");
          toggle.createSpan({ text: t("list.readMore") });
          toggle.addEventListener("click", (e) => {
            var _a2, _b;
            e.stopPropagation();
            if (body.hasClass("is-collapsed")) {
              body.removeClass("is-collapsed");
              body.addClass("is-expanded");
              (0, import_obsidian7.setIcon)(iconSpan, "chevron-up");
              (_a2 = toggle.querySelector(":scope > span:last-child")) == null ? void 0 : _a2.setText(t("list.collapse"));
            } else {
              body.addClass("is-collapsed");
              body.removeClass("is-expanded");
              (0, import_obsidian7.setIcon)(iconSpan, "chevron-down");
              (_b = toggle.querySelector(":scope > span:last-child")) == null ? void 0 : _b.setText(t("list.readMore"));
            }
          });
        }
      }
    }
    if (images.length) renderImageGrid(card, images, (idx) => showLightbox(images, idx));
    const visibleTags = memo.tags.filter((t2) => !RESERVED_TAGS.has(t2));
    if (visibleTags.length) {
      const tagsEl = card.createDiv({ cls: "memoria-card-tags" });
      for (const t2 of visibleTags) {
        tagsEl.createSpan({ cls: "memoria-tag-pill", text: `#${t2}` }).addEventListener("click", () => {
          this.filter.tag = t2;
          this.filter.preset = "all";
          this.activeSavedFilterId = null;
          this.pageLimit = this.getInitialPageLimit();
          this.renderAll();
        });
      }
    }
  }
  bindTaskCheckboxes(container, memo, renderedText) {
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    if (!checkboxes.length) return;
    const taskLines = [];
    const taskRe = /^\s*[-*]\s+\[( |x|X)\]\s/;
    renderedText.split("\n").forEach((line, idx) => {
      const m = line.match(taskRe);
      if (m) taskLines.push({ line: idx, checked: /[xX]/.test(m[1]) });
    });
    if (checkboxes.length !== taskLines.length) return;
    checkboxes.forEach((cb, i) => {
      cb.disabled = false;
      cb.style.cursor = "pointer";
      cb.addEventListener("click", async (e) => {
        e.stopPropagation();
        const task = taskLines[i];
        const lines = renderedText.split("\n");
        const original = lines[task.line];
        lines[task.line] = task.checked ? original.replace(/\[[xX]\]/, "[ ]") : original.replace(/\[ \]/, "[x]");
        const idx = memo.content.indexOf(original);
        if (idx === -1) return;
        const newContent = memo.content.substring(0, idx) + lines[task.line] + memo.content.substring(idx + original.length);
        try {
          await this.store.editMemo(memo, newContent);
        } catch (err) {
          console.error("[Memoria] \u4EFB\u52A1\u52FE\u9009\u5931\u8D25:", err);
          new import_obsidian7.Notice(t("notice.checkFailed", { msg: err instanceof Error ? err.message : String(err) }));
        }
      });
    });
  }
  wrapWideTables(container) {
    container.querySelectorAll("table").forEach((table) => {
      const parent = table.parentElement;
      if (!parent || parent.hasClass("memoria-table-wrap")) return;
      const wrap = createDiv({ cls: "memoria-table-wrap" });
      parent.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
  }
  stripTags(content) {
    return stripDisplayTags(content);
  }
  showMemoMenu(e, memo) {
    const menu = new import_obsidian7.Menu();
    menu.addItem((i) => i.setTitle(memo.isPinned ? t("card.unpin") : t("card.pin")).setIcon(memo.isPinned ? "pin-off" : "pin").onClick(async () => {
      await this.store.togglePinned(memo);
      new import_obsidian7.Notice(memo.isPinned ? t("notice.unpinned") : t("notice.pinned"));
    }));
    menu.addItem((i) => i.setTitle(memo.isStarred ? t("card.unstar") : t("card.star")).setIcon(memo.isStarred ? "star-off" : "star").onClick(async () => {
      await this.store.toggleStarred(memo);
      new import_obsidian7.Notice(memo.isStarred ? t("notice.unstarred") : t("notice.starred"));
    }));
    menu.addSeparator();
    menu.addItem((i) => i.setTitle(t("card.edit")).setIcon("pencil").onClick(() => this.enterEditMode(memo)));
    menu.addItem((i) => i.setTitle(t("card.quote")).setIcon("quote").onClick(() => this.quoteMemo(memo)));
    menu.addItem((i) => i.setTitle(t("card.promote")).setIcon("file-plus").onClick(() => this.showPromoteMemoModal(memo)));
    menu.addItem((i) => i.setTitle(t("card.openSource")).setIcon("file-text").onClick(() => this.openInFile(memo)));
    menu.addItem((i) => i.setTitle(t("card.copySource")).setIcon("copy").onClick(async () => {
      await navigator.clipboard.writeText(memo.content);
      new import_obsidian7.Notice(t("notice.copied"));
    }));
    menu.addSeparator();
    menu.addItem((i) => i.setTitle(t("card.delete")).setIcon("trash").onClick(async () => {
      if (await this.confirmAsync(t("notice.confirmDelete"))) {
        await this.store.deleteMemo(memo);
        new import_obsidian7.Notice(t("notice.deleted"));
        this.restoreInputFocus();
      }
    }));
    menu.showAtMouseEvent(e);
  }
  /** 2026-06-03: 转正式笔记只创建新文件，不自动删除原 memo，降低整理功能的误操作风险 */
  showPromoteMemoModal(memo) {
    const backdrop = document.body.createDiv({ cls: "memoria-modal-backdrop" });
    const modal = backdrop.createDiv({ cls: "memoria-modal memoria-text-modal" });
    modal.createDiv({ cls: "memoria-modal-title", text: t("card.promote") });
    const titleLabel = modal.createDiv({ cls: "memoria-modal-label", text: t("promote.title") });
    const titleInput = modal.createEl("input", {
      cls: "memoria-modal-input",
      attr: { type: "text" },
      value: this.suggestMemoTitle(memo)
    });
    titleLabel.setAttr("for", "memoria-promote-title");
    titleInput.id = "memoria-promote-title";
    const folderLabel = modal.createDiv({ cls: "memoria-modal-label", text: t("promote.folder") });
    const folderInput = modal.createEl("input", {
      cls: "memoria-modal-input",
      attr: { type: "text" },
      value: this.settings.promoteFolder || "Memoria/notes"
    });
    folderLabel.setAttr("for", "memoria-promote-folder");
    folderInput.id = "memoria-promote-folder";
    modal.createDiv({ cls: "memoria-modal-hint", text: t("promote.hint") });
    const btns = modal.createDiv({ cls: "memoria-modal-btns" });
    const cancelBtn = btns.createEl("button", { text: t("common.cancel") });
    const createBtn = btns.createEl("button", { text: t("promote.create"), cls: "mod-cta" });
    const close = () => backdrop.remove();
    const submit = async () => {
      const title = titleInput.value.trim();
      const folder = folderInput.value.trim() || "Memoria/notes";
      if (!title) {
        new import_obsidian7.Notice(t("promote.requireTitle"));
        return;
      }
      try {
        this.settings.promoteFolder = folder;
        await this.saveSettings();
        const path = await this.store.promoteMemoToNote(memo, title, folder);
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof import_obsidian7.TFile) await this.app.workspace.getLeaf("tab").openFile(file);
        new import_obsidian7.Notice(t("promote.created", { path }));
        close();
      } catch (e) {
        new import_obsidian7.Notice(t("promote.failed", { msg: e instanceof Error ? e.message : String(e) }));
      }
    };
    cancelBtn.addEventListener("click", close);
    createBtn.addEventListener("click", submit);
    titleInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
      else if (e.key === "Escape") close();
    });
    folderInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
      else if (e.key === "Escape") close();
    });
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });
    setTimeout(() => {
      titleInput.focus();
      titleInput.select();
    }, 20);
  }
  suggestMemoTitle(memo) {
    var _a;
    const { text } = this.stripTags(memo.content);
    const first = (_a = text.split("\n").map((l) => l.trim()).find(Boolean)) != null ? _a : "Memoria memo";
    return first.replace(/^[-*]\s+/, "").replace(/^#+\s+/, "").replace(/^>\s*/, "").replace(/!\[\[[^\]]+\]\]/g, "").replace(/!\[[^\]]*\]\([^)]+\)/g, "").trim().slice(0, 40) || "Memoria memo";
  }
  async showExportMenu(e) {
    const menu = new import_obsidian7.Menu();
    const memos = this.getFilteredMemos();
    menu.addItem((i) => i.setTitle(t("card.exportMd")).setIcon("file-text").onClick(async () => {
      try {
        await exportMemos(this.app, "md", memos, this.describeFilterOnly(), "Memoria/exports");
      } catch (err) {
        new import_obsidian7.Notice(t("notice.exportFailed", { msg: err.message }));
      }
    }));
    menu.addItem((i) => i.setTitle(t("card.exportHtml")).setIcon("file-code").onClick(async () => {
      try {
        const path = await exportMemos(this.app, "html", memos, this.describeFilterOnly(), "Memoria/exports");
        new import_obsidian7.Notice(t("notice.exportDone", { n: memos.length, path }));
      } catch (err) {
        new import_obsidian7.Notice(t("notice.exportFailed", { msg: err.message }));
      }
    }));
    menu.addItem((i) => i.setTitle(t("card.exportJson")).setIcon("file-json").onClick(async () => {
      try {
        await exportMemos(this.app, "json", memos, this.describeFilterOnly(), "Memoria/exports");
      } catch (err) {
        new import_obsidian7.Notice(t("notice.exportFailed", { msg: err.message }));
      }
    }));
    menu.showAtMouseEvent(e);
  }
  describeFilterOnly() {
    const parts = [];
    if (this.filter.preset !== "all") parts.push(this.getPresetLabel(this.filter.preset));
    if (this.filter.year) parts.push(this.filter.year);
    if (this.filter.date) parts.push(this.filter.date);
    if (this.filter.tag) parts.push(`#${this.filter.tag}`);
    if (this.filter.keyword) parts.push(this.filter.keyword);
    return parts.join(" \xB7 ") || t("sidebar.all");
  }
  confirmAsync(message) {
    return new Promise((resolve) => {
      const backdrop = document.body.createDiv({ cls: "memoria-modal-backdrop" });
      const modal = backdrop.createDiv({ cls: "memoria-modal memoria-confirm" });
      modal.createDiv({ cls: "memoria-modal-title", text: message });
      const btns = modal.createDiv({ cls: "memoria-modal-btns" });
      const cancelBtn = btns.createEl("button", { text: t("common.cancel") });
      const confirmBtn = btns.createEl("button", { text: t("notice.confirmDeleteOk"), cls: "mod-warning" });
      const done = (result) => {
        backdrop.remove();
        document.removeEventListener("keydown", onKey, true);
        setTimeout(() => resolve(result), 0);
      };
      const onKey = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          done(false);
        } else if (e.key === "Enter") {
          e.preventDefault();
          done(true);
        }
      };
      cancelBtn.addEventListener("click", () => done(false));
      confirmBtn.addEventListener("click", () => done(true));
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) done(false);
      });
      document.addEventListener("keydown", onKey, true);
      setTimeout(() => confirmBtn.focus(), 20);
    });
  }
  restoreInputFocus() {
    if (!this.inputEl) return;
    try {
      this.inputEl.blur();
    } catch (e) {
    }
    setTimeout(() => {
      try {
        this.inputEl.setSelectionRange(this.inputEl.value.length, this.inputEl.value.length);
      } catch (e) {
      }
    }, 20);
  }
  async openInFile(memo) {
    const leaf = this.app.workspace.getLeaf(false);
    const file = this.app.vault.getAbstractFileByPath(memo.file);
    if (file instanceof import_obsidian7.TFile) await leaf.openFile(file, { eState: { line: memo.range[0] } });
  }
  quoteMemo(memo) {
    if (this.editingMemo) this.exitEditMode();
    const body = memo.content.replace(/\s*#置顶(?![A-Za-z0-9_一-鿿/])/g, "").replace(/\s*#收藏(?![A-Za-z0-9_一-鿿/])/g, "").trim().split("\n").map((l) => l.trim() === "" ? ">" : `> ${l}`).join("\n");
    const quote = `> [!quote] ${memo.date} ${memo.time}
${body}

`;
    if (this.inputEl.value.trim()) {
      this.inputEl.value = this.inputEl.value.replace(/\s+$/, "") + "\n\n" + quote;
    } else {
      this.inputEl.value = quote;
    }
    this.inputEl.focus();
    this.inputEl.setSelectionRange(this.inputEl.value.length, this.inputEl.value.length);
    new import_obsidian7.Notice(t("notice.quoted"));
  }
};
_MemoriaView.DRAFT_KEY_PREFIX = "memoria:input-draft";
var MemoriaView = _MemoriaView;
function escapeRegex3(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function toDateStr(date) {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function toTimeStr(date) {
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}
function seededShuffle(arr, count, seed) {
  const a = arr.slice();
  let s = Math.abs(seed) || 1;
  const rand = () => {
    s = s * 1664525 + 1013904223 >>> 0;
    return s / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, count);
}

// src/stats-view.ts
var import_obsidian8 = require("obsidian");
var MemoriaStatsView = class extends import_obsidian8.ItemView {
  constructor(leaf, store) {
    super(leaf);
    this.memos = [];
    this.unsubscribe = null;
    this.store = store;
  }
  getViewType() {
    return VIEW_TYPE_STATS;
  }
  getDisplayText() {
    return t("stats.viewTitle");
  }
  getIcon() {
    return "bar-chart-3";
  }
  async onOpen() {
    this.contentEl.addClass("memoria-stats-view");
    this.memos = this.store.getAll();
    this.render();
    this.unsubscribe = this.store.onChange(() => {
      this.memos = this.store.getAll();
      this.render();
    });
  }
  async onClose() {
    var _a;
    (_a = this.unsubscribe) == null ? void 0 : _a.call(this);
  }
  render() {
    const el = this.contentEl;
    el.empty();
    const titleBar = el.createDiv({ cls: "mstat-pagetitle" });
    titleBar.createSpan({ cls: "mstat-pagetitle-icon", text: "\u{1F4CA}" });
    titleBar.createSpan({ cls: "mstat-pagetitle-text", text: t("toolbar.statsReport") });
    if (this.memos.length === 0) {
      el.createEl("p", { text: t("empty.default"), cls: "mstat-empty-page" });
      return;
    }
    const body = el.createDiv({ cls: "memoria-stats-body" });
    this.renderOverview(body);
    this.renderYearHeatmap(body);
    this.renderTopTags(body);
    this.renderHourlyChart(body);
    this.renderHighlights(body);
    this.renderTagCloud(body);
  }
  renderOverview(parent) {
    const section = parent.createDiv({ cls: "mstat-section" }).createDiv({ cls: "mstat-overview" });
    const charCount = this.memos.reduce((sum, m) => sum + m.content.replace(/\s/g, "").length, 0);
    const activeDays = new Set(this.memos.map((m) => m.date)).size;
    const oldest = [...this.memos].sort((a, b) => a.datetime.getTime() - b.datetime.getTime())[0];
    const spanDays = Math.floor((Date.now() - oldest.datetime.getTime()) / (1e3 * 60 * 60 * 24)) + 1;
    this.renderBigNum(section, this.memos.length, t("stats.memos"));
    this.renderBigNum(section, charCount, t("stats.chars"));
    this.renderBigNum(section, activeDays, t("stats.days"));
    this.renderBigNum(section, spanDays, t("stats.dailyGoal"));
  }
  renderBigNum(parent, num, label) {
    const el = parent.createDiv({ cls: "mstat-bignum" });
    el.createDiv({ cls: "mstat-bignum-num", text: num.toLocaleString() });
    el.createDiv({ cls: "mstat-bignum-label", text: label });
  }
  renderYearHeatmap(parent) {
    const section = parent.createDiv({ cls: "mstat-section" });
    const titleRow = section.createDiv({ cls: "mstat-yh-title-row" });
    titleRow.createDiv({ cls: "mstat-title", text: t("stats.yearHeatmap") });
    const yearNav = titleRow.createDiv({ cls: "mstat-yh-year-nav" });
    const prevBtn = yearNav.createEl("button", { cls: "mstat-yh-year-arrow", attr: { "aria-label": t("stats.prevYear") } });
    (0, import_obsidian8.setIcon)(prevBtn, "chevron-left");
    const yearBtn = yearNav.createEl("button", { cls: "mstat-yh-year-btn" });
    const nextBtn = yearNav.createEl("button", { cls: "mstat-yh-year-arrow", attr: { "aria-label": t("stats.nextYear") } });
    (0, import_obsidian8.setIcon)(nextBtn, "chevron-right");
    let currentYear = (/* @__PURE__ */ new Date()).getFullYear();
    yearBtn.setText(t("stats.yearLabel", { year: currentYear }));
    const heatmapWrap = section.createDiv({ cls: "mstat-yh-wrap" });
    const monthLabels = section.createDiv({ cls: "mstat-yh-monthlabels" });
    const monthlyTitleSection = parent.createDiv({ cls: "mstat-section mstat-monthly-title" });
    const monthlyTitleRow = monthlyTitleSection.createDiv({ cls: "mstat-title-row" });
    monthlyTitleRow.createDiv({ cls: "mstat-title", text: t("stats.monthlyTitle") });
    const monthlySubtitle = monthlyTitleRow.createDiv({ cls: "mstat-subtitle" });
    const monthlyWrap = parent.createDiv({ cls: "mstat-monthly-wrap" });
    const drawYear = (year) => {
      var _a, _b;
      heatmapWrap.empty();
      monthLabels.empty();
      yearBtn.setText(t("stats.yearLabel", { year }));
      const dateCounts = /* @__PURE__ */ new Map();
      for (const m of this.memos) {
        if (m.date.startsWith(`${year}-`)) dateCounts.set(m.date, ((_a = dateCounts.get(m.date)) != null ? _a : 0) + 1);
      }
      const jan1 = new Date(year, 0, 1);
      const now = /* @__PURE__ */ new Date();
      const lastDay = year === now.getFullYear() ? now : new Date(year, 11, 31);
      const gridStart = new Date(jan1);
      gridStart.setDate(jan1.getDate() - jan1.getDay());
      const totalDays = Math.ceil((lastDay.getTime() - gridStart.getTime()) / (1e3 * 60 * 60 * 24)) + 1;
      const totalCols = Math.ceil(totalDays / 7);
      const CELL_W = 13, GAP = 3;
      monthLabels.style.width = `${totalCols * (CELL_W + GAP)}px`;
      const monthsSeen = [];
      let lastMonth = -1;
      for (let col = 0; col < totalCols; col++) {
        const d = new Date(gridStart);
        d.setDate(gridStart.getDate() + col * 7);
        if (d.getFullYear() !== year) continue;
        const mo = d.getMonth();
        if (mo !== lastMonth) {
          monthsSeen.push({ month: mo, week: col });
          lastMonth = mo;
        }
      }
      for (let i = 0; i < monthsSeen.length; i++) {
        const { month, week } = monthsSeen[i];
        const next = monthsSeen[i + 1];
        if ((next ? next.week - week : totalCols - week) < 2) continue;
        const lbl = monthLabels.createDiv({ cls: "mstat-yh-mlabel", text: t("stats.monthLabel", { month: month + 1 }) });
        lbl.style.left = `${week * (CELL_W + GAP)}px`;
      }
      for (let col = 0; col < totalCols; col++) {
        const colEl = heatmapWrap.createDiv({ cls: "mstat-yh-col" });
        for (let row = 0; row < 7; row++) {
          const d = new Date(gridStart);
          d.setDate(gridStart.getDate() + col * 7 + row);
          const dateStr = toDateStr2(d);
          const inYear = d >= jan1 && d <= lastDay;
          const count = (_b = dateCounts.get(dateStr)) != null ? _b : 0;
          const level = inYear ? count === 0 ? 0 : count < 2 ? 1 : count < 4 ? 2 : count < 7 ? 3 : 4 : -1;
          const cell = colEl.createDiv({ cls: `mstat-yh-cell level-${level}`, attr: { title: inYear ? t("stats.dayCount", { date: dateStr, count }) : "" } });
          if (level === -1) cell.style.visibility = "hidden";
        }
      }
      this.renderMonthlyForYear(monthlyWrap, year);
      const yearTotal = this.memos.filter((m) => m.date.startsWith(`${year}-`)).length;
      monthlySubtitle.setText(t("stats.yearTotal", { year, total: yearTotal }));
    };
    const allYears = [...new Set(this.memos.map((m) => parseInt(m.date.substring(0, 4))))].sort();
    const navigate = (delta) => {
      const idx = allYears.indexOf(currentYear);
      const newIdx = Math.max(0, Math.min(allYears.length - 1, (idx < 0 ? 0 : idx) + delta));
      currentYear = allYears[newIdx];
      drawYear(currentYear);
    };
    prevBtn.addEventListener("click", () => navigate(-1));
    nextBtn.addEventListener("click", () => navigate(1));
    yearBtn.addEventListener("click", () => navigate(1));
    drawYear(currentYear);
    const legend = section.createDiv({ cls: "mstat-yh-legend" });
    legend.createSpan({ text: t("stats.low") });
    for (let i = 0; i <= 4; i++) legend.createDiv({ cls: `mstat-yh-cell level-${i}` });
    legend.createSpan({ text: t("stats.high") });
  }
  renderMonthlyForYear(parent, year) {
    parent.empty();
    const months = Array.from({ length: 12 }, (_, i) => ({
      key: `${year}-${pad3(i + 1)}`,
      label: t("stats.monthLabel", { month: i + 1 }),
      count: 0
    }));
    for (const m of this.memos) {
      if (!m.date.startsWith(`${year}-`)) continue;
      const mo = parseInt(m.date.substring(5, 7), 10) - 1;
      months[mo].count++;
    }
    const maxCount = Math.max(1, ...months.map((m) => m.count));
    const chart = parent.createDiv({ cls: "mstat-bar-chart" });
    for (const mo of months) {
      const col = chart.createDiv({ cls: "mstat-bar-col" });
      const bar = col.createDiv({ cls: "mstat-bar-wrap" }).createDiv({
        cls: "mstat-bar" + (mo.count === maxCount && mo.count > 0 ? " is-max" : "")
      });
      bar.style.height = `${mo.count / maxCount * 100}%`;
      bar.setAttr("title", t("stats.monthBarTitle", { key: mo.key, count: mo.count }));
      col.createDiv({ cls: "mstat-bar-num", text: mo.count > 0 ? String(mo.count) : "" });
      col.createDiv({ cls: "mstat-bar-label", text: mo.label });
    }
  }
  renderTagCloud(parent) {
    var _a;
    const tagMap = /* @__PURE__ */ new Map();
    for (const m of this.memos) for (const t2 of m.tags) if (!RESERVED_TAGS.has(t2)) tagMap.set(t2, ((_a = tagMap.get(t2)) != null ? _a : 0) + 1);
    if (tagMap.size === 0) return;
    const section = parent.createDiv({ cls: "mstat-section" });
    section.createDiv({ cls: "mstat-title", text: t("stats.tagCloud") });
    const sorted = [...tagMap.entries()].sort((a, b) => b[1] - a[1]);
    const maxCnt = sorted[0][1];
    const minCnt = sorted[sorted.length - 1][1];
    const cloud = section.createDiv({ cls: "mstat-cloud" });
    for (const [tag, cnt] of sorted) {
      const ratio = maxCnt === minCnt ? 1 : (cnt - minCnt) / (maxCnt - minCnt);
      const span = cloud.createSpan({ cls: "mstat-cloud-tag", text: `#${tag}`, attr: { title: t("stats.tagCountTitle", { count: cnt }) } });
      span.style.fontSize = `${12 + ratio * 10}px`;
      span.style.opacity = String(0.55 + ratio * 0.45);
    }
  }
  renderTopTags(parent) {
    var _a;
    const section = parent.createDiv({ cls: "mstat-section" });
    section.createDiv({ cls: "mstat-title", text: t("stats.topTags") });
    const tagMap = /* @__PURE__ */ new Map();
    for (const m of this.memos) for (const t2 of m.tags) if (!RESERVED_TAGS.has(t2)) tagMap.set(t2, ((_a = tagMap.get(t2)) != null ? _a : 0) + 1);
    const top10 = [...tagMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (top10.length === 0) {
      section.createDiv({ cls: "mstat-empty", text: t("stats.noTags") });
      return;
    }
    const maxCnt = top10[0][1];
    const list = section.createDiv({ cls: "mstat-hbar-list" });
    top10.forEach(([tag, cnt], i) => {
      const row = list.createDiv({ cls: "mstat-hbar-row" });
      row.createDiv({ cls: `mstat-hbar-rank rank-${Math.min(i + 1, 4)}` }).setText(String(i + 1));
      row.createDiv({ cls: "mstat-hbar-label", text: `#${tag}` });
      const bar = row.createDiv({ cls: "mstat-hbar-wrap" }).createDiv({ cls: "mstat-hbar" });
      bar.style.width = `${cnt / maxCnt * 100}%`;
      row.createDiv({ cls: "mstat-hbar-num", text: String(cnt) });
    });
  }
  renderHourlyChart(parent) {
    const section = parent.createDiv({ cls: "mstat-section" });
    const titleRow = section.createDiv({ cls: "mstat-title-row" });
    titleRow.createDiv({ cls: "mstat-title", text: t("stats.hourlyTitle") });
    titleRow.createDiv({ cls: "mstat-subtitle", text: t("stats.hourlySub", { n: this.memos.length }) });
    const hourly = new Array(24).fill(0);
    for (const m of this.memos) hourly[m.datetime.getHours()]++;
    const maxVal = Math.max(1, ...hourly);
    const chart = section.createDiv({ cls: "mstat-bar-chart mstat-bar-chart-hour" });
    for (let h = 0; h < 24; h++) {
      const col = chart.createDiv({ cls: "mstat-bar-col" });
      const bar = col.createDiv({ cls: "mstat-bar-wrap" }).createDiv({
        cls: "mstat-bar" + (hourly[h] === maxVal && hourly[h] > 0 ? " is-max" : "") + (hourly[h] === 0 ? " is-empty" : "")
      });
      bar.style.height = hourly[h] === 0 ? "2px" : `${hourly[h] / maxVal * 100}%`;
      bar.setAttr("title", t("stats.hourTitle", { hour: pad3(h), count: hourly[h] }));
      col.createDiv({ cls: "mstat-bar-label", text: pad3(h) });
    }
    const peakHour = hourly.indexOf(maxVal);
    section.createDiv({ cls: "mstat-desc" }).setText(`\u{1F4DD} \u4F60\u6700\u559C\u6B22\u5728 ${pad3(peakHour)}:00 \u5199\u7B14\u8BB0\uFF0C\u81F3\u4ECA\u7D2F\u8BA1 ${maxVal} \u6761\uFF08${(maxVal / this.memos.length * 100).toFixed(1)}%\uFF09`);
  }
  renderHighlights(parent) {
    var _a;
    const section = parent.createDiv({ cls: "mstat-section" });
    section.createDiv({ cls: "mstat-title", text: t("stats.highlights") });
    const list = section.createDiv({ cls: "mstat-fact-list" });
    const dateCounts = /* @__PURE__ */ new Map();
    for (const m of this.memos) dateCounts.set(m.date, ((_a = dateCounts.get(m.date)) != null ? _a : 0) + 1);
    const busiestDay = [...dateCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    this.renderFact(list, "\u{1F4C5}", `\u6700\u6D3B\u8DC3\u7684\u4E00\u5929\uFF1A${busiestDay[0]}\uFF0C\u90A3\u5929\u4F60\u5199\u4E86 ${busiestDay[1]} \u6761`);
    const longest = [...this.memos].sort((a, b) => b.content.length - a.content.length)[0];
    this.renderFact(list, "\u{1F4CF}", `\u6700\u957F\u7684\u4E00\u6761\uFF1A${longest.content.length} \u5B57\uFF08${longest.date}\uFF09`);
    const weekdayCounts = new Array(7).fill(0);
    for (const m of this.memos) weekdayCounts[m.datetime.getDay()]++;
    const maxWd = Math.max(...weekdayCounts);
    const peakWd = weekdayCounts.indexOf(maxWd);
    const weekdays = ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"];
    this.renderFact(list, "\u{1F4C6}", `${weekdays[peakWd]}\u662F\u4F60\u5199\u7B14\u8BB0\u6700\u591A\u7684\u4E00\u5929\uFF08${maxWd} \u6761\uFF09`);
    const activeDays = dateCounts.size;
    this.renderFact(list, "\u{1F4AB}", `\u6D3B\u8DC3\u65E5\u5E73\u5747\u6BCF\u5929 ${(this.memos.length / activeDays).toFixed(2)} \u6761`);
    const imgCount = this.memos.filter((m) => m.hasImage).length;
    if (imgCount > 0) this.renderFact(list, "\u{1F5BC}\uFE0F", `\u5171\u6709 ${imgCount} \u6761\u7B14\u8BB0\u5E26\u56FE\u7247\uFF08${(imgCount / this.memos.length * 100).toFixed(1)}%\uFF09`);
    const nightOwl = this.memos.filter((m) => {
      const h = m.datetime.getHours();
      return h >= 0 && h < 5;
    }).length;
    if (nightOwl > 0) this.renderFact(list, "\u{1F319}", `\u51CC\u6668 0-5 \u70B9\u4F60\u5199\u4E86 ${nightOwl} \u6761\uFF0C\u662F\u4E2A\u591C\u732B\u5B50\u5462`);
    this.renderFact(list, "\u{1F525}", `\u6700\u957F\u8FDE\u7EED\u6253\u5361\uFF1A${this.calcLongestStreak([...dateCounts.keys()])} \u5929`);
    const thisYear = (/* @__PURE__ */ new Date()).getFullYear();
    const thisYearCnt = this.memos.filter((m) => m.date.startsWith(`${thisYear}-`)).length;
    const lastYearCnt = this.memos.filter((m) => m.date.startsWith(`${thisYear - 1}-`)).length;
    if (lastYearCnt > 0) {
      const diff = thisYearCnt - lastYearCnt;
      const pct = (Math.abs(diff) / lastYearCnt * 100).toFixed(0);
      const trend = diff > 0 ? "\u591A" : diff < 0 ? "\u5C11" : "\u6301\u5E73";
      this.renderFact(list, "\u{1F4CA}", `\u4ECA\u5E74 ${thisYearCnt} \u6761\uFF0C\u6BD4\u53BB\u5E74 ${lastYearCnt} \u6761${trend} ${pct}%`);
    }
    const lastDate = [...dateCounts.keys()].sort().pop();
    if (lastDate) {
      const daysSince = Math.floor((Date.now() - (/* @__PURE__ */ new Date(lastDate + "T00:00:00")).getTime()) / 864e5);
      if (daysSince >= 3) this.renderFact(list, "\u{1F4AD}", `\u4F60\u5DF2\u7ECF ${daysSince} \u5929\u6CA1\u8BB0\u5F55\u65B0\u60F3\u6CD5\u4E86\uFF0C\u8981\u4E0D\u8981\u968F\u624B\u5199\u4E00\u6761\uFF1F`);
    }
  }
  renderFact(parent, icon, text) {
    const el = parent.createDiv({ cls: "mstat-fact" });
    el.createSpan({ cls: "mstat-fact-icon", text: icon });
    el.createSpan({ cls: "mstat-fact-text", text });
  }
  calcLongestStreak(dates) {
    if (dates.length === 0) return 0;
    const sorted = [...dates].sort();
    let max = 1, cur = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prev = (/* @__PURE__ */ new Date(sorted[i - 1] + "T00:00:00")).getTime();
      const curr = (/* @__PURE__ */ new Date(sorted[i] + "T00:00:00")).getTime();
      const diff = Math.round((curr - prev) / (24 * 60 * 60 * 1e3));
      if (diff === 1) {
        cur++;
        max = Math.max(max, cur);
      } else if (diff > 1) cur = 1;
    }
    return max;
  }
};
function toDateStr2(date) {
  return `${date.getFullYear()}-${pad3(date.getMonth() + 1)}-${pad3(date.getDate())}`;
}
function pad3(n) {
  return n.toString().padStart(2, "0");
}

// src/year-view.ts
var import_obsidian9 = require("obsidian");
var MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var WEEKDAY_KEYS2 = ["calendar.wd.0", "calendar.wd.1", "calendar.wd.2", "calendar.wd.3", "calendar.wd.4", "calendar.wd.5", "calendar.wd.6"];
var MemoriaYearView = class extends import_obsidian9.ItemView {
  constructor(leaf, store) {
    super(leaf);
    this.memos = [];
    this.unsubscribe = null;
    this.store = store;
    this.year = (/* @__PURE__ */ new Date()).getFullYear();
  }
  getViewType() {
    return VIEW_TYPE_YEAR;
  }
  getDisplayText() {
    return t("year.viewTitle");
  }
  getIcon() {
    return "calendar-days";
  }
  async onOpen() {
    this.contentEl.addClass("memoria-year-view");
    this.memos = this.store.getAll();
    this.render();
    this.unsubscribe = this.store.onChange(() => {
      this.memos = this.store.getAll();
      this.render();
    });
  }
  async onClose() {
    var _a;
    (_a = this.unsubscribe) == null ? void 0 : _a.call(this);
  }
  render() {
    var _a, _b;
    const el = this.contentEl;
    el.empty();
    const header = el.createDiv({ cls: "memoria-year-header" });
    header.createDiv({ cls: "memoria-year-title", text: String(this.year) });
    const nav = header.createDiv({ cls: "memoria-year-nav" });
    const prevBtn = nav.createEl("button", { cls: "memoria-year-nav-btn", attr: { "aria-label": t("year.prevYear") } });
    (0, import_obsidian9.setIcon)(prevBtn, "chevron-left");
    const todayBtn = nav.createEl("button", { cls: "memoria-year-today-btn", text: t("year.today") });
    const nextBtn = nav.createEl("button", { cls: "memoria-year-nav-btn", attr: { "aria-label": t("year.nextYear") } });
    (0, import_obsidian9.setIcon)(nextBtn, "chevron-right");
    prevBtn.addEventListener("click", () => {
      this.year--;
      this.render();
    });
    nextBtn.addEventListener("click", () => {
      this.year++;
      this.render();
    });
    todayBtn.addEventListener("click", () => {
      this.year = (/* @__PURE__ */ new Date()).getFullYear();
      this.render();
    });
    if (this.memos.length === 0) {
      el.createDiv({ cls: "myv-empty", text: t("empty.default") });
      return;
    }
    const dateCounts = /* @__PURE__ */ new Map();
    for (const m of this.memos) dateCounts.set(m.date, ((_a = dateCounts.get(m.date)) != null ? _a : 0) + 1);
    const today = /* @__PURE__ */ new Date();
    const todayStr = `${today.getFullYear()}-${pad4(today.getMonth() + 1)}-${pad4(today.getDate())}`;
    const grid = el.createDiv({ cls: "memoria-year-grid" });
    for (let month = 0; month < 12; month++) {
      const monthEl = grid.createDiv({ cls: "memoria-year-month" });
      monthEl.createDiv({ cls: "memoria-year-month-label", text: MONTH_LABELS[month] });
      const weekHead = monthEl.createDiv({ cls: "memoria-year-weekhead" });
      for (let w = 0; w < WEEKDAY_KEYS2.length; w++) weekHead.createDiv({ cls: "memoria-year-wday", text: t(WEEKDAY_KEYS2[w]) });
      const daysGrid = monthEl.createDiv({ cls: "memoria-year-grid-days" });
      const firstDay = new Date(this.year, month, 1);
      const daysInMonth = new Date(this.year, month + 1, 0).getDate();
      const startOffset = firstDay.getDay();
      const prevMonthDays = new Date(this.year, month, 0).getDate();
      for (let i = startOffset - 1; i >= 0; i--) {
        const d = prevMonthDays - i;
        daysGrid.createDiv({
          cls: "memoria-year-day is-out",
          text: String(d)
        });
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${this.year}-${pad4(month + 1)}-${pad4(d)}`;
        const count = (_b = dateCounts.get(dateStr)) != null ? _b : 0;
        const level = count === 0 ? 0 : count < 2 ? 1 : count < 4 ? 2 : count < 7 ? 3 : 4;
        const cls = "memoria-year-day" + (count > 0 ? ` has-memo level-${level}` : "") + (dateStr === todayStr ? " is-today" : "");
        daysGrid.createDiv({
          cls,
          text: String(d),
          attr: { title: count > 0 ? t("stats.dayCount", { date: dateStr, count }) : dateStr }
        });
      }
      const remaining = 7 - (startOffset + daysInMonth) % 7;
      if (remaining < 7) {
        for (let d = 1; d <= remaining; d++) {
          daysGrid.createDiv({
            cls: "memoria-year-day is-out",
            text: String(d)
          });
        }
      }
    }
    const activeDays = new Set(this.memos.map((m) => m.date)).size;
    const yearMemos = this.memos.filter((m) => m.date.startsWith(String(this.year)));
    const foot = el.createDiv({ cls: "memoria-year-foot" });
    foot.createSpan({ cls: "memoria-year-foot-item", text: t("year.memos", { n: yearMemos.length }) });
    foot.createSpan({ cls: "memoria-year-foot-sep", text: "\xB7" });
    foot.createSpan({ cls: "memoria-year-foot-item", text: t("year.activeDays", { n: activeDays }) });
  }
};
function pad4(n) {
  return n.toString().padStart(2, "0");
}

// src/trash-view.ts
var import_obsidian10 = require("obsidian");
var MemoriaTrashView = class extends import_obsidian10.ItemView {
  constructor(leaf, store) {
    super(leaf);
    this.store = store;
    this.items = [];
    this.query = "";
    this.childComponent = new import_obsidian10.Component();
  }
  getViewType() {
    return VIEW_TYPE_TRASH;
  }
  getDisplayText() {
    return t("trash.viewTitle");
  }
  getIcon() {
    return "trash-2";
  }
  async onOpen() {
    this.contentEl.addClass("memoria-root", "memoria-trash-view");
    await this.reload();
  }
  async onClose() {
    this.childComponent.unload();
  }
  /** 2026-06-03: 回收站视图每次操作后重新解析 _trash.md，避免行号 range 因删除/恢复后失效 */
  async reload() {
    try {
      this.items = await this.store.getTrashItems();
      this.render();
    } catch (e) {
      console.error("[Memoria] \u56DE\u6536\u7AD9\u8BFB\u53D6\u5931\u8D25:", e);
      new import_obsidian10.Notice(t("trash.loadFailed", { msg: e instanceof Error ? e.message : String(e) }));
    }
  }
  render() {
    const el = this.contentEl;
    el.empty();
    this.childComponent.unload();
    this.childComponent = new import_obsidian10.Component();
    this.childComponent.load();
    const header = el.createDiv({ cls: "memoria-trash-header" });
    const title = header.createDiv({ cls: "memoria-trash-title" });
    (0, import_obsidian10.setIcon)(title.createSpan({ cls: "memoria-trash-title-icon" }), "trash-2");
    title.createSpan({ text: t("trash.viewTitle") });
    const actions = header.createDiv({ cls: "memoria-trash-actions" });
    const refreshBtn = actions.createEl("button", { cls: "memoria-icon-btn", attr: { "aria-label": t("common.refresh") } });
    (0, import_obsidian10.setIcon)(refreshBtn, "refresh-cw");
    refreshBtn.addEventListener("click", () => this.reload());
    const openBtn = actions.createEl("button", { cls: "memoria-icon-btn", attr: { "aria-label": t("trash.openFile") } });
    (0, import_obsidian10.setIcon)(openBtn, "file-text");
    openBtn.addEventListener("click", () => this.openTrashFile());
    const clearBtn = actions.createEl("button", { cls: "memoria-icon-btn", attr: { "aria-label": t("trash.clear") } });
    (0, import_obsidian10.setIcon)(clearBtn, "trash");
    clearBtn.addEventListener("click", async () => {
      if (!this.items.length) return;
      if (!confirm(t("trash.clearConfirm", { n: this.items.length }))) return;
      try {
        await this.store.clearTrash();
        new import_obsidian10.Notice(t("trash.cleared"));
        await this.reload();
      } catch (e) {
        new import_obsidian10.Notice(t("trash.clearFailed", { msg: e instanceof Error ? e.message : String(e) }));
      }
    });
    const searchWrap = el.createDiv({ cls: "memoria-trash-search-wrap" });
    (0, import_obsidian10.setIcon)(searchWrap.createSpan({ cls: "memoria-search-icon" }), "search");
    const search = searchWrap.createEl("input", {
      cls: "memoria-trash-search",
      attr: { placeholder: t("trash.searchPlaceholder"), type: "text" },
      value: this.query
    });
    search.addEventListener("input", () => {
      this.query = search.value.trim();
      this.renderList();
    });
    el.createDiv({ cls: "memoria-trash-list" });
    this.renderList();
  }
  renderList() {
    const list = this.contentEl.querySelector(".memoria-trash-list");
    if (!list) return;
    list.empty();
    const filtered = this.getFilteredItems();
    const meta = list.createDiv({ cls: "memoria-list-meta" });
    meta.createDiv({ cls: "memoria-list-meta-left", text: t("trash.total", { n: filtered.length }) });
    if (!filtered.length) {
      const empty = list.createDiv({ cls: "memoria-empty" });
      empty.createDiv({ cls: "memoria-empty-text", text: this.items.length ? t("trash.noMatch") : t("trash.empty") });
      empty.createDiv({ cls: "memoria-empty-sub", text: t("trash.emptySub") });
      return;
    }
    for (const item of filtered) this.renderTrashCard(list, item);
  }
  getFilteredItems() {
    if (!this.query) return this.items;
    const q = this.query.toLowerCase();
    return this.items.filter(
      (item) => item.content.toLowerCase().includes(q) || item.sourceFile.toLowerCase().includes(q) || item.deletedAt.toLowerCase().includes(q) || item.originalDate.includes(q) || item.originalTime.includes(q)
    );
  }
  renderTrashCard(parent, item) {
    const card = parent.createDiv({ cls: "memoria-trash-card" });
    const head = card.createDiv({ cls: "memoria-trash-card-head" });
    const meta = head.createDiv({ cls: "memoria-trash-card-meta" });
    meta.createDiv({ cls: "memoria-trash-card-time", text: t("trash.originalTime", { date: item.originalDate, time: item.originalTime }) });
    meta.createDiv({ cls: "memoria-trash-card-source", text: t("trash.deletedAt", { deletedAt: item.deletedAt, source: item.sourceFile }) });
    const actions = head.createDiv({ cls: "memoria-trash-card-actions" });
    const restoreBtn = actions.createEl("button", { cls: "memoria-small-btn" });
    (0, import_obsidian10.setIcon)(restoreBtn.createSpan(), "rotate-ccw");
    restoreBtn.createSpan({ text: t("trash.restore") });
    restoreBtn.addEventListener("click", async () => {
      try {
        await this.store.restoreTrashItem(item.id);
        new import_obsidian10.Notice(t("trash.restored"));
        await this.reload();
      } catch (e) {
        new import_obsidian10.Notice(t("trash.restoreFailed", { msg: e instanceof Error ? e.message : String(e) }));
      }
    });
    const deleteBtn = actions.createEl("button", { cls: "memoria-small-btn is-danger" });
    (0, import_obsidian10.setIcon)(deleteBtn.createSpan(), "trash");
    deleteBtn.createSpan({ text: t("trash.purge") });
    deleteBtn.addEventListener("click", async () => {
      if (!confirm(t("trash.purgeConfirm"))) return;
      try {
        await this.store.removeTrashItem(item.id);
        new import_obsidian10.Notice(t("trash.purged"));
        await this.reload();
      } catch (e) {
        new import_obsidian10.Notice(t("trash.deleteFailed", { msg: e instanceof Error ? e.message : String(e) }));
      }
    });
    const body = card.createDiv({ cls: "memoria-card-body memoria-trash-card-body" });
    import_obsidian10.MarkdownRenderer.render(this.app, normalizeForRender(item.content), body, item.sourceFile, this.childComponent);
  }
  async openTrashFile() {
    const file = this.app.vault.getAbstractFileByPath(this.store.getTrashFilePath());
    if (file instanceof import_obsidian10.TFile) await this.app.workspace.getLeaf(false).openFile(file);
    else new import_obsidian10.Notice(t("trash.fileMissing"));
  }
};

// src/tag-tools-view.ts
var import_obsidian11 = require("obsidian");
var MemoriaTagToolsView = class extends import_obsidian11.ItemView {
  constructor(leaf, store) {
    super(leaf);
    this.store = store;
    this.tags = [];
    this.query = "";
  }
  getViewType() {
    return VIEW_TYPE_TAG_TOOLS;
  }
  getDisplayText() {
    return t("tagTools.viewTitle");
  }
  getIcon() {
    return "tags";
  }
  async onOpen() {
    this.contentEl.addClass("memoria-root", "memoria-tag-tools-view");
    await this.reload();
  }
  async onClose() {
  }
  /** 2026-06-03: 标签整理视图每次进入先刷新 store，避免基于旧缓存批量改写标签 */
  async reload() {
    try {
      await this.store.reloadAll();
      this.tags = this.store.getTagStats();
      this.render();
    } catch (e) {
      console.error("[Memoria] \u6807\u7B7E\u6574\u7406\u52A0\u8F7D\u5931\u8D25:", e);
      new import_obsidian11.Notice(t("tagTools.loadFailed", { msg: e instanceof Error ? e.message : String(e) }));
    }
  }
  render() {
    const el = this.contentEl;
    el.empty();
    const header = el.createDiv({ cls: "memoria-tag-tools-header" });
    const title = header.createDiv({ cls: "memoria-tag-tools-title" });
    (0, import_obsidian11.setIcon)(title.createSpan({ cls: "memoria-tag-tools-title-icon" }), "tags");
    title.createSpan({ text: t("tagTools.viewTitle") });
    const actions = header.createDiv({ cls: "memoria-tag-tools-actions" });
    const refreshBtn = actions.createEl("button", { cls: "memoria-icon-btn", attr: { "aria-label": t("common.refresh") } });
    (0, import_obsidian11.setIcon)(refreshBtn, "refresh-cw");
    refreshBtn.addEventListener("click", () => this.reload());
    const summary = el.createDiv({ cls: "memoria-tag-tools-summary" });
    summary.createDiv({ cls: "memoria-tag-tools-stat", text: t("tagTools.tagCount", { n: this.tags.length }) });
    summary.createDiv({
      cls: "memoria-tag-tools-stat",
      text: t("tagTools.lowFreqCount", { n: this.tags.filter((t2) => t2.memoCount <= 1).length })
    });
    const searchWrap = el.createDiv({ cls: "memoria-tag-tools-search-wrap" });
    (0, import_obsidian11.setIcon)(searchWrap.createSpan({ cls: "memoria-search-icon" }), "search");
    const search = searchWrap.createEl("input", {
      cls: "memoria-tag-tools-search",
      attr: { placeholder: t("tagTools.searchPlaceholder"), type: "text" },
      value: this.query
    });
    search.addEventListener("input", () => {
      this.query = search.value.trim();
      this.renderList();
    });
    el.createDiv({ cls: "memoria-tag-tools-list" });
    this.renderList();
  }
  renderList() {
    const list = this.contentEl.querySelector(".memoria-tag-tools-list");
    if (!list) return;
    list.empty();
    const filtered = this.getFilteredTags();
    const meta = list.createDiv({ cls: "memoria-list-meta" });
    meta.createDiv({ cls: "memoria-list-meta-left", text: t("tagTools.total", { n: filtered.length }) });
    if (!filtered.length) {
      const empty = list.createDiv({ cls: "memoria-empty" });
      empty.createDiv({ cls: "memoria-empty-text", text: this.tags.length ? t("tagTools.noMatch") : t("tagTools.empty") });
      empty.createDiv({ cls: "memoria-empty-sub", text: t("tagTools.emptySub") });
      return;
    }
    for (const tag of filtered) this.renderTagRow(list, tag);
  }
  getFilteredTags() {
    if (!this.query) return this.tags;
    const q = this.query.replace(/^#/, "").toLowerCase();
    return this.tags.filter((tag) => tag.name.toLowerCase().includes(q));
  }
  renderTagRow(parent, tag) {
    const row = parent.createDiv({ cls: "memoria-tag-tool-row" });
    const info = row.createDiv({ cls: "memoria-tag-tool-info" });
    info.createDiv({ cls: "memoria-tag-tool-name", text: `#${tag.name}` });
    info.createDiv({ cls: "memoria-tag-tool-meta", text: t("tagTools.memoCount", { n: tag.memoCount }) });
    const actions = row.createDiv({ cls: "memoria-tag-tool-actions" });
    const renameBtn = actions.createEl("button", { cls: "memoria-small-btn" });
    (0, import_obsidian11.setIcon)(renameBtn.createSpan(), "replace");
    renameBtn.createSpan({ text: t("tagTools.rename") });
    renameBtn.addEventListener("click", () => this.showRenameModal(tag));
    const removeBtn = actions.createEl("button", { cls: "memoria-small-btn is-danger" });
    (0, import_obsidian11.setIcon)(removeBtn.createSpan(), "tag-x");
    removeBtn.createSpan({ text: t("tagTools.remove") });
    removeBtn.addEventListener("click", () => this.confirmRemoveTag(tag));
  }
  showRenameModal(tag) {
    const backdrop = document.body.createDiv({ cls: "memoria-modal-backdrop" });
    const modal = backdrop.createDiv({ cls: "memoria-modal memoria-text-modal" });
    modal.createDiv({ cls: "memoria-modal-title", text: t("tagTools.renameTitle", { tag: tag.name }) });
    modal.createDiv({ cls: "memoria-modal-label", text: t("tagTools.newName") });
    const input = modal.createEl("input", {
      cls: "memoria-modal-input",
      attr: { type: "text", placeholder: t("tagTools.namePlaceholder") },
      value: tag.name
    });
    const affected = this.getAffectedMemoCount(tag.name);
    modal.createDiv({
      cls: "memoria-modal-hint",
      text: t("tagTools.renameHint", { tag: tag.name, n: affected })
    });
    const btns = modal.createDiv({ cls: "memoria-modal-btns" });
    const cancelBtn = btns.createEl("button", { text: t("common.cancel") });
    const saveBtn = btns.createEl("button", { text: t("tagTools.execute"), cls: "mod-cta" });
    const close = () => backdrop.remove();
    const submit = async () => {
      const next = input.value.trim();
      if (!next || next === tag.name) {
        close();
        return;
      }
      if (!confirm(t("tagTools.renameConfirm", { old: tag.name, next, n: affected }))) return;
      try {
        const count = await this.store.renameTag(tag.name, next);
        new import_obsidian11.Notice(t("tagTools.renamed", { n: count }));
        close();
        await this.reload();
      } catch (e) {
        new import_obsidian11.Notice(t("tagTools.updateFailed", { msg: e instanceof Error ? e.message : String(e) }));
      }
    };
    cancelBtn.addEventListener("click", close);
    saveBtn.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
      else if (e.key === "Escape") close();
    });
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });
    setTimeout(() => {
      input.focus();
      input.select();
    }, 20);
  }
  async confirmRemoveTag(tag) {
    const affected = this.getAffectedMemoCount(tag.name);
    if (!confirm(t("tagTools.removeConfirm", { n: affected, tag: tag.name }))) return;
    try {
      const count = await this.store.removeTag(tag.name);
      new import_obsidian11.Notice(t("tagTools.removed", { n: count }));
      await this.reload();
    } catch (e) {
      new import_obsidian11.Notice(t("tagTools.removeFailed", { msg: e instanceof Error ? e.message : String(e) }));
    }
  }
  getAffectedMemoCount(tag) {
    return this.store.getAll().filter(
      (memo) => memo.tags.some((t2) => t2 === tag || t2.startsWith(tag + "/"))
    ).length;
  }
};

// src/settings.ts
var import_obsidian12 = require("obsidian");
var MemoriaSettingTab = class extends import_obsidian12.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: t("settings.title") });
    new import_obsidian12.Setting(containerEl).setName(t("settings.folder.name")).setDesc(t("settings.folder.desc")).addText((tx) => tx.setPlaceholder("Memoria").setValue(this.plugin.settings.folder).onChange(async (v) => {
      this.plugin.settings.folder = v.trim() || "Memoria";
      await this.plugin.saveSettings();
      await this.plugin.store.reloadAll();
    }));
    new import_obsidian12.Setting(containerEl).setName(t("settings.attachFolder.name")).setDesc(t("settings.attachFolder.desc")).addText((tx) => tx.setPlaceholder("Memoria/attachments").setValue(this.plugin.settings.attachmentFolder).onChange(async (v) => {
      this.plugin.settings.attachmentFolder = v.trim() || "Memoria/attachments";
      await this.plugin.saveSettings();
    }));
    new import_obsidian12.Setting(containerEl).setName(t("settings.promoteFolder.name")).setDesc(t("settings.promoteFolder.desc")).addText((tx) => tx.setPlaceholder("Memoria/notes").setValue(this.plugin.settings.promoteFolder).onChange(async (v) => {
      this.plugin.settings.promoteFolder = v.trim() || "Memoria/notes";
      await this.plugin.saveSettings();
    }));
    new import_obsidian12.Setting(containerEl).setName(t("settings.sidebarTags.name")).setDesc(t("settings.sidebarTags.desc")).addToggle((tg) => tg.setValue(this.plugin.settings.showSidebarTags).onChange(async (v) => {
      this.plugin.settings.showSidebarTags = v;
      await this.plugin.saveSettings();
    }));
    new import_obsidian12.Setting(containerEl).setName(t("settings.clearAfterSave.name")).addToggle((tg) => tg.setValue(this.plugin.settings.clearAfterSave).onChange(async (v) => {
      this.plugin.settings.clearAfterSave = v;
      await this.plugin.saveSettings();
    }));
    new import_obsidian12.Setting(containerEl).setName(t("settings.pageSize.name")).setDesc(t("settings.pageSize.desc")).addSlider((sl) => sl.setLimits(10, 200, 10).setValue(this.plugin.settings.pageSize).setDynamicTooltip().onChange(async (v) => {
      this.plugin.settings.pageSize = v;
      await this.plugin.saveSettings();
    }));
    new import_obsidian12.Setting(containerEl).setName(t("settings.useTrash.name")).setDesc(t("settings.useTrash.desc")).addToggle((tg) => tg.setValue(this.plugin.settings.useTrash).onChange(async (v) => {
      this.plugin.settings.useTrash = v;
      await this.plugin.saveSettings();
    }));
    new import_obsidian12.Setting(containerEl).setName(t("settings.trashMax.name")).setDesc(t("settings.trashMax.desc")).addDropdown((dd) => dd.addOption("100", t("settings.trash.100")).addOption("300", t("settings.trash.300")).addOption("500", t("settings.trash.500")).addOption("1000", t("settings.trash.1000")).addOption("3000", t("settings.trash.3000")).addOption("0", t("settings.trash.0")).setValue(String(this.plugin.settings.trashMaxItems)).onChange(async (v) => {
      this.plugin.settings.trashMaxItems = parseInt(v, 10);
      await this.plugin.saveSettings();
    }));
    new import_obsidian12.Setting(containerEl).setName(t("settings.exportTheme.name")).setDesc(t("settings.exportTheme.desc")).addDropdown((dd) => dd.addOption("auto", t("settings.exportTheme.auto")).addOption("random", t("settings.exportTheme.random")).addOption("paper", t("settings.exportTheme.paper")).addOption("kraft", t("settings.exportTheme.kraft")).addOption("mint", t("settings.exportTheme.mint")).addOption("peach", t("settings.exportTheme.peach")).addOption("sky", t("settings.exportTheme.sky")).addOption("lavender", t("settings.exportTheme.lavender")).addOption("midnight", t("settings.exportTheme.midnight")).addOption("charcoal", t("settings.exportTheme.charcoal")).setValue(this.plugin.settings.exportTheme).onChange(async (v) => {
      this.plugin.settings.exportTheme = v;
      await this.plugin.saveSettings();
    }));
    new import_obsidian12.Setting(containerEl).setName(t("settings.collapse.name")).setDesc(t("settings.collapse.desc")).addDropdown((dd) => dd.addOption("0", t("settings.collapse.0")).addOption("4", t("settings.collapse.4")).addOption("6", t("settings.collapse.6")).addOption("8", t("settings.collapse.8")).addOption("12", t("settings.collapse.12")).addOption("20", t("settings.collapse.20")).setValue(String(this.plugin.settings.collapseLineLimit)).onChange(async (v) => {
      this.plugin.settings.collapseLineLimit = parseInt(v, 10);
      await this.plugin.saveSettings();
    }));
    new import_obsidian12.Setting(containerEl).setName(t("settings.dailyGoal.name")).setDesc(t("settings.dailyGoal.desc")).addSlider((sl) => sl.setLimits(0, 30, 1).setValue(this.plugin.settings.dailyGoal).setDynamicTooltip().onChange(async (v) => {
      this.plugin.settings.dailyGoal = v;
      await this.plugin.saveSettings();
    }));
    containerEl.createEl("h3", { text: t("settings.heading.newFeatures") });
    new import_obsidian12.Setting(containerEl).setName(t("settings.density.name")).setDesc(t("settings.density.desc")).addDropdown((dd) => dd.addOption("cozy", t("settings.density.cozy")).addOption("compact", t("settings.density.compact")).setValue(this.plugin.settings.density).onChange(async (v) => {
      this.plugin.settings.density = v;
      await this.plugin.saveSettings();
    }));
    new import_obsidian12.Setting(containerEl).setName(t("settings.vim.name")).setDesc(t("settings.vim.desc")).addToggle((tg) => tg.setValue(this.plugin.settings.enableVimKeys).onChange(async (v) => {
      this.plugin.settings.enableVimKeys = v;
      await this.plugin.saveSettings();
    }));
    new import_obsidian12.Setting(containerEl).setName(t("settings.mood.name")).setDesc(t("settings.mood.desc")).addToggle((tg) => tg.setValue(this.plugin.settings.enableMoodColoring).onChange(async (v) => {
      this.plugin.settings.enableMoodColoring = v;
      await this.plugin.saveSettings();
    }));
    new import_obsidian12.Setting(containerEl).setName(t("settings.smartReview.name")).setDesc(t("settings.smartReview.desc")).addToggle((tg) => tg.setValue(this.plugin.settings.enableSmartReview).onChange(async (v) => {
      this.plugin.settings.enableSmartReview = v;
      await this.plugin.saveSettings();
    }));
    new import_obsidian12.Setting(containerEl).setName(t("settings.language.name")).setDesc(t("settings.language.desc")).addDropdown((dd) => dd.addOption("auto", t("settings.language.auto")).addOption("zh-CN", t("settings.language.zh")).addOption("en-US", t("settings.language.en")).setValue(this.plugin.settings.language).onChange(async (v) => {
      this.plugin.settings.language = v;
      setLang(v);
      await this.plugin.saveSettings();
      this.plugin.store.notifyChange();
      this.display();
    }));
    containerEl.createEl("h3", { text: t("settings.heading.about") });
    const desc = containerEl.createEl("p", { cls: "setting-item-description" });
    desc.appendText(t("settings.about.p1"));
    desc.createEl("code", { text: "## yyyy-MM-dd" });
    desc.appendText(" + ");
    desc.createEl("code", { text: "- HH:MM content" });
    desc.appendText(t("settings.about.p2"));
    new import_obsidian12.Setting(containerEl).setName(t("settings.repo.name")).setDesc(t("settings.repo.desc")).addButton((btn) => btn.setButtonText(t("settings.repo.btn")).onClick(() => {
      window.open("https://github.com/gzcm/obsidian-memoria");
    }));
    containerEl.createEl("p", { cls: "setting-item-description", text: t("settings.version", { ver: "2.0.3" }) });
  }
};

// src/main.ts
var MemoriaPlugin = class extends import_obsidian13.Plugin {
  async onload() {
    await this.loadSettings();
    setLang(this.settings.language);
    this.store = new MemoStore(this.app, this.settings);
    this.registerView(VIEW_TYPE_MEMORIA, (leaf) => new MemoriaView(leaf, this.store, this.settings, () => this.saveSettings()));
    this.registerView(VIEW_TYPE_STATS, (leaf) => new MemoriaStatsView(leaf, this.store));
    this.registerView(VIEW_TYPE_YEAR, (leaf) => new MemoriaYearView(leaf, this.store));
    this.registerView(VIEW_TYPE_TRASH, (leaf) => new MemoriaTrashView(leaf, this.store));
    this.registerView(VIEW_TYPE_TAG_TOOLS, (leaf) => new MemoriaTagToolsView(leaf, this.store));
    this.addRibbonIcon("feather", t("toolbar.more"), () => this.activateLeaf(VIEW_TYPE_MEMORIA));
    this.addCommand({ id: "open-memoria", name: t("toolbar.more"), callback: () => this.activateLeaf(VIEW_TYPE_MEMORIA) });
    this.addCommand({ id: "open-memoria-stats", name: t("toolbar.statsReport"), callback: () => this.activateLeaf(VIEW_TYPE_STATS) });
    this.addCommand({ id: "open-memoria-trash", name: t("toolbar.openTrashCmd"), callback: () => this.activateLeaf(VIEW_TYPE_TRASH) });
    this.addCommand({ id: "open-memoria-tag-tools", name: t("toolbar.openTagToolsCmd"), callback: () => this.activateLeaf(VIEW_TYPE_TAG_TOOLS) });
    this.addCommand({ id: "memoria-quick-capture", name: t("toolbar.quickCaptureCmd", { submit: t("input.submit") }), callback: () => this.quickCapture() });
    this.addCommand({
      id: "memoria-normalize-all",
      name: t("notice.normalizing"),
      callback: () => this.normalizeAll()
    });
    this.registerEvent(this.app.vault.on("modify", (f) => {
      if (f instanceof import_obsidian13.TFile && this.store.isInFolder(f)) this.store.reloadFile(f);
    }));
    this.registerEvent(this.app.vault.on("delete", (f) => {
      if (f instanceof import_obsidian13.TFile) this.store.removeFile(f.path);
    }));
    this.registerEvent(this.app.vault.on("create", (f) => {
      if (f instanceof import_obsidian13.TFile && this.store.isInFolder(f)) this.store.reloadFile(f);
    }));
    this.registerEvent(this.app.vault.on("rename", (f, oldPath) => {
      this.store.removeFile(oldPath);
      if (f instanceof import_obsidian13.TFile && this.store.isInFolder(f)) this.store.reloadFile(f);
    }));
    this.addSettingTab(new MemoriaSettingTab(this.app, this));
  }
  async onunload() {
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  /** 激活（或聚焦已存在）的指定类型视图 leaf */
  async activateLeaf(type) {
    const existing = this.app.workspace.getLeavesOfType(type);
    if (existing.length) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
  async normalizeAll() {
    var _a;
    if (!confirm(t("notice.normalizeConfirm"))) return;
    new import_obsidian13.Notice(t("notice.normalizing"));
    try {
      await this.store.reloadAll();
      const all = this.store.getAll();
      const byFile = /* @__PURE__ */ new Map();
      for (const m of all) {
        const arr = (_a = byFile.get(m.file)) != null ? _a : [];
        arr.push(m);
        byFile.set(m.file, arr);
      }
      let count = 0;
      for (const [filePath, memos] of byFile) {
        memos.sort((a, b) => b.range[0] - a.range[0]);
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof import_obsidian13.TFile)) continue;
        let raw = await this.app.vault.read(file);
        for (const m of memos) {
          const lines = raw.split(/\r?\n/);
          const [start, end] = m.range;
          const newBlock = buildMemoBlock(m.time, m.content).split("\n");
          lines.splice(start, end - start + 1, ...newBlock);
          raw = lines.join("\n");
          count++;
        }
        await this.app.vault.modify(file, raw);
      }
      await this.store.reloadAll();
      new import_obsidian13.Notice(t("notice.normalizeDone", { n: count }));
    } catch (e) {
      console.error(e);
      new import_obsidian13.Notice(t("notice.normalizeFailed", { msg: e instanceof Error ? e.message : String(e) }));
    }
  }
  quickCapture() {
    const backdrop = document.createElement("div");
    backdrop.addClass("memoria-modal-backdrop");
    const modal = backdrop.createDiv({ cls: "memoria-modal" });
    modal.createDiv({ cls: "memoria-modal-title", text: t("input.placeholder") });
    const textarea = modal.createEl("textarea", {
      cls: "memoria-modal-textarea",
      attr: { placeholder: "Ctrl+Enter / Cmd+Enter" }
    });
    const btns = modal.createDiv({ cls: "memoria-modal-btns" });
    const cancelBtn = btns.createEl("button", { text: t("common.cancel") });
    const sendBtn = btns.createEl("button", { text: t("input.submit"), cls: "mod-cta" });
    document.body.appendChild(backdrop);
    setTimeout(() => textarea.focus(), 20);
    const close = () => backdrop.remove();
    const submit = async () => {
      const text = textarea.value.trim();
      if (!text) {
        close();
        return;
      }
      try {
        await this.store.addMemo(text);
        new import_obsidian13.Notice(t("notice.saved"));
        close();
      } catch (e) {
        new import_obsidian13.Notice(t("notice.saveFailed", { msg: e instanceof Error ? e.message : String(e) }));
      }
    };
    cancelBtn.addEventListener("click", close);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });
    textarea.addEventListener("keydown", (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        submit();
      } else if (e.key === "Escape") close();
    });
    sendBtn.addEventListener("click", submit);
  }
};

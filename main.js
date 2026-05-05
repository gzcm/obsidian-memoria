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
var import_obsidian8 = require("obsidian");

// src/types.ts
var DEFAULT_SETTINGS = {
  folder: "Memoria",
  attachmentFolder: "Memoria/attachments",
  clearAfterSave: true,
  pageSize: 50,
  showSidebarTags: false,
  useTrash: true
};
var VIEW_TYPE_MEMORIA = "memoria-view";
var VIEW_TYPE_STATS = "memoria-stats-view";
var TAG_PINNED = "\u7F6E\u9876";
var TAG_STARRED = "\u6536\u85CF";
var RESERVED_TAGS = /* @__PURE__ */ new Set([TAG_PINNED, TAG_STARRED]);

// src/store.ts
var import_obsidian = require("obsidian");

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
  const re = /#([A-Za-z0-9_一-鿿][A-Za-z0-9_一-鿿/]*)/g;
  const tags = /* @__PURE__ */ new Set();
  let m;
  while ((m = re.exec(content)) !== null) tags.add(m[1]);
  return [...tags];
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

// src/store.ts
var MemoStore = class {
  constructor(app, settings) {
    this.app = app;
    this.settings = settings;
    this.memos = [];
    this.listeners = [];
    this.loading = false;
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
  getAll() {
    return this.memos;
  }
  async reloadAll() {
    if (this.loading) return;
    this.loading = true;
    try {
      const files = this.collectFiles();
      const all = [];
      for (const file of files) {
        const content = await this.app.vault.read(file);
        all.push(...parseMemos(file.path, content));
      }
      this.sortMemos(all);
      this.memos = all;
      this.emit();
    } finally {
      this.loading = false;
    }
  }
  async reloadFile(file) {
    if (!this.isInFolder(file)) return;
    const content = await this.app.vault.read(file);
    const parsed = parseMemos(file.path, content);
    this.memos = this.memos.filter((m) => m.file !== file.path);
    this.memos.push(...parsed);
    this.sortMemos(this.memos);
    this.emit();
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
  collectFiles() {
    const folder = (0, import_obsidian.normalizePath)(this.settings.folder);
    return this.app.vault.getMarkdownFiles().filter((f) => {
      return f.path === `${folder}/${f.name}` || f.path.startsWith(`${folder}/`);
    });
  }
  isInFolder(file) {
    const folder = (0, import_obsidian.normalizePath)(this.settings.folder);
    return file.path.startsWith(`${folder}/`);
  }
  async addMemo(content, date = /* @__PURE__ */ new Date()) {
    content = content.trim();
    if (!content) return;
    const year = date.getFullYear().toString();
    const dateStr = formatDate(date);
    const timeStr = formatTime(date);
    const weekday = getWeekday(date);
    const folder = (0, import_obsidian.normalizePath)(this.settings.folder);
    await this.ensureFolder(folder);
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
    const [start, end] = memo.range;
    const newBlock = buildMemoBlock(memo.time, newContent).split("\n");
    lines.splice(start, end - start + 1, ...newBlock);
    await this.app.vault.modify(file, lines.join("\n"));
    await this.reloadFile(file);
  }
  async deleteMemo(memo) {
    const file = this.app.vault.getAbstractFileByPath(memo.file);
    if (!file) return;
    if (this.settings.useTrash) {
      try {
        await this.appendToTrash(memo);
      } catch (e) {
        console.error("[Memoria] \u5199\u5165\u56DE\u6536\u7AD9\u5931\u8D25\uFF08\u5C06\u7EE7\u7EED\u6267\u884C\u5220\u9664\uFF09:", e);
      }
    }
    const raw = await this.app.vault.read(file);
    const lines = raw.split(/\r?\n/);
    const [start, end] = memo.range;
    lines.splice(start, end - start + 1);
    this.removeOrphanDateHeaders(lines);
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
    await this.app.vault.modify(file, cleaned.join("\n"));
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
    const folder = (0, import_obsidian.normalizePath)(this.settings.folder);
    await this.ensureFolder(folder);
    const trashPath = `${folder}/_trash.md`;
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
      const raw = await this.app.vault.read(existing);
      await this.app.vault.modify(existing, raw + entry);
    }
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
      if (newContent === "") newContent = " ";
    } else {
      const lines = memo.content.split("\n");
      if (lines.length === 0 || lines[0].trim() === "") lines[0] = `#${tag}`;
      else lines[0] = `${lines[0].replace(/\s+$/, "")} #${tag}`;
      newContent = lines.join("\n");
    }
    await this.editMemo(memo, newContent);
  }
  async saveImageAttachment(data, ext) {
    const folder = (0, import_obsidian.normalizePath)(this.settings.attachmentFolder);
    await this.ensureFolder(folder);
    const now = /* @__PURE__ */ new Date();
    const ts = now.getFullYear().toString() + pad(now.getMonth() + 1) + pad(now.getDate()) + "-" + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
    const rand = Math.random().toString(36).slice(2, 6);
    const cleanExt = (ext || "png").replace(/^\./, "").toLowerCase();
    const filePath = `${folder}/memoria-${ts}-${rand}.${cleanExt}`;
    await this.app.vault.createBinary(filePath, data);
    return filePath;
  }
  async ensureFolder(path) {
    if (!this.app.vault.getAbstractFileByPath(path)) {
      await this.app.vault.createFolder(path);
    }
  }
  insertMemoIntoYear(raw, year, dateStr, weekday, time, content) {
    var _a;
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
      const insertAt = this.trimTrailingBlank(lines, dateIdx + 1, sectionEnd);
      lines.splice(insertAt, 0, "", memoBlock);
      return lines.join("\n");
    }
    const laterDateRe = /^##\s+(\d{4}-\d{2}-\d{2})/;
    let insertBefore = -1;
    for (let i = yearIdx + 1; i < lines.length; i++) {
      const m = lines[i].match(laterDateRe);
      if (m && m[1] > dateStr) {
        insertBefore = i;
        break;
      }
    }
    const newSection = ["", `## ${dateStr} ${weekday}`, "", memoBlock, ""];
    if (insertBefore === -1) {
      if (((_a = lines[lines.length - 1]) == null ? void 0 : _a.trim()) !== "") lines.push("");
      lines.push(...newSection.filter((_, i) => i > 0));
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
function pad(n) {
  return n.toString().padStart(2, "0");
}

// src/view.ts
var import_obsidian5 = require("obsidian");

// src/tag-suggest.ts
var import_obsidian2 = require("obsidian");
var TagSuggest = class {
  constructor(app, textarea) {
    this.app = app;
    this.textarea = textarea;
    this.dropdown = null;
    this.items = [];
    this.active = 0;
    this.rangeStart = 0;
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
  }
  destroy() {
    this.textarea.removeEventListener("input", this.handleInput);
    this.textarea.removeEventListener("keydown", this.handleKeydown, true);
    this.textarea.removeEventListener("blur", this.handleBlur);
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
  collectAllTags() {
    var _a, _b;
    const counts = /* @__PURE__ */ new Map();
    const cache = this.app.metadataCache;
    for (const file of this.app.vault.getMarkdownFiles()) {
      const meta = cache.getFileCache(file);
      if (!meta) continue;
      for (const tag of (_a = (0, import_obsidian2.getAllTags)(meta)) != null ? _a : []) {
        const name = tag.replace(/^#/, "");
        if (name) counts.set(name, ((_b = counts.get(name)) != null ? _b : 0) + 1);
      }
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }
  matchTags(tags, query) {
    if (!query) return tags.slice(0, 8).map((t) => t.name);
    const q = query.toLowerCase();
    const starts = [];
    const contains = [];
    for (const t of tags) {
      const n = t.name.toLowerCase();
      if (n === q) continue;
      if (n.startsWith(q)) starts.push(t);
      else if (n.includes(q) || n.split("/").some((p) => p.startsWith(q))) contains.push(t);
    }
    return [...starts, ...contains].slice(0, 8).map((t) => t.name);
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
      (0, import_obsidian2.setIcon)(item.createSpan({ cls: "memoria-tag-suggest-icon" }), "hash");
      item.createSpan({ cls: "memoria-tag-suggest-name", text: name });
      item.addEventListener("click", () => {
        this.active = i;
        this.applySelected();
      });
    });
    this.position();
  }
  refreshActive() {
    var _a;
    if (!this.dropdown) return;
    const items = this.dropdown.querySelectorAll(".memoria-tag-suggest-item");
    items.forEach((el, i) => el.toggleClass("active", i === this.active));
    (_a = items[this.active]) == null ? void 0 : _a.scrollIntoView({ block: "nearest" });
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

// src/image.ts
var import_obsidian3 = require("obsidian");
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
    if (!(file instanceof import_obsidian3.TFile)) return match;
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
      if (file instanceof import_obsidian3.TFile) resolvedSrc = app.vault.getResourcePath(file);
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
    attr: { "aria-label": "\u5173\u95ED" }
  });
  const prevBtn = backdrop.createEl("button", {
    cls: "memoria-lightbox-nav memoria-lightbox-prev",
    text: "\u2039",
    attr: { "aria-label": "\u4E0A\u4E00\u5F20" }
  });
  const nextBtn = backdrop.createEl("button", {
    cls: "memoria-lightbox-nav memoria-lightbox-next",
    text: "\u203A",
    attr: { "aria-label": "\u4E0B\u4E00\u5F20" }
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
var import_obsidian4 = require("obsidian");
var WEEKDAY_CHARS = ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"];
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
    const prevBtn = head.createEl("button", { cls: "memoria-cal-nav", attr: { "aria-label": "\u4E0A\u4E2A\u6708" } });
    (0, import_obsidian4.setIcon)(prevBtn, "chevron-left");
    head.createDiv({ cls: "memoria-cal-title", text: `${year}\u5E74${month + 1}\u6708` }).addEventListener("click", () => {
      year = today.getFullYear();
      month = today.getMonth();
      render();
    });
    const nextBtn = head.createEl("button", { cls: "memoria-cal-nav", attr: { "aria-label": "\u4E0B\u4E2A\u6708" } });
    (0, import_obsidian4.setIcon)(nextBtn, "chevron-right");
    prevBtn.addEventListener("click", () => {
      month === 0 ? (month = 11, year--) : month--;
      render();
    });
    nextBtn.addEventListener("click", () => {
      month === 11 ? (month = 0, year++) : month++;
      render();
    });
    const weekHead = el.createDiv({ cls: "memoria-cal-week-head" });
    for (const wd of WEEKDAY_CHARS) weekHead.createDiv({ cls: "memoria-cal-wday", text: wd });
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
        attr: { title: count > 0 ? `${dateStr}  ${count} \u6761` : dateStr }
      });
      cell.createDiv({ cls: "memoria-cal-num", text: String(d) });
      if (count > 0) {
        const dot = cell.createDiv({ cls: "memoria-cal-dot" });
        dot.addClass(`level-${count < 2 ? 1 : count < 4 ? 2 : count < 7 ? 3 : 4}`);
      }
      if (count > 0 || dateStr === todayStr) {
        cell.addEventListener("click", () => state.onPickDate(dateStr));
      }
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

// src/view.ts
var _MemoriaView = class _MemoriaView extends import_obsidian5.ItemView {
  constructor(leaf, store, settings) {
    super(leaf);
    this.filter = { tag: null, year: null, date: null, keyword: "", preset: "all" };
    this.unsubscribe = null;
    this.childComponent = new import_obsidian5.Component();
    this.tagsExpanded = false;
    this.tagSuggest = null;
    this.overviewMode = "heatmap";
    this.editingMemo = null;
    this.editBannerEl = null;
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
    this.childComponent.unload();
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
    (0, import_obsidian5.setIcon)(title.createSpan({ cls: "memoria-logo" }), "feather");
    title.createSpan({ cls: "memoria-brand", text: "Memoria" });
    const searchWrap = topbar.createDiv({ cls: "memoria-search-wrap" });
    (0, import_obsidian5.setIcon)(searchWrap.createDiv({ cls: "memoria-search-icon" }), "search");
    this.searchEl = searchWrap.createEl("input", {
      cls: "memoria-search",
      attr: { placeholder: "\u641C\u7D22\u7B14\u8BB0...", type: "text" }
    });
    this.searchEl.addEventListener("input", () => {
      this.filter.keyword = this.searchEl.value.trim();
      this.pageLimit = this.getInitialPageLimit();
      this.renderList();
    });
    const refreshBtn = searchWrap.createEl("button", { cls: "memoria-icon-btn", attr: { "aria-label": "\u5237\u65B0" } });
    (0, import_obsidian5.setIcon)(refreshBtn, "refresh-cw");
    refreshBtn.addEventListener("click", () => this.store.reloadAll());
    const statsBtn = searchWrap.createEl("button", { cls: "memoria-icon-btn", attr: { "aria-label": "\u6570\u636E\u62A5\u544A" } });
    (0, import_obsidian5.setIcon)(statsBtn, "bar-chart-3");
    statsBtn.addEventListener("click", async () => {
      const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_STATS);
      if (existing.length) {
        this.app.workspace.revealLeaf(existing[0]);
        return;
      }
      const leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE_STATS, active: true });
      this.app.workspace.revealLeaf(leaf);
    });
    const menuBtn = topbar.createEl("button", {
      cls: "memoria-icon-btn memoria-sidebar-toggle",
      attr: { "aria-label": "\u5207\u6362\u4FA7\u680F" }
    });
    (0, import_obsidian5.setIcon)(menuBtn, "menu");
    menuBtn.addEventListener("click", () => this.toggleSidebar(!this.contentEl.hasClass("memoria-sidebar-open")));
    this.buildInputCard(main);
    this.listEl = main.createDiv({ cls: "memoria-list" });
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
      attr: { placeholder: "\u6B64\u523B\uFF0C\u4F60\u5728\u60F3\u4EC0\u4E48\uFF1F" }
    });
    this.tagSuggest = new TagSuggest(this.app, this.inputEl);
    this.inputEl.addEventListener("keydown", (e) => {
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
      var _a;
      const items = (_a = e.clipboardData) == null ? void 0 : _a.items;
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
    const tagBtn = tools.createEl("button", { cls: "memoria-tool-btn", attr: { "aria-label": "\u63D2\u5165\u6807\u7B7E #" } });
    (0, import_obsidian5.setIcon)(tagBtn, "hash");
    tagBtn.addEventListener("click", () => this.insertAtCursor("#"));
    const imgBtn = tools.createEl("button", { cls: "memoria-tool-btn", attr: { "aria-label": "\u63D2\u5165\u56FE\u7247" } });
    (0, import_obsidian5.setIcon)(imgBtn, "image");
    imgBtn.addEventListener("click", () => this.pickImageFromDisk());
    const listBtn = tools.createEl("button", { cls: "memoria-tool-btn", attr: { "aria-label": "\u63D2\u5165\u65E0\u5E8F\u5217\u8868" } });
    (0, import_obsidian5.setIcon)(listBtn, "list");
    listBtn.addEventListener("click", () => this.insertListAtCursor("- "));
    const orderedBtn = tools.createEl("button", { cls: "memoria-tool-btn", attr: { "aria-label": "\u63D2\u5165\u6709\u5E8F\u5217\u8868" } });
    (0, import_obsidian5.setIcon)(orderedBtn, "list-ordered");
    orderedBtn.addEventListener("click", () => this.insertOrderedListAtCursor());
    const taskBtn = tools.createEl("button", { cls: "memoria-tool-btn", attr: { "aria-label": "\u63D2\u5165\u4EFB\u52A1\u5217\u8868" } });
    (0, import_obsidian5.setIcon)(taskBtn, "square-check");
    taskBtn.addEventListener("click", () => this.insertListAtCursor("- [ ] "));
    const tableBtn = tools.createEl("button", { cls: "memoria-tool-btn", attr: { "aria-label": "\u63D2\u5165\u8868\u683C" } });
    (0, import_obsidian5.setIcon)(tableBtn, "table");
    tableBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showTablePicker(tableBtn);
    });
    tools.createSpan({ cls: "memoria-input-hint", text: "Ctrl+Enter \xB7 \u62D6\u62FD/\u7C98\u8D34\u56FE\u7247" });
    const submitWrap = toolbar.createDiv({ cls: "memoria-submit-wrap" });
    const cancelBtn = submitWrap.createEl("button", { cls: "memoria-cancel-btn memoria-hidden", text: "\u53D6\u6D88" });
    cancelBtn.addEventListener("click", () => this.exitEditMode());
    this.editBannerEl = cancelBtn;
    const sendBtn = submitWrap.createEl("button", { cls: "memoria-submit-btn", text: "\u53D1\u9001" });
    sendBtn.addEventListener("click", () => this.submitMemo());
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
    const isMobile = import_obsidian5.Platform.isMobile;
    const size = isMobile ? 5 : 6;
    const picker = document.body.createDiv({ cls: "memoria-table-picker" + (isMobile ? " is-mobile" : "") });
    const label = picker.createDiv({
      cls: "memoria-table-picker-label",
      text: isMobile ? "\u70B9\u51FB\u683C\u5B50\u76F4\u63A5\u63D2\u5165" : "0 \xD7 0"
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
      new import_obsidian5.Notice(`\u56FE\u7247\u5DF2\u4FDD\u5B58: ${name}`);
    } catch (e) {
      console.error(e);
      new import_obsidian5.Notice("\u56FE\u7247\u4FDD\u5B58\u5931\u8D25\uFF1A" + (e instanceof Error ? e.message : String(e)));
    }
  }
  async submitMemo() {
    const text = this.inputEl.value.trim();
    if (!text) return;
    try {
      if (this.editingMemo) {
        await this.store.editMemo(this.editingMemo, text);
        new import_obsidian5.Notice("\u2713 \u5DF2\u66F4\u65B0");
        this.exitEditMode();
      } else {
        await this.store.addMemo(text);
        new import_obsidian5.Notice("\u2713 \u5DF2\u8BB0\u4E0B");
        if (this.settings.clearAfterSave) {
          this.inputEl.value = "";
          this.clearDraft();
        }
      }
      this.autoResizeInput();
    } catch (e) {
      console.error(e);
      new import_obsidian5.Notice("\u4FDD\u5B58\u5931\u8D25\uFF1A" + (e instanceof Error ? e.message : String(e)));
    }
  }
  toggleSidebar(open) {
    this.contentEl.toggleClass("memoria-sidebar-open", open);
  }
  enterEditMode(memo) {
    if (this.inputEl.value.trim() && !this.editingMemo) this.saveDraft(this.inputEl.value);
    this.editingMemo = memo;
    this.inputEl.value = memo.content;
    this.inputEl.focus();
    this.inputEl.setSelectionRange(this.inputEl.value.length, this.inputEl.value.length);
    this.updateEditBanner();
    this.autoResizeInput();
  }
  exitEditMode() {
    this.editingMemo = null;
    this.inputEl.value = this.loadDraft();
    this.updateEditBanner();
    this.autoResizeInput();
  }
  updateEditBanner() {
    if (!this.editBannerEl) return;
    const card = this.inputEl.closest(".memoria-input-card");
    if (this.editingMemo) {
      this.editBannerEl.removeClass("memoria-hidden");
      card == null ? void 0 : card.addClass("is-editing");
      this.inputEl.setAttr("placeholder", `\u7F16\u8F91 ${this.editingMemo.date} ${this.editingMemo.time} \u7684\u7B14\u8BB0\uFF08Esc \u53D6\u6D88\uFF09`);
    } else {
      this.editBannerEl.addClass("memoria-hidden");
      card == null ? void 0 : card.removeClass("is-editing");
      this.inputEl.setAttr("placeholder", "\u6B64\u523B\uFF0C\u4F60\u5728\u60F3\u4EC0\u4E48\uFF1F");
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
    let imgCount = 0, linkCount = 0, pinnedCount = 0, starredCount = 0, noTagCount = 0, onThisDayCount = 0;
    const todayStr = toDateStr(/* @__PURE__ */ new Date());
    const todayMMDD = todayStr.slice(5);
    for (const m of all) {
      for (const t of m.tags) if (!RESERVED_TAGS.has(t)) uniqueTags.add(t);
      uniqueDates.add(m.date);
      if (m.hasImage) imgCount++;
      if (m.hasLink) linkCount++;
      if (m.isPinned) pinnedCount++;
      if (m.isStarred) starredCount++;
      if (m.date.slice(5) === todayMMDD && m.date !== todayStr) onThisDayCount++;
      if (m.tags.filter((t) => !RESERVED_TAGS.has(t)).length === 0) noTagCount++;
    }
    const statsEl = this.sidebarEl.createDiv({ cls: "memoria-stats" });
    this.renderStatItem(statsEl, all.length.toString(), "\u7B14\u8BB0");
    this.renderStatItem(statsEl, uniqueTags.size.toString(), "\u6807\u7B7E");
    this.renderStatItem(statsEl, uniqueDates.size.toString(), "\u5929\u6570");
    const switchBtn = statsEl.createEl("button", {
      cls: "memoria-icon-btn memoria-overview-btn memoria-stats-switch",
      attr: {
        "aria-label": this.overviewMode === "heatmap" ? "\u5207\u6362\u4E3A\u6708\u5386" : "\u5207\u6362\u4E3A\u70ED\u529B\u56FE",
        title: this.overviewMode === "heatmap" ? "\u5207\u6362\u4E3A\u6708\u5386" : "\u5207\u6362\u4E3A\u70ED\u529B\u56FE"
      }
    });
    (0, import_obsidian5.setIcon)(switchBtn, this.overviewMode === "heatmap" ? "calendar" : "activity");
    switchBtn.addEventListener("click", () => {
      this.overviewMode = this.overviewMode === "heatmap" ? "calendar" : "heatmap";
      this.renderSidebar();
    });
    this.renderOverview(this.sidebarEl, all);
    this.sidebarEl.createDiv({ cls: "memoria-sidebar-section", text: "\u89C6\u56FE" });
    const navItems = [
      { key: "all", icon: "layout-grid", text: "\u5168\u90E8\u7B14\u8BB0", count: all.length },
      { key: "pinned", icon: "pin", text: "\u7F6E\u9876", count: pinnedCount },
      { key: "starred", icon: "star", text: "\u6536\u85CF", count: starredCount },
      { key: "today", icon: "calendar", text: "\u4ECA\u5929" },
      { key: "week", icon: "calendar-days", text: "\u672C\u5468" },
      { key: "on-this-day", icon: "history", text: "\u6BCF\u65E5\u56DE\u987E", count: onThisDayCount },
      { key: "random", icon: "shuffle", text: "\u968F\u673A\u56DE\u987E" }
    ];
    for (const item of navItems) this.renderNavItem(item.key, item.icon, item.text, item.count);
    this.sidebarEl.createDiv({ cls: "memoria-sidebar-section", text: "\u68C0\u7D22\u5F0F" });
    this.renderNavItem("no-tag", "tag", "\u65E0\u6807\u7B7E", noTagCount);
    this.renderNavItem("with-image", "image", "\u6709\u56FE\u7247", imgCount);
    this.renderNavItem("with-link", "link", "\u6709\u94FE\u63A5", linkCount);
    const yearCounts = /* @__PURE__ */ new Map();
    for (const m of all) {
      const y = m.date.substring(0, 4);
      yearCounts.set(y, ((_a = yearCounts.get(y)) != null ? _a : 0) + 1);
    }
    if (yearCounts.size) {
      this.sidebarEl.createDiv({ cls: "memoria-sidebar-section", text: "\u5E74\u4EFD" });
      for (const [y, cnt] of [...yearCounts.entries()].sort((a, b) => b[0] < a[0] ? -1 : 1)) {
        const item = this.sidebarEl.createDiv({
          cls: "memoria-nav-item" + (this.filter.year === y ? " active" : "")
        });
        (0, import_obsidian5.setIcon)(item.createDiv({ cls: "memoria-nav-icon" }), "calendar");
        item.createSpan({ cls: "memoria-nav-text", text: y });
        item.createSpan({ cls: "memoria-nav-count", text: String(cnt) });
        item.addEventListener("click", () => {
          this.filter.year = this.filter.year === y ? null : y;
          this.filter.preset = "all";
          this.pageLimit = this.getInitialPageLimit();
          this.renderAll();
        });
      }
    }
    if (this.settings.showSidebarTags) {
      const tagMap = /* @__PURE__ */ new Map();
      for (const m of all) for (const t of m.tags) if (!RESERVED_TAGS.has(t)) tagMap.set(t, ((_b = tagMap.get(t)) != null ? _b : 0) + 1);
      if (tagMap.size) {
        const section = this.sidebarEl.createDiv({ cls: "memoria-sidebar-section memoria-section-collapsible" });
        section.createSpan({ cls: "memoria-section-arrow", text: this.tagsExpanded ? "\u25BE" : "\u25B8" });
        section.createSpan({ text: ` \u6807\u7B7E (${tagMap.size})` });
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
    const active = this.filter.preset === key && !this.filter.tag && !this.filter.year;
    const item = this.sidebarEl.createDiv({ cls: "memoria-nav-item" + (active ? " active" : "") });
    (0, import_obsidian5.setIcon)(item.createDiv({ cls: "memoria-nav-icon" }), icon);
    item.createSpan({ cls: "memoria-nav-text", text });
    if (count !== void 0) item.createSpan({ cls: "memoria-nav-count", text: String(count) });
    item.addEventListener("click", () => {
      this.filter.preset = key;
      this.filter.tag = null;
      this.filter.year = null;
      this.filter.date = null;
      if (key === "random") this.filter.randomSeed = Date.now();
      this.pageLimit = this.getInitialPageLimit();
      this.renderAll();
    });
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
          this.pageLimit = this.getInitialPageLimit();
          this.renderAll();
        }
      });
    }
  }
  renderHeatmap(parent, memos) {
    var _a, _b;
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const gridStart = new Date(startOfWeek);
    gridStart.setDate(startOfWeek.getDate() - 13 * 7);
    const dateCounts = /* @__PURE__ */ new Map();
    for (const m of memos) dateCounts.set(m.date, ((_a = dateCounts.get(m.date)) != null ? _a : 0) + 1);
    const heatmap = parent.createDiv({ cls: "memoria-heatmap" });
    for (let col = 0; col < 14; col++) {
      const colEl = heatmap.createDiv({ cls: "memoria-heatmap-col" });
      for (let row = 0; row < 7; row++) {
        const date = new Date(gridStart);
        date.setDate(gridStart.getDate() + col * 7 + row);
        const dateStr = toDateStr(date);
        const count = (_b = dateCounts.get(dateStr)) != null ? _b : 0;
        const level = count === 0 ? 0 : count < 2 ? 1 : count < 4 ? 2 : count < 7 ? 3 : 4;
        const cell = colEl.createDiv({
          cls: `memoria-heatmap-cell level-${level}`,
          attr: { title: `${dateStr}  ${count} \u6761` }
        });
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
        this.pageLimit = this.getInitialPageLimit();
        this.renderAll();
      });
      if (child.children.size) this.renderTagTree(wrap, child, depth + 1);
    }
  }
  getFilteredMemos() {
    var _a;
    let memos = this.store.getAll();
    const raw = this.filter.keyword.trim();
    const tagsFromKeyword = [];
    const keywordTokens = [];
    if (raw) {
      const tagTokenRe = /^#([A-Za-z0-9_一-鿿/]+)$/;
      for (const tok of raw.split(/\s+/).filter((t) => t !== "")) {
        const m = tok.match(tagTokenRe);
        if (m) tagsFromKeyword.push(m[1]);
        else keywordTokens.push(tok.toLowerCase());
      }
    }
    memos = memos.filter((m) => {
      if (this.filter.year && !m.date.startsWith(this.filter.year)) return false;
      if (this.filter.date && m.date !== this.filter.date) return false;
      const requiredTags = this.filter.tag ? [this.filter.tag, ...tagsFromKeyword] : tagsFromKeyword;
      for (const t of requiredTags) {
        if (!m.tags.some((x) => x === t || x.startsWith(t + "/"))) return false;
      }
      if (keywordTokens.length) {
        const lower = m.content.toLowerCase();
        for (const k of keywordTokens) if (!lower.includes(k)) return false;
      }
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
    } else if (this.filter.preset === "no-tag") {
      memos = memos.filter((m) => m.tags.filter((t) => !RESERVED_TAGS.has(t)).length === 0);
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
    this.childComponent = new import_obsidian5.Component();
    this.childComponent.load();
    const filtered = this.getFilteredMemos();
    const meta = this.listEl.createDiv({ cls: "memoria-list-meta" });
    meta.createDiv({ cls: "memoria-list-meta-left", text: this.describeFilter(filtered.length) });
    if (this.filter.preset === "random") {
      const rerollBtn = meta.createEl("button", { cls: "memoria-meta-btn" });
      (0, import_obsidian5.setIcon)(rerollBtn.createSpan(), "shuffle");
      rerollBtn.createSpan({ text: " \u6362\u4E00\u6279" });
      rerollBtn.addEventListener("click", () => {
        this.filter.randomSeed = Date.now();
        this.renderList();
      });
    }
    if (filtered.length === 0) {
      const empty = this.listEl.createDiv({ cls: "memoria-empty" });
      empty.createDiv({ cls: "memoria-empty-emoji", text: "\u{1F4ED}" });
      empty.createDiv({ cls: "memoria-empty-text", text: "\u8FD9\u91CC\u8FD8\u6CA1\u6709\u7B14\u8BB0\u54E6" });
      empty.createDiv({ cls: "memoria-empty-sub", text: "\u5728\u9876\u90E8\u8F93\u5165\u6846\u5199\u4E0B\u4F60\u7684\u7B2C\u4E00\u4E2A\u60F3\u6CD5\u5427\uFF5E" });
      return;
    }
    const page = filtered.slice(0, this.pageLimit);
    const pinned = page.filter((m) => m.isPinned);
    const unpinned = page.filter((m) => !m.isPinned);
    if (pinned.length) {
      const group = this.listEl.createDiv({ cls: "memoria-day-group memoria-pin-group" });
      const head = group.createDiv({ cls: "memoria-day-head memoria-pin-head" });
      (0, import_obsidian5.setIcon)(head.createSpan({ cls: "memoria-pin-head-icon" }), "pin");
      head.createSpan({ text: `\u7F6E\u9876  \u5171 ${pinned.length} \u6761` });
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
    const weekdays = ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"];
    for (const [date, dayMemos] of byDate) {
      const group = this.listEl.createDiv({ cls: "memoria-day-group" });
      const head = group.createDiv({ cls: "memoria-day-head" });
      const wd = weekdays[(/* @__PURE__ */ new Date(date + "T00:00:00")).getDay()];
      let label = `${date}  ${wd}`;
      if (date === todayStr) label = `\u4ECA\u5929  ${wd}`;
      else if (date === yesterdayStr) label = `\u6628\u5929  ${wd}`;
      head.setText(label);
      for (const m of dayMemos) this.renderMemoCard(group, m);
    }
    if (this.pageLimit < filtered.length) {
      this.listEl.createDiv({ cls: "memoria-load-more" }).setText(`\u2193 \u6EDA\u52A8\u52A0\u8F7D\u66F4\u591A\uFF08\u8FD8\u6709 ${filtered.length - this.pageLimit} \u6761\uFF09`);
    }
  }
  describeFilter(count) {
    var _a;
    const parts = [];
    const presetLabels = {
      today: "\u4ECA\u5929",
      week: "\u672C\u5468",
      random: "\u968F\u673A\u56DE\u987E",
      "on-this-day": "\u{1F4C5} \u6BCF\u65E5\u56DE\u987E",
      "no-tag": "\u65E0\u6807\u7B7E",
      "with-image": "\u6709\u56FE\u7247",
      "with-link": "\u6709\u94FE\u63A5",
      pinned: "\u{1F4CC} \u7F6E\u9876",
      starred: "\u2B50 \u6536\u85CF"
    };
    if (this.filter.preset !== "all") parts.push((_a = presetLabels[this.filter.preset]) != null ? _a : this.filter.preset);
    if (this.filter.year) parts.push(this.filter.year);
    if (this.filter.date) parts.push(`\u{1F4C5} ${this.filter.date}`);
    if (this.filter.tag) parts.push(`#${this.filter.tag}`);
    if (this.filter.keyword) parts.push(`\u300C${this.filter.keyword}\u300D`);
    return `${parts.length ? parts.join(" \xB7 ") + " \xB7 " : ""}\u5171 ${count} \u6761`;
  }
  renderMemoCard(parent, memo) {
    const card = parent.createDiv({
      cls: "memoria-card" + (memo.isPinned ? " is-pinned" : "") + (memo.isStarred ? " is-starred" : "") + (this.editingMemo === memo ? " is-editing" : "")
    });
    card.addEventListener("dblclick", (e) => {
      const target = e.target;
      if (!target.closest(".memoria-img-cell") && target.tagName !== "A") this.enterEditMode(memo);
    });
    const head = card.createDiv({ cls: "memoria-card-head" });
    const timeWrap = head.createDiv({ cls: "memoria-card-time-wrap" });
    if (memo.isPinned) {
      const pin = timeWrap.createSpan({ cls: "memoria-card-pin" });
      (0, import_obsidian5.setIcon)(pin, "pin");
      pin.setAttr("aria-label", "\u5DF2\u7F6E\u9876");
    }
    if (memo.isStarred) {
      const star = timeWrap.createSpan({ cls: "memoria-card-star" });
      (0, import_obsidian5.setIcon)(star, "star");
      star.setAttr("aria-label", "\u5DF2\u6536\u85CF");
    }
    timeWrap.createSpan({ cls: "memoria-card-time", text: `${memo.date} ${memo.time}` });
    const moreBtn = head.createDiv({ cls: "memoria-card-actions" }).createEl("button", { cls: "memoria-icon-btn", attr: { "aria-label": "\u66F4\u591A\u64CD\u4F5C" } });
    (0, import_obsidian5.setIcon)(moreBtn, "more-horizontal");
    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showMemoMenu(e, memo);
    });
    const { text, tags } = this.stripTags(memo.content);
    const { text: bodyText, images } = extractImages(this.app, text, memo.file);
    if (bodyText.trim()) {
      const body = card.createDiv({ cls: "memoria-card-body" });
      import_obsidian5.MarkdownRenderer.render(this.app, normalizeForRender(bodyText), body, memo.file, this.childComponent);
      this.bindTaskCheckboxes(body, memo, bodyText);
      this.wrapWideTables(body);
    }
    if (images.length) renderImageGrid(card, images, (idx) => showLightbox(images, idx));
    const visibleTags = tags.filter((t) => !RESERVED_TAGS.has(t));
    if (visibleTags.length) {
      const tagsEl = card.createDiv({ cls: "memoria-card-tags" });
      for (const t of visibleTags) {
        tagsEl.createSpan({ cls: "memoria-tag-pill", text: `#${t}` }).addEventListener("click", () => {
          this.filter.tag = t;
          this.filter.preset = "all";
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
          new import_obsidian5.Notice("\u52FE\u9009\u5931\u8D25\uFF1A" + (err instanceof Error ? err.message : String(err)));
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
    const tags = [];
    const text = content.replace(/#([A-Za-z0-9_一-鿿][A-Za-z0-9_一-鿿/]*)/g, (_, tag) => {
      if (!tags.includes(tag)) tags.push(tag);
      return "";
    }).split("\n").map((l) => l.replace(/\s+$/, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    return { text, tags };
  }
  showMemoMenu(e, memo) {
    const menu = new import_obsidian5.Menu();
    menu.addItem((i) => i.setTitle(memo.isPinned ? "\u53D6\u6D88\u7F6E\u9876" : "\u7F6E\u9876").setIcon(memo.isPinned ? "pin-off" : "pin").onClick(async () => {
      await this.store.togglePinned(memo);
      new import_obsidian5.Notice(memo.isPinned ? "\u5DF2\u53D6\u6D88\u7F6E\u9876" : "\u2713 \u5DF2\u7F6E\u9876");
    }));
    menu.addItem((i) => i.setTitle(memo.isStarred ? "\u53D6\u6D88\u6536\u85CF" : "\u6536\u85CF").setIcon(memo.isStarred ? "star-off" : "star").onClick(async () => {
      await this.store.toggleStarred(memo);
      new import_obsidian5.Notice(memo.isStarred ? "\u5DF2\u53D6\u6D88\u6536\u85CF" : "\u2713 \u5DF2\u6536\u85CF");
    }));
    menu.addSeparator();
    menu.addItem((i) => i.setTitle("\u7F16\u8F91").setIcon("pencil").onClick(() => this.enterEditMode(memo)));
    menu.addItem((i) => i.setTitle("\u5F15\u7528").setIcon("quote").onClick(() => this.quoteMemo(memo)));
    menu.addItem((i) => i.setTitle("\u6253\u5F00\u539F\u6587").setIcon("file-text").onClick(() => this.openInFile(memo)));
    menu.addItem((i) => i.setTitle("\u590D\u5236\u539F\u6587").setIcon("copy").onClick(async () => {
      await navigator.clipboard.writeText(memo.content);
      new import_obsidian5.Notice("\u5DF2\u590D\u5236");
    }));
    menu.addSeparator();
    menu.addItem((i) => i.setTitle("\u5220\u9664").setIcon("trash").onClick(async () => {
      if (await this.confirmAsync("\u786E\u5B9A\u5220\u9664\u8FD9\u6761\u7B14\u8BB0\u5417\uFF1F")) {
        await this.store.deleteMemo(memo);
        new import_obsidian5.Notice("\u5DF2\u5220\u9664");
        this.restoreInputFocus();
      }
    }));
    menu.showAtMouseEvent(e);
  }
  confirmAsync(message) {
    return new Promise((resolve) => {
      const backdrop = document.body.createDiv({ cls: "memoria-modal-backdrop" });
      const modal = backdrop.createDiv({ cls: "memoria-modal memoria-confirm" });
      modal.createDiv({ cls: "memoria-modal-title", text: message });
      const btns = modal.createDiv({ cls: "memoria-modal-btns" });
      const cancelBtn = btns.createEl("button", { text: "\u53D6\u6D88" });
      const confirmBtn = btns.createEl("button", { text: "\u786E\u8BA4\u5220\u9664", cls: "mod-warning" });
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
    if (file instanceof import_obsidian5.TFile) await leaf.openFile(file, { eState: { line: memo.range[0] } });
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
    new import_obsidian5.Notice("\u5DF2\u5F15\u7528\uFF0C\u7EE7\u7EED\u8865\u5145\u60F3\u6CD5\u5427");
  }
};
_MemoriaView.DRAFT_KEY_PREFIX = "memoria:input-draft";
var MemoriaView = _MemoriaView;
function toDateStr(date) {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
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
var import_obsidian6 = require("obsidian");
var MemoriaStatsView = class extends import_obsidian6.ItemView {
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
    return "Memoria \u6570\u636E\u62A5\u544A";
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
    titleBar.createSpan({ cls: "mstat-pagetitle-text", text: "Memoria \u6570\u636E\u62A5\u544A" });
    if (this.memos.length === 0) {
      el.createEl("p", { text: "\u8FD8\u6CA1\u6709\u7B14\u8BB0\uFF0C\u8D76\u7D27\u53BB\u5199\u4E00\u6761\u5427 \u2728", cls: "mstat-empty-page" });
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
    this.renderBigNum(section, this.memos.length, "\u6761\u7B14\u8BB0");
    this.renderBigNum(section, charCount, "\u5B57");
    this.renderBigNum(section, activeDays, "\u6D3B\u8DC3\u5929");
    this.renderBigNum(section, spanDays, "\u603B\u8DE8\u5EA6");
  }
  renderBigNum(parent, num, label) {
    const el = parent.createDiv({ cls: "mstat-bignum" });
    el.createDiv({ cls: "mstat-bignum-num", text: num.toLocaleString() });
    el.createDiv({ cls: "mstat-bignum-label", text: label });
  }
  renderYearHeatmap(parent) {
    const section = parent.createDiv({ cls: "mstat-section" });
    const titleRow = section.createDiv({ cls: "mstat-yh-title-row" });
    titleRow.createDiv({ cls: "mstat-title", text: "\u{1F525} \u5168\u5E74\u6D3B\u8DC3\u5EA6" });
    const yearNav = titleRow.createDiv({ cls: "mstat-yh-year-nav" });
    const prevBtn = yearNav.createEl("button", { cls: "mstat-yh-year-arrow", attr: { "aria-label": "\u4E0A\u4E00\u5E74" } });
    (0, import_obsidian6.setIcon)(prevBtn, "chevron-left");
    const yearBtn = yearNav.createEl("button", { cls: "mstat-yh-year-btn" });
    const nextBtn = yearNav.createEl("button", { cls: "mstat-yh-year-arrow", attr: { "aria-label": "\u4E0B\u4E00\u5E74" } });
    (0, import_obsidian6.setIcon)(nextBtn, "chevron-right");
    let currentYear = (/* @__PURE__ */ new Date()).getFullYear();
    yearBtn.setText(`${currentYear} \u5E74`);
    const heatmapWrap = section.createDiv({ cls: "mstat-yh-wrap" });
    const monthLabels = section.createDiv({ cls: "mstat-yh-monthlabels" });
    const monthlyTitleSection = parent.createDiv({ cls: "mstat-section mstat-monthly-title" });
    const monthlyTitleRow = monthlyTitleSection.createDiv({ cls: "mstat-title-row" });
    monthlyTitleRow.createDiv({ cls: "mstat-title", text: "\u{1F4C5} \u6708\u5EA6\u5206\u5E03" });
    const monthlySubtitle = monthlyTitleRow.createDiv({ cls: "mstat-subtitle" });
    const monthlyWrap = parent.createDiv({ cls: "mstat-monthly-wrap" });
    const drawYear = (year) => {
      var _a, _b;
      heatmapWrap.empty();
      monthLabels.empty();
      yearBtn.setText(`${year} \u5E74`);
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
        const lbl = monthLabels.createDiv({ cls: "mstat-yh-mlabel", text: `${month + 1}\u6708` });
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
          const cell = colEl.createDiv({ cls: `mstat-yh-cell level-${level}`, attr: { title: inYear ? `${dateStr}  ${count} \u6761` : "" } });
          if (level === -1) cell.style.visibility = "hidden";
        }
      }
      this.renderMonthlyForYear(monthlyWrap, year);
      const yearTotal = this.memos.filter((m) => m.date.startsWith(`${year}-`)).length;
      monthlySubtitle.setText(`${year} \u5E74\u5171 ${yearTotal} \u6761`);
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
    legend.createSpan({ text: "\u5C11 " });
    for (let i = 0; i <= 4; i++) legend.createDiv({ cls: `mstat-yh-cell level-${i}` });
    legend.createSpan({ text: " \u591A" });
  }
  renderMonthlyForYear(parent, year) {
    parent.empty();
    const months = Array.from({ length: 12 }, (_, i) => ({
      key: `${year}-${pad2(i + 1)}`,
      label: `${i + 1}\u6708`,
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
      bar.setAttr("title", `${mo.key}: ${mo.count} \u6761`);
      col.createDiv({ cls: "mstat-bar-num", text: mo.count > 0 ? String(mo.count) : "" });
      col.createDiv({ cls: "mstat-bar-label", text: mo.label });
    }
  }
  renderTagCloud(parent) {
    var _a;
    const tagMap = /* @__PURE__ */ new Map();
    for (const m of this.memos) for (const t of m.tags) if (!RESERVED_TAGS.has(t)) tagMap.set(t, ((_a = tagMap.get(t)) != null ? _a : 0) + 1);
    if (tagMap.size === 0) return;
    const section = parent.createDiv({ cls: "mstat-section" });
    section.createDiv({ cls: "mstat-title", text: "\u2601\uFE0F \u6807\u7B7E\u4E91" });
    const sorted = [...tagMap.entries()].sort((a, b) => b[1] - a[1]);
    const maxCnt = sorted[0][1];
    const minCnt = sorted[sorted.length - 1][1];
    const cloud = section.createDiv({ cls: "mstat-cloud" });
    for (const [tag, cnt] of sorted) {
      const ratio = maxCnt === minCnt ? 1 : (cnt - minCnt) / (maxCnt - minCnt);
      const span = cloud.createSpan({ cls: "mstat-cloud-tag", text: `#${tag}`, attr: { title: `${cnt} \u6761` } });
      span.style.fontSize = `${12 + ratio * 10}px`;
      span.style.opacity = String(0.55 + ratio * 0.45);
    }
  }
  renderTopTags(parent) {
    var _a;
    const section = parent.createDiv({ cls: "mstat-section" });
    section.createDiv({ cls: "mstat-title", text: "\u{1F3F7}\uFE0F \u6700\u5E38\u7528\u6807\u7B7E Top 10" });
    const tagMap = /* @__PURE__ */ new Map();
    for (const m of this.memos) for (const t of m.tags) if (!RESERVED_TAGS.has(t)) tagMap.set(t, ((_a = tagMap.get(t)) != null ? _a : 0) + 1);
    const top10 = [...tagMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (top10.length === 0) {
      section.createDiv({ cls: "mstat-empty", text: "\u6682\u65E0\u6807\u7B7E" });
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
    titleRow.createDiv({ cls: "mstat-title", text: "\u23F0 \u4E00\u5929\u4E2D\u4F60\u4EC0\u4E48\u65F6\u5019\u5199\u5F97\u6700\u591A" });
    titleRow.createDiv({ cls: "mstat-subtitle", text: `\u57FA\u4E8E ${this.memos.length} \u6761\u5386\u53F2\u7B14\u8BB0\u7D2F\u8BA1` });
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
      bar.setAttr("title", `${pad2(h)}:00 \u2014 ${hourly[h]} \u6761`);
      col.createDiv({ cls: "mstat-bar-label", text: pad2(h) });
    }
    const peakHour = hourly.indexOf(maxVal);
    section.createDiv({ cls: "mstat-desc" }).setText(`\u{1F4DD} \u4F60\u6700\u559C\u6B22\u5728 ${pad2(peakHour)}:00 \u5199\u7B14\u8BB0\uFF0C\u81F3\u4ECA\u7D2F\u8BA1 ${maxVal} \u6761\uFF08${(maxVal / this.memos.length * 100).toFixed(1)}%\uFF09`);
  }
  renderHighlights(parent) {
    var _a;
    const section = parent.createDiv({ cls: "mstat-section" });
    section.createDiv({ cls: "mstat-title", text: "\u{1F31F} \u6709\u8DA3\u7684\u53D1\u73B0" });
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
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
function pad2(n) {
  return n.toString().padStart(2, "0");
}

// src/settings.ts
var import_obsidian7 = require("obsidian");
var MemoriaSettingTab = class extends import_obsidian7.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Memoria \u8BBE\u7F6E" });
    new import_obsidian7.Setting(containerEl).setName("\u7B14\u8BB0\u6587\u4EF6\u5939").setDesc("Memoria \u5728\u6B64\u6587\u4EF6\u5939\u4E0B\u8BFB\u5199 YYYY.md \u6587\u4EF6\uFF08\u76F8\u5BF9 vault \u6839\u76EE\u5F55\uFF09").addText((t) => t.setPlaceholder("Memoria").setValue(this.plugin.settings.folder).onChange(async (v) => {
      this.plugin.settings.folder = v.trim() || "Memoria";
      await this.plugin.saveSettings();
      await this.plugin.store.reloadAll();
    }));
    new import_obsidian7.Setting(containerEl).setName("\u56FE\u7247\u9644\u4EF6\u6587\u4EF6\u5939").setDesc("\u7C98\u8D34/\u62D6\u62FD/\u9009\u62E9\u7684\u56FE\u7247\u4F1A\u4FDD\u5B58\u5230\u6B64\u76EE\u5F55\uFF08\u76F8\u5BF9 vault \u6839\u76EE\u5F55\uFF09").addText((t) => t.setPlaceholder("Memoria/attachments").setValue(this.plugin.settings.attachmentFolder).onChange(async (v) => {
      this.plugin.settings.attachmentFolder = v.trim() || "Memoria/attachments";
      await this.plugin.saveSettings();
    }));
    new import_obsidian7.Setting(containerEl).setName("\u5728\u4FA7\u8FB9\u680F\u663E\u793A\u6807\u7B7E\u6811").setDesc("\u9ED8\u8BA4\u5173\u95ED\u3002\u5173\u95ED\u540E\u53EF\u5728\u5361\u7247\u5E95\u90E8\u70B9\u51FB\u6807\u7B7E\u80F6\u56CA\u7B5B\u9009\uFF0C\u6216\u5728\u641C\u7D22\u6846\u8F93\u5165\u300C#\u6807\u7B7E\u540D\u300D\u7B5B\u9009\u3002").addToggle((t) => t.setValue(this.plugin.settings.showSidebarTags).onChange(async (v) => {
      this.plugin.settings.showSidebarTags = v;
      await this.plugin.saveSettings();
      await this.plugin.store.reloadAll();
    }));
    new import_obsidian7.Setting(containerEl).setName("\u5220\u9664\u65F6\u79FB\u5165\u56DE\u6536\u7AD9").setDesc("\u5F00\u542F\u540E\uFF0C\u5220\u9664\u7684\u7B14\u8BB0\u4F1A\u8FFD\u52A0\u5230 <\u7B14\u8BB0\u6587\u4EF6\u5939>/_trash.md\uFF08\u800C\u4E0D\u662F\u5F7B\u5E95\u6D88\u5931\uFF09\uFF0C\u4FBF\u4E8E\u8BEF\u5220\u540E\u624B\u52A8\u6062\u590D\u3002\u5173\u95ED = \u5F7B\u5E95\u5220\u9664\u3002").addToggle((t) => t.setValue(this.plugin.settings.useTrash).onChange(async (v) => {
      this.plugin.settings.useTrash = v;
      await this.plugin.saveSettings();
    }));
    new import_obsidian7.Setting(containerEl).setName("\u53D1\u9001\u540E\u6E05\u7A7A\u8F93\u5165\u6846").addToggle((t) => t.setValue(this.plugin.settings.clearAfterSave).onChange(async (v) => {
      this.plugin.settings.clearAfterSave = v;
      await this.plugin.saveSettings();
    }));
    new import_obsidian7.Setting(containerEl).setName("\u6BCF\u6B21\u52A0\u8F7D\u6761\u6570").setDesc("\u7011\u5E03\u6D41\u6BCF\u6B21\u5C55\u793A\u591A\u5C11\u6761\uFF0C\u6EDA\u52A8\u5230\u5E95\u81EA\u52A8\u52A0\u8F7D\u66F4\u591A").addSlider((t) => t.setLimits(10, 200, 10).setValue(this.plugin.settings.pageSize).setDynamicTooltip().onChange(async (v) => {
      this.plugin.settings.pageSize = v;
      await this.plugin.saveSettings();
    }));
    containerEl.createEl("h3", { text: "\u5173\u4E8E" });
    const desc = containerEl.createEl("p", { cls: "setting-item-description" });
    desc.appendText("Memoria \u2014 \u6D6E\u58A8\u5F0F\u788E\u7247\u7B14\u8BB0\u63D2\u4EF6\u3002\u6240\u6709\u7B14\u8BB0\u4EE5\u7EAF Markdown \u683C\u5F0F\u5B58\u50A8\uFF08");
    desc.createEl("code", { text: "## yyyy-MM-dd" });
    desc.appendText(" + ");
    desc.createEl("code", { text: "- HH:MM \u5185\u5BB9" });
    desc.appendText("\uFF09\uFF0C\u505C\u7528\u63D2\u4EF6\u540E\u4F60\u7684\u7B14\u8BB0\u4F9D\u7136\u5B8C\u6574\u53EF\u8BFB\u3002");
  }
};

// src/main.ts
var MemoriaPlugin = class extends import_obsidian8.Plugin {
  async onload() {
    await this.loadSettings();
    this.store = new MemoStore(this.app, this.settings);
    this.registerView(VIEW_TYPE_MEMORIA, (leaf) => new MemoriaView(leaf, this.store, this.settings));
    this.registerView(VIEW_TYPE_STATS, (leaf) => new MemoriaStatsView(leaf, this.store));
    this.addRibbonIcon("feather", "\u6253\u5F00 Memoria", () => this.activateView());
    this.addCommand({ id: "open-memoria", name: "\u6253\u5F00 Memoria \u9762\u677F", callback: () => this.activateView() });
    this.addCommand({ id: "open-memoria-stats", name: "\u6253\u5F00\u6570\u636E\u62A5\u544A", callback: () => this.activateStatsView() });
    this.addCommand({ id: "memoria-quick-capture", name: "\u5FEB\u901F\u8BB0\u5F55\uFF08\u5F39\u7A97\uFF09", callback: () => this.quickCapture() });
    this.addCommand({
      id: "memoria-normalize-all",
      name: "\u89C4\u8303\u5316\u6240\u6709\u7B14\u8BB0\u683C\u5F0F\uFF08\u4FEE\u590D md \u6E32\u67D3\uFF09",
      callback: () => this.normalizeAll()
    });
    this.registerEvent(this.app.vault.on("modify", (f) => {
      if (f instanceof import_obsidian8.TFile && this.store.isInFolder(f)) this.store.reloadFile(f);
    }));
    this.registerEvent(this.app.vault.on("delete", (f) => {
      if (f instanceof import_obsidian8.TFile) this.store.removeFile(f.path);
    }));
    this.registerEvent(this.app.vault.on("create", (f) => {
      if (f instanceof import_obsidian8.TFile && this.store.isInFolder(f)) this.store.reloadFile(f);
    }));
    this.registerEvent(this.app.vault.on("rename", (f, oldPath) => {
      this.store.removeFile(oldPath);
      if (f instanceof import_obsidian8.TFile && this.store.isInFolder(f)) this.store.reloadFile(f);
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
  async activateView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_MEMORIA);
    if (existing.length) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE_MEMORIA, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
  async activateStatsView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_STATS);
    if (existing.length) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE_STATS, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
  async normalizeAll() {
    var _a;
    if (!confirm("\u5C06\u91CD\u5199\u6240\u6709 Memoria \u7B14\u8BB0\u7684 md \u683C\u5F0F\u4EE5\u4FEE\u590D\u6E32\u67D3\u95EE\u9898\u3002\n\u5EFA\u8BAE\u5148\u5907\u4EFD Memoria \u6587\u4EF6\u5939\u3002\n\n\u786E\u5B9A\u7EE7\u7EED\u5417\uFF1F")) return;
    new import_obsidian8.Notice("\u6B63\u5728\u89C4\u8303\u5316\u2026");
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
        if (!(file instanceof import_obsidian8.TFile)) continue;
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
      new import_obsidian8.Notice(`\u2713 \u5DF2\u89C4\u8303\u5316 ${count} \u6761\u7B14\u8BB0`);
    } catch (e) {
      console.error(e);
      new import_obsidian8.Notice("\u89C4\u8303\u5316\u5931\u8D25\uFF1A" + (e instanceof Error ? e.message : String(e)));
    }
  }
  quickCapture() {
    const backdrop = document.createElement("div");
    backdrop.addClass("memoria-modal-backdrop");
    const modal = backdrop.createDiv({ cls: "memoria-modal" });
    modal.createDiv({ cls: "memoria-modal-title", text: "\u{1F4AD} \u6B64\u523B\u60F3\u5230\u4E86\u4EC0\u4E48\uFF1F" });
    const textarea = modal.createEl("textarea", {
      cls: "memoria-modal-textarea",
      attr: { placeholder: "Ctrl+Enter \u53D1\u9001 \xB7 Esc \u5173\u95ED" }
    });
    const btns = modal.createDiv({ cls: "memoria-modal-btns" });
    const cancelBtn = btns.createEl("button", { text: "\u53D6\u6D88" });
    const sendBtn = btns.createEl("button", { text: "\u53D1\u9001", cls: "mod-cta" });
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
        new import_obsidian8.Notice("\u2713 \u5DF2\u8BB0\u4E0B");
        close();
      } catch (e) {
        new import_obsidian8.Notice("\u4FDD\u5B58\u5931\u8D25\uFF1A" + (e instanceof Error ? e.message : String(e)));
      }
    };
    cancelBtn.addEventListener("click", close);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });
    textarea.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        submit();
      } else if (e.key === "Escape") close();
    });
    sendBtn.addEventListener("click", submit);
  }
};

import { App, normalizePath, TFile } from "obsidian";
import { Memo, MemoriaSettings, TAG_PINNED, TAG_STARRED } from "./types";
import { parseMemos, formatDate, formatTime, getWeekday, buildMemoBlock } from "./parser";

export class MemoStore {
  private memos: Memo[] = [];
  private listeners: (() => void)[] = [];
  private loading = false;

  constructor(private app: App, private settings: MemoriaSettings) {}

  onChange(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  getAll(): Memo[] {
    return this.memos;
  }

  async reloadAll() {
    if (this.loading) return;
    this.loading = true;
    try {
      const files = this.collectFiles();
      const all: Memo[] = [];
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

  async reloadFile(file: TFile) {
    if (!this.isInFolder(file)) return;
    const content = await this.app.vault.read(file);
    const parsed = parseMemos(file.path, content);
    this.memos = this.memos.filter(m => m.file !== file.path);
    this.memos.push(...parsed);
    this.sortMemos(this.memos);
    this.emit();
  }

  removeFile(filePath: string) {
    const prev = this.memos.length;
    this.memos = this.memos.filter(m => m.file !== filePath);
    if (this.memos.length !== prev) this.emit();
  }

  private sortMemos(memos: Memo[]) {
    memos.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      const diff = b.datetime.getTime() - a.datetime.getTime();
      if (diff !== 0) return diff;
      if (a.file !== b.file) return a.file < b.file ? 1 : -1;
      return b.range[0] - a.range[0];
    });
  }

  collectFiles(): TFile[] {
    const folder = normalizePath(this.settings.folder);
    return this.app.vault.getMarkdownFiles().filter(f => {
      return f.path === `${folder}/${f.name}` || f.path.startsWith(`${folder}/`);
    });
  }

  isInFolder(file: TFile): boolean {
    const folder = normalizePath(this.settings.folder);
    return file.path.startsWith(`${folder}/`);
  }

  async addMemo(content: string, date = new Date()) {
    content = content.trim();
    if (!content) return;
    const year = date.getFullYear().toString();
    const dateStr = formatDate(date);
    const timeStr = formatTime(date);
    const weekday = getWeekday(date);
    const folder = normalizePath(this.settings.folder);
    await this.ensureFolder(folder);
    const filePath = `${folder}/${year}.md`;
    const existing = this.app.vault.getAbstractFileByPath(filePath);
    if (existing) {
      const raw = await this.app.vault.read(existing as TFile);
      const updated = this.insertMemoIntoYear(raw, year, dateStr, weekday, timeStr, content);
      await this.app.vault.modify(existing as TFile, updated);
    } else {
      await this.app.vault.create(
        filePath,
        `# ${year}\n\n## ${dateStr} ${weekday}\n\n${buildMemoBlock(timeStr, content)}\n\n`
      );
    }
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file) await this.reloadFile(file as TFile);
  }

  async editMemo(memo: Memo, newContent: string) {
    newContent = newContent.trim();
    if (!newContent) return;
    const file = this.app.vault.getAbstractFileByPath(memo.file);
    if (!file) return;
    const raw = await this.app.vault.read(file as TFile);
    const lines = raw.split(/\r?\n/);
    const [start, end] = memo.range;
    const newBlock = buildMemoBlock(memo.time, newContent).split("\n");
    lines.splice(start, end - start + 1, ...newBlock);
    await this.app.vault.modify(file as TFile, lines.join("\n"));
    await this.reloadFile(file as TFile);
  }

  async deleteMemo(memo: Memo) {
    const file = this.app.vault.getAbstractFileByPath(memo.file);
    if (!file) return;
    if (this.settings.useTrash) {
      try { await this.appendToTrash(memo); }
      catch (e) { console.error("[Memoria] 写入回收站失败（将继续执行删除）:", e); }
    }
    const raw = await this.app.vault.read(file as TFile);
    const lines = raw.split(/\r?\n/);
    const [start, end] = memo.range;
    lines.splice(start, end - start + 1);
    this.removeOrphanDateHeaders(lines);
    const cleaned: string[] = [];
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
    await this.app.vault.modify(file as TFile, cleaned.join("\n"));
    await this.reloadFile(file as TFile);
  }

  private removeOrphanDateHeaders(lines: string[]) {
    const dateHeadRe = /^##\s+\d{4}-\d{2}-\d{2}(?:\s+.+)?$/;
    const memoLineRe = /^- \d{2}:\d{2}/;
    const headingRe = /^#{1,2}\s+/;
    const toRemove: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (!dateHeadRe.test(lines[i])) continue;
      let hasMemo = false;
      for (let j = i + 1; j < lines.length && !headingRe.test(lines[j]); j++) {
        if (memoLineRe.test(lines[j])) { hasMemo = true; break; }
      }
      if (!hasMemo) toRemove.push(i);
    }
    for (let i = toRemove.length - 1; i >= 0; i--) lines.splice(toRemove[i], 1);
  }

  private async appendToTrash(memo: Memo) {
    const folder = normalizePath(this.settings.folder);
    await this.ensureFolder(folder);
    const trashPath = `${folder}/_trash.md`;
    const now = new Date();
    const timestamp = `${formatDate(now)} ${formatTime(now)}`;
    const indented = memo.content.split("\n").map(l => (l === "" ? "" : `  ${l}`)).join("\n");
    const entry = `\n## 已删除 ${timestamp}\n\n- 来源：\`${memo.file}\` · 原时间 ${memo.date} ${memo.time}\n${indented}\n`;
    const existing = this.app.vault.getAbstractFileByPath(trashPath);
    if (!existing) {
      await this.app.vault.create(
        trashPath,
        "# Memoria 回收站\n\n> 这里保存被删除的笔记。停用插件后依然可读，可手动恢复或清空。\n> 该文件不会被 Memoria 主视图识别为普通笔记。\n" + entry
      );
    } else {
      const raw = await this.app.vault.read(existing as TFile);
      await this.app.vault.modify(existing as TFile, raw + entry);
    }
  }

  async togglePinned(memo: Memo) { await this.toggleReservedTag(memo, TAG_PINNED); }
  async toggleStarred(memo: Memo) { await this.toggleReservedTag(memo, TAG_STARRED); }

  private async toggleReservedTag(memo: Memo, tag: string) {
    const hasTag = memo.tags.includes(tag);
    let newContent: string;
    if (hasTag) {
      const re = new RegExp(`\\s*#${escapeRegex(tag)}(?![A-Za-z0-9_\\u4e00-\\u9fff/])`, "g");
      newContent = memo.content.replace(re, "");
      newContent = newContent.split("\n").map(l => l.replace(/[ \t]+$/, "")).join("\n")
        .replace(/\n{3,}/g, "\n\n").trim();
      if (newContent === "") newContent = " ";
    } else {
      const lines = memo.content.split("\n");
      if (lines.length === 0 || lines[0].trim() === "") lines[0] = `#${tag}`;
      else lines[0] = `${lines[0].replace(/\s+$/, "")} #${tag}`;
      newContent = lines.join("\n");
    }
    await this.editMemo(memo, newContent);
  }

  async saveImageAttachment(data: ArrayBuffer, ext: string): Promise<string> {
    const folder = normalizePath(this.settings.attachmentFolder);
    await this.ensureFolder(folder);
    const now = new Date();
    const ts = now.getFullYear().toString() +
      pad(now.getMonth() + 1) + pad(now.getDate()) + "-" +
      pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
    const rand = Math.random().toString(36).slice(2, 6);
    const cleanExt = (ext || "png").replace(/^\./, "").toLowerCase();
    const filePath = `${folder}/memoria-${ts}-${rand}.${cleanExt}`;
    await this.app.vault.createBinary(filePath, data);
    return filePath;
  }

  private async ensureFolder(path: string) {
    if (!this.app.vault.getAbstractFileByPath(path)) {
      await this.app.vault.createFolder(path);
    }
  }

  private insertMemoIntoYear(
    raw: string, year: string, dateStr: string,
    weekday: string, time: string, content: string
  ): string {
    const lines = raw.split(/\r?\n/);
    const yearHead = `# ${year}`;
    const memoBlock = buildMemoBlock(time, content);

    let yearIdx = lines.findIndex(l => l.trim() === yearHead);
    if (yearIdx < 0) {
      if (lines.length && lines[0].trim() !== "") lines.unshift("", yearHead, "");
      else lines.unshift(yearHead, "");
      yearIdx = lines.findIndex(l => l.trim() === yearHead);
    }

    const dateRe = new RegExp(`^##\\s+${dateStr}(?:\\s+.+)?$`);
    const dateIdx = lines.findIndex(l => dateRe.test(l));

    if (dateIdx >= 0) {
      let sectionEnd = lines.length;
      for (let i = dateIdx + 1; i < lines.length; i++) {
        if (/^#{1,2}\s+/.test(lines[i])) { sectionEnd = i; break; }
      }
      const insertAt = this.trimTrailingBlank(lines, dateIdx + 1, sectionEnd);
      lines.splice(insertAt, 0, "", memoBlock);
      return lines.join("\n");
    }

    const laterDateRe = /^##\s+(\d{4}-\d{2}-\d{2})/;
    let insertBefore = -1;
    for (let i = yearIdx + 1; i < lines.length; i++) {
      const m = lines[i].match(laterDateRe);
      if (m && m[1] > dateStr) { insertBefore = i; break; }
    }

    const newSection = ["", `## ${dateStr} ${weekday}`, "", memoBlock, ""];
    if (insertBefore === -1) {
      if (lines[lines.length - 1]?.trim() !== "") lines.push("");
      lines.push(...newSection.filter((_, i) => i > 0));
    } else {
      lines.splice(insertBefore, 0, ...newSection);
    }
    return lines.join("\n");
  }

  private trimTrailingBlank(lines: string[], start: number, end: number): number {
    let last = start;
    for (let i = start; i < end; i++) {
      if (lines[i].trim() !== "") last = i + 1;
    }
    return last;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

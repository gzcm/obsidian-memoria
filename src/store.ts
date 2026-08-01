import { App, normalizePath, TFile } from "obsidian";
import { Memo, MemoriaSettings, RESERVED_TAGS, TAG_PINNED, TAG_STARRED, TagStat, TrashItem } from "./types";
import { parseMemos, formatDate, formatTime, getWeekday, buildMemoBlock, extractTags, buildDatetime } from "./parser";
import { ensureFolder } from "./vault";
import { replaceTagInContent } from "./tag-rewrite";

interface ReloadLock {
  running: boolean;
  pending: boolean;
}

export class MemoStore {
  private memos: Memo[] = [];
  private listeners: (() => void)[] = [];
  private loading = false;
  /** v2.0.3: 防 reloadFile 竞态 */
  private reloadLocks = new Map<string, ReloadLock>();

  constructor(private app: App, private settings: MemoriaSettings) {}

  onChange(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  /** v2.0.3: 公开通知变更（供 year-view 等使用） */
  notifyChange() {
    this.emit();
  }

  getAll(): Memo[] {
    return this.memos;
  }

  async reloadAll() {
    if (this.loading) return;
    this.loading = true;
    try {
      const files = this.collectFiles();
      const results = await Promise.all(files.map(async f => {
        const content = await this.app.vault.read(f);
        return parseMemos(f.path, content);
      }));
      const all: Memo[] = [];
      for (const arr of results) all.push(...arr);
      this.sortMemos(all);
      this.memos = all;
      this.emit();
    } finally {
      this.loading = false;
    }
  }

  /** v2.0.3: 竞态安全版 reloadFile */
  async reloadFile(file: TFile) {
    if (!this.isInFolder(file)) return;
    const key = file.path;
    const existing = this.reloadLocks.get(key);
    if (existing && existing.running) {
      existing.pending = true;
      return;
    }
    const lock: ReloadLock = { running: true, pending: false };
    this.reloadLocks.set(key, lock);
    try {
      do {
        lock.pending = false;
        const current = this.app.vault.getAbstractFileByPath(key);
        if (!(current instanceof TFile)) break;
        const content = await this.app.vault.read(current);
        const parsed = parseMemos(current.path, content);
        this.memos = this.memos.filter(m => m.file !== current.path);
        this.memos.push(...parsed);
        this.sortMemos(this.memos);
        this.emit();
      } while (lock.pending);
    } finally {
      this.reloadLocks.delete(key);
    }
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

  /** v2.0.3: 忽略 _ 前缀文件（_trash.md 等） */
  collectFiles(): TFile[] {
    const folder = normalizePath(this.settings.folder);
    const exportsPrefix = `${folder}/exports/`;
    return this.app.vault.getMarkdownFiles().filter(f => {
      if (f.name.startsWith("_")) return false;
      // v2.0.3: 忽略导出文件目录，防止导出的 md 被当作笔记加载
      if (f.path.startsWith(exportsPrefix)) return false;
      return f.path === `${folder}/${f.name}` || f.path.startsWith(`${folder}/`);
    });
  }

  isInFolder(file: TFile): boolean {
    if (file.name.startsWith("_")) return false;
    const folder = normalizePath(this.settings.folder);
    // v2.0.3: 忽略导出文件目录
    if (file.path.startsWith(`${folder}/exports/`)) return false;
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
    await ensureFolder(this.app, folder);
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
    const [start, end] = this.locateMemoRange(file.path, raw, memo);
    const newBlock = buildMemoBlock(memo.time, newContent).split("\n");
    lines.splice(start, end - start + 1, ...newBlock);
    await this.app.vault.modify(file as TFile, lines.join("\n"));
    await this.reloadFile(file as TFile);
  }

  private locateMemoRange(filePath: string, raw: string, memo: Memo): [number, number] {
    const parsed = parseMemos(filePath, raw);
    const sameRange = parsed.find(m =>
      m.range[0] === memo.range[0] &&
      m.range[1] === memo.range[1] &&
      m.date === memo.date &&
      m.time === memo.time &&
      m.content === memo.content
    );
    if (sameRange) return sameRange.range;

    const reparsed = parsed.filter(m =>
      m.date === memo.date &&
      m.time === memo.time &&
      m.content === memo.content
    );
    if (reparsed.length === 0) throw new Error("文件内容已变更，找不到原笔记位置，请关闭编辑后刷新重试");
    reparsed.sort((a, b) => {
      const da = Math.abs(a.range[0] - memo.range[0]);
      const db = Math.abs(b.range[0] - memo.range[0]);
      return da !== db ? da - db : a.range[0] - b.range[0];
    });
    return reparsed[0].range;
  }

  /** v2.0.3: 编辑笔记内容 + 时间（可跨日/跨年） */
  async editMemoDateTime(memo: Memo, newDate: Date, newContent?: string) {
    const file = this.app.vault.getAbstractFileByPath(memo.file);
    if (!file) throw new Error("找不到原笔记文件");
    const content = (newContent ?? memo.content).trim();
    if (!content) throw new Error("内容不能为空");

    const year = newDate.getFullYear().toString();
    const dateStr = formatDate(newDate);
    const timeStr = formatTime(newDate);
    const weekday = getWeekday(newDate);

    // 完全没变，跳过
    if (dateStr === memo.date && timeStr === memo.time && content === memo.content) return;

    // 1. 从旧位置删除
    const raw = await this.app.vault.read(file as TFile);
    const lines = raw.split(/\r?\n/);
    const [start, end] = this.locateMemoRange(file.path, raw, memo);
    lines.splice(start, end - start + 1);
    this.removeOrphanDateHeaders(lines);
    await this.app.vault.modify(file as TFile, this.compactBlankLines(lines).join("\n"));

    // 2. 插入到新位置
    const folder = normalizePath(this.settings.folder);
    await ensureFolder(this.app, folder);
    const newPath = `${folder}/${year}.md`;
    if (newPath === file.path) {
      // 同年: 直接插入
      const newRaw = await this.app.vault.read(file as TFile);
      const updated = this.insertMemoIntoYear(newRaw, year, dateStr, weekday, timeStr, content);
      await this.app.vault.modify(file as TFile, updated);
      await this.reloadFile(file as TFile);
    } else {
      // 跨年
      const targetFile = this.app.vault.getAbstractFileByPath(newPath);
      if (targetFile) {
        const targetRaw = await this.app.vault.read(targetFile as TFile);
        const updated = this.insertMemoIntoYear(targetRaw, year, dateStr, weekday, timeStr, content);
        await this.app.vault.modify(targetFile as TFile, updated);
      } else {
        await this.app.vault.create(
          newPath,
          `# ${year}\n\n## ${dateStr} ${weekday}\n\n${buildMemoBlock(timeStr, content)}\n\n`
        );
      }
      await this.reloadFile(file as TFile);
      const newFile = this.app.vault.getAbstractFileByPath(newPath);
      if (newFile) await this.reloadFile(newFile as TFile);
    }
  }

  async deleteMemo(memo: Memo) {
    const file = this.app.vault.getAbstractFileByPath(memo.file);
    if (!file) return;
    const raw = await this.app.vault.read(file as TFile);
    const lines = raw.split(/\r?\n/);
    const [start, end] = this.locateMemoRange(file.path, raw, memo);
    if (this.settings.useTrash) {
      try { await this.appendToTrash(memo); }
      catch (e) { console.error("[Memoria] 写入回收站失败（将继续执行删除）:", e); }
    }
    lines.splice(start, end - start + 1);
    this.removeOrphanDateHeaders(lines);
    await this.app.vault.modify(file as TFile, this.compactBlankLines(lines).join("\n"));
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
    await ensureFolder(this.app, folder);
    const trashPath = this.getTrashFilePath();
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
      let raw = await this.app.vault.read(existing as TFile);
      raw = raw + entry;
      raw = this.trimTrashToLimit(raw, this.settings.trashMaxItems);
      await this.app.vault.modify(existing as TFile, raw);
    }
  }

  getTrashFilePath(): string {
    const folder = normalizePath(this.settings.folder);
    return `${folder}/_trash.md`;
  }

  /** 2026-06-03: 回收站 UI 入口统一走这里，避免视图层手动解析 _trash.md 导致恢复定位出错 */
  async getTrashItems(): Promise<TrashItem[]> {
    const file = this.app.vault.getAbstractFileByPath(this.getTrashFilePath());
    if (!(file instanceof TFile)) return [];
    const raw = await this.app.vault.read(file);
    return this.parseTrashItems(raw);
  }

  /** 2026-06-03: 恢复先插回年份文件，再移除回收站条目；顺序反过来会增加误删风险 */
  async restoreTrashItem(id: string): Promise<TrashItem> {
    const item = await this.findTrashItem(id);
    const date = buildDatetime(item.originalDate, item.originalTime);
    await this.addMemo(item.content, date);
    await this.removeTrashItem(id);
    return item;
  }

  /** 2026-06-03: 清空回收站保留文件说明，方便用户知道这个文件仍是 Memoria 的安全兜底 */
  async clearTrash() {
    const folder = normalizePath(this.settings.folder);
    await ensureFolder(this.app, folder);
    const trashPath = this.getTrashFilePath();
    const header = "# Memoria 回收站\n\n> 这里保存被删除的笔记。停用插件后依然可读，可手动恢复或清空。\n> 该文件不会被 Memoria 主视图识别为普通笔记。\n";
    const existing = this.app.vault.getAbstractFileByPath(trashPath);
    if (existing instanceof TFile) await this.app.vault.modify(existing, header);
    else await this.app.vault.create(trashPath, header);
  }

  private async findTrashItem(id: string): Promise<TrashItem> {
    const items = await this.getTrashItems();
    const item = items.find(x => x.id === id);
    if (!item) throw new Error("回收站条目已变更，请刷新后重试");
    return item;
  }

  async removeTrashItem(id: string): Promise<TrashItem> {
    const file = this.app.vault.getAbstractFileByPath(this.getTrashFilePath());
    if (!(file instanceof TFile)) throw new Error("找不到回收站文件");
    const raw = await this.app.vault.read(file);
    const items = this.parseTrashItems(raw);
    const item = items.find(x => x.id === id);
    if (!item) throw new Error("回收站条目已变更，请刷新后重试");

    const lines = raw.split(/\r?\n/);
    lines.splice(item.range[0], item.range[1] - item.range[0] + 1);
    await this.app.vault.modify(file, this.compactBlankLines(lines).join("\n"));
    return item;
  }

  private parseTrashItems(raw: string): TrashItem[] {
    const lines = raw.split(/\r?\n/);
    const items: TrashItem[] = [];
    const headRe = /^##\s+已删除\s+(.+)$/;
    const metaRe = /^-\s+来源：`([^`]+)`\s+·\s+原时间\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/;

    for (let i = 0; i < lines.length; i++) {
      const head = lines[i].match(headRe);
      if (!head) continue;
      const metaOffset = findMetaOffset(lines[i + 1] ?? "", lines[i + 2] ?? "");
      if (metaOffset < 0) continue;
      const metaLine = lines[i + metaOffset] ?? "";
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
      const contentLines = lines.slice(contentStart, end + 1)
        .map(l => l.startsWith("  ") ? l.slice(2) : l);
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
        range: [i, end],
      });
    }
    return items.reverse();
  }

  private compactBlankLines(lines: string[]): string[] {
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
    while (cleaned.length > 1 && cleaned[cleaned.length - 1].trim() === "" && cleaned[cleaned.length - 2].trim() === "") cleaned.pop();
    return cleaned;
  }

  /** v2.0.3: 回收站上限裁剪 */
  private trimTrashToLimit(raw: string, limit: number): string {
    if (!limit || limit <= 0) return raw;
    const lines = raw.split(/\r?\n/);
    const trashHeadRe = /^##\s+已删除\s+/;
    const indices: number[] = [];
    for (let i = 0; i < lines.length; i++) if (trashHeadRe.test(lines[i])) indices.push(i);
    if (indices.length <= limit) return raw;
    const cutoff = indices[indices.length - limit];
    const headerEnd = indices[0];
    const header = lines.slice(0, headerEnd);
    const tail = lines.slice(cutoff);
    while (header.length && header[header.length - 1].trim() === "") header.pop();
    return header.join("\n") + "\n\n" + tail.join("\n");
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
      if (newContent === "") newContent = `（已取消${tag}）`;
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
    await ensureFolder(this.app, folder);
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

  getTagStats(): TagStat[] {
    const counts = new Map<string, number>();
    for (const memo of this.memos) {
      const seen = new Set<string>();
      for (const tag of memo.tags) {
        if (RESERVED_TAGS.has(tag) || seen.has(tag)) continue;
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
        seen.add(tag);
      }
    }
    return [...counts.entries()]
      .map(([name, memoCount]) => ({ name, memoCount }))
      .sort((a, b) => b.memoCount - a.memoCount || a.name.localeCompare(b.name));
  }

  async renameTag(oldTag: string, newTag: string): Promise<number> {
    const from = normalizeTagName(oldTag);
    const to = normalizeTagName(newTag);
    if (!from || !to) throw new Error("标签不能为空");
    if (RESERVED_TAGS.has(from) || RESERVED_TAGS.has(to)) throw new Error("置顶、收藏是保留标签，不能在标签整理工具中改名");
    if (from === to) return 0;
    return await this.rewriteTagsAcrossMemos(content => replaceTagInContent(content, from, to));
  }

  async removeTag(tag: string): Promise<number> {
    const target = normalizeTagName(tag);
    if (!target) throw new Error("标签不能为空");
    if (RESERVED_TAGS.has(target)) throw new Error("置顶、收藏是保留标签，不能在标签整理工具中删除");
    return await this.rewriteTagsAcrossMemos(content => replaceTagInContent(content, target, null));
  }

  /** 2026-06-03: 标签整理批量改写只替换 memo 内容块，避免误改年份标题、回收站和导出文件 */
  private async rewriteTagsAcrossMemos(transform: (content: string) => string): Promise<number> {
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
        if (nextTags.join("\u0000") === memo.tags.join("\u0000")) continue;
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
  async promoteMemoToNote(memo: Memo, title: string, folder: string): Promise<string> {
    const targetFolder = normalizePath(folder.trim() || this.settings.promoteFolder || "Memoria/notes");
    await ensureFolder(this.app, targetFolder);
    const safeTitle = sanitizeFileName(title.trim() || memo.content.split("\n")[0] || "Memoria memo");
    const baseName = `${memo.date}-${memo.time.replace(":", "")}-${safeTitle}`.slice(0, 100);
    const filePath = await this.getUniqueMarkdownPath(targetFolder, baseName);
    const content = this.buildPromotedNoteContent(memo, title.trim() || safeTitle);
    await this.app.vault.create(filePath, content);
    return filePath;
  }

  private async getUniqueMarkdownPath(folder: string, baseName: string): Promise<string> {
    let filePath = `${folder}/${baseName}.md`;
    let idx = 2;
    while (this.app.vault.getAbstractFileByPath(filePath)) {
      filePath = `${folder}/${baseName}-${idx}.md`;
      idx++;
    }
    return filePath;
  }

  private buildPromotedNoteContent(memo: Memo, title: string): string {
    const now = new Date().toISOString();
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
      `> 来源：Memoria · ${memo.date} ${memo.time}`,
      "",
      "## 原文",
      "",
      body,
      "",
    ].join("\n");
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
      // v2.0.3: 按时间升序找插入位置
      let sectionEnd = lines.length;
      for (let i = dateIdx + 1; i < lines.length; i++) {
        if (/^#{1,2}\s+/.test(lines[i])) { sectionEnd = i; break; }
      }
      const timeLineRe = /^-\s+(\d{2}:\d{2})(?:\s|$)/;
      let insertIdx = -1;
      for (let i = dateIdx + 1; i < sectionEnd; i++) {
        const m = lines[i].match(timeLineRe);
        if (m && m[1] > time) { insertIdx = i; break; }
      }
      if (insertIdx >= 0) {
        // 插入前回退空行
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
      if (yearHeadRe.test(lines[i])) { yearSectionEnd = i; break; }
    }
    for (let i = yearIdx + 1; i < yearSectionEnd; i++) {
      const m = lines[i].match(laterDateRe);
      if (m && m[1] > dateStr) { insertBefore = i; break; }
    }

    const newSection = ["", `## ${dateStr} ${weekday}`, "", memoBlock, ""];
    if (insertBefore === -1) {
      if (yearSectionEnd < lines.length) {
        // 在年份结束前插入
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

function findMetaOffset(line1: string, line2: string): number {
  const metaRe = /^-\s+来源：`([^`]+)`\s+·\s+原时间\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/;
  if (metaRe.test(line1)) return 1;
  if (metaRe.test(line2)) return 2;
  return -1;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60) || "Memoria memo";
}

function hashString(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function normalizeTagName(tag: string): string {
  const normalized = tag.trim().replace(/^#/, "").replace(/\/+$/, "");
  if (!normalized) return "";
  if (!/^[A-Za-z0-9_一-鿿][A-Za-z0-9_一-鿿/]*$/.test(normalized)) {
    throw new Error("标签只能包含字母、数字、下划线、中文和 /");
  }
  return normalized;
}

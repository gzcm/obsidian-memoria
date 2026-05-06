import {
  Component, ItemView, MarkdownRenderer, Menu, Notice, Platform, setIcon, TFile, WorkspaceLeaf,
} from "obsidian";
import { Memo, MemoriaSettings, RESERVED_TAGS, VIEW_TYPE_MEMORIA, VIEW_TYPE_STATS } from "./types";
import { MemoStore } from "./store";
import { TagSuggest } from "./tag-suggest";
import { extractImages, renderImageGrid, showLightbox } from "./image";
import { renderCalendar } from "./calendar";
import { normalizeForRender } from "./parser";

interface MemoFilter {
  tag: string | null;
  year: string | null;
  date: string | null;
  keyword: string;
  preset: string;
  randomSeed?: number;
}

export class MemoriaView extends ItemView {
  static readonly DRAFT_KEY_PREFIX = "memoria:input-draft";

  private store: MemoStore;
  private settings: MemoriaSettings;
  private filter: MemoFilter = { tag: null, year: null, date: null, keyword: "", preset: "all" };
  private unsubscribe: (() => void) | null = null;
  private childComponent = new Component();
  private pageLimit: number;
  private tagsExpanded = false;
  private tagSuggest: TagSuggest | null = null;
  private overviewMode: "heatmap" | "calendar" = "heatmap";
  private editingMemo: Memo | null = null;
  private timeOverride: string | null = null;
  private timeTickHandle: number | null = null;

  private sidebarEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private searchEl!: HTMLInputElement;
  private listEl!: HTMLElement;
  private editBannerEl: HTMLElement | null = null;
  private timeChipEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, store: MemoStore, settings: MemoriaSettings) {
    super(leaf);
    this.store = store;
    this.settings = settings;
    this.pageLimit = this.getInitialPageLimit();
  }

  private getInitialPageLimit(): number {
    return Math.max(10, this.settings.pageSize || 50);
  }

  getViewType() { return VIEW_TYPE_MEMORIA; }
  getDisplayText() { return "Memoria"; }
  getIcon() { return "feather"; }

  async onOpen() {
    this.contentEl.addClass("memoria-root");
    this.buildLayout();
    this.unsubscribe = this.store.onChange(() => this.renderAll());
    try { await this.store.reloadAll(); } catch (e) { console.error("[Memoria] reloadAll failed:", e); }
    const draft = this.loadDraft();
    if (draft) this.inputEl.value = draft;
    this.autoResizeInput();
    this.renderAll();
  }

  async onClose() {
    this.unsubscribe?.();
    this.tagSuggest?.destroy();
    this.tagSuggest = null;
    this.stopTimeTick();
    this.childComponent.unload();
  }

  private buildLayout() {
    const root = this.contentEl;
    root.empty();
    root.addClass("memoria-container");

    const shell = root.createDiv({ cls: "memoria-shell" });
    this.sidebarEl = shell.createDiv({ cls: "memoria-sidebar" });
    shell.createDiv({ cls: "memoria-sidebar-overlay" })
      .addEventListener("click", () => this.toggleSidebar(false));

    const main = shell.createDiv({ cls: "memoria-main" });

    // 顶栏
    const topbar = main.createDiv({ cls: "memoria-topbar" });
    const title = topbar.createDiv({ cls: "memoria-topbar-title" });
    setIcon(title.createSpan({ cls: "memoria-logo" }), "feather");
    title.createSpan({ cls: "memoria-brand", text: "Memoria" });

    const searchWrap = topbar.createDiv({ cls: "memoria-search-wrap" });
    setIcon(searchWrap.createDiv({ cls: "memoria-search-icon" }), "search");
    this.searchEl = searchWrap.createEl("input", {
      cls: "memoria-search",
      attr: { placeholder: "搜索笔记...", type: "text" },
    });
    this.searchEl.addEventListener("input", () => {
      this.filter.keyword = this.searchEl.value.trim();
      this.pageLimit = this.getInitialPageLimit();
      this.renderList();
    });

    const refreshBtn = searchWrap.createEl("button", { cls: "memoria-icon-btn", attr: { "aria-label": "刷新" } });
    setIcon(refreshBtn, "refresh-cw");
    refreshBtn.addEventListener("click", () => this.store.reloadAll());

    const statsBtn = searchWrap.createEl("button", { cls: "memoria-icon-btn", attr: { "aria-label": "数据报告" } });
    setIcon(statsBtn, "bar-chart-3");
    statsBtn.addEventListener("click", async () => {
      const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_STATS);
      if (existing.length) { this.app.workspace.revealLeaf(existing[0]); return; }
      const leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE_STATS, active: true });
      this.app.workspace.revealLeaf(leaf);
    });

    const menuBtn = topbar.createEl("button", {
      cls: "memoria-icon-btn memoria-sidebar-toggle",
      attr: { "aria-label": "切换侧栏" },
    });
    setIcon(menuBtn, "menu");
    menuBtn.addEventListener("click", () => this.toggleSidebar(!this.contentEl.hasClass("memoria-sidebar-open")));

    this.buildInputCard(main);
    this.listEl = main.createDiv({ cls: "memoria-list" });
    this.listEl.addEventListener("scroll", () => {
      if (this.listEl.scrollTop + this.listEl.clientHeight >= this.listEl.scrollHeight - 200) {
        const filtered = this.getFilteredMemos();
        if (this.pageLimit < filtered.length) { this.pageLimit += this.getInitialPageLimit(); this.renderList(); }
      }
    });
  }

  private buildInputCard(parent: HTMLElement) {
    const card = parent.createDiv({ cls: "memoria-input-card" });
    this.inputEl = card.createEl("textarea", {
      cls: "memoria-input",
      attr: { placeholder: "此刻，你在想什么？" },
    });
    this.tagSuggest = new TagSuggest(this.app, this.inputEl);

    this.inputEl.addEventListener("keydown", e => {
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
    this.inputEl.addEventListener("paste", async e => {
      const items = e.clipboardData?.items;
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
    this.inputEl.addEventListener("dragover", e => { e.preventDefault(); this.inputEl.addClass("dragging"); });
    this.inputEl.addEventListener("dragleave", () => this.inputEl.removeClass("dragging"));
    this.inputEl.addEventListener("drop", async e => {
      e.preventDefault();
      this.inputEl.removeClass("dragging");
      for (const file of Array.from(e.dataTransfer?.files ?? [])) {
        if (file.type.startsWith("image/")) await this.handleImageFile(file);
      }
    });

    const toolbar = card.createDiv({ cls: "memoria-input-toolbar" });
    const tools = toolbar.createDiv({ cls: "memoria-input-tools" });

    const tagBtn = tools.createEl("button", { cls: "memoria-tool-btn", attr: { "aria-label": "插入标签 #" } });
    setIcon(tagBtn, "hash");
    tagBtn.addEventListener("click", () => this.insertAtCursor("#"));

    const imgBtn = tools.createEl("button", { cls: "memoria-tool-btn", attr: { "aria-label": "插入图片" } });
    setIcon(imgBtn, "image");
    imgBtn.addEventListener("click", () => this.pickImageFromDisk());

    const listBtn = tools.createEl("button", { cls: "memoria-tool-btn", attr: { "aria-label": "插入无序列表" } });
    setIcon(listBtn, "list");
    listBtn.addEventListener("click", () => this.insertListAtCursor("- "));

    const orderedBtn = tools.createEl("button", { cls: "memoria-tool-btn", attr: { "aria-label": "插入有序列表" } });
    setIcon(orderedBtn, "list-ordered");
    orderedBtn.addEventListener("click", () => this.insertOrderedListAtCursor());

    const taskBtn = tools.createEl("button", { cls: "memoria-tool-btn", attr: { "aria-label": "插入任务列表" } });
    setIcon(taskBtn, "square-check");
    taskBtn.addEventListener("click", () => this.insertListAtCursor("- [ ] "));

    const tableBtn = tools.createEl("button", { cls: "memoria-tool-btn", attr: { "aria-label": "插入表格" } });
    setIcon(tableBtn, "table");
    tableBtn.addEventListener("click", e => { e.stopPropagation(); this.showTablePicker(tableBtn); });

    tools.createSpan({ cls: "memoria-input-hint", text: "Ctrl+Enter · 拖拽/粘贴图片" });

    const submitWrap = toolbar.createDiv({ cls: "memoria-submit-wrap" });
    const cancelBtn = submitWrap.createEl("button", { cls: "memoria-cancel-btn memoria-hidden", text: "取消" });
    cancelBtn.addEventListener("click", () => this.exitEditMode());
    this.editBannerEl = cancelBtn;

    this.timeChipEl = submitWrap.createDiv({
      cls: "memoria-time-chip",
      attr: { title: "左键选择时间 · 右键重置为当前时间" },
    });
    this.timeChipEl.addEventListener("click", e => {
      e.stopPropagation();
      this.openTimePicker();
    });
    this.timeChipEl.addEventListener("contextmenu", e => {
      e.preventDefault();
      this.timeOverride = null;
      this.refreshTimeChip();
    });
    this.refreshTimeChip();
    this.timeTickHandle = window.setInterval(() => {
      if (this.timeOverride === null) this.refreshTimeChip();
    }, 30_000);

    const sendBtn = submitWrap.createEl("button", { cls: "memoria-submit-btn", text: "发送" });
    sendBtn.addEventListener("click", () => this.submitMemo());
  }

  private getEffectiveDate(): Date {
    const now = new Date();
    if (this.timeOverride === null) return now;
    const [h, m] = this.timeOverride.split(":").map(n => parseInt(n, 10));
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    return d;
  }

  private refreshTimeChip() {
    if (!this.timeChipEl) return;
    const d = this.getEffectiveDate();
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    this.timeChipEl.setText(`${hh}:${mm}`);
    this.timeChipEl.toggleClass("is-overridden", this.timeOverride !== null);
  }

  private stopTimeTick() {
    if (this.timeTickHandle !== null) {
      window.clearInterval(this.timeTickHandle);
      this.timeTickHandle = null;
    }
  }

  private openTimePicker() {
    const existing = document.querySelector(".memoria-time-picker");
    if (existing) { existing.remove(); return; }

    const now = new Date();
    let h: number;
    let m: number;
    if (this.timeOverride !== null) {
      const [oh, om] = this.timeOverride.split(":").map(n => parseInt(n, 10));
      h = oh; m = om;
    } else {
      h = now.getHours();
      m = now.getMinutes();
    }

    const picker = document.body.createDiv({ cls: "memoria-time-picker" });
    const label = picker.createDiv({ cls: "memoria-time-picker-label" });
    const cols = picker.createDiv({ cls: "memoria-time-picker-cols" });
    const hourCol = cols.createDiv({ cls: "memoria-time-picker-col memoria-time-picker-hours" });
    const minuteCol = cols.createDiv({ cls: "memoria-time-picker-col memoria-time-picker-minutes" });

    const hourCells: HTMLElement[] = [];
    const minuteCells: HTMLElement[] = [];

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
        text: i.toString().padStart(2, "0"),
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
        text: i.toString().padStart(2, "0"),
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

    // 弹层定位：以芯片为锚，弹在它上方
    const anchor = this.timeChipEl;
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      // 先放上去再读尺寸，确保 picker 完全可见
      picker.style.left = `${Math.round(rect.left)}px`;
      picker.style.top = `${Math.round(rect.top - 8)}px`;
      picker.style.transform = "translateY(-100%)";
    }

    // 滚动居中到当前选中行
    requestAnimationFrame(() => {
      hourCells[h]?.scrollIntoView({ block: "center" });
      minuteCells[m]?.scrollIntoView({ block: "center" });
    });

    setTimeout(() => {
      const onOutside = (e: MouseEvent) => {
        if (!picker.contains(e.target as Node) && e.target !== anchor && !anchor?.contains(e.target as Node)) {
          picker.remove();
          document.removeEventListener("mousedown", onOutside, true);
        }
      };
      document.addEventListener("mousedown", onOutside, true);
    }, 0);
  }

  private insertAtCursor(text: string) {
    const el = this.inputEl;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + text + el.value.slice(end);
    const pos = start + text.length;
    el.setSelectionRange(pos, pos);
    el.focus();
    if (!this.editingMemo) this.saveDraft(el.value);
    this.autoResizeInput();
  }

  private insertListAtCursor(prefix: string) {
    const el = this.inputEl;
    const pos = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, pos);
    const atLineStart = pos === 0 || before.endsWith("\n");
    this.insertAtCursor(atLineStart ? prefix : `\n${prefix}`);
  }

  private insertOrderedListAtCursor() {
    const el = this.inputEl;
    const pos = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, pos);
    const atLineStart = pos === 0 || before.endsWith("\n");
    const lines = (atLineStart ? before.replace(/\n$/, "") : before).split("\n");
    const orderedRe = /^(\d+)\.\s/;
    let nextNum = 1;
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (line.trim() === "") break;
      const m = line.match(orderedRe);
      if (m) { nextNum = parseInt(m[1], 10) + 1; break; }
      break;
    }
    const prefix = `${nextNum}. `;
    this.insertAtCursor(atLineStart ? prefix : `\n${prefix}`);
  }

  private handleListIndent(unindent: boolean): boolean {
    const el = this.inputEl;
    const pos = el.selectionStart ?? 0;
    const val = el.value;
    const lineStart = val.lastIndexOf("\n", pos - 1) + 1;
    let lineEnd = val.indexOf("\n", pos);
    if (lineEnd === -1) lineEnd = val.length;
    const line = val.slice(lineStart, lineEnd);
    if (!/^(\s*)(?:[-*]\s+\[[ xX]\]\s|[-*]\s|\d+\.\s)/.test(line)) return false;
    let newLine: string;
    let cursorDelta: number;
    if (unindent) {
      if (line.startsWith("  ")) { newLine = line.slice(2); cursorDelta = -2; }
      else if (line.startsWith(" ")) { newLine = line.slice(1); cursorDelta = -1; }
      else return true;
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

  private handleListContinuation(): boolean {
    const el = this.inputEl;
    const pos = el.selectionStart ?? 0;
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
      else this.insertAtCursor(`\n${indent}${marker}[ ]${sp}`);
      return true;
    }
    const orderedMatch = line.match(orderedRe);
    if (orderedMatch) {
      const [, indent, num, sp, content] = orderedMatch;
      if (content === "") this.replaceLineAndInsertNewline(lineStart, lineEnd);
      else {
        const nextNum = parseInt(num, 10) + 1;
        this.insertAtCursor(`\n${indent}${nextNum}${sp}`);
      }
      return true;
    }
    const bulletMatch = line.match(bulletRe);
    if (bulletMatch) {
      const [, indent, marker, content] = bulletMatch;
      if (content === "") this.replaceLineAndInsertNewline(lineStart, lineEnd);
      else this.insertAtCursor(`\n${indent}${marker}`);
      return true;
    }
    return false;
  }

  private replaceLineAndInsertNewline(lineStart: number, lineEnd: number) {
    const el = this.inputEl;
    const val = el.value;
    el.value = val.slice(0, lineStart) + "\n" + val.slice(lineEnd);
    const newPos = lineStart + 1;
    el.setSelectionRange(newPos, newPos);
    if (!this.editingMemo) this.saveDraft(el.value);
    this.autoResizeInput();
  }

  private autoResizeInput() {
    const el = this.inputEl;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }

  private draftKey(): string {
    try {
      return `${MemoriaView.DRAFT_KEY_PREFIX}:${this.app.vault.getName()}`;
    } catch {
      return MemoriaView.DRAFT_KEY_PREFIX;
    }
  }

  private saveDraft(text: string) {
    try {
      const key = this.draftKey();
      if (text.trim() === "") window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, text);
    } catch {}
  }

  private loadDraft(): string {
    try { return window.localStorage.getItem(this.draftKey()) ?? ""; }
    catch { return ""; }
  }

  private clearDraft() {
    try { window.localStorage.removeItem(this.draftKey()); } catch {}
  }

  private showTablePicker(anchor: HTMLElement) {
    const existing = document.querySelector(".memoria-table-picker");
    if (existing) { existing.remove(); return; }
    const isMobile = Platform.isMobile;
    const size = isMobile ? 5 : 6;
    const picker = document.body.createDiv({ cls: "memoria-table-picker" + (isMobile ? " is-mobile" : "") });
    const label = picker.createDiv({
      cls: "memoria-table-picker-label",
      text: isMobile ? "点击格子直接插入" : "0 × 0",
    });
    const grid = picker.createDiv({ cls: "memoria-table-picker-grid" });
    const cells: HTMLElement[][] = [];
    for (let r = 0; r < size; r++) {
      cells[r] = [];
      for (let c = 0; c < size; c++) {
        const cell = grid.createDiv({ cls: "memoria-table-picker-cell" });
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);
        if (isMobile) cell.createSpan({ cls: "memoria-table-picker-cell-text", text: `${r + 1}×${c + 1}` });
        cells[r][c] = cell;
      }
    }
    let hoverRow = 0, hoverCol = 0;
    const highlight = (r: number, c: number) => {
      hoverRow = r; hoverCol = c;
      for (let i = 0; i < size; i++)
        for (let j = 0; j < size; j++)
          cells[i][j].toggleClass("is-active", i <= r && j <= c);
      label.setText(`${r + 1} × ${c + 1}`);
    };
    grid.addEventListener("mouseover", e => {
      const target = e.target as HTMLElement;
      if (!target.hasClass("memoria-table-picker-cell")) return;
      highlight(parseInt(target.dataset.row ?? "0"), parseInt(target.dataset.col ?? "0"));
    });
    grid.addEventListener("click", e => {
      if ((e.target as HTMLElement).hasClass("memoria-table-picker-cell")) {
        this.insertTable(hoverRow + 1, hoverCol + 1);
        picker.remove();
      }
    });
    const rect = anchor.getBoundingClientRect();
    picker.style.left = `${Math.round(rect.left)}px`;
    picker.style.top = `${Math.round(rect.bottom + 6)}px`;
    setTimeout(() => {
      const onOutside = (e: MouseEvent) => {
        if (!picker.contains(e.target as Node) && e.target !== anchor) {
          picker.remove();
          document.removeEventListener("mousedown", onOutside, true);
        }
      };
      document.addEventListener("mousedown", onOutside, true);
    }, 0);
  }

  private insertTable(rows: number, cols: number) {
    const header = "| " + Array(cols).fill("  ").join(" | ") + " |";
    const sep = "| " + Array(cols).fill("--").join(" | ") + " |";
    const dataRows = Array(Math.max(0, rows - 1)).fill(null)
      .map(() => "| " + Array(cols).fill("  ").join(" | ") + " |");
    const tableLines = [header, sep, ...dataRows];
    const el = this.inputEl;
    const val = el.value;
    const pos = el.selectionStart ?? val.length;
    const before = val.slice(0, pos);
    let prefix = "";
    let suffix = "";
    if (before.length > 0 && !before.endsWith("\n\n")) prefix = before.endsWith("\n") ? "\n" : "\n\n";
    const after = val.slice(pos);
    if (after && !after.startsWith("\n")) suffix = "\n\n";
    this.insertAtCursor(prefix + tableLines.join("\n") + suffix);
  }

  private pickImageFromDisk() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.addEventListener("change", async () => {
      for (const file of Array.from(input.files ?? [])) await this.handleImageFile(file);
    });
    input.click();
  }

  private async handleImageFile(file: File) {
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const data = await file.arrayBuffer();
      const savedPath = await this.store.saveImageAttachment(data, ext);
      const name = savedPath.split("/").pop() ?? savedPath;
      const link = `![[${name}]]`;
      const val = this.inputEl.value;
      if (val && !/\n$/.test(val)) this.insertAtCursor("\n" + link + "\n");
      else this.insertAtCursor(link + "\n");
      new Notice(`图片已保存: ${name}`);
    } catch (e: unknown) {
      console.error(e);
      new Notice("图片保存失败：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  private async submitMemo() {
    const text = this.inputEl.value.trim();
    if (!text) return;
    try {
      if (this.editingMemo) {
        await this.store.editMemo(this.editingMemo, text);
        new Notice("✓ 已更新");
        this.exitEditMode();
      } else {
        await this.store.addMemo(text, this.getEffectiveDate());
        new Notice("✓ 已记下");
        if (this.settings.clearAfterSave) {
          this.inputEl.value = "";
          this.clearDraft();
        }
      }
      this.autoResizeInput();
    } catch (e: unknown) {
      console.error(e);
      new Notice("保存失败：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  private toggleSidebar(open: boolean) {
    this.contentEl.toggleClass("memoria-sidebar-open", open);
  }

  enterEditMode(memo: Memo) {
    if (this.inputEl.value.trim() && !this.editingMemo) this.saveDraft(this.inputEl.value);
    this.editingMemo = memo;
    this.inputEl.value = memo.content;
    this.inputEl.focus();
    this.inputEl.setSelectionRange(this.inputEl.value.length, this.inputEl.value.length);
    this.updateEditBanner();
    this.autoResizeInput();
  }

  private exitEditMode() {
    this.editingMemo = null;
    this.inputEl.value = this.loadDraft();
    this.updateEditBanner();
    this.autoResizeInput();
  }

  private updateEditBanner() {
    if (!this.editBannerEl) return;
    const card = this.inputEl.closest(".memoria-input-card");
    if (this.editingMemo) {
      this.editBannerEl.removeClass("memoria-hidden");
      card?.addClass("is-editing");
      this.inputEl.setAttr("placeholder", `编辑 ${this.editingMemo.date} ${this.editingMemo.time} 的笔记（Esc 取消）`);
      this.timeChipEl?.addClass("memoria-hidden");
    } else {
      this.editBannerEl.addClass("memoria-hidden");
      card?.removeClass("is-editing");
      this.inputEl.setAttr("placeholder", "此刻，你在想什么？");
      this.timeChipEl?.removeClass("memoria-hidden");
      this.refreshTimeChip();
    }
  }

  renderAll() {
    this.renderSidebar();
    this.renderList();
  }

  private renderSidebar() {
    this.sidebarEl.empty();
    const all = this.store.getAll();
    const uniqueTags = new Set<string>();
    const uniqueDates = new Set<string>();
    let imgCount = 0, linkCount = 0, pinnedCount = 0, starredCount = 0, noTagCount = 0, onThisDayCount = 0;
    const todayStr = toDateStr(new Date());
    const todayMMDD = todayStr.slice(5);

    for (const m of all) {
      for (const t of m.tags) if (!RESERVED_TAGS.has(t)) uniqueTags.add(t);
      uniqueDates.add(m.date);
      if (m.hasImage) imgCount++;
      if (m.hasLink) linkCount++;
      if (m.isPinned) pinnedCount++;
      if (m.isStarred) starredCount++;
      if (m.date.slice(5) === todayMMDD && m.date !== todayStr) onThisDayCount++;
      if (m.tags.filter(t => !RESERVED_TAGS.has(t)).length === 0) noTagCount++;
    }

    const statsEl = this.sidebarEl.createDiv({ cls: "memoria-stats" });
    this.renderStatItem(statsEl, all.length.toString(), "笔记");
    this.renderStatItem(statsEl, uniqueTags.size.toString(), "标签");
    this.renderStatItem(statsEl, uniqueDates.size.toString(), "天数");

    const switchBtn = statsEl.createEl("button", {
      cls: "memoria-icon-btn memoria-overview-btn memoria-stats-switch",
      attr: {
        "aria-label": this.overviewMode === "heatmap" ? "切换为月历" : "切换为热力图",
        title: this.overviewMode === "heatmap" ? "切换为月历" : "切换为热力图",
      },
    });
    setIcon(switchBtn, this.overviewMode === "heatmap" ? "calendar" : "activity");
    switchBtn.addEventListener("click", () => {
      this.overviewMode = this.overviewMode === "heatmap" ? "calendar" : "heatmap";
      this.renderSidebar();
    });

    this.renderOverview(this.sidebarEl, all);

    this.sidebarEl.createDiv({ cls: "memoria-sidebar-section", text: "视图" });
    const navItems = [
      { key: "all", icon: "layout-grid", text: "全部笔记", count: all.length },
      { key: "pinned", icon: "pin", text: "置顶", count: pinnedCount },
      { key: "starred", icon: "star", text: "收藏", count: starredCount },
      { key: "today", icon: "calendar", text: "今天" },
      { key: "week", icon: "calendar-days", text: "本周" },
      { key: "on-this-day", icon: "history", text: "每日回顾", count: onThisDayCount },
      { key: "random", icon: "shuffle", text: "随机回顾" },
    ];
    for (const item of navItems) this.renderNavItem(item.key, item.icon, item.text, item.count);

    this.sidebarEl.createDiv({ cls: "memoria-sidebar-section", text: "检索式" });
    this.renderNavItem("no-tag", "tag", "无标签", noTagCount);
    this.renderNavItem("with-image", "image", "有图片", imgCount);
    this.renderNavItem("with-link", "link", "有链接", linkCount);

    const yearCounts = new Map<string, number>();
    for (const m of all) {
      const y = m.date.substring(0, 4);
      yearCounts.set(y, (yearCounts.get(y) ?? 0) + 1);
    }
    if (yearCounts.size) {
      this.sidebarEl.createDiv({ cls: "memoria-sidebar-section", text: "年份" });
      for (const [y, cnt] of [...yearCounts.entries()].sort((a, b) => b[0] < a[0] ? -1 : 1)) {
        const item = this.sidebarEl.createDiv({
          cls: "memoria-nav-item" + (this.filter.year === y ? " active" : ""),
        });
        setIcon(item.createDiv({ cls: "memoria-nav-icon" }), "calendar");
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
      const tagMap = new Map<string, number>();
      for (const m of all) for (const t of m.tags) if (!RESERVED_TAGS.has(t)) tagMap.set(t, (tagMap.get(t) ?? 0) + 1);
      if (tagMap.size) {
        const section = this.sidebarEl.createDiv({ cls: "memoria-sidebar-section memoria-section-collapsible" });
        section.createSpan({ cls: "memoria-section-arrow", text: this.tagsExpanded ? "▾" : "▸" });
        section.createSpan({ text: ` 标签 (${tagMap.size})` });
        section.addEventListener("click", () => { this.tagsExpanded = !this.tagsExpanded; this.renderSidebar(); });
        if (this.tagsExpanded) {
          this.renderTagTree(this.sidebarEl, this.buildTagTree(tagMap), 0);
        }
      }
    }
  }

  private renderNavItem(key: string, icon: string, text: string, count?: number) {
    const active = this.filter.preset === key && !this.filter.tag && !this.filter.year;
    const item = this.sidebarEl.createDiv({ cls: "memoria-nav-item" + (active ? " active" : "") });
    setIcon(item.createDiv({ cls: "memoria-nav-icon" }), icon);
    item.createSpan({ cls: "memoria-nav-text", text });
    if (count !== undefined) item.createSpan({ cls: "memoria-nav-count", text: String(count) });
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

  private renderStatItem(parent: HTMLElement, num: string, label: string) {
    const el = parent.createDiv({ cls: "memoria-stat" });
    el.createDiv({ cls: "memoria-stat-num", text: num });
    el.createDiv({ cls: "memoria-stat-label", text: label });
  }

  private renderOverview(parent: HTMLElement, memos: Memo[]) {
    const wrap = parent.createDiv({ cls: "memoria-overview" }).createDiv({ cls: "memoria-overview-content" });
    if (this.overviewMode === "heatmap") {
      this.renderHeatmap(wrap, memos);
    } else {
      renderCalendar(wrap, memos, {
        activeDate: this.filter.date,
        onPickDate: date => {
          this.filter.date = this.filter.date === date ? null : date;
          this.filter.preset = "all";
          this.pageLimit = this.getInitialPageLimit();
          this.renderAll();
        },
      });
    }
  }

  private renderHeatmap(parent: HTMLElement, memos: Memo[]) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const gridStart = new Date(startOfWeek);
    gridStart.setDate(startOfWeek.getDate() - 13 * 7);

    const dateCounts = new Map<string, number>();
    for (const m of memos) dateCounts.set(m.date, (dateCounts.get(m.date) ?? 0) + 1);

    const heatmap = parent.createDiv({ cls: "memoria-heatmap" });
    for (let col = 0; col < 14; col++) {
      const colEl = heatmap.createDiv({ cls: "memoria-heatmap-col" });
      for (let row = 0; row < 7; row++) {
        const date = new Date(gridStart);
        date.setDate(gridStart.getDate() + col * 7 + row);
        const dateStr = toDateStr(date);
        const count = dateCounts.get(dateStr) ?? 0;
        const level = count === 0 ? 0 : count < 2 ? 1 : count < 4 ? 2 : count < 7 ? 3 : 4;
        const cell = colEl.createDiv({
          cls: `memoria-heatmap-cell level-${level}`,
          attr: { title: `${dateStr}  ${count} 条` },
        });
        if (date > today) cell.addClass("future");
      }
    }
  }

  private buildTagTree(tagMap: Map<string, number>) {
    type Node = { name: string; full: string; count: number; self: number; children: Map<string, Node> };
    const root: Node = { name: "", full: "", count: 0, self: 0, children: new Map() };
    for (const [tag, cnt] of tagMap) {
      const parts = tag.split("/");
      let node = root;
      let path = "";
      for (const part of parts) {
        path = path ? `${path}/${part}` : part;
        if (!node.children.has(part)) {
          node.children.set(part, { name: part, full: path, count: 0, self: 0, children: new Map() });
        }
        node = node.children.get(part)!;
      }
      node.self += cnt;
    }
    const sumCount = (n: typeof root): number => {
      let total = n.self;
      for (const child of n.children.values()) total += sumCount(child);
      n.count = total;
      return total;
    };
    sumCount(root);
    return root;
  }

  private renderTagTree(parent: HTMLElement, node: ReturnType<typeof this.buildTagTree>, depth: number) {
    const children = [...node.children.values()].sort((a, b) => b.count - a.count);
    for (const child of children) {
      const wrap = parent.createDiv({ cls: "memoria-tag-node" });
      const item = wrap.createDiv({
        cls: "memoria-nav-item memoria-tag-item" + (this.filter.tag === child.full ? " active" : ""),
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

  private getFilteredMemos(): Memo[] {
    let memos = this.store.getAll();
    const raw = this.filter.keyword.trim();
    const tagsFromKeyword: string[] = [];
    const keywordTokens: string[] = [];
    if (raw) {
      const tagTokenRe = /^#([A-Za-z0-9_一-鿿/]+)$/;
      for (const tok of raw.split(/\s+/).filter(t => t !== "")) {
        const m = tok.match(tagTokenRe);
        if (m) tagsFromKeyword.push(m[1]);
        else keywordTokens.push(tok.toLowerCase());
      }
    }

    memos = memos.filter(m => {
      if (this.filter.year && !m.date.startsWith(this.filter.year)) return false;
      if (this.filter.date && m.date !== this.filter.date) return false;
      const requiredTags = this.filter.tag ? [this.filter.tag, ...tagsFromKeyword] : tagsFromKeyword;
      for (const t of requiredTags) {
        if (!m.tags.some(x => x === t || x.startsWith(t + "/"))) return false;
      }
      if (keywordTokens.length) {
        const lower = m.content.toLowerCase();
        for (const k of keywordTokens) if (!lower.includes(k)) return false;
      }
      return true;
    });

    const todayStr = toDateStr(new Date());
    if (this.filter.preset === "today") {
      memos = memos.filter(m => m.date === todayStr);
    } else if (this.filter.preset === "week") {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
      weekStart.setHours(0, 0, 0, 0);
      memos = memos.filter(m => m.datetime >= weekStart);
    } else if (this.filter.preset === "on-this-day") {
      const today = new Date();
      const mmdd = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      memos = memos.filter(m => m.date.slice(5) === mmdd && m.date !== todayStr);
    } else if (this.filter.preset === "no-tag") {
      memos = memos.filter(m => m.tags.filter(t => !RESERVED_TAGS.has(t)).length === 0);
    } else if (this.filter.preset === "with-image") {
      memos = memos.filter(m => m.hasImage);
    } else if (this.filter.preset === "with-link") {
      memos = memos.filter(m => m.hasLink);
    } else if (this.filter.preset === "pinned") {
      memos = memos.filter(m => m.isPinned);
    } else if (this.filter.preset === "starred") {
      memos = memos.filter(m => m.isStarred);
    } else if (this.filter.preset === "random" && memos.length) {
      memos = seededShuffle(memos, Math.min(5, memos.length), this.filter.randomSeed ?? 1);
    }
    return memos;
  }

  private renderList() {
    this.listEl.empty();
    this.childComponent.unload();
    this.childComponent = new Component();
    this.childComponent.load();

    const filtered = this.getFilteredMemos();
    const meta = this.listEl.createDiv({ cls: "memoria-list-meta" });
    meta.createDiv({ cls: "memoria-list-meta-left", text: this.describeFilter(filtered.length) });

    if (this.filter.preset === "random") {
      const rerollBtn = meta.createEl("button", { cls: "memoria-meta-btn" });
      setIcon(rerollBtn.createSpan(), "shuffle");
      rerollBtn.createSpan({ text: " 换一批" });
      rerollBtn.addEventListener("click", () => { this.filter.randomSeed = Date.now(); this.renderList(); });
    }

    if (filtered.length === 0) {
      const empty = this.listEl.createDiv({ cls: "memoria-empty" });
      empty.createDiv({ cls: "memoria-empty-emoji", text: "📭" });
      empty.createDiv({ cls: "memoria-empty-text", text: "这里还没有笔记哦" });
      empty.createDiv({ cls: "memoria-empty-sub", text: "在顶部输入框写下你的第一个想法吧～" });
      return;
    }

    const page = filtered.slice(0, this.pageLimit);
    const pinned = page.filter(m => m.isPinned);
    const unpinned = page.filter(m => !m.isPinned);

    if (pinned.length) {
      const group = this.listEl.createDiv({ cls: "memoria-day-group memoria-pin-group" });
      const head = group.createDiv({ cls: "memoria-day-head memoria-pin-head" });
      setIcon(head.createSpan({ cls: "memoria-pin-head-icon" }), "pin");
      head.createSpan({ text: `置顶  共 ${pinned.length} 条` });
      for (const m of pinned) this.renderMemoCard(group, m);
    }

    const byDate = new Map<string, Memo[]>();
    for (const m of unpinned) {
      const arr = byDate.get(m.date) ?? [];
      arr.push(m);
      byDate.set(m.date, arr);
    }

    const todayStr = toDateStr(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = toDateStr(yesterday);
    const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

    for (const [date, dayMemos] of byDate) {
      const group = this.listEl.createDiv({ cls: "memoria-day-group" });
      const head = group.createDiv({ cls: "memoria-day-head" });
      const wd = weekdays[new Date(date + "T00:00:00").getDay()];
      let label = `${date}  ${wd}`;
      if (date === todayStr) label = `今天  ${wd}`;
      else if (date === yesterdayStr) label = `昨天  ${wd}`;
      head.setText(label);
      for (const m of dayMemos) this.renderMemoCard(group, m);
    }

    if (this.pageLimit < filtered.length) {
      this.listEl.createDiv({ cls: "memoria-load-more" })
        .setText(`↓ 滚动加载更多（还有 ${filtered.length - this.pageLimit} 条）`);
    }
  }

  private describeFilter(count: number): string {
    const parts: string[] = [];
    const presetLabels: Record<string, string> = {
      today: "今天", week: "本周", random: "随机回顾",
      "on-this-day": "📅 每日回顾",
      "no-tag": "无标签", "with-image": "有图片", "with-link": "有链接",
      pinned: "📌 置顶", starred: "⭐ 收藏",
    };
    if (this.filter.preset !== "all") parts.push(presetLabels[this.filter.preset] ?? this.filter.preset);
    if (this.filter.year) parts.push(this.filter.year);
    if (this.filter.date) parts.push(`📅 ${this.filter.date}`);
    if (this.filter.tag) parts.push(`#${this.filter.tag}`);
    if (this.filter.keyword) parts.push(`「${this.filter.keyword}」`);
    return `${parts.length ? parts.join(" · ") + " · " : ""}共 ${count} 条`;
  }

  private renderMemoCard(parent: HTMLElement, memo: Memo) {
    const card = parent.createDiv({
      cls: "memoria-card" +
        (memo.isPinned ? " is-pinned" : "") +
        (memo.isStarred ? " is-starred" : "") +
        (this.editingMemo === memo ? " is-editing" : ""),
    });
    card.addEventListener("dblclick", e => {
      const target = e.target as HTMLElement;
      if (!target.closest(".memoria-img-cell") && target.tagName !== "A") this.enterEditMode(memo);
    });

    const head = card.createDiv({ cls: "memoria-card-head" });
    const timeWrap = head.createDiv({ cls: "memoria-card-time-wrap" });
    if (memo.isPinned) { const pin = timeWrap.createSpan({ cls: "memoria-card-pin" }); setIcon(pin, "pin"); pin.setAttr("aria-label", "已置顶"); }
    if (memo.isStarred) { const star = timeWrap.createSpan({ cls: "memoria-card-star" }); setIcon(star, "star"); star.setAttr("aria-label", "已收藏"); }
    timeWrap.createSpan({ cls: "memoria-card-time", text: `${memo.date} ${memo.time}` });

    const moreBtn = head.createDiv({ cls: "memoria-card-actions" })
      .createEl("button", { cls: "memoria-icon-btn", attr: { "aria-label": "更多操作" } });
    setIcon(moreBtn, "more-horizontal");
    moreBtn.addEventListener("click", e => { e.stopPropagation(); this.showMemoMenu(e, memo); });

    const { text, tags } = this.stripTags(memo.content);
    const { text: bodyText, images } = extractImages(this.app, text, memo.file);

    if (bodyText.trim()) {
      const body = card.createDiv({ cls: "memoria-card-body" });
      MarkdownRenderer.render(this.app, normalizeForRender(bodyText), body, memo.file, this.childComponent);
      this.bindTaskCheckboxes(body, memo, bodyText);
      this.wrapWideTables(body);
    }
    if (images.length) renderImageGrid(card, images, idx => showLightbox(images, idx));

    const visibleTags = tags.filter(t => !RESERVED_TAGS.has(t));
    if (visibleTags.length) {
      const tagsEl = card.createDiv({ cls: "memoria-card-tags" });
      for (const t of visibleTags) {
        tagsEl.createSpan({ cls: "memoria-tag-pill", text: `#${t}` })
          .addEventListener("click", () => {
            this.filter.tag = t;
            this.filter.preset = "all";
            this.pageLimit = this.getInitialPageLimit();
            this.renderAll();
          });
      }
    }
  }

  private bindTaskCheckboxes(container: HTMLElement, memo: Memo, renderedText: string) {
    const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    if (!checkboxes.length) return;
    const taskLines: { line: number; checked: boolean }[] = [];
    const taskRe = /^\s*[-*]\s+\[( |x|X)\]\s/;
    renderedText.split("\n").forEach((line, idx) => {
      const m = line.match(taskRe);
      if (m) taskLines.push({ line: idx, checked: /[xX]/.test(m[1]) });
    });
    if (checkboxes.length !== taskLines.length) return;
    checkboxes.forEach((cb, i) => {
      cb.disabled = false;
      cb.style.cursor = "pointer";
      cb.addEventListener("click", async e => {
        e.stopPropagation();
        const task = taskLines[i];
        const lines = renderedText.split("\n");
        const original = lines[task.line];
        lines[task.line] = task.checked
          ? original.replace(/\[[xX]\]/, "[ ]")
          : original.replace(/\[ \]/, "[x]");
        const idx = memo.content.indexOf(original);
        if (idx === -1) return;
        const newContent = memo.content.substring(0, idx) + lines[task.line] + memo.content.substring(idx + original.length);
        try { await this.store.editMemo(memo, newContent); }
        catch (err) { console.error("[Memoria] 任务勾选失败:", err); new Notice("勾选失败：" + (err instanceof Error ? err.message : String(err))); }
      });
    });
  }

  private wrapWideTables(container: HTMLElement) {
    container.querySelectorAll("table").forEach(table => {
      const parent = table.parentElement;
      if (!parent || parent.hasClass("memoria-table-wrap")) return;
      const wrap = createDiv({ cls: "memoria-table-wrap" });
      parent.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
  }

  private stripTags(content: string): { text: string; tags: string[] } {
    const tags: string[] = [];
    const text = content.replace(/#([A-Za-z0-9_一-鿿][A-Za-z0-9_一-鿿/]*)/g, (_, tag) => {
      if (!tags.includes(tag)) tags.push(tag);
      return "";
    }).split("\n").map(l => l.replace(/\s+$/, "")).join("\n")
      .replace(/\n{3,}/g, "\n\n").trim();
    return { text, tags };
  }

  private showMemoMenu(e: MouseEvent, memo: Memo) {
    const menu = new Menu();
    menu.addItem(i => i.setTitle(memo.isPinned ? "取消置顶" : "置顶").setIcon(memo.isPinned ? "pin-off" : "pin")
      .onClick(async () => { await this.store.togglePinned(memo); new Notice(memo.isPinned ? "已取消置顶" : "✓ 已置顶"); }));
    menu.addItem(i => i.setTitle(memo.isStarred ? "取消收藏" : "收藏").setIcon(memo.isStarred ? "star-off" : "star")
      .onClick(async () => { await this.store.toggleStarred(memo); new Notice(memo.isStarred ? "已取消收藏" : "✓ 已收藏"); }));
    menu.addSeparator();
    menu.addItem(i => i.setTitle("编辑").setIcon("pencil").onClick(() => this.enterEditMode(memo)));
    menu.addItem(i => i.setTitle("引用").setIcon("quote").onClick(() => this.quoteMemo(memo)));
    menu.addItem(i => i.setTitle("打开原文").setIcon("file-text").onClick(() => this.openInFile(memo)));
    menu.addItem(i => i.setTitle("复制原文").setIcon("copy").onClick(async () => {
      await navigator.clipboard.writeText(memo.content);
      new Notice("已复制");
    }));
    menu.addSeparator();
    menu.addItem(i => i.setTitle("删除").setIcon("trash").onClick(async () => {
      if (await this.confirmAsync("确定删除这条笔记吗？")) {
        await this.store.deleteMemo(memo);
        new Notice("已删除");
        this.restoreInputFocus();
      }
    }));
    menu.showAtMouseEvent(e);
  }

  private confirmAsync(message: string): Promise<boolean> {
    return new Promise(resolve => {
      const backdrop = document.body.createDiv({ cls: "memoria-modal-backdrop" });
      const modal = backdrop.createDiv({ cls: "memoria-modal memoria-confirm" });
      modal.createDiv({ cls: "memoria-modal-title", text: message });
      const btns = modal.createDiv({ cls: "memoria-modal-btns" });
      const cancelBtn = btns.createEl("button", { text: "取消" });
      const confirmBtn = btns.createEl("button", { text: "确认删除", cls: "mod-warning" });
      const done = (result: boolean) => {
        backdrop.remove();
        document.removeEventListener("keydown", onKey, true);
        setTimeout(() => resolve(result), 0);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") { e.preventDefault(); done(false); }
        else if (e.key === "Enter") { e.preventDefault(); done(true); }
      };
      cancelBtn.addEventListener("click", () => done(false));
      confirmBtn.addEventListener("click", () => done(true));
      backdrop.addEventListener("click", e => { if (e.target === backdrop) done(false); });
      document.addEventListener("keydown", onKey, true);
      setTimeout(() => confirmBtn.focus(), 20);
    });
  }

  private restoreInputFocus() {
    if (!this.inputEl) return;
    try { this.inputEl.blur(); } catch {}
    setTimeout(() => {
      try { this.inputEl.setSelectionRange(this.inputEl.value.length, this.inputEl.value.length); } catch {}
    }, 20);
  }

  private async openInFile(memo: Memo) {
    const leaf = this.app.workspace.getLeaf(false);
    const file = this.app.vault.getAbstractFileByPath(memo.file);
    if (file instanceof TFile) await leaf.openFile(file, { eState: { line: memo.range[0] } });
  }

  private quoteMemo(memo: Memo) {
    if (this.editingMemo) this.exitEditMode();
    const body = memo.content
      .replace(/\s*#置顶(?![A-Za-z0-9_一-鿿/])/g, "")
      .replace(/\s*#收藏(?![A-Za-z0-9_一-鿿/])/g, "")
      .trim()
      .split("\n")
      .map(l => (l.trim() === "" ? ">" : `> ${l}`))
      .join("\n");
    const quote = `> [!quote] ${memo.date} ${memo.time}\n${body}\n\n`;
    if (this.inputEl.value.trim()) {
      this.inputEl.value = this.inputEl.value.replace(/\s+$/, "") + "\n\n" + quote;
    } else {
      this.inputEl.value = quote;
    }
    this.inputEl.focus();
    this.inputEl.setSelectionRange(this.inputEl.value.length, this.inputEl.value.length);
    new Notice("已引用，继续补充想法吧");
  }
}

function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 有种子洗牌：用线性同余生成器（LCG）保证同一 seed 输出相同顺序，便于「换一批」交互 */
function seededShuffle<T>(arr: T[], count: number, seed: number): T[] {
  const a = arr.slice();
  let s = Math.abs(seed) || 1;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, count);
}

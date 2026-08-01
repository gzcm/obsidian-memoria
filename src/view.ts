import {
  Component, ItemView, MarkdownRenderer, Menu, Notice, Platform, setIcon, TFile, WorkspaceLeaf,
} from "obsidian";
import { Memo, MemoriaSettings, MoodType, RESERVED_TAGS, SavedFilter, VIEW_TYPE_MEMORIA, VIEW_TYPE_STATS, VIEW_TYPE_TAG_TOOLS, VIEW_TYPE_TRASH, VIEW_TYPE_YEAR } from "./types";
import { MemoStore } from "./store";
import { TagSuggest } from "./tag-suggest";
import { extractImages, ImageInfo, renderImageGrid, showLightbox } from "./image";
import { renderCalendar } from "./calendar";
import { SearchTokens } from "./types";
import { normalizeForRender, htmlToMarkdown } from "./parser";
import { t } from "./i18n";
import { parseSearch, matchesSearch } from "./search";
import { detectMood, moodClass } from "./mood";
import { exportMemos, ExportFormat } from "./export";
import { stripDisplayTags } from "./tag-rewrite";

interface MemoFilter {
  tag: string | null;
  year: string | null;
  date: string | null;
  keyword: string;
  preset: string;
  randomSeed?: number;
  /** v2.0.3: 高级搜索 token */
  searchTokens: SearchTokens;
}

export class MemoriaView extends ItemView {
  static readonly DRAFT_KEY_PREFIX = "memoria:input-draft";

  private store: MemoStore;
  private settings: MemoriaSettings;
  private filter: MemoFilter = { tag: null, year: null, date: null, keyword: "", preset: "all",
    searchTokens: { includeTerms: [], excludeTerms: [], includeTags: [], excludeTags: [], afterDate: null, beforeDate: null, raw: "" } };
  private unsubscribe: (() => void) | null = null;
  private childComponent = new Component();
  private pageLimit: number;
  private tagsExpanded = false;
  private tagSuggest: TagSuggest | null = null;
  private overviewMode: "heatmap" | "calendar" = "heatmap";
  private editingMemo: Memo | null = null;
  private activeSavedFilterId: string | null = null;
  private timeOverride: string | null = null;
  private timeOverrideBeforeEdit: string | null = null;
  private timeTickHandle: number | null = null;
  /**
   * 性能：memo → 派生渲染结果缓存。
   * store 每次 reload 都会生成新的 Memo 对象，WeakMap 自动失效，无一致性问题。
   */
  private renderCache = new WeakMap<Memo, { bodyText: string; images: ImageInfo[] }>();
  private moodCache = new WeakMap<Memo, MoodType>();

  private sidebarEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private searchEl!: HTMLInputElement;
  private listEl!: HTMLElement;
  private editBannerEl: HTMLElement | null = null;
  private timeChipEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, store: MemoStore, settings: MemoriaSettings, private saveSettings: () => Promise<void>) {
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

  /** 打开（或聚焦已存在）的指定类型视图 leaf */
  private openLeaf(type: string) {
    const existing = this.app.workspace.getLeavesOfType(type);
    if (existing.length) { this.app.workspace.revealLeaf(existing[0]); return; }
    const leaf = this.app.workspace.getLeaf("tab");
    void leaf.setViewState({ type, active: true }).then(() => this.app.workspace.revealLeaf(leaf));
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
      attr: { placeholder: t("search.placeholder"), type: "text" },
    });
    this.searchEl.addEventListener("input", () => {
      this.filter.keyword = this.searchEl.value.trim();
      this.filter.searchTokens = parseSearch(this.filter.keyword);
      this.activeSavedFilterId = null;
      this.pageLimit = this.getInitialPageLimit();
      this.renderList();
    });

    // v1.4.5: 顶栏工具区（searchWrap 用 margin-left:auto 推到右侧，tools 紧随其后）
    const tools = topbar.createDiv({ cls: "memoria-topbar-tools" });

    const refreshBtn = tools.createEl("button", { cls: "memoria-icon-btn", attr: { "aria-label": t("common.refresh") } });
    setIcon(refreshBtn, "refresh-cw");
    refreshBtn.addEventListener("click", () => this.store.reloadAll());

    const statsBtn = tools.createEl("button", { cls: "memoria-icon-btn", attr: { "aria-label": t("toolbar.statsReport") } });
    setIcon(statsBtn, "bar-chart-3");
    statsBtn.addEventListener("click", () => this.openLeaf(VIEW_TYPE_STATS));

    const yearBtn = tools.createEl("button", {
      cls: "memoria-icon-btn",
      attr: { "aria-label": t("toolbar.yearPanorama"), title: t("toolbar.yearPanorama") },
    });
    setIcon(yearBtn, "calendar-days");
    yearBtn.addEventListener("click", () => this.openLeaf(VIEW_TYPE_YEAR));

    const trashBtn = tools.createEl("button", {
      cls: "memoria-icon-btn",
      attr: { "aria-label": t("toolbar.trash"), title: t("toolbar.trash") },
    });
    setIcon(trashBtn, "trash-2");
    trashBtn.addEventListener("click", () => this.openLeaf(VIEW_TYPE_TRASH));

    const tagToolsBtn = tools.createEl("button", {
      cls: "memoria-icon-btn",
      attr: { "aria-label": t("toolbar.tagTools"), title: t("toolbar.tagTools") },
    });
    setIcon(tagToolsBtn, "tags");
    tagToolsBtn.addEventListener("click", () => this.openLeaf(VIEW_TYPE_TAG_TOOLS));

    const densityBtn = tools.createEl("button", {
      cls: "memoria-icon-btn",
      attr: { "aria-label": t("density.toggle"), title: t("density.toggle") },
    });
    setIcon(densityBtn, this.settings.density === "cozy" ? "scan" : "expand");
    densityBtn.addEventListener("click", () => {
      this.settings.density = this.settings.density === "cozy" ? "compact" : "cozy";
      setIcon(densityBtn, this.settings.density === "cozy" ? "scan" : "expand");
      this.listEl.toggleClass("is-compact", this.settings.density === "compact");
      this.saveSettings();
      this.renderList();
    });

    const exportBtn = tools.createEl("button", {
      cls: "memoria-icon-btn",
      attr: { "aria-label": t("card.exportTooltip"), title: t("card.exportTooltip") },
    });
    setIcon(exportBtn, "download");
    exportBtn.addEventListener("click", e => this.showExportMenu(e));

    const menuBtn = topbar.createEl("button", {
      cls: "memoria-icon-btn memoria-sidebar-toggle",
      attr: { "aria-label": t("toolbar.toggleSidebar") },
    });
    setIcon(menuBtn, "menu");
    menuBtn.addEventListener("click", () => this.toggleSidebar(!this.contentEl.hasClass("memoria-sidebar-open")));

    this.buildInputCard(main);
    const listCls = "memoria-list" + (this.settings.density === "compact" ? " is-compact" : "");
    this.listEl = main.createDiv({ cls: listCls });
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
      attr: { placeholder: t("input.placeholder") },
    });
    this.tagSuggest = new TagSuggest(this.app, this.inputEl);

    this.inputEl.addEventListener("keydown", e => {
      if (e.isComposing || e.keyCode === 229) return; // IME 组合态
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
      // v2.0.3: HTML 粘贴自动转 Markdown
      const html = e.clipboardData?.getData("text/html");
      if (html) {
        const md = htmlToMarkdown(html);
        if (md) { e.preventDefault(); this.insertAtCursor(md); return; }
      }
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

    const tagBtn = tools.createEl("button", { cls: "memoria-tool-btn", attr: { "aria-label": t("toolbar.insertTag") } });
    setIcon(tagBtn, "hash");
    tagBtn.addEventListener("click", () => this.insertAtCursor("#"));

    const imgBtn = tools.createEl("button", { cls: "memoria-tool-btn", attr: { "aria-label": t("toolbar.insertImage") } });
    setIcon(imgBtn, "image");
    imgBtn.addEventListener("click", () => this.pickImageFromDisk());

    const listBtn = tools.createEl("button", { cls: "memoria-tool-btn", attr: { "aria-label": t("toolbar.insertUL") } });
    setIcon(listBtn, "list");
    listBtn.addEventListener("click", () => this.insertListAtCursor("- "));

    const orderedBtn = tools.createEl("button", { cls: "memoria-tool-btn", attr: { "aria-label": t("toolbar.insertOL") } });
    setIcon(orderedBtn, "list-ordered");
    orderedBtn.addEventListener("click", () => this.insertOrderedListAtCursor());

    const taskBtn = tools.createEl("button", { cls: "memoria-tool-btn", attr: { "aria-label": t("toolbar.insertTask") } });
    setIcon(taskBtn, "square-check");
    taskBtn.addEventListener("click", () => this.insertListAtCursor("- [ ] "));

    const tableBtn = tools.createEl("button", { cls: "memoria-tool-btn", attr: { "aria-label": t("toolbar.insertTable") } });
    setIcon(tableBtn, "table");
    tableBtn.addEventListener("click", e => { e.stopPropagation(); this.showTablePicker(tableBtn); });

    tools.createSpan({ cls: "memoria-input-hint", text: t("input.hint") });

    const submitWrap = toolbar.createDiv({ cls: "memoria-submit-wrap" });
    const cancelBtn = submitWrap.createEl("button", { cls: "memoria-cancel-btn memoria-hidden", text: t("common.cancel") });
    cancelBtn.addEventListener("click", () => this.exitEditMode());
    this.editBannerEl = cancelBtn;

    this.timeChipEl = submitWrap.createDiv({
      cls: "memoria-time-chip",
      attr: { title: t("input.timeChipTitle") },
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

    const sendBtn = submitWrap.createEl("button", { cls: "memoria-submit-btn", text: t("input.submit") });
    sendBtn.addEventListener("click", () => this.submitMemo());
  }

  private getEffectiveDate(): Date {
    const now = new Date();
    const baseDateText = this.editingMemo?.date ?? this.filter.date;
    const baseDate = baseDateText ? new Date(baseDateText + "T00:00:00") : now;
    if (this.timeOverride === null && !baseDateText) return now;
    const fallbackTime = this.editingMemo?.time ??
      `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    const [h, m] = (this.timeOverride ?? fallbackTime).split(":").map(n => parseInt(n, 10));
    const d = new Date(baseDate);
    d.setHours(h, m, 0, 0);
    return d;
  }

  private refreshTimeChip() {
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
    } else if (this.editingMemo) {
      const [oh, om] = this.editingMemo.time.split(":").map(n => parseInt(n, 10));
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
      text: isMobile ? t("input.tableInsert") : t("input.tableSize"),
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
      new Notice(t("notice.imageSaved", { name }));
    } catch (e: unknown) {
      console.error(e);
      new Notice(t("notice.imageFailed", { msg: e instanceof Error ? e.message : String(e) }));
    }
  }

  private async submitMemo() {
    const text = this.inputEl.value.trim();
    if (!text) return;
    try {
      if (this.editingMemo) {
        const effectiveDate = this.getEffectiveDate();
        if (toDateStr(effectiveDate) === this.editingMemo.date && toTimeStr(effectiveDate) === this.editingMemo.time) {
          await this.store.editMemo(this.editingMemo, text);
          new Notice(t("notice.updated"));
        } else {
          await this.store.editMemoDateTime(this.editingMemo, effectiveDate, text);
          new Notice(t("notice.updatedWithTime"));
        }
        this.exitEditMode();
      } else {
        // v2.0.3: 按标签筛选时自动加标签
        let finalText = text;
        if (this.filter.tag && !this.editingMemo) {
          const ft = this.filter.tag;
          const autoRe = new RegExp(`#${escapeRegex(ft)}(?:/|$)`);
          if (!autoRe.test(finalText)) {
            finalText = finalText.replace(/\s+$/, "") + `\n#${ft}`;
          }
        }
        await this.store.addMemo(finalText, this.getEffectiveDate());
        new Notice(t("notice.saved"));
        if (this.settings.clearAfterSave) {
          this.inputEl.value = "";
          this.clearDraft();
        }
      }
      this.autoResizeInput();
    } catch (e: unknown) {
      console.error(e);
      new Notice(t("notice.saveFailed", { msg: e instanceof Error ? e.message : String(e) }));
    }
  }

  private toggleSidebar(open: boolean) {
    this.contentEl.toggleClass("memoria-sidebar-open", open);
  }

  enterEditMode(memo: Memo) {
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

  private exitEditMode() {
    this.editingMemo = null;
    this.timeOverride = this.timeOverrideBeforeEdit;
    this.timeOverrideBeforeEdit = null;
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
      this.inputEl.setAttr("placeholder", t("input.editPlaceholder", { date: this.editingMemo.date, time: this.editingMemo.time }));
      this.timeChipEl?.removeClass("memoria-hidden");
      this.refreshTimeChip();
    } else {
      this.editBannerEl.addClass("memoria-hidden");
      card?.removeClass("is-editing");
      this.inputEl.setAttr("placeholder", t("input.placeholder"));
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
    let imgCount = 0, linkCount = 0, pinnedCount = 0, starredCount = 0, noTagCount = 0, onThisDayCount = 0, openTaskCount = 0;
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
      if (m.hasOpenTask) openTaskCount++;
    }

    const statsEl = this.sidebarEl.createDiv({ cls: "memoria-stats" });
    this.renderStatItem(statsEl, all.length.toString(), t("stats.memos"));
    this.renderStatItem(statsEl, uniqueTags.size.toString(), t("stats.tags"));
    this.renderStatItem(statsEl, uniqueDates.size.toString(), t("stats.days"));

    this.renderOverview(this.sidebarEl, all);

    // v1.4.0: 每日打卡进度条（热力图下方独立行）
    if (this.settings.dailyGoal > 0) {
      const todayMemos = all.filter(m => m.date === todayStr);
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
        attr: { "aria-label": this.overviewMode === "heatmap" ? t("toolbar.toCalendar") : t("toolbar.toHeatmap") },
      });
      setIcon(switchBtn, this.overviewMode === "heatmap" ? "calendar" : "activity");
      switchBtn.addEventListener("click", e => {
        e.stopPropagation();
        this.overviewMode = this.overviewMode === "heatmap" ? "calendar" : "heatmap";
        this.renderSidebar();
      });
    } else {
      // 无每日目标：切换按钮独立一行
      const row = this.sidebarEl.createDiv({ cls: "memoria-daily-goal-row" });
      const actions = row.createDiv({ cls: "memoria-daily-goal-actions" });
      const switchBtn = actions.createEl("button", {
        cls: "memoria-icon-btn memoria-daily-goal-switch",
        attr: { "aria-label": this.overviewMode === "heatmap" ? t("toolbar.toCalendar") : t("toolbar.toHeatmap") },
      });
      setIcon(switchBtn, this.overviewMode === "heatmap" ? "calendar" : "activity");
      switchBtn.addEventListener("click", e => {
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
      { key: "random", icon: "shuffle", text: t("sidebar.random") },
    ];
    for (const item of navItems) this.renderNavItem(item.key, item.icon, item.text, item.count);

    this.sidebarEl.createDiv({ cls: "memoria-sidebar-section", text: t("sidebar.section.search") });
    this.renderNavItem("no-tag", "tag", t("sidebar.noTag"), noTagCount);
    this.renderNavItem("with-image", "image", t("sidebar.withImage"), imgCount);
    this.renderNavItem("with-link", "link", t("sidebar.withLink"), linkCount);
    this.renderSavedFilters();

    const yearCounts = new Map<string, number>();
    for (const m of all) {
      const y = m.date.substring(0, 4);
      yearCounts.set(y, (yearCounts.get(y) ?? 0) + 1);
    }
    if (yearCounts.size) {
      this.sidebarEl.createDiv({ cls: "memoria-sidebar-section", text: t("sidebar.section.years") });
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
          this.activeSavedFilterId = null;
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
        section.createSpan({ text: `${t("sidebar.section.tags")} (${tagMap.size})` });
        section.addEventListener("click", () => { this.tagsExpanded = !this.tagsExpanded; this.renderSidebar(); });
        if (this.tagsExpanded) {
          this.renderTagTree(this.sidebarEl, this.buildTagTree(tagMap), 0);
        }
      }
    }
  }

  private renderNavItem(key: string, icon: string, text: string, count?: number) {
    const active = !this.activeSavedFilterId && this.filter.preset === key && !this.filter.tag && !this.filter.year;
    const item = this.sidebarEl.createDiv({ cls: "memoria-nav-item" + (active ? " active" : "") });
    setIcon(item.createDiv({ cls: "memoria-nav-icon" }), icon);
    item.createSpan({ cls: "memoria-nav-text", text });
    if (count !== undefined) item.createSpan({ cls: "memoria-nav-count", text: String(count) });
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

  private renderSavedFilters() {
    this.sidebarEl.createDiv({ cls: "memoria-sidebar-section", text: t("sidebar.saveFilter") });

    const saveItem = this.sidebarEl.createDiv({ cls: "memoria-nav-item memoria-save-filter-action" });
    setIcon(saveItem.createDiv({ cls: "memoria-nav-icon" }), "bookmark-plus");
    saveItem.createSpan({ cls: "memoria-nav-text", text: t("sidebar.saveCurrentFilter") });
    saveItem.addEventListener("click", () => this.showSaveFilterModal());

    for (const filter of this.settings.savedFilters ?? []) {
      const item = this.sidebarEl.createDiv({
        cls: "memoria-nav-item memoria-saved-filter-item" + (this.activeSavedFilterId === filter.id ? " active" : ""),
      });
      setIcon(item.createDiv({ cls: "memoria-nav-icon" }), "bookmark");
      item.createSpan({ cls: "memoria-nav-text", text: filter.name });
      const deleteBtn = item.createEl("button", { cls: "memoria-saved-filter-delete", attr: { "aria-label": t("sidebar.deleteFilter") } });
      setIcon(deleteBtn, "x");
      item.addEventListener("click", () => this.applySavedFilter(filter));
      deleteBtn.addEventListener("click", async e => {
        e.stopPropagation();
        this.settings.savedFilters = (this.settings.savedFilters ?? []).filter(x => x.id !== filter.id);
        if (this.activeSavedFilterId === filter.id) this.activeSavedFilterId = null;
        await this.saveSettings();
        this.renderSidebar();
        new Notice(t("notice.filterDeleted"));
      });
    }
  }

  /** 2026-06-03: 保存完整筛选快照，排查结果不一致时优先对照这里和 parseSearch 的输出 */
  private currentFilterSnapshot(name: string): SavedFilter {
    return {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      preset: this.filter.preset,
      tag: this.filter.tag,
      year: this.filter.year,
      date: this.filter.date,
      keyword: this.filter.keyword,
    };
  }

  private applySavedFilter(saved: SavedFilter) {
    this.filter = {
      tag: saved.tag,
      year: saved.year,
      date: saved.date,
      keyword: saved.keyword,
      preset: saved.preset || "all",
      searchTokens: parseSearch(saved.keyword),
    };
    this.activeSavedFilterId = saved.id;
    this.searchEl.value = saved.keyword;
    this.pageLimit = this.getInitialPageLimit();
    this.refreshTimeChip();
    this.renderAll();
  }

  private showSaveFilterModal() {
    const backdrop = document.body.createDiv({ cls: "memoria-modal-backdrop" });
    const modal = backdrop.createDiv({ cls: "memoria-modal memoria-text-modal" });
    modal.createDiv({ cls: "memoria-modal-title", text: t("filter.saveTitle") });
    const input = modal.createEl("input", {
      cls: "memoria-modal-input",
      attr: { type: "text", placeholder: t("filter.namePlaceholder") },
      value: this.describeFilterOnly(),
    });
    const hint = modal.createDiv({ cls: "memoria-modal-hint" });
    hint.setText(t("filter.saveHint", { desc: this.describeFilterOnly() }));
    const btns = modal.createDiv({ cls: "memoria-modal-btns" });
    const cancelBtn = btns.createEl("button", { text: t("common.cancel") });
    const saveBtn = btns.createEl("button", { text: t("filter.save"), cls: "mod-cta" });

    const close = () => backdrop.remove();
    const submit = async () => {
      const name = input.value.trim();
      if (!name) { new Notice(t("filter.requireName")); return; }
      this.settings.savedFilters = [...(this.settings.savedFilters ?? []), this.currentFilterSnapshot(name)];
      await this.saveSettings();
      close();
      this.renderSidebar();
      new Notice(t("notice.filterSaved"));
    };
    cancelBtn.addEventListener("click", close);
    saveBtn.addEventListener("click", submit);
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") submit();
      else if (e.key === "Escape") close();
    });
    backdrop.addEventListener("click", e => { if (e.target === backdrop) close(); });
    setTimeout(() => { input.focus(); input.select(); }, 20);
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
          this.activeSavedFilterId = null;
          this.pageLimit = this.getInitialPageLimit();
          this.refreshTimeChip();
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
    const dateMemos = new Map<string, Memo[]>();
    for (const m of memos) {
      dateCounts.set(m.date, (dateCounts.get(m.date) ?? 0) + 1);
      const arr = dateMemos.get(m.date) ?? [];
      arr.push(m);
      dateMemos.set(m.date, arr);
    }

    const heatmap = parent.createDiv({ cls: "memoria-heatmap" });
    let tooltip: HTMLElement | null = null;

    const showTooltip = (cell: HTMLElement, dateStr: string, count: number) => {
      if (count === 0) return;
      tooltip?.remove();
      const dayMemos = dateMemos.get(dateStr) ?? [];
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
      tooltip?.remove();
      tooltip = null;
    };

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
          attr: { title: count > 0 ? "" : t("stats.dayCount", { date: dateStr, count: 0 }) },
        });
        if (count > 0) {
          cell.addEventListener("mouseenter", () => showTooltip(cell, dateStr, count));
          cell.addEventListener("mouseleave", hideTooltip);
        }
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
        this.activeSavedFilterId = null;
        this.pageLimit = this.getInitialPageLimit();
        this.renderAll();
      });
      if (child.children.size) this.renderTagTree(wrap, child, depth + 1);
    }
  }

  private getFilteredMemos(): Memo[] {
    let memos = this.store.getAll();

    memos = memos.filter(m => {
      if (this.filter.year && !m.date.startsWith(this.filter.year)) return false;
      if (this.filter.date && m.date !== this.filter.date) return false;
      if (this.filter.tag && !m.tags.some(x => x === this.filter.tag || x.startsWith(this.filter.tag + "/"))) return false;
      // 使用新的搜索 token 匹配（支持 after:/before:/date:/-keyword/-#tag）
      if (!matchesSearch(m.content, m.tags, m.date, this.filter.searchTokens)) return false;
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
    } else if (this.filter.preset === "todo") {
      memos = memos.filter(m => m.hasOpenTask);
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
      rerollBtn.createSpan({ text: t("meta.reroll") });
      rerollBtn.addEventListener("click", () => { this.filter.randomSeed = Date.now(); this.renderList(); });
    }

    if (filtered.length === 0) {
      const empty = this.listEl.createDiv({ cls: "memoria-empty" });
      if (this.filter.preset === "todo") {
        empty.createDiv({ cls: "memoria-empty-emoji", text: "✅" });
        empty.createDiv({ cls: "memoria-empty-text", text: t("empty.todo") });
        empty.createDiv({ cls: "memoria-empty-sub", text: t("empty.todoSub") });
      } else if (this.filter.preset === "on-this-day") {
        empty.createDiv({ cls: "memoria-empty-emoji", text: "🕰️" });
        empty.createDiv({ cls: "memoria-empty-text", text: t("empty.onThisDay") });
        empty.createDiv({ cls: "memoria-empty-sub", text: t("empty.onThisDaySub") });
      } else {
        empty.createDiv({ cls: "memoria-empty-emoji", text: "📭" });
        empty.createDiv({ cls: "memoria-empty-text", text: t("empty.default") });
        empty.createDiv({ cls: "memoria-empty-sub", text: t("empty.defaultSub") });
      }
      return;
    }

    const page = filtered.slice(0, this.pageLimit);
    const pinned = page.filter(m => m.isPinned);
    const unpinned = page.filter(m => !m.isPinned);

    if (pinned.length) {
      const group = this.listEl.createDiv({ cls: "memoria-day-group memoria-pin-group" });
      const head = group.createDiv({ cls: "memoria-day-head memoria-pin-head" });
      setIcon(head.createSpan({ cls: "memoria-pin-head-icon" }), "pin");
      head.createSpan({ text: t("list.pinnedHead", { n: pinned.length }) });
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

    for (const [date, dayMemos] of byDate) {
      const group = this.listEl.createDiv({ cls: "memoria-day-group" });
      const head = group.createDiv({ cls: "memoria-day-head" });
      const wd = t(`weekday.${new Date(date + "T00:00:00").getDay()}`);
      let label = `${date}  ${wd}`;
      if (date === todayStr) label = `${t("date.today")}  ${wd}`;
      else if (date === yesterdayStr) label = `${t("date.yesterday")}  ${wd}`;
      head.setText(label);
      for (const m of dayMemos) this.renderMemoCard(group, m);
    }

    if (this.pageLimit < filtered.length) {
      this.listEl.createDiv({ cls: "memoria-load-more" })
        .setText(t("list.loadMore", { n: filtered.length - this.pageLimit }));
    }
  }

  private getPresetLabel(preset: string): string {
    const presetLabels: Record<string, string> = {
      today: t("sidebar.today"), week: t("sidebar.week"), random: t("sidebar.random"),
      "on-this-day": t("list.presetOnThisDay"),
      todo: "📋 " + t("sidebar.todo"),
      "no-tag": t("sidebar.noTag"), "with-image": t("sidebar.withImage"), "with-link": t("sidebar.withLink"),
      pinned: t("list.presetPinned"), starred: t("list.presetStarred"),
    };
    return presetLabels[preset] ?? preset;
  }

  private describeFilter(count: number): string {
    const parts: string[] = [];
    if (this.filter.preset !== "all") parts.push(this.getPresetLabel(this.filter.preset));
    if (this.filter.year) parts.push(this.filter.year);
    if (this.filter.date) parts.push(`📅 ${this.filter.date}`);
    if (this.filter.tag) parts.push(`#${this.filter.tag}`);
    if (this.filter.keyword) parts.push(`「${this.filter.keyword}」`);
    return `${parts.length ? parts.join(" · ") + " · " : ""}${t("list.totalCount", { n: count })}`;
  }

  private renderMemoCard(parent: HTMLElement, memo: Memo) {
    // 派生字段缓存：内容不变时避免重复 stripTags/extractImages/detectMood
    let bodyText = "";
    let images: ImageInfo[] = [];
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
    // mood 依赖设置开关，仅在开启时读取/写入缓存，避免开关切换后残留旧值
    let mood: MoodType = "neutral";
    if (this.settings.enableMoodColoring) {
      mood = this.moodCache.get(memo) ?? detectMood(memo.content);
      this.moodCache.set(memo, mood);
    }
    const moodCls = mood !== "neutral" ? ` ${moodClass(mood)}` : "";
    const card = parent.createDiv({
      cls: "memoria-card" +
        (memo.isPinned ? " is-pinned" : "") +
        (memo.isStarred ? " is-starred" : "") +
        (this.editingMemo === memo ? " is-editing" : "") +
        moodCls,
    });
    card.addEventListener("dblclick", e => {
      const target = e.target as HTMLElement;
      if (!target.closest(".memoria-img-cell") && target.tagName !== "A") this.enterEditMode(memo);
    });

    const head = card.createDiv({ cls: "memoria-card-head" });
    const timeWrap = head.createDiv({ cls: "memoria-card-time-wrap" });
    if (memo.isPinned) { const pin = timeWrap.createSpan({ cls: "memoria-card-pin" }); setIcon(pin, "pin"); pin.setAttr("aria-label", t("card.pinnedMark")); }
    if (memo.isStarred) { const star = timeWrap.createSpan({ cls: "memoria-card-star" }); setIcon(star, "star"); star.setAttr("aria-label", t("card.starredMark")); }
    timeWrap.createSpan({ cls: "memoria-card-time", text: `${memo.date} ${memo.time}` });

    const moreBtn = head.createDiv({ cls: "memoria-card-actions" })
      .createEl("button", { cls: "memoria-icon-btn", attr: { "aria-label": t("toolbar.moreActions") } });
    setIcon(moreBtn, "more-horizontal");
    moreBtn.addEventListener("click", e => { e.stopPropagation(); this.showMemoMenu(e, memo); });

    if (bodyText.trim()) {
      const body = card.createDiv({ cls: "memoria-card-body" });
      MarkdownRenderer.render(this.app, normalizeForRender(bodyText), body, memo.file, this.childComponent);
      this.bindTaskCheckboxes(body, memo, bodyText);
      this.wrapWideTables(body);

      // v1.3: 长笔记折叠
      const lineLimit = this.settings.collapseLineLimit;
      if (lineLimit > 0) {
        const textLines = bodyText.split("\n").filter(l => l.trim() !== "").length;
        if (textLines > lineLimit) {
          body.addClass("is-collapsed");
          body.style.setProperty("--memoria-collapse-max", `${lineLimit * 1.6}em`);
          const toggle = body.createDiv({ cls: "memoria-collapse-toggle" });
          const iconSpan = toggle.createSpan({ cls: "memoria-collapse-icon" });
          setIcon(iconSpan, "chevron-down");
          toggle.createSpan({ text: t("list.readMore") });
          toggle.addEventListener("click", e => {
            e.stopPropagation();
            if (body.hasClass("is-collapsed")) {
              body.removeClass("is-collapsed");
              body.addClass("is-expanded");
              setIcon(iconSpan, "chevron-up");
              toggle.querySelector(":scope > span:last-child")?.setText(t("list.collapse"));
            } else {
              body.addClass("is-collapsed");
              body.removeClass("is-expanded");
              setIcon(iconSpan, "chevron-down");
              toggle.querySelector(":scope > span:last-child")?.setText(t("list.readMore"));
            }
          });
        }
      }
    }
    if (images.length) renderImageGrid(card, images, idx => showLightbox(images, idx));

    // 标签直接复用 parseMemos 已提取的 memo.tags，避免渲染时再次解析内容
    const visibleTags = memo.tags.filter(t => !RESERVED_TAGS.has(t));
    if (visibleTags.length) {
      const tagsEl = card.createDiv({ cls: "memoria-card-tags" });
      for (const t of visibleTags) {
        tagsEl.createSpan({ cls: "memoria-tag-pill", text: `#${t}` })
          .addEventListener("click", () => {
            this.filter.tag = t;
            this.filter.preset = "all";
            this.activeSavedFilterId = null;
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
        catch (err) { console.error("[Memoria] 任务勾选失败:", err); new Notice(t("notice.checkFailed", { msg: err instanceof Error ? err.message : String(err) })); }
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
    return stripDisplayTags(content);
  }

  private showMemoMenu(e: MouseEvent, memo: Memo) {
    const menu = new Menu();
    menu.addItem(i => i.setTitle(memo.isPinned ? t("card.unpin") : t("card.pin")).setIcon(memo.isPinned ? "pin-off" : "pin")
      .onClick(async () => { await this.store.togglePinned(memo); new Notice(memo.isPinned ? t("notice.unpinned") : t("notice.pinned")); }));
    menu.addItem(i => i.setTitle(memo.isStarred ? t("card.unstar") : t("card.star")).setIcon(memo.isStarred ? "star-off" : "star")
      .onClick(async () => { await this.store.toggleStarred(memo); new Notice(memo.isStarred ? t("notice.unstarred") : t("notice.starred")); }));
    menu.addSeparator();
    menu.addItem(i => i.setTitle(t("card.edit")).setIcon("pencil").onClick(() => this.enterEditMode(memo)));
    menu.addItem(i => i.setTitle(t("card.quote")).setIcon("quote").onClick(() => this.quoteMemo(memo)));
    menu.addItem(i => i.setTitle(t("card.promote")).setIcon("file-plus").onClick(() => this.showPromoteMemoModal(memo)));
    menu.addItem(i => i.setTitle(t("card.openSource")).setIcon("file-text").onClick(() => this.openInFile(memo)));
    menu.addItem(i => i.setTitle(t("card.copySource")).setIcon("copy").onClick(async () => {
      await navigator.clipboard.writeText(memo.content);
      new Notice(t("notice.copied"));
    }));
    menu.addSeparator();
    menu.addItem(i => i.setTitle(t("card.delete")).setIcon("trash").onClick(async () => {
      if (await this.confirmAsync(t("notice.confirmDelete"))) {
        await this.store.deleteMemo(memo);
        new Notice(t("notice.deleted"));
        this.restoreInputFocus();
      }
    }));
    menu.showAtMouseEvent(e);
  }

  /** 2026-06-03: 转正式笔记只创建新文件，不自动删除原 memo，降低整理功能的误操作风险 */
  private showPromoteMemoModal(memo: Memo) {
    const backdrop = document.body.createDiv({ cls: "memoria-modal-backdrop" });
    const modal = backdrop.createDiv({ cls: "memoria-modal memoria-text-modal" });
    modal.createDiv({ cls: "memoria-modal-title", text: t("card.promote") });

    const titleLabel = modal.createDiv({ cls: "memoria-modal-label", text: t("promote.title") });
    const titleInput = modal.createEl("input", {
      cls: "memoria-modal-input",
      attr: { type: "text" },
      value: this.suggestMemoTitle(memo),
    });
    titleLabel.setAttr("for", "memoria-promote-title");
    titleInput.id = "memoria-promote-title";

    const folderLabel = modal.createDiv({ cls: "memoria-modal-label", text: t("promote.folder") });
    const folderInput = modal.createEl("input", {
      cls: "memoria-modal-input",
      attr: { type: "text" },
      value: this.settings.promoteFolder || "Memoria/notes",
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
      if (!title) { new Notice(t("promote.requireTitle")); return; }
      try {
        this.settings.promoteFolder = folder;
        await this.saveSettings();
        const path = await this.store.promoteMemoToNote(memo, title, folder);
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) await this.app.workspace.getLeaf("tab").openFile(file);
        new Notice(t("promote.created", { path }));
        close();
      } catch (e) {
        new Notice(t("promote.failed", { msg: e instanceof Error ? e.message : String(e) }));
      }
    };

    cancelBtn.addEventListener("click", close);
    createBtn.addEventListener("click", submit);
    titleInput.addEventListener("keydown", e => {
      if (e.key === "Enter") submit();
      else if (e.key === "Escape") close();
    });
    folderInput.addEventListener("keydown", e => {
      if (e.key === "Enter") submit();
      else if (e.key === "Escape") close();
    });
    backdrop.addEventListener("click", e => { if (e.target === backdrop) close(); });
    setTimeout(() => { titleInput.focus(); titleInput.select(); }, 20);
  }

  private suggestMemoTitle(memo: Memo): string {
    const { text } = this.stripTags(memo.content);
    const first = text.split("\n").map(l => l.trim()).find(Boolean) ?? "Memoria memo";
    return first
      .replace(/^[-*]\s+/, "")
      .replace(/^#+\s+/, "")
      .replace(/^>\s*/, "")
      .replace(/!\[\[[^\]]+\]\]/g, "")
      .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
      .trim()
      .slice(0, 40) || "Memoria memo";
  }

  private async showExportMenu(e: MouseEvent) {
    const menu = new Menu();
    const memos = this.getFilteredMemos();
    menu.addItem(i => i.setTitle(t("card.exportMd")).setIcon("file-text").onClick(async () => {
      try {
        await exportMemos(this.app, "md", memos, this.describeFilterOnly(), "Memoria/exports");
      } catch (err: any) { new Notice(t("notice.exportFailed", { msg: err.message })); }
    }));
    menu.addItem(i => i.setTitle(t("card.exportHtml")).setIcon("file-code").onClick(async () => {
      try {
        const path = await exportMemos(this.app, "html", memos, this.describeFilterOnly(), "Memoria/exports");
        new Notice(t("notice.exportDone", { n: memos.length, path }));
      } catch (err: any) { new Notice(t("notice.exportFailed", { msg: err.message })); }
    }));
    menu.addItem(i => i.setTitle(t("card.exportJson")).setIcon("file-json").onClick(async () => {
      try {
        await exportMemos(this.app, "json", memos, this.describeFilterOnly(), "Memoria/exports");
      } catch (err: any) { new Notice(t("notice.exportFailed", { msg: err.message })); }
    }));
    menu.showAtMouseEvent(e);
  }

  private describeFilterOnly(): string {
    const parts: string[] = [];
    if (this.filter.preset !== "all") parts.push(this.getPresetLabel(this.filter.preset));
    if (this.filter.year) parts.push(this.filter.year);
    if (this.filter.date) parts.push(this.filter.date);
    if (this.filter.tag) parts.push(`#${this.filter.tag}`);
    if (this.filter.keyword) parts.push(this.filter.keyword);
    return parts.join(" · ") || t("sidebar.all");
  }

  private confirmAsync(message: string): Promise<boolean> {
    return new Promise(resolve => {
      const backdrop = document.body.createDiv({ cls: "memoria-modal-backdrop" });
      const modal = backdrop.createDiv({ cls: "memoria-modal memoria-confirm" });
      modal.createDiv({ cls: "memoria-modal-title", text: message });
      const btns = modal.createDiv({ cls: "memoria-modal-btns" });
      const cancelBtn = btns.createEl("button", { text: t("common.cancel") });
      const confirmBtn = btns.createEl("button", { text: t("notice.confirmDeleteOk"), cls: "mod-warning" });
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
    new Notice(t("notice.quoted"));
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toTimeStr(date: Date): string {
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
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

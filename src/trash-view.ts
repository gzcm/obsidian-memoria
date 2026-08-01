import {
  Component, ItemView, MarkdownRenderer, Notice, setIcon, TFile, WorkspaceLeaf,
} from "obsidian";
import { MemoStore } from "./store";
import { TrashItem, VIEW_TYPE_TRASH } from "./types";
import { normalizeForRender } from "./parser";
import { t } from "./i18n";

export class MemoriaTrashView extends ItemView {
  private items: TrashItem[] = [];
  private query = "";
  private childComponent = new Component();

  constructor(leaf: WorkspaceLeaf, private store: MemoStore) {
    super(leaf);
  }

  getViewType() { return VIEW_TYPE_TRASH; }
  getDisplayText() { return t("trash.viewTitle"); }
  getIcon() { return "trash-2"; }

  async onOpen() {
    this.contentEl.addClass("memoria-root", "memoria-trash-view");
    await this.reload();
  }

  async onClose() {
    this.childComponent.unload();
  }

  /** 2026-06-03: 回收站视图每次操作后重新解析 _trash.md，避免行号 range 因删除/恢复后失效 */
  private async reload() {
    try {
      this.items = await this.store.getTrashItems();
      this.render();
    } catch (e) {
      console.error("[Memoria] 回收站读取失败:", e);
      new Notice(t("trash.loadFailed", { msg: e instanceof Error ? e.message : String(e) }));
    }
  }

  private render() {
    const el = this.contentEl;
    el.empty();
    this.childComponent.unload();
    this.childComponent = new Component();
    this.childComponent.load();

    const header = el.createDiv({ cls: "memoria-trash-header" });
    const title = header.createDiv({ cls: "memoria-trash-title" });
    setIcon(title.createSpan({ cls: "memoria-trash-title-icon" }), "trash-2");
    title.createSpan({ text: t("trash.viewTitle") });

    const actions = header.createDiv({ cls: "memoria-trash-actions" });
    const refreshBtn = actions.createEl("button", { cls: "memoria-icon-btn", attr: { "aria-label": t("common.refresh") } });
    setIcon(refreshBtn, "refresh-cw");
    refreshBtn.addEventListener("click", () => this.reload());

    const openBtn = actions.createEl("button", { cls: "memoria-icon-btn", attr: { "aria-label": t("trash.openFile") } });
    setIcon(openBtn, "file-text");
    openBtn.addEventListener("click", () => this.openTrashFile());

    const clearBtn = actions.createEl("button", { cls: "memoria-icon-btn", attr: { "aria-label": t("trash.clear") } });
    setIcon(clearBtn, "trash");
    clearBtn.addEventListener("click", async () => {
      if (!this.items.length) return;
      if (!confirm(t("trash.clearConfirm", { n: this.items.length }))) return;
      try {
        await this.store.clearTrash();
        new Notice(t("trash.cleared"));
        await this.reload();
      } catch (e) {
        new Notice(t("trash.clearFailed", { msg: e instanceof Error ? e.message : String(e) }));
      }
    });

    const searchWrap = el.createDiv({ cls: "memoria-trash-search-wrap" });
    setIcon(searchWrap.createSpan({ cls: "memoria-search-icon" }), "search");
    const search = searchWrap.createEl("input", {
      cls: "memoria-trash-search",
      attr: { placeholder: t("trash.searchPlaceholder"), type: "text" },
      value: this.query,
    });
    search.addEventListener("input", () => {
      this.query = search.value.trim();
      this.renderList();
    });

    el.createDiv({ cls: "memoria-trash-list" });
    this.renderList();
  }

  private renderList() {
    const list = this.contentEl.querySelector<HTMLElement>(".memoria-trash-list");
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

  private getFilteredItems(): TrashItem[] {
    if (!this.query) return this.items;
    const q = this.query.toLowerCase();
    return this.items.filter(item =>
      item.content.toLowerCase().includes(q) ||
      item.sourceFile.toLowerCase().includes(q) ||
      item.deletedAt.toLowerCase().includes(q) ||
      item.originalDate.includes(q) ||
      item.originalTime.includes(q)
    );
  }

  private renderTrashCard(parent: HTMLElement, item: TrashItem) {
    const card = parent.createDiv({ cls: "memoria-trash-card" });
    const head = card.createDiv({ cls: "memoria-trash-card-head" });
    const meta = head.createDiv({ cls: "memoria-trash-card-meta" });
    meta.createDiv({ cls: "memoria-trash-card-time", text: t("trash.originalTime", { date: item.originalDate, time: item.originalTime }) });
    meta.createDiv({ cls: "memoria-trash-card-source", text: t("trash.deletedAt", { deletedAt: item.deletedAt, source: item.sourceFile }) });

    const actions = head.createDiv({ cls: "memoria-trash-card-actions" });
    const restoreBtn = actions.createEl("button", { cls: "memoria-small-btn" });
    setIcon(restoreBtn.createSpan(), "rotate-ccw");
    restoreBtn.createSpan({ text: t("trash.restore") });
    restoreBtn.addEventListener("click", async () => {
      try {
        await this.store.restoreTrashItem(item.id);
        new Notice(t("trash.restored"));
        await this.reload();
      } catch (e) {
        new Notice(t("trash.restoreFailed", { msg: e instanceof Error ? e.message : String(e) }));
      }
    });

    const deleteBtn = actions.createEl("button", { cls: "memoria-small-btn is-danger" });
    setIcon(deleteBtn.createSpan(), "trash");
    deleteBtn.createSpan({ text: t("trash.purge") });
    deleteBtn.addEventListener("click", async () => {
      if (!confirm(t("trash.purgeConfirm"))) return;
      try {
        await this.store.removeTrashItem(item.id);
        new Notice(t("trash.purged"));
        await this.reload();
      } catch (e) {
        new Notice(t("trash.deleteFailed", { msg: e instanceof Error ? e.message : String(e) }));
      }
    });

    const body = card.createDiv({ cls: "memoria-card-body memoria-trash-card-body" });
    MarkdownRenderer.render(this.app, normalizeForRender(item.content), body, item.sourceFile, this.childComponent);
  }

  private async openTrashFile() {
    const file = this.app.vault.getAbstractFileByPath(this.store.getTrashFilePath());
    if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
    else new Notice(t("trash.fileMissing"));
  }
}

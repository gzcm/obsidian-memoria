import { ItemView, Notice, setIcon, WorkspaceLeaf } from "obsidian";
import { MemoStore } from "./store";
import { TagStat, VIEW_TYPE_TAG_TOOLS } from "./types";
import { t } from "./i18n";

export class MemoriaTagToolsView extends ItemView {
  private tags: TagStat[] = [];
  private query = "";

  constructor(leaf: WorkspaceLeaf, private store: MemoStore) {
    super(leaf);
  }

  getViewType() { return VIEW_TYPE_TAG_TOOLS; }
  getDisplayText() { return t("tagTools.viewTitle"); }
  getIcon() { return "tags"; }

  async onOpen() {
    this.contentEl.addClass("memoria-root", "memoria-tag-tools-view");
    await this.reload();
  }

  async onClose() {}

  /** 2026-06-03: 标签整理视图每次进入先刷新 store，避免基于旧缓存批量改写标签 */
  private async reload() {
    try {
      await this.store.reloadAll();
      this.tags = this.store.getTagStats();
      this.render();
    } catch (e) {
      console.error("[Memoria] 标签整理加载失败:", e);
      new Notice(t("tagTools.loadFailed", { msg: e instanceof Error ? e.message : String(e) }));
    }
  }

  private render() {
    const el = this.contentEl;
    el.empty();

    const header = el.createDiv({ cls: "memoria-tag-tools-header" });
    const title = header.createDiv({ cls: "memoria-tag-tools-title" });
    setIcon(title.createSpan({ cls: "memoria-tag-tools-title-icon" }), "tags");
    title.createSpan({ text: t("tagTools.viewTitle") });

    const actions = header.createDiv({ cls: "memoria-tag-tools-actions" });
    const refreshBtn = actions.createEl("button", { cls: "memoria-icon-btn", attr: { "aria-label": t("common.refresh") } });
    setIcon(refreshBtn, "refresh-cw");
    refreshBtn.addEventListener("click", () => this.reload());

    const summary = el.createDiv({ cls: "memoria-tag-tools-summary" });
    summary.createDiv({ cls: "memoria-tag-tools-stat", text: t("tagTools.tagCount", { n: this.tags.length }) });
    summary.createDiv({
      cls: "memoria-tag-tools-stat",
      text: t("tagTools.lowFreqCount", { n: this.tags.filter(t => t.memoCount <= 1).length }),
    });

    const searchWrap = el.createDiv({ cls: "memoria-tag-tools-search-wrap" });
    setIcon(searchWrap.createSpan({ cls: "memoria-search-icon" }), "search");
    const search = searchWrap.createEl("input", {
      cls: "memoria-tag-tools-search",
      attr: { placeholder: t("tagTools.searchPlaceholder"), type: "text" },
      value: this.query,
    });
    search.addEventListener("input", () => {
      this.query = search.value.trim();
      this.renderList();
    });

    el.createDiv({ cls: "memoria-tag-tools-list" });
    this.renderList();
  }

  private renderList() {
    const list = this.contentEl.querySelector<HTMLElement>(".memoria-tag-tools-list");
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

  private getFilteredTags(): TagStat[] {
    if (!this.query) return this.tags;
    const q = this.query.replace(/^#/, "").toLowerCase();
    return this.tags.filter(tag => tag.name.toLowerCase().includes(q));
  }

  private renderTagRow(parent: HTMLElement, tag: TagStat) {
    const row = parent.createDiv({ cls: "memoria-tag-tool-row" });
    const info = row.createDiv({ cls: "memoria-tag-tool-info" });
    info.createDiv({ cls: "memoria-tag-tool-name", text: `#${tag.name}` });
    info.createDiv({ cls: "memoria-tag-tool-meta", text: t("tagTools.memoCount", { n: tag.memoCount }) });

    const actions = row.createDiv({ cls: "memoria-tag-tool-actions" });
    const renameBtn = actions.createEl("button", { cls: "memoria-small-btn" });
    setIcon(renameBtn.createSpan(), "replace");
    renameBtn.createSpan({ text: t("tagTools.rename") });
    renameBtn.addEventListener("click", () => this.showRenameModal(tag));

    const removeBtn = actions.createEl("button", { cls: "memoria-small-btn is-danger" });
    setIcon(removeBtn.createSpan(), "tag-x");
    removeBtn.createSpan({ text: t("tagTools.remove") });
    removeBtn.addEventListener("click", () => this.confirmRemoveTag(tag));
  }

  private showRenameModal(tag: TagStat) {
    const backdrop = document.body.createDiv({ cls: "memoria-modal-backdrop" });
    const modal = backdrop.createDiv({ cls: "memoria-modal memoria-text-modal" });
    modal.createDiv({ cls: "memoria-modal-title", text: t("tagTools.renameTitle", { tag: tag.name }) });
    modal.createDiv({ cls: "memoria-modal-label", text: t("tagTools.newName") });
    const input = modal.createEl("input", {
      cls: "memoria-modal-input",
      attr: { type: "text", placeholder: t("tagTools.namePlaceholder") },
      value: tag.name,
    });
    const affected = this.getAffectedMemoCount(tag.name);
    modal.createDiv({
      cls: "memoria-modal-hint",
      text: t("tagTools.renameHint", { tag: tag.name, n: affected }),
    });

    const btns = modal.createDiv({ cls: "memoria-modal-btns" });
    const cancelBtn = btns.createEl("button", { text: t("common.cancel") });
    const saveBtn = btns.createEl("button", { text: t("tagTools.execute"), cls: "mod-cta" });

    const close = () => backdrop.remove();
    const submit = async () => {
      const next = input.value.trim();
      if (!next || next === tag.name) { close(); return; }
      if (!confirm(t("tagTools.renameConfirm", { old: tag.name, next, n: affected }))) return;
      try {
        // 2026-06-03: 真正批量写入在 store.renameTag 中完成，视图只负责确认影响面和刷新结果
        const count = await this.store.renameTag(tag.name, next);
        new Notice(t("tagTools.renamed", { n: count }));
        close();
        await this.reload();
      } catch (e) {
        new Notice(t("tagTools.updateFailed", { msg: e instanceof Error ? e.message : String(e) }));
      }
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

  private async confirmRemoveTag(tag: TagStat) {
    const affected = this.getAffectedMemoCount(tag.name);
    if (!confirm(t("tagTools.removeConfirm", { n: affected, tag: tag.name }))) return;
    try {
      const count = await this.store.removeTag(tag.name);
      new Notice(t("tagTools.removed", { n: count }));
      await this.reload();
    } catch (e) {
      new Notice(t("tagTools.removeFailed", { msg: e instanceof Error ? e.message : String(e) }));
    }
  }

  private getAffectedMemoCount(tag: string): number {
    return this.store.getAll().filter(memo =>
      memo.tags.some(t => t === tag || t.startsWith(tag + "/"))
    ).length;
  }
}

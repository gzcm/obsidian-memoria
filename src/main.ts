import { Notice, Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS, MemoriaSettings, VIEW_TYPE_MEMORIA, VIEW_TYPE_STATS, VIEW_TYPE_YEAR } from "./types";
import { MemoStore } from "./store";
import { MemoriaView } from "./view";
import { MemoriaStatsView } from "./stats-view";
import { MemoriaYearView } from "./year-view";
import { MemoriaSettingTab } from "./settings";
import { buildMemoBlock } from "./parser";
import { setLang, t } from "./i18n";

export default class MemoriaPlugin extends Plugin {
  settings!: MemoriaSettings;
  store!: MemoStore;

  async onload() {
    await this.loadSettings();

    // v2.0.3: 初始化语言
    setLang(this.settings.language);

    this.store = new MemoStore(this.app, this.settings);

    this.registerView(VIEW_TYPE_MEMORIA, leaf => new MemoriaView(leaf, this.store, this.settings, () => this.saveSettings()));
    this.registerView(VIEW_TYPE_STATS, leaf => new MemoriaStatsView(leaf, this.store));
    this.registerView(VIEW_TYPE_YEAR, leaf => new MemoriaYearView(leaf, this.store));

    this.addRibbonIcon("feather", t("toolbar.more"), () => this.activateView());

    this.addCommand({ id: "open-memoria", name: t("toolbar.more"), callback: () => this.activateView() });
    this.addCommand({ id: "open-memoria-stats", name: t("toolbar.statsReport"), callback: () => this.activateStatsView() });
    this.addCommand({ id: "memoria-quick-capture", name: t("input.submit") + "（弹窗）", callback: () => this.quickCapture() });
    this.addCommand({
      id: "memoria-normalize-all",
      name: t("notice.normalizing"),
      callback: () => this.normalizeAll(),
    });

    this.registerEvent(this.app.vault.on("modify", f => {
      if (f instanceof TFile && this.store.isInFolder(f)) this.store.reloadFile(f);
    }));
    this.registerEvent(this.app.vault.on("delete", f => {
      if (f instanceof TFile) this.store.removeFile(f.path);
    }));
    this.registerEvent(this.app.vault.on("create", f => {
      if (f instanceof TFile && this.store.isInFolder(f)) this.store.reloadFile(f);
    }));
    this.registerEvent(this.app.vault.on("rename", (f, oldPath) => {
      this.store.removeFile(oldPath);
      if (f instanceof TFile && this.store.isInFolder(f)) this.store.reloadFile(f);
    }));

    this.addSettingTab(new MemoriaSettingTab(this.app, this));
  }

  async onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private async activateView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_MEMORIA);
    if (existing.length) { this.app.workspace.revealLeaf(existing[0]); return; }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE_MEMORIA, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  private async activateStatsView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_STATS);
    if (existing.length) { this.app.workspace.revealLeaf(existing[0]); return; }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE_STATS, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  private async normalizeAll() {
    if (!confirm(t("notice.normalizeConfirm"))) return;
    new Notice(t("notice.normalizing"));
    try {
      await this.store.reloadAll();
      const all = this.store.getAll();
      const byFile = new Map<string, typeof all>();
      for (const m of all) {
        const arr = byFile.get(m.file) ?? [];
        arr.push(m);
        byFile.set(m.file, arr);
      }
      let count = 0;
      for (const [filePath, memos] of byFile) {
        memos.sort((a, b) => b.range[0] - a.range[0]);
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) continue;
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
      new Notice(t("notice.normalizeDone", { n: count }));
    } catch (e: unknown) {
      console.error(e);
      new Notice(t("notice.normalizeFailed", { msg: e instanceof Error ? e.message : String(e) }));
    }
  }

  private quickCapture() {
    const backdrop = document.createElement("div");
    backdrop.addClass("memoria-modal-backdrop");
    const modal = backdrop.createDiv({ cls: "memoria-modal" });
    modal.createDiv({ cls: "memoria-modal-title", text: t("input.placeholder") });
    const textarea = modal.createEl("textarea", {
      cls: "memoria-modal-textarea",
      attr: { placeholder: "Ctrl+Enter / Cmd+Enter" },
    });
    const btns = modal.createDiv({ cls: "memoria-modal-btns" });
    const cancelBtn = btns.createEl("button", { text: t("common.cancel") });
    const sendBtn = btns.createEl("button", { text: t("input.submit"), cls: "mod-cta" });
    document.body.appendChild(backdrop);
    setTimeout(() => textarea.focus(), 20);

    const close = () => backdrop.remove();
    const submit = async () => {
      const text = textarea.value.trim();
      if (!text) { close(); return; }
      try {
        await this.store.addMemo(text);
        new Notice(t("notice.saved"));
        close();
      } catch (e: unknown) {
        new Notice(t("notice.saveFailed", { msg: e instanceof Error ? e.message : String(e) }));
      }
    };

    cancelBtn.addEventListener("click", close);
    backdrop.addEventListener("click", e => { if (e.target === backdrop) close(); });
    textarea.addEventListener("keydown", e => {
      if (e.isComposing || e.keyCode === 229) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); submit(); }
      else if (e.key === "Escape") close();
    });
    sendBtn.addEventListener("click", submit);
  }
}

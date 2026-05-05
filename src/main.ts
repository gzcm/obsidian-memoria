import { Notice, Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS, MemoriaSettings, VIEW_TYPE_MEMORIA, VIEW_TYPE_STATS } from "./types";
import { MemoStore } from "./store";
import { MemoriaView } from "./view";
import { MemoriaStatsView } from "./stats-view";
import { MemoriaSettingTab } from "./settings";
import { buildMemoBlock } from "./parser";

export default class MemoriaPlugin extends Plugin {
  settings!: MemoriaSettings;
  store!: MemoStore;

  async onload() {
    await this.loadSettings();
    this.store = new MemoStore(this.app, this.settings);

    this.registerView(VIEW_TYPE_MEMORIA, leaf => new MemoriaView(leaf, this.store, this.settings));
    this.registerView(VIEW_TYPE_STATS, leaf => new MemoriaStatsView(leaf, this.store));

    this.addRibbonIcon("feather", "打开 Memoria", () => this.activateView());

    this.addCommand({ id: "open-memoria", name: "打开 Memoria 面板", callback: () => this.activateView() });
    this.addCommand({ id: "open-memoria-stats", name: "打开数据报告", callback: () => this.activateStatsView() });
    this.addCommand({ id: "memoria-quick-capture", name: "快速记录（弹窗）", callback: () => this.quickCapture() });
    this.addCommand({
      id: "memoria-normalize-all",
      name: "规范化所有笔记格式（修复 md 渲染）",
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
    if (!confirm("将重写所有 Memoria 笔记的 md 格式以修复渲染问题。\n建议先备份 Memoria 文件夹。\n\n确定继续吗？")) return;
    new Notice("正在规范化…");
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
      new Notice(`✓ 已规范化 ${count} 条笔记`);
    } catch (e: unknown) {
      console.error(e);
      new Notice("规范化失败：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  private quickCapture() {
    const backdrop = document.createElement("div");
    backdrop.addClass("memoria-modal-backdrop");
    const modal = backdrop.createDiv({ cls: "memoria-modal" });
    modal.createDiv({ cls: "memoria-modal-title", text: "💭 此刻想到了什么？" });
    const textarea = modal.createEl("textarea", {
      cls: "memoria-modal-textarea",
      attr: { placeholder: "Ctrl+Enter 发送 · Esc 关闭" },
    });
    const btns = modal.createDiv({ cls: "memoria-modal-btns" });
    const cancelBtn = btns.createEl("button", { text: "取消" });
    const sendBtn = btns.createEl("button", { text: "发送", cls: "mod-cta" });
    document.body.appendChild(backdrop);
    setTimeout(() => textarea.focus(), 20);

    const close = () => backdrop.remove();
    const submit = async () => {
      const text = textarea.value.trim();
      if (!text) { close(); return; }
      try {
        await this.store.addMemo(text);
        new Notice("✓ 已记下");
        close();
      } catch (e: unknown) {
        new Notice("保存失败：" + (e instanceof Error ? e.message : String(e)));
      }
    };

    cancelBtn.addEventListener("click", close);
    backdrop.addEventListener("click", e => { if (e.target === backdrop) close(); });
    textarea.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); submit(); }
      else if (e.key === "Escape") close();
    });
    sendBtn.addEventListener("click", submit);
  }
}

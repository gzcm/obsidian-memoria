import { App, PluginSettingTab, Setting } from "obsidian";
import type MemoriaPlugin from "./main";
import { setLang, t } from "./i18n";

export class MemoriaSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: MemoriaPlugin) {
    super(app, plugin);
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: t("settings.title") });

    new Setting(containerEl)
      .setName(t("settings.folder.name"))
      .setDesc(t("settings.folder.desc"))
      .addText(tx => tx.setPlaceholder("Memoria").setValue(this.plugin.settings.folder)
        .onChange(async v => {
          this.plugin.settings.folder = v.trim() || "Memoria";
          await this.plugin.saveSettings();
          await this.plugin.store.reloadAll();
        }));

    new Setting(containerEl)
      .setName(t("settings.attachFolder.name"))
      .setDesc(t("settings.attachFolder.desc"))
      .addText(tx => tx.setPlaceholder("Memoria/attachments").setValue(this.plugin.settings.attachmentFolder)
        .onChange(async v => {
          this.plugin.settings.attachmentFolder = v.trim() || "Memoria/attachments";
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t("settings.promoteFolder.name"))
      .setDesc(t("settings.promoteFolder.desc"))
      .addText(tx => tx.setPlaceholder("Memoria/notes").setValue(this.plugin.settings.promoteFolder)
        .onChange(async v => {
          // 2026-06-03: 只保存默认目录，不主动创建文件夹；真正创建发生在转正式笔记时，便于定位失败点
          this.plugin.settings.promoteFolder = v.trim() || "Memoria/notes";
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t("settings.sidebarTags.name"))
      .setDesc(t("settings.sidebarTags.desc"))
      .addToggle(tg => tg.setValue(this.plugin.settings.showSidebarTags)
        .onChange(async v => {
          this.plugin.settings.showSidebarTags = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t("settings.clearAfterSave.name"))
      .addToggle(tg => tg.setValue(this.plugin.settings.clearAfterSave)
        .onChange(async v => {
          this.plugin.settings.clearAfterSave = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t("settings.pageSize.name"))
      .setDesc(t("settings.pageSize.desc"))
      .addSlider(sl => sl.setLimits(10, 200, 10).setValue(this.plugin.settings.pageSize)
        .setDynamicTooltip()
        .onChange(async v => {
          this.plugin.settings.pageSize = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t("settings.useTrash.name"))
      .setDesc(t("settings.useTrash.desc"))
      .addToggle(tg => tg.setValue(this.plugin.settings.useTrash)
        .onChange(async v => {
          this.plugin.settings.useTrash = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t("settings.trashMax.name"))
      .setDesc(t("settings.trashMax.desc"))
      .addDropdown(dd => dd
        .addOption("100", t("settings.trash.100"))
        .addOption("300", t("settings.trash.300"))
        .addOption("500", t("settings.trash.500"))
        .addOption("1000", t("settings.trash.1000"))
        .addOption("3000", t("settings.trash.3000"))
        .addOption("0", t("settings.trash.0"))
        .setValue(String(this.plugin.settings.trashMaxItems))
        .onChange(async v => {
          this.plugin.settings.trashMaxItems = parseInt(v, 10);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t("settings.exportTheme.name"))
      .setDesc(t("settings.exportTheme.desc"))
      .addDropdown(dd => dd
        .addOption("auto", t("settings.exportTheme.auto"))
        .addOption("random", t("settings.exportTheme.random"))
        .addOption("paper", t("settings.exportTheme.paper"))
        .addOption("kraft", t("settings.exportTheme.kraft"))
        .addOption("mint", t("settings.exportTheme.mint"))
        .addOption("peach", t("settings.exportTheme.peach"))
        .addOption("sky", t("settings.exportTheme.sky"))
        .addOption("lavender", t("settings.exportTheme.lavender"))
        .addOption("midnight", t("settings.exportTheme.midnight"))
        .addOption("charcoal", t("settings.exportTheme.charcoal"))
        .setValue(this.plugin.settings.exportTheme)
        .onChange(async v => {
          this.plugin.settings.exportTheme = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t("settings.collapse.name"))
      .setDesc(t("settings.collapse.desc"))
      .addDropdown(dd => dd
        .addOption("0", t("settings.collapse.0"))
        .addOption("4", t("settings.collapse.4"))
        .addOption("6", t("settings.collapse.6"))
        .addOption("8", t("settings.collapse.8"))
        .addOption("12", t("settings.collapse.12"))
        .addOption("20", t("settings.collapse.20"))
        .setValue(String(this.plugin.settings.collapseLineLimit))
        .onChange(async v => {
          this.plugin.settings.collapseLineLimit = parseInt(v, 10);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t("settings.dailyGoal.name"))
      .setDesc(t("settings.dailyGoal.desc"))
      .addSlider(sl => sl.setLimits(0, 30, 1).setValue(this.plugin.settings.dailyGoal)
        .setDynamicTooltip()
        .onChange(async v => {
          this.plugin.settings.dailyGoal = v;
          await this.plugin.saveSettings();
        }));

    // v2.0.3: 功能开关
    containerEl.createEl("h3", { text: t("settings.heading.newFeatures") });

    new Setting(containerEl)
      .setName(t("settings.density.name"))
      .setDesc(t("settings.density.desc"))
      .addDropdown(dd => dd
        .addOption("cozy", t("settings.density.cozy"))
        .addOption("compact", t("settings.density.compact"))
        .setValue(this.plugin.settings.density)
        .onChange(async v => {
          this.plugin.settings.density = v as any;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t("settings.vim.name"))
      .setDesc(t("settings.vim.desc"))
      .addToggle(tg => tg.setValue(this.plugin.settings.enableVimKeys)
        .onChange(async v => {
          this.plugin.settings.enableVimKeys = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t("settings.mood.name"))
      .setDesc(t("settings.mood.desc"))
      .addToggle(tg => tg.setValue(this.plugin.settings.enableMoodColoring)
        .onChange(async v => {
          this.plugin.settings.enableMoodColoring = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t("settings.smartReview.name"))
      .setDesc(t("settings.smartReview.desc"))
      .addToggle(tg => tg.setValue(this.plugin.settings.enableSmartReview)
        .onChange(async v => {
          this.plugin.settings.enableSmartReview = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t("settings.language.name"))
      .setDesc(t("settings.language.desc"))
      .addDropdown(dd => dd
        .addOption("auto", t("settings.language.auto"))
        .addOption("zh-CN", t("settings.language.zh"))
        .addOption("en-US", t("settings.language.en"))
        .setValue(this.plugin.settings.language)
        .onChange(async v => {
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

    new Setting(containerEl)
      .setName(t("settings.repo.name"))
      .setDesc(t("settings.repo.desc"))
      .addButton(btn => btn.setButtonText(t("settings.repo.btn")).onClick(() => {
        window.open("https://github.com/gzcm/obsidian-memoria");
      }));

    containerEl.createEl("p", { cls: "setting-item-description", text: t("settings.version", { ver: "2.0.3" }) });
  }
}

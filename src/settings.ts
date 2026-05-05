import { App, PluginSettingTab, Setting } from "obsidian";
import type MemoriaPlugin from "./main";

export class MemoriaSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: MemoriaPlugin) {
    super(app, plugin);
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Memoria 设置" });

    new Setting(containerEl)
      .setName("笔记文件夹")
      .setDesc("Memoria 在此文件夹下读写 YYYY.md 文件（相对 vault 根目录）")
      .addText(t => t.setPlaceholder("Memoria").setValue(this.plugin.settings.folder)
        .onChange(async v => {
          this.plugin.settings.folder = v.trim() || "Memoria";
          await this.plugin.saveSettings();
          await this.plugin.store.reloadAll();
        }));

    new Setting(containerEl)
      .setName("图片附件文件夹")
      .setDesc("粘贴/拖拽/选择的图片会保存到此目录（相对 vault 根目录）")
      .addText(t => t.setPlaceholder("Memoria/attachments").setValue(this.plugin.settings.attachmentFolder)
        .onChange(async v => {
          this.plugin.settings.attachmentFolder = v.trim() || "Memoria/attachments";
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("在侧边栏显示标签树")
      .setDesc("默认关闭。关闭后可在卡片底部点击标签胶囊筛选，或在搜索框输入「#标签名」筛选。")
      .addToggle(t => t.setValue(this.plugin.settings.showSidebarTags)
        .onChange(async v => {
          this.plugin.settings.showSidebarTags = v;
          await this.plugin.saveSettings();
          await this.plugin.store.reloadAll();
        }));

    new Setting(containerEl)
      .setName("删除时移入回收站")
      .setDesc("开启后，删除的笔记会追加到 <笔记文件夹>/_trash.md（而不是彻底消失），便于误删后手动恢复。关闭 = 彻底删除。")
      .addToggle(t => t.setValue(this.plugin.settings.useTrash)
        .onChange(async v => {
          this.plugin.settings.useTrash = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("发送后清空输入框")
      .addToggle(t => t.setValue(this.plugin.settings.clearAfterSave)
        .onChange(async v => {
          this.plugin.settings.clearAfterSave = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("每次加载条数")
      .setDesc("瀑布流每次展示多少条，滚动到底自动加载更多")
      .addSlider(t => t.setLimits(10, 200, 10).setValue(this.plugin.settings.pageSize)
        .setDynamicTooltip()
        .onChange(async v => {
          this.plugin.settings.pageSize = v;
          await this.plugin.saveSettings();
        }));

    containerEl.createEl("h3", { text: "关于" });
    const desc = containerEl.createEl("p", { cls: "setting-item-description" });
    desc.appendText("Memoria — 浮墨式碎片笔记插件。所有笔记以纯 Markdown 格式存储（");
    desc.createEl("code", { text: "## yyyy-MM-dd" });
    desc.appendText(" + ");
    desc.createEl("code", { text: "- HH:MM 内容" });
    desc.appendText("），停用插件后你的笔记依然完整可读。");
  }
}

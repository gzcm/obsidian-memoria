/**
 * Memoria 年度全景视图 (v1.4.5+)
 * 4 列月份卡片布局，每天一个圆点
 */
import { ItemView, setIcon, WorkspaceLeaf } from "obsidian";
import { Memo, VIEW_TYPE_YEAR } from "./types";
import { MemoStore } from "./store";
import { t } from "./i18n";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

export class MemoriaYearView extends ItemView {
  private store: MemoStore;
  private memos: Memo[] = [];
  private unsubscribe: (() => void) | null = null;
  private year: number;

  constructor(leaf: WorkspaceLeaf, store: MemoStore) {
    super(leaf);
    this.store = store;
    this.year = new Date().getFullYear();
  }

  getViewType() { return VIEW_TYPE_YEAR; }
  getDisplayText() { return "Memoria 年度全景"; }
  getIcon() { return "calendar-days"; }

  async onOpen() {
    this.contentEl.addClass("memoria-year-view");
    this.memos = this.store.getAll();
    this.render();
    this.unsubscribe = this.store.onChange(() => {
      this.memos = this.store.getAll();
      this.render();
    });
  }

  async onClose() { this.unsubscribe?.(); }

  private render() {
    const el = this.contentEl;
    el.empty();

    // 头部
    const header = el.createDiv({ cls: "memoria-year-header" });
    header.createDiv({ cls: "memoria-year-title", text: String(this.year) });

    const nav = header.createDiv({ cls: "memoria-year-nav" });
    const prevBtn = nav.createEl("button", { cls: "memoria-year-nav-btn", attr: { "aria-label": "上一年" } });
    setIcon(prevBtn, "chevron-left");
    const todayBtn = nav.createEl("button", { cls: "memoria-year-today-btn", text: "今年" });
    const nextBtn = nav.createEl("button", { cls: "memoria-year-nav-btn", attr: { "aria-label": "下一年" } });
    setIcon(nextBtn, "chevron-right");

    prevBtn.addEventListener("click", () => { this.year--; this.render(); });
    nextBtn.addEventListener("click", () => { this.year++; this.render(); });
    todayBtn.addEventListener("click", () => { this.year = new Date().getFullYear(); this.render(); });

    if (this.memos.length === 0) {
      el.createDiv({ cls: "myv-empty", text: t("empty.default") });
      return;
    }

    // 按日期统计
    const dateCounts = new Map<string, number>();
    for (const m of this.memos) dateCounts.set(m.date, (dateCounts.get(m.date) ?? 0) + 1);

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    // 12 个月网格
    const grid = el.createDiv({ cls: "memoria-year-grid" });
    for (let month = 0; month < 12; month++) {
      const monthEl = grid.createDiv({ cls: "memoria-year-month" });
      monthEl.createDiv({ cls: "memoria-year-month-label", text: MONTH_LABELS[month] });

      // 星期头
      const weekHead = monthEl.createDiv({ cls: "memoria-year-weekhead" });
      for (const wd of WEEKDAY_LABELS) weekHead.createDiv({ cls: "memoria-year-wday", text: wd });

      // 日期网格
      const daysGrid = monthEl.createDiv({ cls: "memoria-year-grid-days" });
      const firstDay = new Date(this.year, month, 1);
      const daysInMonth = new Date(this.year, month + 1, 0).getDate();
      const startOffset = firstDay.getDay();
      const prevMonthDays = new Date(this.year, month, 0).getDate();

      // 上月尾
      for (let i = startOffset - 1; i >= 0; i--) {
        const d = prevMonthDays - i;
        daysGrid.createDiv({
          cls: "memoria-year-day is-out",
          text: String(d),
        });
      }

      // 本月
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${this.year}-${pad(month + 1)}-${pad(d)}`;
        const count = dateCounts.get(dateStr) ?? 0;
        const level = count === 0 ? 0 : count < 2 ? 1 : count < 4 ? 2 : count < 7 ? 3 : 4;
        const cls = "memoria-year-day" +
          (count > 0 ? ` has-memo level-${level}` : "") +
          (dateStr === todayStr ? " is-today" : "");
        daysGrid.createDiv({
          cls,
          text: String(d),
          attr: { title: count > 0 ? `${dateStr}  ${count} 条` : dateStr },
        });
      }

      // 下月头
      const remaining = 7 - ((startOffset + daysInMonth) % 7);
      if (remaining < 7) {
        for (let d = 1; d <= remaining; d++) {
          daysGrid.createDiv({
            cls: "memoria-year-day is-out",
            text: String(d),
          });
        }
      }
    }

    // 底部统计
    const activeDays = new Set(this.memos.map(m => m.date)).size;
    const yearMemos = this.memos.filter(m => m.date.startsWith(String(this.year)));
    const foot = el.createDiv({ cls: "memoria-year-foot" });
    foot.createSpan({ cls: "memoria-year-foot-item", text: `${yearMemos.length} 条笔记` });
    foot.createSpan({ cls: "memoria-year-foot-sep", text: "·" });
    foot.createSpan({ cls: "memoria-year-foot-item", text: `${activeDays} 活跃天` });
  }
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

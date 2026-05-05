import { ItemView, setIcon, WorkspaceLeaf } from "obsidian";
import { Memo, RESERVED_TAGS, VIEW_TYPE_STATS } from "./types";
import { MemoStore } from "./store";

export class MemoriaStatsView extends ItemView {
  private store: MemoStore;
  private memos: Memo[] = [];
  private unsubscribe: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf, store: MemoStore) {
    super(leaf);
    this.store = store;
  }

  getViewType() { return VIEW_TYPE_STATS; }
  getDisplayText() { return "Memoria 数据报告"; }
  getIcon() { return "bar-chart-3"; }

  async onOpen() {
    this.contentEl.addClass("memoria-stats-view");
    this.memos = this.store.getAll();
    this.render();
    this.unsubscribe = this.store.onChange(() => { this.memos = this.store.getAll(); this.render(); });
  }

  async onClose() { this.unsubscribe?.(); }

  private render() {
    const el = this.contentEl;
    el.empty();

    const titleBar = el.createDiv({ cls: "mstat-pagetitle" });
    titleBar.createSpan({ cls: "mstat-pagetitle-icon", text: "📊" });
    titleBar.createSpan({ cls: "mstat-pagetitle-text", text: "Memoria 数据报告" });

    if (this.memos.length === 0) {
      el.createEl("p", { text: "还没有笔记，赶紧去写一条吧 ✨", cls: "mstat-empty-page" });
      return;
    }

    const body = el.createDiv({ cls: "memoria-stats-body" });
    this.renderOverview(body);
    this.renderYearHeatmap(body);
    this.renderTopTags(body);
    this.renderHourlyChart(body);
    this.renderHighlights(body);
    this.renderTagCloud(body);
  }

  private renderOverview(parent: HTMLElement) {
    const section = parent.createDiv({ cls: "mstat-section" }).createDiv({ cls: "mstat-overview" });
    const charCount = this.memos.reduce((sum, m) => sum + m.content.replace(/\s/g, "").length, 0);
    const activeDays = new Set(this.memos.map(m => m.date)).size;
    const oldest = [...this.memos].sort((a, b) => a.datetime.getTime() - b.datetime.getTime())[0];
    const spanDays = Math.floor((Date.now() - oldest.datetime.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    this.renderBigNum(section, this.memos.length, "条笔记");
    this.renderBigNum(section, charCount, "字");
    this.renderBigNum(section, activeDays, "活跃天");
    this.renderBigNum(section, spanDays, "总跨度");
  }

  private renderBigNum(parent: HTMLElement, num: number, label: string) {
    const el = parent.createDiv({ cls: "mstat-bignum" });
    el.createDiv({ cls: "mstat-bignum-num", text: num.toLocaleString() });
    el.createDiv({ cls: "mstat-bignum-label", text: label });
  }

  private renderYearHeatmap(parent: HTMLElement) {
    const section = parent.createDiv({ cls: "mstat-section" });
    const titleRow = section.createDiv({ cls: "mstat-yh-title-row" });
    titleRow.createDiv({ cls: "mstat-title", text: "🔥 全年活跃度" });

    const yearNav = titleRow.createDiv({ cls: "mstat-yh-year-nav" });
    const prevBtn = yearNav.createEl("button", { cls: "mstat-yh-year-arrow", attr: { "aria-label": "上一年" } });
    setIcon(prevBtn, "chevron-left");
    const yearBtn = yearNav.createEl("button", { cls: "mstat-yh-year-btn" });
    const nextBtn = yearNav.createEl("button", { cls: "mstat-yh-year-arrow", attr: { "aria-label": "下一年" } });
    setIcon(nextBtn, "chevron-right");

    let currentYear = new Date().getFullYear();
    yearBtn.setText(`${currentYear} 年`);

    const heatmapWrap = section.createDiv({ cls: "mstat-yh-wrap" });
    const monthLabels = section.createDiv({ cls: "mstat-yh-monthlabels" });

    const monthlyTitleSection = parent.createDiv({ cls: "mstat-section mstat-monthly-title" });
    const monthlyTitleRow = monthlyTitleSection.createDiv({ cls: "mstat-title-row" });
    monthlyTitleRow.createDiv({ cls: "mstat-title", text: "📅 月度分布" });
    const monthlySubtitle = monthlyTitleRow.createDiv({ cls: "mstat-subtitle" });
    const monthlyWrap = parent.createDiv({ cls: "mstat-monthly-wrap" });

    const drawYear = (year: number) => {
      heatmapWrap.empty();
      monthLabels.empty();
      yearBtn.setText(`${year} 年`);

      const dateCounts = new Map<string, number>();
      for (const m of this.memos) {
        if (m.date.startsWith(`${year}-`)) dateCounts.set(m.date, (dateCounts.get(m.date) ?? 0) + 1);
      }

      const jan1 = new Date(year, 0, 1);
      const now = new Date();
      const lastDay = year === now.getFullYear() ? now : new Date(year, 11, 31);
      const gridStart = new Date(jan1);
      gridStart.setDate(jan1.getDate() - jan1.getDay());

      const totalDays = Math.ceil((lastDay.getTime() - gridStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const totalCols = Math.ceil(totalDays / 7);

      const CELL_W = 13, GAP = 3;
      monthLabels.style.width = `${totalCols * (CELL_W + GAP)}px`;

      // 月份标签
      const monthsSeen: { month: number; week: number }[] = [];
      let lastMonth = -1;
      for (let col = 0; col < totalCols; col++) {
        const d = new Date(gridStart);
        d.setDate(gridStart.getDate() + col * 7);
        if (d.getFullYear() !== year) continue;
        const mo = d.getMonth();
        if (mo !== lastMonth) { monthsSeen.push({ month: mo, week: col }); lastMonth = mo; }
      }
      for (let i = 0; i < monthsSeen.length; i++) {
        const { month, week } = monthsSeen[i];
        const next = monthsSeen[i + 1];
        if ((next ? next.week - week : totalCols - week) < 2) continue;
        const lbl = monthLabels.createDiv({ cls: "mstat-yh-mlabel", text: `${month + 1}月` });
        lbl.style.left = `${week * (CELL_W + GAP)}px`;
      }

      // 热力图格子
      for (let col = 0; col < totalCols; col++) {
        const colEl = heatmapWrap.createDiv({ cls: "mstat-yh-col" });
        for (let row = 0; row < 7; row++) {
          const d = new Date(gridStart);
          d.setDate(gridStart.getDate() + col * 7 + row);
          const dateStr = toDateStr(d);
          const inYear = d >= jan1 && d <= lastDay;
          const count = dateCounts.get(dateStr) ?? 0;
          const level = inYear ? (count === 0 ? 0 : count < 2 ? 1 : count < 4 ? 2 : count < 7 ? 3 : 4) : -1;
          const cell = colEl.createDiv({ cls: `mstat-yh-cell level-${level}`, attr: { title: inYear ? `${dateStr}  ${count} 条` : "" } });
          if (level === -1) cell.style.visibility = "hidden";
        }
      }

      this.renderMonthlyForYear(monthlyWrap, year);
      const yearTotal = this.memos.filter(m => m.date.startsWith(`${year}-`)).length;
      monthlySubtitle.setText(`${year} 年共 ${yearTotal} 条`);
    };

    const allYears = [...new Set(this.memos.map(m => parseInt(m.date.substring(0, 4))))].sort();
    const navigate = (delta: number) => {
      const idx = allYears.indexOf(currentYear);
      const newIdx = Math.max(0, Math.min(allYears.length - 1, (idx < 0 ? 0 : idx) + delta));
      currentYear = allYears[newIdx];
      drawYear(currentYear);
    };
    prevBtn.addEventListener("click", () => navigate(-1));
    nextBtn.addEventListener("click", () => navigate(1));
    yearBtn.addEventListener("click", () => navigate(1));
    drawYear(currentYear);

    const legend = section.createDiv({ cls: "mstat-yh-legend" });
    legend.createSpan({ text: "少 " });
    for (let i = 0; i <= 4; i++) legend.createDiv({ cls: `mstat-yh-cell level-${i}` });
    legend.createSpan({ text: " 多" });
  }

  private renderMonthlyForYear(parent: HTMLElement, year: number) {
    parent.empty();
    const months = Array.from({ length: 12 }, (_, i) => ({
      key: `${year}-${pad(i + 1)}`,
      label: `${i + 1}月`,
      count: 0,
    }));
    for (const m of this.memos) {
      if (!m.date.startsWith(`${year}-`)) continue;
      const mo = parseInt(m.date.substring(5, 7), 10) - 1;
      months[mo].count++;
    }
    const maxCount = Math.max(1, ...months.map(m => m.count));
    const chart = parent.createDiv({ cls: "mstat-bar-chart" });
    for (const mo of months) {
      const col = chart.createDiv({ cls: "mstat-bar-col" });
      const bar = col.createDiv({ cls: "mstat-bar-wrap" }).createDiv({
        cls: "mstat-bar" + (mo.count === maxCount && mo.count > 0 ? " is-max" : ""),
      });
      bar.style.height = `${(mo.count / maxCount) * 100}%`;
      bar.setAttr("title", `${mo.key}: ${mo.count} 条`);
      col.createDiv({ cls: "mstat-bar-num", text: mo.count > 0 ? String(mo.count) : "" });
      col.createDiv({ cls: "mstat-bar-label", text: mo.label });
    }
  }

  private renderTagCloud(parent: HTMLElement) {
    const tagMap = new Map<string, number>();
    for (const m of this.memos) for (const t of m.tags) if (!RESERVED_TAGS.has(t)) tagMap.set(t, (tagMap.get(t) ?? 0) + 1);
    if (tagMap.size === 0) return;

    const section = parent.createDiv({ cls: "mstat-section" });
    section.createDiv({ cls: "mstat-title", text: "☁️ 标签云" });

    const sorted = [...tagMap.entries()].sort((a, b) => b[1] - a[1]);
    const maxCnt = sorted[0][1];
    const minCnt = sorted[sorted.length - 1][1];
    const cloud = section.createDiv({ cls: "mstat-cloud" });
    for (const [tag, cnt] of sorted) {
      const ratio = maxCnt === minCnt ? 1 : (cnt - minCnt) / (maxCnt - minCnt);
      const span = cloud.createSpan({ cls: "mstat-cloud-tag", text: `#${tag}`, attr: { title: `${cnt} 条` } });
      span.style.fontSize = `${12 + ratio * 10}px`;
      span.style.opacity = String(0.55 + ratio * 0.45);
    }
  }

  private renderTopTags(parent: HTMLElement) {
    const section = parent.createDiv({ cls: "mstat-section" });
    section.createDiv({ cls: "mstat-title", text: "🏷️ 最常用标签 Top 10" });

    const tagMap = new Map<string, number>();
    for (const m of this.memos) for (const t of m.tags) if (!RESERVED_TAGS.has(t)) tagMap.set(t, (tagMap.get(t) ?? 0) + 1);
    const top10 = [...tagMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (top10.length === 0) { section.createDiv({ cls: "mstat-empty", text: "暂无标签" }); return; }

    const maxCnt = top10[0][1];
    const list = section.createDiv({ cls: "mstat-hbar-list" });
    top10.forEach(([tag, cnt], i) => {
      const row = list.createDiv({ cls: "mstat-hbar-row" });
      row.createDiv({ cls: `mstat-hbar-rank rank-${Math.min(i + 1, 4)}` }).setText(String(i + 1));
      row.createDiv({ cls: "mstat-hbar-label", text: `#${tag}` });
      const bar = row.createDiv({ cls: "mstat-hbar-wrap" }).createDiv({ cls: "mstat-hbar" });
      bar.style.width = `${(cnt / maxCnt) * 100}%`;
      row.createDiv({ cls: "mstat-hbar-num", text: String(cnt) });
    });
  }

  private renderHourlyChart(parent: HTMLElement) {
    const section = parent.createDiv({ cls: "mstat-section" });
    const titleRow = section.createDiv({ cls: "mstat-title-row" });
    titleRow.createDiv({ cls: "mstat-title", text: "⏰ 一天中你什么时候写得最多" });
    titleRow.createDiv({ cls: "mstat-subtitle", text: `基于 ${this.memos.length} 条历史笔记累计` });

    const hourly = new Array(24).fill(0);
    for (const m of this.memos) hourly[m.datetime.getHours()]++;
    const maxVal = Math.max(1, ...hourly);

    const chart = section.createDiv({ cls: "mstat-bar-chart mstat-bar-chart-hour" });
    for (let h = 0; h < 24; h++) {
      const col = chart.createDiv({ cls: "mstat-bar-col" });
      const bar = col.createDiv({ cls: "mstat-bar-wrap" }).createDiv({
        cls: "mstat-bar" + (hourly[h] === maxVal && hourly[h] > 0 ? " is-max" : "") + (hourly[h] === 0 ? " is-empty" : ""),
      });
      bar.style.height = hourly[h] === 0 ? "2px" : `${(hourly[h] / maxVal) * 100}%`;
      bar.setAttr("title", `${pad(h)}:00 — ${hourly[h]} 条`);
      col.createDiv({ cls: "mstat-bar-label", text: pad(h) });
    }

    const peakHour = hourly.indexOf(maxVal);
    section.createDiv({ cls: "mstat-desc" })
      .setText(`📝 你最喜欢在 ${pad(peakHour)}:00 写笔记，至今累计 ${maxVal} 条（${(maxVal / this.memos.length * 100).toFixed(1)}%）`);
  }

  private renderHighlights(parent: HTMLElement) {
    const section = parent.createDiv({ cls: "mstat-section" });
    section.createDiv({ cls: "mstat-title", text: "🌟 有趣的发现" });
    const list = section.createDiv({ cls: "mstat-fact-list" });

    const dateCounts = new Map<string, number>();
    for (const m of this.memos) dateCounts.set(m.date, (dateCounts.get(m.date) ?? 0) + 1);

    const busiestDay = [...dateCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    this.renderFact(list, "📅", `最活跃的一天：${busiestDay[0]}，那天你写了 ${busiestDay[1]} 条`);

    const longest = [...this.memos].sort((a, b) => b.content.length - a.content.length)[0];
    this.renderFact(list, "📏", `最长的一条：${longest.content.length} 字（${longest.date}）`);

    const weekdayCounts = new Array(7).fill(0);
    for (const m of this.memos) weekdayCounts[m.datetime.getDay()]++;
    const maxWd = Math.max(...weekdayCounts);
    const peakWd = weekdayCounts.indexOf(maxWd);
    const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    this.renderFact(list, "📆", `${weekdays[peakWd]}是你写笔记最多的一天（${maxWd} 条）`);

    const activeDays = dateCounts.size;
    this.renderFact(list, "💫", `活跃日平均每天 ${(this.memos.length / activeDays).toFixed(2)} 条`);

    const imgCount = this.memos.filter(m => m.hasImage).length;
    if (imgCount > 0) this.renderFact(list, "🖼️", `共有 ${imgCount} 条笔记带图片（${(imgCount / this.memos.length * 100).toFixed(1)}%）`);

    const nightOwl = this.memos.filter(m => { const h = m.datetime.getHours(); return h >= 0 && h < 5; }).length;
    if (nightOwl > 0) this.renderFact(list, "🌙", `凌晨 0-5 点你写了 ${nightOwl} 条，是个夜猫子呢`);

    this.renderFact(list, "🔥", `最长连续打卡：${this.calcLongestStreak([...dateCounts.keys()])} 天`);

    const thisYear = new Date().getFullYear();
    const thisYearCnt = this.memos.filter(m => m.date.startsWith(`${thisYear}-`)).length;
    const lastYearCnt = this.memos.filter(m => m.date.startsWith(`${thisYear - 1}-`)).length;
    if (lastYearCnt > 0) {
      const diff = thisYearCnt - lastYearCnt;
      const pct = (Math.abs(diff) / lastYearCnt * 100).toFixed(0);
      const trend = diff > 0 ? "多" : diff < 0 ? "少" : "持平";
      this.renderFact(list, "📊", `今年 ${thisYearCnt} 条，比去年 ${lastYearCnt} 条${trend} ${pct}%`);
    }

    const lastDate = [...dateCounts.keys()].sort().pop();
    if (lastDate) {
      const daysSince = Math.floor((Date.now() - new Date(lastDate + "T00:00:00").getTime()) / 86400000);
      if (daysSince >= 3) this.renderFact(list, "💭", `你已经 ${daysSince} 天没记录新想法了，要不要随手写一条？`);
    }
  }

  private renderFact(parent: HTMLElement, icon: string, text: string) {
    const el = parent.createDiv({ cls: "mstat-fact" });
    el.createSpan({ cls: "mstat-fact-icon", text: icon });
    el.createSpan({ cls: "mstat-fact-text", text });
  }

  private calcLongestStreak(dates: string[]): number {
    if (dates.length === 0) return 0;
    const sorted = [...dates].sort();
    let max = 1, cur = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1] + "T00:00:00").getTime();
      const curr = new Date(sorted[i] + "T00:00:00").getTime();
      const diff = Math.round((curr - prev) / (24 * 60 * 60 * 1000));
      if (diff === 1) { cur++; max = Math.max(max, cur); }
      else if (diff > 1) cur = 1;
    }
    return max;
  }
}

function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

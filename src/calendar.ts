import { setIcon } from "obsidian";
import { Memo } from "./types";

const WEEKDAY_CHARS = ["日", "一", "二", "三", "四", "五", "六"];

export interface CalendarState {
  activeDate: string | null;
  onPickDate: (date: string) => void;
}

export function renderCalendar(
  container: HTMLElement,
  memos: Memo[],
  state: CalendarState,
  initialYear?: number,
  initialMonth?: number
): { element: HTMLElement; setMonth: (year: number, month: number) => void } {
  const today = new Date();
  let year = initialYear ?? today.getFullYear();
  let month = initialMonth ?? today.getMonth();

  const el = container.createDiv({ cls: "memoria-calendar" });

  const dateCounts = new Map<string, number>();
  for (const m of memos) dateCounts.set(m.date, (dateCounts.get(m.date) ?? 0) + 1);

  const render = () => {
    el.empty();

    const head = el.createDiv({ cls: "memoria-cal-head" });
    const prevBtn = head.createEl("button", { cls: "memoria-cal-nav", attr: { "aria-label": "上个月" } });
    setIcon(prevBtn, "chevron-left");
    head.createDiv({ cls: "memoria-cal-title", text: `${year}年${month + 1}月` })
      .addEventListener("click", () => { year = today.getFullYear(); month = today.getMonth(); render(); });
    const nextBtn = head.createEl("button", { cls: "memoria-cal-nav", attr: { "aria-label": "下个月" } });
    setIcon(nextBtn, "chevron-right");

    prevBtn.addEventListener("click", () => { month === 0 ? (month = 11, year--) : month--; render(); });
    nextBtn.addEventListener("click", () => { month === 11 ? (month = 0, year++) : month++; render(); });

    const weekHead = el.createDiv({ cls: "memoria-cal-week-head" });
    for (const wd of WEEKDAY_CHARS) weekHead.createDiv({ cls: "memoria-cal-wday", text: wd });

    const grid = el.createDiv({ cls: "memoria-cal-grid" });
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startOffset = firstDay.getDay();

    for (let i = 0; i < startOffset; i++) grid.createDiv({ cls: "memoria-cal-cell empty" });

    const todayStr = formatCalDate(today);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = formatCalDate(new Date(year, month, d));
      const count = dateCounts.get(dateStr) ?? 0;
      const cell = grid.createDiv({
        cls: "memoria-cal-cell" +
          (count > 0 ? " has-memo" : "") +
          (dateStr === todayStr ? " is-today" : "") +
          (dateStr === state.activeDate ? " is-active" : ""),
        attr: { title: count > 0 ? `${dateStr}  ${count} 条` : dateStr },
      });
      cell.createDiv({ cls: "memoria-cal-num", text: String(d) });
      if (count > 0) {
        const dot = cell.createDiv({ cls: "memoria-cal-dot" });
        dot.addClass(`level-${count < 2 ? 1 : count < 4 ? 2 : count < 7 ? 3 : 4}`);
      }
      cell.addEventListener("click", () => state.onPickDate(dateStr));
    }
  };

  render();
  return {
    element: el,
    setMonth: (y: number, m: number) => { year = y; month = m; render(); },
  };
}

export function formatCalDate(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

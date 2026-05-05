import { Memo, TAG_PINNED, TAG_STARRED } from "./types";

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const DATE_HEAD_RE = /^##\s+(\d{4}-\d{2}-\d{2})(?:\s+.+)?$/;
const TIME_LINE_RE = /^-\s+(\d{2}:\d{2})\s?(.*)$/;

export function parseMemos(filePath: string, content: string): Memo[] {
  const lines = content.split(/\r?\n/);
  const memos: Memo[] = [];
  let currentDate = "";
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const dateMatch = line.match(DATE_HEAD_RE);
    if (dateMatch) {
      currentDate = dateMatch[1];
      i++;
      continue;
    }

    const timeMatch = line.match(TIME_LINE_RE);
    if (timeMatch && currentDate) {
      const time = timeMatch[1];
      const firstLine = timeMatch[2] ?? "";
      const startLine = i;
      const contentLines = [firstLine];

      i++;
      while (i < lines.length) {
        const next = lines[i];
        if (TIME_LINE_RE.test(next) || DATE_HEAD_RE.test(next) || /^#\s+\d{4}\s*$/.test(next)) break;
        if (next.startsWith("  ")) {
          contentLines.push(next.slice(2));
          i++;
          continue;
        }
        if (next.trim() === "") {
          const peek = lines[i + 1];
          if (peek !== undefined && peek.startsWith("  ")) {
            contentLines.push("");
            i++;
            continue;
          }
          break;
        }
        break;
      }

      const endLine = i - 1;
      while (contentLines.length && contentLines[0].trim() === "") contentLines.shift();
      while (contentLines.length && contentLines[contentLines.length - 1].trim() === "") contentLines.pop();

      const memoContent = contentLines.join("\n");
      const tags = extractTags(memoContent);

      memos.push({
        file: filePath,
        date: currentDate,
        time,
        datetime: buildDatetime(currentDate, time),
        content: memoContent,
        tags,
        hasImage: checkHasImage(memoContent),
        hasLink: checkHasLink(memoContent),
        isPinned: tags.includes(TAG_PINNED),
        isStarred: tags.includes(TAG_STARRED),
        range: [startLine, endLine],
      });
      continue;
    }
    i++;
  }
  return memos;
}

function buildDatetime(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(n => parseInt(n, 10));
  const [h, min] = timeStr.split(":").map(n => parseInt(n, 10));
  return new Date(y, m - 1, d, h, min, 0, 0);
}

export function extractTags(content: string): string[] {
  const re = /#([A-Za-z0-9_一-鿿][A-Za-z0-9_一-鿿/]*)/g;
  const tags = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) tags.add(m[1]);
  return [...tags];
}

function checkHasImage(content: string): boolean {
  return !!(
    /!\[[^\]]*\]\([^)]+\)/.test(content) ||
    /!\[\[[^\]]+\.(png|jpe?g|gif|webp|svg|bmp|avif)(\|[^\]]*)?\]\]/i.test(content)
  );
}

function checkHasLink(content: string): boolean {
  // 先剥离代码块和图片，避免误判
  const stripped = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "")
    .replace(/`[^`\n]*`/g, "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/!\[\[[^\]]+\]\]/g, "");
  return !!(
    /\[[^\]]+\]\([^)]+\)/.test(stripped) ||
    /\[\[[^\]]+\]\]/.test(stripped) ||
    /https?:\/\/[^\s)]+/.test(stripped)
  );
}

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function getWeekday(date: Date): string {
  return WEEKDAYS[date.getDay()];
}

export function buildMemoBlock(time: string, content: string): string {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  while (lines.length && lines[0].trim() === "") lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  if (lines.length === 0) return `- ${time}`;
  const indented = lines.map(l => (l.trim() === "" ? "" : `  ${l}`)).join("\n");
  return `- ${time}\n${indented}`;
}

/** 渲染前规范化：给代码块/表格/callout/标题/分隔线前后补空行，不修改存储内容 */
export function normalizeForRender(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let inFence = false;

  const isTable = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  const isHeading = (l: string) => /^#{1,6}\s/.test(l);
  const isHRule = (l: string) => /^\s*(?:---|\*\*\*|___)\s*$/.test(l);
  const isBlockquote = (l: string) => /^\s*>/.test(l);
  const isFence = (l: string) => /^\s*(?:```|~~~)/.test(l);

  const lastNonBlank = () => {
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i].trim() !== "") return result[i];
    }
    return "";
  };
  const ensureBlankBefore = () => {
    if (result.length > 0 && result[result.length - 1].trim() !== "") result.push("");
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = i < lines.length - 1 ? lines[i + 1] : "";

    if (isFence(line) && !inFence) {
      ensureBlankBefore();
      result.push(line);
      inFence = true;
      continue;
    }
    if (inFence) {
      result.push(line);
      if (isFence(line)) {
        inFence = false;
        if (next.trim() !== "") result.push("");
      }
      continue;
    }

    if (isHeading(line)) {
      ensureBlankBefore();
      result.push(line);
      if (next.trim() !== "") result.push("");
      continue;
    }
    if (isHRule(line) && lines[i > 0 ? i - 1 : 0].trim() !== "" && !isHeading(lastNonBlank())) {
      ensureBlankBefore();
      result.push(line);
      if (next.trim() !== "") result.push("");
      continue;
    }
    if (isTable(line) && (i === 0 || !isTable(lines[i - 1])) && lines[i > 0 ? i - 1 : 0].trim() !== "") {
      ensureBlankBefore();
      result.push(line);
      continue;
    }
    if (isTable(line)) {
      result.push(line);
      if (next.trim() !== "" && !isTable(next)) result.push("");
      continue;
    }
    if (isBlockquote(line) && (i === 0 || !isBlockquote(lines[i - 1])) && lines[i > 0 ? i - 1 : 0].trim() !== "") {
      ensureBlankBefore();
      result.push(line);
      continue;
    }
    result.push(line);
  }
  return result.join("\n");
}

import { Memo, TAG_PINNED, TAG_STARRED } from "./types";
import { extractTagsFromContent } from "./tag-rewrite";

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

      const taskState = checkTasks(memoContent);
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
        hasOpenTask: taskState.open,
        hasClosedTask: taskState.closed,
        range: [startLine, endLine],
      });
      continue;
    }
    i++;
  }
  return memos;
}

export function buildDatetime(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(n => parseInt(n, 10));
  const [h, min] = timeStr.split(":").map(n => parseInt(n, 10));
  return new Date(y, m - 1, d, h, min, 0, 0);
}

export function extractTags(content: string): string[] {
  return extractTagsFromContent(content);
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

/** 检测任务列表状态 */
function checkTasks(content: string): { open: boolean; closed: boolean } {
  const openRe = /(?:^|\n)\s*[-*+]\s+\[ \]\s/;
  const closedRe = /(?:^|\n)\s*[-*+]\s+\[[xX]\]\s/;
  return { open: openRe.test(content), closed: closedRe.test(content) };
}

/** 将粘贴的 HTML 转为 Markdown */
export function htmlToMarkdown(html: string): string {
  if (!isHtmlContent(html)) return "";
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const md = nodeToMd(doc.body);
    return md.trim();
  } catch {
    return "";
  }
}

function isHtmlContent(text: string): boolean {
  return /<\/?(strong|b|em|i|a|h[1-6]|ul|ol|li|blockquote|pre|code|img|hr)[\s>]/i.test(text);
}

function nodeToMd(node: Node, indent = 0): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? "").replace(/\s+/g, " ")
      .replace(/([\\`*_{}[\]()#+\-.!])/g, "\\$1");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as HTMLElement;
  const tag = el.tagName;
  const children = Array.from(el.childNodes);
  const inner = (): string => children.map(c => nodeToMd(c, indent)).join("");

  switch (tag) {
    case "BR": return "\n";
    case "HR": return "\n---\n";
    case "STRONG": case "B": return "**" + inner().replace(/\\([*_])/g, "$1") + "**";
    case "EM": case "I": return "*" + inner().replace(/\\([*_])/g, "$1") + "*";
    case "CODE": return "`" + (el.textContent ?? "") + "`";
    case "PRE": return "\n```\n" + (el.textContent ?? "") + "\n```\n";
    case "A": {
      const href = el.getAttribute("href") ?? "";
      const text = inner();
      return href ? `[${text}](${href})` : text;
    }
    case "IMG": {
      const src = el.getAttribute("src") ?? "";
      const alt = el.getAttribute("alt") ?? "";
      return src ? `![${alt}](${src})` : "";
    }
    case "H1": return "\n# " + inner() + "\n";
    case "H2": return "\n## " + inner() + "\n";
    case "H3": return "\n### " + inner() + "\n";
    case "H4": return "\n#### " + inner() + "\n";
    case "H5": return "\n##### " + inner() + "\n";
    case "H6": return "\n###### " + inner() + "\n";
    case "BLOCKQUOTE": return "\n" + inner().trim().split("\n").map(l => "> " + l).join("\n") + "\n";
    case "UL": {
      let result = "\n";
      Array.from(el.children).forEach(li => {
        if (li.tagName === "LI") {
          const prefix = "  ".repeat(indent);
          const liText = Array.from(li.childNodes).map(c => nodeToMd(c, indent + 1)).join("").trim();
          result += `${prefix}- ${liText}\n`;
        }
      });
      return result;
    }
    case "OL": {
      let result = "\n", num = 1;
      Array.from(el.children).forEach(li => {
        if (li.tagName === "LI") {
          const prefix = "  ".repeat(indent);
          const liText = Array.from(li.childNodes).map(c => nodeToMd(c, indent + 1)).join("").trim();
          result += `${prefix}${num}. ${liText}\n`;
          num++;
        }
      });
      return result;
    }
    case "LI": return inner();
    case "P": case "DIV": case "SECTION": case "ARTICLE": return "\n" + inner() + "\n";
    case "SCRIPT": case "STYLE": case "NOSCRIPT": return "";
    default: return inner();
  }
}

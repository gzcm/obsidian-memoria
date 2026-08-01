const TAG_RE = /#([A-Za-z0-9_一-鿿][A-Za-z0-9_一-鿿/]*)/g;

type Range = [number, number];

export function extractTagsFromContent(content: string): string[] {
  const tags = new Set<string>();
  visitEditableLines(content, line => {
    const protectedRanges = getProtectedRanges(line);
    TAG_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TAG_RE.exec(line)) !== null) {
      if (!isProtected(match.index, protectedRanges)) tags.add(match[1]);
    }
    return line;
  });
  return [...tags];
}

export function replaceTagInContent(content: string, oldTag: string, newTag: string | null): string {
  const next = visitEditableLines(content, line => replaceTagsInLine(line, oldTag, newTag));
  if (newTag !== null) return next;
  return compactLines(next) || "（标签已移除）";
}

export function stripDisplayTags(content: string): { text: string; tags: string[] } {
  const tags: string[] = [];
  let changed = false;
  const text = visitEditableLines(content, line => {
    const protectedRanges = getProtectedRanges(line);
    TAG_RE.lastIndex = 0;
    return line.replace(TAG_RE, (match: string, tag: string, offset: number) => {
      if (isProtected(offset, protectedRanges)) return match;
      if (!tags.includes(tag)) tags.push(tag);
      changed = true;
      return "";
    });
  });
  if (!changed) return { text: content, tags };
  return { text: compactLines(text), tags };
}

function visitEditableLines(content: string, transform: (line: string) => string): string {
  const lines = content.split("\n");
  let inFence = false;
  return lines.map(line => {
    if (isFenceLine(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;
    return transform(line);
  }).join("\n");
}

function replaceTagsInLine(line: string, oldTag: string, newTag: string | null): string {
  const protectedRanges = getProtectedRanges(line);
  TAG_RE.lastIndex = 0;
  return line.replace(TAG_RE, (match: string, tag: string, offset: number) => {
    if (isProtected(offset, protectedRanges)) return match;
    if (tag === oldTag) return newTag ? `#${newTag}` : "";
    if (tag.startsWith(oldTag + "/")) return newTag ? `#${newTag}${tag.slice(oldTag.length)}` : "";
    return match;
  });
}

function getProtectedRanges(line: string): Range[] {
  const ranges: Range[] = [];
  addInlineCodeRanges(line, ranges);
  addWikiLinkRanges(line, ranges);
  addMarkdownDestinationRanges(line, ranges);
  addBareUrlRanges(line, ranges);
  return mergeRanges(ranges);
}

function addInlineCodeRanges(line: string, ranges: Range[]) {
  let i = 0;
  while (i < line.length) {
    if (line[i] !== "`") {
      i++;
      continue;
    }
    const start = i;
    while (i < line.length && line[i] === "`") i++;
    const ticks = line.slice(start, i);
    const end = line.indexOf(ticks, i);
    if (end < 0) break;
    ranges.push([start, end + ticks.length]);
    i = end + ticks.length;
  }
}

function addWikiLinkRanges(line: string, ranges: Range[]) {
  let start = line.indexOf("[[");
  while (start >= 0) {
    const end = line.indexOf("]]", start + 2);
    if (end < 0) break;
    ranges.push([start, end + 2]);
    start = line.indexOf("[[", end + 2);
  }
}

function addMarkdownDestinationRanges(line: string, ranges: Range[]) {
  let start = line.indexOf("](");
  while (start >= 0) {
    let depth = 1;
    let i = start + 2;
    while (i < line.length && depth > 0) {
      if (line[i] === "\\") {
        i += 2;
        continue;
      }
      if (line[i] === "(") depth++;
      else if (line[i] === ")") depth--;
      i++;
    }
    if (depth === 0) ranges.push([start + 2, i - 1]);
    start = line.indexOf("](", i);
  }
}

function addBareUrlRanges(line: string, ranges: Range[]) {
  const urlRe = /\b(?:https?|file|obsidian):\/\/[^\s<>()]+/gi;
  let match: RegExpExecArray | null;
  while ((match = urlRe.exec(line)) !== null) ranges.push([match.index, match.index + match[0].length]);
}

function mergeRanges(ranges: Range[]): Range[] {
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Range[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (!last || range[0] > last[1]) merged.push([...range] as Range);
    else last[1] = Math.max(last[1], range[1]);
  }
  return merged;
}

function isProtected(index: number, ranges: Range[]): boolean {
  return ranges.some(([start, end]) => index >= start && index < end);
}

function isFenceLine(line: string): boolean {
  return /^\s*(?:```|~~~)/.test(line);
}

/** 2026-06-03: 公用的行尾空白清理和多余空行折叠，replaceTagInContent 和 stripDisplayTags 各调用一次 */
function compactLines(text: string): string {
  return text.split("\n")
    .map(l => l.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Memoria 高级搜索模块 (v2.0.3)
 * 支持: after:xxx / before:xxx / date:xxx / -tag / -keyword / #tag
 */
import { SearchTokens } from "./types";

/** 默认空搜索 */
export function emptySearch(): SearchTokens {
  return {
    includeTerms: [],
    excludeTerms: [],
    includeTags: [],
    excludeTags: [],
    afterDate: null,
    beforeDate: null,
    raw: "",
  };
}

/** 解析搜索字符串 */
export function parseSearch(raw: string): SearchTokens {
  const tokens: SearchTokens = {
    includeTerms: [],
    excludeTerms: [],
    includeTags: [],
    excludeTags: [],
    afterDate: null,
    beforeDate: null,
    raw: raw.trim(),
  };
  if (!tokens.raw) return tokens;

  const parts = tokens.raw.split(/\s+/).filter(p => p.length > 0);
  for (let part of parts) {
    const neg = part.startsWith("-") && part.length > 1;
    const cleaned = neg ? part.slice(1) : part;

    // 时间范围: after:xxx / before:xxx / date:xxx
    const timeMatch = cleaned.match(/^(after|before|date):(.+)$/i);
    if (timeMatch) {
      const range = parseDateRange(timeMatch[2]);
      if (range) {
        const kind = timeMatch[1].toLowerCase();
        if (kind === "after") {
          tokens.afterDate = latest(tokens.afterDate, range.start);
        } else {
          if (kind === "before") {
            // before:xxx 只设置结束日期，不设置开始日期
          } else {
            // date:xxx 同时设置开始和结束
            tokens.afterDate = latest(tokens.afterDate, range.start);
          }
          tokens.beforeDate = earliest(tokens.beforeDate, range.end);
        }
        continue;
      }
    }

    // 标签
    if (cleaned.startsWith("#") && cleaned.length > 1) {
      const tag = cleaned.slice(1);
      if (neg) tokens.excludeTags.push(tag);
      else tokens.includeTags.push(tag);
      continue;
    }

    // 普通关键词
    if (neg) tokens.excludeTerms.push(cleaned);
    else tokens.includeTerms.push(cleaned);
  }
  return tokens;
}

function parseDateRange(raw: string): { start: string; end: string } | null {
  // yyyy-mm-dd
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const y = m[1], mo = m[2].padStart(2, "0"), d = m[3].padStart(2, "0");
    return { start: `${y}-${mo}-${d}`, end: `${y}-${mo}-${d}` };
  }
  // yyyy-mm
  m = raw.match(/^(\d{4})-(\d{1,2})$/);
  if (m) {
    const y = parseInt(m[1], 10), mo = parseInt(m[2], 10);
    if (mo < 1 || mo > 12) return null;
    const lastDay = new Date(y, mo, 0).getDate();
    return {
      start: `${y}-${mo.toString().padStart(2, "0")}-01`,
      end: `${y}-${mo.toString().padStart(2, "0")}-${lastDay.toString().padStart(2, "0")}`,
    };
  }
  // yyyy
  m = raw.match(/^(\d{4})$/);
  if (m) return { start: `${m[1]}-01-01`, end: `${m[1]}-12-31` };
  return null;
}

function latest(a: string | null, b: string): string {
  if (!a) return b;
  return a > b ? a : b;
}

function earliest(a: string | null, b: string): string {
  if (!a) return b;
  return a < b ? a : b;
}

/** 检查一条 memo 是否匹配搜索条件 */
export function matchesSearch(
  content: string,
  tags: string[],
  date: string,
  search: SearchTokens,
): boolean {
  if (search.raw === "") return true;
  const lower = content.toLowerCase();

  for (const term of search.includeTerms) {
    if (!lower.includes(term.toLowerCase())) return false;
  }
  for (const term of search.excludeTerms) {
    if (lower.includes(term.toLowerCase())) return false;
  }
  for (const tag of search.includeTags) {
    if (!tags.some(t => t === tag || t.startsWith(tag + "/"))) return false;
  }
  for (const tag of search.excludeTags) {
    if (tags.some(t => t === tag || t.startsWith(tag + "/"))) return false;
  }
  if (search.afterDate && date < search.afterDate) return false;
  if (search.beforeDate && date > search.beforeDate) return false;
  return true;
}

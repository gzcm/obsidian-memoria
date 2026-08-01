export interface MemoriaSettings {
  folder: string;
  attachmentFolder: string;
  clearAfterSave: boolean;
  pageSize: number;
  showSidebarTags: boolean;
  useTrash: boolean;
  /** v2.0.3: 导出图片背景主题 */
  exportTheme: string;
  /** v2.0.3: 长笔记自动折叠行数阈值，0=不折叠 */
  collapseLineLimit: number;
  /** v2.0.3: 每日目标笔记数 */
  dailyGoal: number;
  /** v2.0.3: 回收站最大条数 */
  trashMaxItems: number;
  /** v2.0.3: 视图密度 */
  density: "cozy" | "compact";
  /** v2.0.3: Vim 快捷键 */
  enableVimKeys: boolean;
  /** v2.0.3: 情感色彩可视化 */
  enableMoodColoring: boolean;
  /** v2.0.3: 智能回顾 */
  enableSmartReview: boolean;
  /** v2.0.3: UI 语言 */
  language: string;
  /** 2026-06-03: 保存筛选器列表，存放在插件 data.json，避免污染用户 Markdown 数据 */
  savedFilters: SavedFilter[];
  /** 2026-06-03: memo 转正式笔记时的默认输出目录 */
  promoteFolder: string;
}

export const DEFAULT_SETTINGS: MemoriaSettings = {
  folder: "Memoria",
  attachmentFolder: "Memoria/attachments",
  clearAfterSave: true,
  pageSize: 50,
  showSidebarTags: false,
  useTrash: true,
  exportTheme: "auto",
  collapseLineLimit: 8,
  dailyGoal: 5,
  trashMaxItems: 300,
  density: "cozy",
  enableVimKeys: false,
  enableMoodColoring: false,
  enableSmartReview: true,
  language: "auto",
  savedFilters: [],
  promoteFolder: "Memoria/notes",
};

export interface Memo {
  file: string;
  date: string;
  time: string;
  datetime: Date;
  content: string;
  tags: string[];
  hasImage: boolean;
  hasLink: boolean;
  isPinned: boolean;
  isStarred: boolean;
  /** v2.0.3: 是否包含未完成的任务 */
  hasOpenTask: boolean;
  /** v2.0.3: 是否包含已完成的任务 */
  hasClosedTask: boolean;
  range: [number, number];
}

/** v2.0.3: 搜索 token 结构 */
export interface SearchTokens {
  includeTerms: string[];
  excludeTerms: string[];
  includeTags: string[];
  excludeTags: string[];
  afterDate: string | null;
  beforeDate: string | null;
  raw: string;
}

/** 2026-06-03: 可复用筛选器快照，后续排查筛选异常时先看这里的字段是否完整 */
export interface SavedFilter {
  id: string;
  name: string;
  preset: string;
  tag: string | null;
  year: string | null;
  date: string | null;
  keyword: string;
}

/** 2026-06-03: _trash.md 的结构化视图，range 对应当前回收站文件中的行号范围 */
export interface TrashItem {
  id: string;
  deletedAt: string;
  sourceFile: string;
  originalDate: string;
  originalTime: string;
  content: string;
  range: [number, number];
}

/** 2026-06-03: 标签整理视图的统计单元，memoCount 用于批量操作前给用户确认影响面 */
export interface TagStat {
  name: string;
  memoCount: number;
}

export const VIEW_TYPE_MEMORIA = "memoria-view";
export const VIEW_TYPE_STATS = "memoria-stats-view";
export const VIEW_TYPE_YEAR = "memoria-year-view";
export const VIEW_TYPE_TRASH = "memoria-trash-view";
export const VIEW_TYPE_TAG_TOOLS = "memoria-tag-tools-view";
export const TAG_PINNED = "置顶";
export const TAG_STARRED = "收藏";
export const RESERVED_TAGS = new Set([TAG_PINNED, TAG_STARRED]);

/** v2.0.3: 情感色彩类型 */
export type MoodType = "happy" | "touched" | "inspired" | "sad" | "angry" | "fear" | "tired" | "neutral";

/** v2.0.3: 导出格式 */
export type ExportFormat = "md" | "html" | "json";

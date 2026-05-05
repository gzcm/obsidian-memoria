export interface MemoriaSettings {
  folder: string;
  attachmentFolder: string;
  clearAfterSave: boolean;
  pageSize: number;
  showSidebarTags: boolean;
  useTrash: boolean;
}

export const DEFAULT_SETTINGS: MemoriaSettings = {
  folder: "Memoria",
  attachmentFolder: "Memoria/attachments",
  clearAfterSave: true,
  pageSize: 50,
  showSidebarTags: false,
  useTrash: true,
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
  range: [number, number];
}

export const VIEW_TYPE_MEMORIA = "memoria-view";
export const VIEW_TYPE_STATS = "memoria-stats-view";
export const TAG_PINNED = "置顶";
export const TAG_STARRED = "收藏";
export const RESERVED_TAGS = new Set([TAG_PINNED, TAG_STARRED]);

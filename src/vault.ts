import { App, normalizePath, TFolder } from "obsidian";

export async function ensureFolder(app: App, path: string) {
  const normalized = normalizePath(path).replace(/\/+$/, "");
  if (!normalized) return;

  const parts = normalized.split("/");
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const existing = app.vault.getAbstractFileByPath(current);
    if (existing) {
      if (!(existing instanceof TFolder)) throw new Error(`路径已存在但不是文件夹: ${current}`);
      continue;
    }
    await app.vault.createFolder(current);
  }
}

import { App, getAllTags, setIcon } from "obsidian";

/** v2.0.3: 带缓存的标签联想，修复 IME 组合态冲突 */
export class TagSuggest {
  private static readonly CACHE_TTL_MS = 30_000;

  private dropdown: HTMLElement | null = null;
  private items: string[] = [];
  private active = 0;
  private rangeStart = 0;
  private cachedTags: { name: string; count: number }[] | null = null;
  private cacheTime = 0;
  private metaChangeRef: { unref: () => void } | null = null;

  constructor(private app: App, private textarea: HTMLTextAreaElement) {
    this.textarea.addEventListener("input", this.handleInput);
    this.textarea.addEventListener("keydown", this.handleKeydown, true);
    this.textarea.addEventListener("blur", this.handleBlur);
    this.textarea.addEventListener("scroll", () => this.close());

    // 监听 metadataCache 变化以刷新缓存
    const ref = this.app.metadataCache.on("changed", () => { this.cachedTags = null; });
    this.metaChangeRef = { unref: () => this.app.metadataCache.offref(ref) };
  }

  destroy() {
    this.textarea.removeEventListener("input", this.handleInput);
    this.textarea.removeEventListener("keydown", this.handleKeydown, true);
    this.textarea.removeEventListener("blur", this.handleBlur);
    if (this.metaChangeRef) { this.metaChangeRef.unref(); this.metaChangeRef = null; }
    this.close();
  }

  private handleInput = () => {
    const trigger = this.detectTrigger();
    if (!trigger) { this.close(); return; }
    this.rangeStart = trigger.start;
    const allTags = this.collectAllTags();
    this.items = this.matchTags(allTags, trigger.query);
    if (this.items.length === 0) { this.close(); return; }
    this.active = 0;
    this.render();
  };

  private handleBlur = () => {
    setTimeout(() => this.close(), 150);
  };

  private handleKeydown = (e: KeyboardEvent) => {
    // v2.0.6: IME 组合态期间不处理
    if (e.isComposing || e.keyCode === 229) return;
    if (!this.dropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.active = (this.active + 1) % this.items.length;
      this.refreshActive();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.active = (this.active - 1 + this.items.length) % this.items.length;
      this.refreshActive();
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      e.stopPropagation();
      this.applySelected();
    } else if (e.key === "Escape") {
      e.preventDefault();
      this.close();
    }
  };

  private detectTrigger(): { start: number; query: string } | null {
    const pos = this.textarea.selectionStart ?? 0;
    const val = this.textarea.value;
    let i = pos - 1;
    while (i >= 0) {
      const ch = val[i];
      if (ch === "#") {
        const before = i === 0 ? " " : val[i - 1];
        if (/[\s\n\r,，。.!?！？（(]/.test(before) || i === 0) {
          const query = val.slice(i + 1, pos);
          if (/^[A-Za-z0-9_一-鿿/]*$/.test(query)) return { start: i, query };
        }
        return null;
      }
      if (/[\s\n\r]/.test(ch) || !/[A-Za-z0-9_一-鿿/]/.test(ch)) return null;
      i--;
    }
    return null;
  }

  /** v2.0.3: 带 30s TTL 缓存的标签收集 */
  private collectAllTags(): { name: string; count: number }[] {
    if (this.cachedTags && Date.now() - this.cacheTime < TagSuggest.CACHE_TTL_MS) {
      return this.cachedTags;
    }
    const counts = new Map<string, number>();
    const cache = this.app.metadataCache;
    for (const file of this.app.vault.getMarkdownFiles()) {
      const meta = cache.getFileCache(file);
      if (!meta) continue;
      for (const tag of (getAllTags(meta) ?? [])) {
        const name = tag.replace(/^#/, "");
        if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
    const result = [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    this.cachedTags = result;
    this.cacheTime = Date.now();
    return result;
  }

  private matchTags(tags: { name: string; count: number }[], query: string): string[] {
    if (!query) return tags.slice(0, 8).map(t => t.name);
    const q = query.toLowerCase();
    const starts: typeof tags = [];
    const contains: typeof tags = [];
    for (const t of tags) {
      const n = t.name.toLowerCase();
      if (n === q) continue;
      if (n.startsWith(q)) starts.push(t);
      else if (n.includes(q) || n.split("/").some(p => p.startsWith(q))) contains.push(t);
    }
    return [...starts, ...contains].slice(0, 8).map(t => t.name);
  }

  private render() {
    if (!this.dropdown) {
      this.dropdown = document.body.createDiv({ cls: "memoria-tag-suggest" });
      this.dropdown.addEventListener("mousedown", e => e.preventDefault());
    }
    this.dropdown.empty();
    this.items.forEach((name, i) => {
      const item = this.dropdown!.createDiv({
        cls: "memoria-tag-suggest-item" + (i === this.active ? " active" : ""),
      });
      setIcon(item.createSpan({ cls: "memoria-tag-suggest-icon" }), "hash");
      item.createSpan({ cls: "memoria-tag-suggest-name", text: name });
      item.addEventListener("click", () => { this.active = i; this.applySelected(); });
    });
    this.position();
  }

  private refreshActive() {
    if (!this.dropdown) return;
    const items = this.dropdown.querySelectorAll(".memoria-tag-suggest-item");
    items.forEach((el, i) => el.toggleClass("active", i === this.active));
    const activeItem = items[this.active] as HTMLElement | undefined;
    activeItem?.scrollIntoView({ block: "nearest" });
  }

  private position() {
    if (!this.dropdown) return;
    const rect = this.textarea.getBoundingClientRect();
    this.dropdown.style.top = `${rect.bottom + 4}px`;
    this.dropdown.style.left = `${rect.left + 4}px`;
    this.dropdown.style.minWidth = `${Math.min(rect.width, 280)}px`;
  }

  private applySelected() {
    if (!this.dropdown || !this.items.length) return;
    const tag = this.items[this.active];
    const val = this.textarea.value;
    const pos = this.textarea.selectionStart ?? 0;
    const before = val.slice(0, this.rangeStart);
    const after = val.slice(pos);
    const insert = `#${tag} `;
    this.textarea.value = before + insert + after;
    const newPos = before.length + insert.length;
    this.textarea.setSelectionRange(newPos, newPos);
    this.textarea.focus();
    this.close();
  }

  close() {
    this.dropdown?.remove();
    this.dropdown = null;
    this.items = [];
    this.active = 0;
  }
}

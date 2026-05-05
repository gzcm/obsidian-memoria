import { App, TFile } from "obsidian";

const WIKILINK_IMG_RE = /!\[\[([^\]]+?)(?:\|([^\]]*))?\]\]/g;
const MD_IMG_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;

function isImageExt(ext: string): boolean {
  return /^(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(ext);
}

export interface ImageInfo {
  vaultPath?: string;
  src: string;
  alt: string;
}

export function extractImages(
  app: App, content: string, filePath: string
): { text: string; images: ImageInfo[] } {
  const images: ImageInfo[] = [];

  let text = content.replace(WIKILINK_IMG_RE, (match, path, alt) => {
    const name = path.trim();
    const ext = (name.split(".").pop() ?? "").toLowerCase();
    if (!isImageExt(ext)) return match;
    const file = app.metadataCache.getFirstLinkpathDest(name, filePath);
    if (!(file instanceof TFile)) return match;
    images.push({ vaultPath: file.path, src: app.vault.getResourcePath(file), alt: alt ?? file.basename });
    return "";
  });

  text = text.replace(MD_IMG_RE, (match, alt, src) => {
    const url = src.trim();
    const ext = url.split(/[?#]/)[0].split(".").pop() ?? "";
    if (!isImageExt(ext) && !url.startsWith("data:image/")) return match;
    let resolvedSrc = url;
    if (!url.startsWith("http") && !url.startsWith("data:")) {
      const file = app.metadataCache.getFirstLinkpathDest(url, filePath);
      if (file instanceof TFile) resolvedSrc = app.vault.getResourcePath(file);
    }
    images.push({ src: resolvedSrc, alt: alt || "image" });
    return "";
  });

  text = text.split("\n").map(l => l.replace(/\s+$/, "")).join("\n")
    .replace(/\n{3,}/g, "\n\n").trim();

  return { text, images };
}

export function renderImageGrid(
  container: HTMLElement,
  images: ImageInfo[],
  onClickImage: (index: number) => void
) {
  if (images.length === 0) return;
  const grid = container.createDiv({
    cls: `memoria-img-grid memoria-img-grid-${Math.min(images.length, 9)}`,
  });
  images.slice(0, 9).forEach((img, i) => {
    const cell = grid.createDiv({ cls: "memoria-img-cell" });
    cell.createEl("img", {
      cls: "memoria-img",
      attr: { src: img.src, alt: img.alt, loading: "lazy" },
    }).addEventListener("click", e => { e.stopPropagation(); onClickImage(i); });
    if (i === 8 && images.length > 9) {
      const overlay = cell.createDiv({ cls: "memoria-img-overlay" });
      overlay.setText(`+${images.length - 9}`);
      overlay.addEventListener("click", e => { e.stopPropagation(); onClickImage(8); });
    }
  });
}

export function showLightbox(images: ImageInfo[], initialIndex: number) {
  let current = initialIndex;
  const backdrop = document.body.createDiv({ cls: "memoria-lightbox" });
  const stage = backdrop.createDiv({ cls: "memoria-lightbox-stage" });
  const img = stage.createEl("img", { cls: "memoria-lightbox-img" });
  const counter = backdrop.createDiv({ cls: "memoria-lightbox-counter" });
  const closeBtn = backdrop.createEl("button", {
    cls: "memoria-lightbox-close", text: "×", attr: { "aria-label": "关闭" },
  });
  const prevBtn = backdrop.createEl("button", {
    cls: "memoria-lightbox-nav memoria-lightbox-prev", text: "‹", attr: { "aria-label": "上一张" },
  });
  const nextBtn = backdrop.createEl("button", {
    cls: "memoria-lightbox-nav memoria-lightbox-next", text: "›", attr: { "aria-label": "下一张" },
  });

  const update = () => {
    img.src = images[current].src;
    img.alt = images[current].alt;
    counter.setText(`${current + 1} / ${images.length}`);
    prevBtn.style.visibility = current > 0 ? "visible" : "hidden";
    nextBtn.style.visibility = current < images.length - 1 ? "visible" : "hidden";
  };
  update();

  const close = () => { backdrop.remove(); document.removeEventListener("keydown", onKey); };
  const prev = () => { if (current > 0) { current--; update(); } };
  const next = () => { if (current < images.length - 1) { current++; update(); } };

  closeBtn.addEventListener("click", close);
  prevBtn.addEventListener("click", e => { e.stopPropagation(); prev(); });
  nextBtn.addEventListener("click", e => { e.stopPropagation(); next(); });
  backdrop.addEventListener("click", e => { (e.target === backdrop || e.target === stage) && close(); });
  img.addEventListener("click", e => { e.stopPropagation(); next(); });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") prev();
    else if (e.key === "ArrowRight") next();
  };
  document.addEventListener("keydown", onKey);
}

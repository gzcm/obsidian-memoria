import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const tempRoot = resolve(".tmp");
await mkdir(tempRoot, { recursive: true });
const dir = await mkdtemp(join(tempRoot, "memoria-tag-rewrite-"));
const entry = join(dir, "entry.ts");
const out = join(dir, "out.mjs");
const modulePath = resolve("src/tag-rewrite.ts").replace(/\\/g, "/");

try {
  await writeFile(entry, `
import assert from "node:assert/strict";
import { extractTagsFromContent, replaceTagInContent, stripDisplayTags } from ${JSON.stringify(modulePath)};

const input = [
  "正文 #项目 和 #项目/毕业设计",
  "",
  "行内代码 \`#项目\` 不改",
  "",
  "\`\`\`js",
  "const tag = '#项目/代码';",
  "\`\`\`",
  "",
  "链接 https://example.com/page#项目 不改",
  "Markdown 链接 [go](https://example.com/page#项目/frag) 不改",
  "其他标签 #其他 不改"
].join("\\n");

const renamed = replaceTagInContent(input, "项目", "研究");
assert.match(renamed, /正文 #研究 和 #研究\\/毕业设计/);
assert.match(renamed, /行内代码 \`#项目\` 不改/);
assert.match(renamed, /const tag = '#项目\\/代码';/);
assert.match(renamed, /链接 https:\\/\\/example\\.com\\/page#项目 不改/);
assert.match(renamed, /Markdown 链接 \\[go\\]\\(https:\\/\\/example\\.com\\/page#项目\\/frag\\) 不改/);
assert.match(renamed, /其他标签 #其他 不改/);

assert.deepEqual(extractTagsFromContent(input), ["项目", "项目/毕业设计", "其他"]);

const removed = replaceTagInContent("正文 #项目\\n行内代码 \`#项目\`", "项目", null);
assert.equal(removed, "正文\\n行内代码 \`#项目\`");

const emptied = replaceTagInContent("#项目", "项目", null);
assert.equal(emptied, "（标签已移除）");

const displayOnlyFalseTags = [
  "链接测试 https://example.com/page#项目",
  "",
  "\`\`\`js",
  "const tag = '#项目';",
  "\`\`\`"
].join("\\n");
assert.deepEqual(stripDisplayTags(displayOnlyFalseTags), {
  text: displayOnlyFalseTags,
  tags: [],
});

const displayMixed = stripDisplayTags("正文 #项目\\n链接 https://example.com/page#项目\\n行内 \`#项目\`");
assert.equal(displayMixed.text, "正文\\n链接 https://example.com/page#项目\\n行内 \`#项目\`");
assert.deepEqual(displayMixed.tags, ["项目"]);
`);

  await build({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: out,
    logLevel: "silent",
  });

  await import(pathToFileURL(out).href);
  assert.ok(true);
} finally {
  await rm(dir, { recursive: true, force: true });
}

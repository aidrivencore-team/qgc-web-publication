import fs from "fs";
import path from "path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";

const DOCS_DIR = path.join(process.cwd(), "..", "source-docs");

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

export interface Document {
  slug: string;
  title: string;
  html: string;
  toc: TocItem[];
}

function extractToc(html: string): TocItem[] {
  const toc: TocItem[] = [];
  const regex = /<h([2-3])\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/h[2-3]>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    // Strip ALL HTML tags but keep their text content
    const text = match[3]
      .replace(/<[^>]+>/g, "")
      .trim();
    if (text) {
      toc.push({
        level: parseInt(match[1]),
        id: match[2],
        text,
      });
    }
  }
  return toc;
}

function resolveInternalLinks(html: string): string {
  const linkMap: Record<string, string> = {
    "01_CODEBASE_AUDIT_REPORT.md": "/audit/",
    "02_SYSTEM_ARCHITECTURE.md": "/architecture/",
    "03_DATA_FLOW.md": "/architecture/#data-flow",
    "04_PRODUCT_LOGIC.md": "/product-logic/",
    "05_ARCHITECTURE_DECISIONS.md": "/product-logic/#decisions",
    "06_GAP_ANALYSIS.md": "/target-state/",
    "07_TARGET_ARCHITECTURE.md": "/target-state/#target-architecture",
    "00_INDEX.md": "/",
  };

  let result = html;
  for (const [mdFile, webPath] of Object.entries(linkMap)) {
    result = result.replace(
      new RegExp(mdFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
      webPath
    );
  }
  return result;
}

async function processMarkdown(content: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, { behavior: "wrap" })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(content);
  return String(result);
}

export async function getDocument(filename: string): Promise<Document> {
  const filePath = path.join(DOCS_DIR, filename);
  const raw = fs.readFileSync(filePath, "utf-8");

  const titleMatch = raw.match(/^#\s+(.+)$/m);
  const title = titleMatch
    ? titleMatch[1].replace(/[📊🧠🖥🧪📌]/g, "").trim()
    : filename;

  let html = await processMarkdown(raw);
  html = resolveInternalLinks(html);

  const toc = extractToc(html);

  return {
    slug: filename.replace(/\.md$/, ""),
    title,
    html,
    toc,
  };
}

export async function getDocuments(
  filenames: string[]
): Promise<Document[]> {
  return Promise.all(filenames.map(getDocument));
}

import fs from "fs";
import path from "path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";

/** Supported project slugs */
export type ProjectSlug = "qgroundcontrol" | "mission-planner";

const SOURCE_DOCS_ROOT = path.join(process.cwd(), "..", "source-docs");

/**
 * Returns the docs directory for a given project.
 * Falls back to the root source-docs for backward compat if the project dir doesn't exist.
 */
function getDocsDir(project: ProjectSlug): string {
  return path.join(SOURCE_DOCS_ROOT, project);
}

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

/**
 * Internal link resolution – project-aware.
 * Maps markdown filenames to web paths, scoped to the current project context.
 */
function resolveInternalLinks(html: string, project: ProjectSlug): string {
  // QGroundControl link map
  const qgcLinkMap: Record<string, string> = {
    "00_INDEX.md": "/",
    "01_CODEBASE_AUDIT_REPORT.md": "/audit/",
    "02_SYSTEM_ARCHITECTURE.md": "/architecture/",
    "03_DATA_FLOW.md": "/architecture/#data-flow",
    "04_PRODUCT_LOGIC.md": "/product-logic/",
    "05_ARCHITECTURE_DECISIONS.md": "/product-logic/#decisions",
    "06_GAP_ANALYSIS.md": "/target-state/",
    "07_TARGET_ARCHITECTURE.md": "/target-state/#target-architecture",
    "08_FLY_VIEW_DEEP_ANALYSIS.md": "/ui-analysis/#fly-view",
    "09_PLAN_VIEW_DEEP_ANALYSIS.md": "/ui-analysis/#plan-view",
    "10_SETUP_DEEP_ANALYSIS.md": "/ui-analysis/#setup-view",
    "11_ANALYZE_TOOLS_DEEP_ANALYSIS.md": "/tools-and-config/#analyze-tools",
    "12_APPLICATION_SETTINGS_DEEP_ANALYSIS.md": "/tools-and-config/#application-settings",
    "13_UI_ACTION_MAP.md": "/tools-and-config/#ui-action-map",
    "14_BOAT_MODES_AND_BEHAVIOR.md": "/maritime/#boat-modes",
    "15_SITL_BOAT_TEST_PLAN.md": "/maritime/#sitl-test-plan",
    "16_QGC_SYSTEM_CAPABILITIES.md": "/product-overview/#system-capabilities",
    "17_QGC_USER_WORKFLOWS.md": "/product-overview/#user-workflows",
    "18_QGC_PRODUCT_FEATURE_ANALYSIS.md": "/product-overview/#feature-analysis",
  };

  // Mission Planner link map (placeholder – will be activated when MP UI is built)
  const mpLinkMap: Record<string, string> = {
    "01_CODEBASE_AUDIT_REPORT.md": "/mp/audit/",
    "02_SYSTEM_ARCHITECTURE.md": "/mp/architecture/",
    "03_DATA_FLOW.md": "/mp/architecture/#data-flow",
    "04_PRODUCT_LOGIC.md": "/mp/product-logic/",
    "05_ARCHITECTURE_DECISIONS.md": "/mp/decisions/",
    "06_MODULE_MAP.md": "/mp/modules/",
    "07_COMMUNICATION_AND_PROTOCOLS.md": "/mp/modules/#protocols",
    "08_EXTERNAL_INTERFACES.md": "/mp/modules/#interfaces",
    "09_TESTING_AND_QUALITY.md": "/mp/quality/",
    "10_PERFORMANCE_AND_SCALABILITY.md": "/mp/quality/#performance",
    "11_RISK_ASSESSMENT.md": "/mp/roadmap/#risks",
    "12_MODERNIZATION_ROADMAP.md": "/mp/roadmap/",
    "13_SYSTEM_CAPABILITIES.md": "/mp/product/#capabilities",
    "14_USER_WORKFLOWS.md": "/mp/product/#workflows",
    "15_PRODUCT_FEATURE_ANALYSIS.md": "/mp/product/#features",
  };

  const linkMap = project === "qgroundcontrol" ? qgcLinkMap : mpLinkMap;

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

export async function getDocument(
  project: ProjectSlug,
  filename: string
): Promise<Document> {
  const docsDir = getDocsDir(project);
  const filePath = path.join(docsDir, filename);
  const raw = fs.readFileSync(filePath, "utf-8");

  const titleMatch = raw.match(/^#\s+(.+)$/m);
  const title = titleMatch
    ? titleMatch[1].replace(/[📊🧠🖥🧪📌]/g, "").trim()
    : filename;

  let html = await processMarkdown(raw);
  html = resolveInternalLinks(html, project);

  const toc = extractToc(html);

  return {
    slug: filename.replace(/\.md$/, ""),
    title,
    html,
    toc,
  };
}

export async function getDocuments(
  project: ProjectSlug,
  filenames: string[]
): Promise<Document[]> {
  return Promise.all(filenames.map((f) => getDocument(project, f)));
}

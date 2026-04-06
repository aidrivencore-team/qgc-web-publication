import { TableOfContents } from "@/components/layout/TableOfContents";
import { PrevNextNav } from "@/components/ui/PrevNextNav";
import type { Document } from "@/lib/content";

interface ContentPageProps {
  documents: Document[];
  prevNext: {
    prev: { title: string; href: string } | null;
    next: { title: string; href: string } | null;
  };
}

export function ContentPage({ documents, prevNext }: ContentPageProps) {
  const allToc = documents.flatMap((doc) => doc.toc);

  return (
    <div className="flex gap-8 px-6 lg:px-12 py-8">
      {/* Main content */}
      <article className="flex-1 min-w-0">
        {documents.map((doc, i) => (
          <div key={doc.slug}>
            {i > 0 && (
              <div className="my-12 border-t border-zinc-800 pt-8">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900/50 text-[10px] uppercase tracking-wider text-zinc-500 mb-6">
                  Дополнение
                </div>
              </div>
            )}
            <div
              className="prose"
              dangerouslySetInnerHTML={{ __html: doc.html }}
            />
          </div>
        ))}

        <PrevNextNav prev={prevNext.prev} next={prevNext.next} />
      </article>

      {/* Table of Contents */}
      <TableOfContents items={allToc} />
    </div>
  );
}

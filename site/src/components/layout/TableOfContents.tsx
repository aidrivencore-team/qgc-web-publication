"use client";

import { useEffect, useState } from "react";
import type { TocItem } from "@/lib/content";

interface TableOfContentsProps {
  items: TocItem[];
}

export function TableOfContents({ items }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -80% 0px", threshold: 0 }
    );

    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <nav className="hidden xl:block w-56 shrink-0">
      <div className="sticky top-20">
        <div className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium mb-3">
          На странице
        </div>
        <ul className="space-y-1 border-l border-zinc-800">
          {items.map((item, index) => (
            <li key={`${item.id}-${index}`}>
              <a
                href={`#${item.id}`}
                className={`block text-xs py-1 transition-all duration-200 ${
                  item.level === 3 ? "pl-6" : "pl-3"
                } ${
                  activeId === item.id
                    ? "text-cyan-400 border-l-2 border-cyan-400 -ml-px"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {item.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

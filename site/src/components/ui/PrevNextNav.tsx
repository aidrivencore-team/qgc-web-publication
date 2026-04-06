import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PrevNextProps {
  prev: { title: string; href: string } | null;
  next: { title: string; href: string } | null;
}

export function PrevNextNav({ prev, next }: PrevNextProps) {
  return (
    <div className="flex items-stretch gap-4 mt-16 pt-8 border-t border-zinc-800">
      {prev ? (
        <Link
          href={prev.href}
          className="flex-1 group flex items-center gap-3 px-5 py-4 rounded-xl border border-zinc-800 hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all duration-300"
        >
          <ChevronLeft
            size={16}
            className="text-zinc-600 group-hover:text-cyan-400 transition-colors"
          />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1">
              Назад
            </div>
            <div className="text-sm text-zinc-300 group-hover:text-cyan-400 transition-colors">
              {prev.title}
            </div>
          </div>
        </Link>
      ) : (
        <div className="flex-1" />
      )}
      {next ? (
        <Link
          href={next.href}
          className="flex-1 group flex items-center justify-end gap-3 px-5 py-4 rounded-xl border border-zinc-800 hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all duration-300 text-right"
        >
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1">
              Далее
            </div>
            <div className="text-sm text-zinc-300 group-hover:text-cyan-400 transition-colors">
              {next.title}
            </div>
          </div>
          <ChevronRight
            size={16}
            className="text-zinc-600 group-hover:text-cyan-400 transition-colors"
          />
        </Link>
      ) : (
        <div className="flex-1" />
      )}
    </div>
  );
}

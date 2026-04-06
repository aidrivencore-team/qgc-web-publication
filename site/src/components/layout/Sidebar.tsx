"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigation } from "@/lib/navigation";
import {
  Home,
  Search,
  Layers,
  Briefcase,
  Target,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";

const iconMap: Record<string, React.ReactNode> = {
  home: <Home size={18} />,
  search: <Search size={18} />,
  layers: <Layers size={18} />,
  briefcase: <Briefcase size={18} />,
  target: <Target size={18} />,
};

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed top-4 left-4 z-50 lg:hidden p-2 rounded-lg bg-zinc-800/80 backdrop-blur border border-zinc-700/50 text-zinc-300 hover:text-white transition-colors"
        aria-label="Меню"
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-40 h-screen w-64 bg-zinc-900/95 backdrop-blur-xl border-r border-zinc-800 transition-transform duration-300 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-zinc-800">
          <Link href="/" className="flex items-center gap-3 group" onClick={() => setOpen(false)}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm">
              Q
            </div>
            <div>
              <span className="text-sm font-semibold text-white group-hover:text-cyan-400 transition-colors">
                QGC Analysis
              </span>
              <span className="block text-[10px] text-zinc-500 font-mono">
                Maritime GCS
              </span>
            </div>
          </Link>
        </div>

        {/* Nav items */}
        <nav className="p-4 space-y-1 overflow-y-auto h-[calc(100vh-4rem)]">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href ||
              pathname === item.href.replace(/\/$/, "");
            const isSection =
              item.href !== "/" && pathname.startsWith(item.href.replace(/\/$/, ""));

            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                    isActive || isSection
                      ? "bg-cyan-500/10 text-cyan-400 font-medium"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                  }`}
                >
                  <span
                    className={
                      isActive || isSection ? "text-cyan-400" : "text-zinc-500"
                    }
                  >
                    {iconMap[item.icon]}
                  </span>
                  <span className="flex-1">{item.title}</span>
                  {item.children && (
                    <ChevronRight
                      size={14}
                      className={`transition-transform ${
                        isSection ? "rotate-90" : ""
                      }`}
                    />
                  )}
                </Link>

                {/* Sub-items */}
                {item.children && isSection && (
                  <div className="ml-9 mt-1 space-y-0.5 border-l border-zinc-800 pl-3">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={() => setOpen(false)}
                        className="block px-2 py-1.5 text-xs text-zinc-500 hover:text-cyan-400 transition-colors rounded"
                      >
                        {child.title}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Footer info */}
          <div className="pt-6 mt-6 border-t border-zinc-800">
            <div className="px-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium">
                Проект
              </div>
              <div className="text-xs text-zinc-500">
                QGroundControl → Maritime GCS
              </div>
              <div className="text-[10px] text-zinc-600 font-mono">
                Апрель 2026
              </div>
            </div>
          </div>
        </nav>
      </aside>
    </>
  );
}

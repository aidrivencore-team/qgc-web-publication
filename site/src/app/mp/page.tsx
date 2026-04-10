import Link from "next/link";
import { Metadata } from "next";
import { Search, Layers, Briefcase, Shield, Map, ClipboardList, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Mission Planner — Обзор",
  description:
    "Комплексный технический анализ Mission Planner: архитектура, модули, продуктовая логика и дорожная карта модернизации.",
};

const sections = [
  {
    title: "Аудит и архитектура",
    description:
      "Codebase audit, системная архитектура и потоки данных Mission Planner.",
    href: "/mp/audit/",
    icon: Search,
    color: "from-amber-500 to-orange-600",
  },
  {
    title: "Продуктовая логика",
    description:
      "Product logic и ключевые архитектурные решения системы.",
    href: "/mp/product-logic/",
    icon: Briefcase,
    color: "from-yellow-500 to-amber-600",
  },
  {
    title: "Модули и интерфейсы",
    description:
      "Module map, протоколы коммуникации и внешние интерфейсы.",
    href: "/mp/modules/",
    icon: Layers,
    color: "from-orange-500 to-red-600",
  },
  {
    title: "Качество и производительность",
    description:
      "Testing & quality, performance и scalability анализ.",
    href: "/mp/quality/",
    icon: Shield,
    color: "from-emerald-500 to-teal-600",
  },
  {
    title: "Риски и дорожная карта",
    description:
      "Risk assessment и modernization roadmap для Mission Planner.",
    href: "/mp/roadmap/",
    icon: Map,
    color: "from-sky-500 to-blue-600",
  },
  {
    title: "Обзор продукта",
    description:
      "System capabilities, user workflows и feature analysis.",
    href: "/mp/product/",
    icon: ClipboardList,
    color: "from-rose-500 to-pink-600",
  },
];

export default function MPHomePage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-zinc-800">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-orange-600/5" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />
        <div className="relative px-6 lg:px-12 py-16 lg:py-24 max-w-4xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900/50 text-xs text-zinc-500 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Analysis — Complete
          </div>
          <h1 className="text-3xl lg:text-5xl font-bold text-white mb-4 leading-tight">
            Mission Planner
            <br />
            <span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
              Technical Analysis
            </span>
          </h1>
          <p className="text-lg text-zinc-400 max-w-2xl leading-relaxed mb-8">
            Комплексный технический аудит Mission Planner — open-source наземной станции управления
            для ArduPilot. Архитектура, модули, протоколы и план модернизации.
          </p>

          <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
              <span className="font-mono text-amber-400">C# / WinForms</span>
              <span>•</span>
              <span>MAVLink</span>
              <span>•</span>
              <span>ArduPilot</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
              Апрель 2026
            </div>
          </div>
        </div>
      </section>

      {/* About */}
      <section className="px-6 lg:px-12 py-12 border-b border-zinc-800">
        <div className="max-w-3xl">
          <h2 className="text-lg font-semibold text-white mb-4">О проекте</h2>
          <div className="space-y-3 text-sm text-zinc-400 leading-relaxed">
            <p>
              Mission Planner — полнофункциональная GCS для ArduPilot,
              написанная на C# / WinForms. Анализ охватывает архитектуру,
              модульную структуру, протоколы коммуникации и внешние интерфейсы.
            </p>
            <p>
              Результат — оценка качества кода, рисков, производительности
              и детальная дорожная карта модернизации.
            </p>
          </div>
        </div>
      </section>

      {/* Navigation Cards */}
      <section className="px-6 lg:px-12 py-12">
        <h2 className="text-lg font-semibold text-white mb-6">Структура документации</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {sections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="group relative flex flex-col p-6 rounded-xl border border-zinc-800 hover:border-zinc-700 bg-zinc-900/30 hover:bg-zinc-900/50 transition-all duration-300"
            >
              <div className="flex items-start gap-4 mb-3">
                <div
                  className={`flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br ${section.color} opacity-80 group-hover:opacity-100 transition-opacity`}
                >
                  <section.icon size={20} className="text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-white group-hover:text-amber-400 transition-colors">
                    {section.title}
                  </h3>
                </div>
                <ArrowRight
                  size={16}
                  className="text-zinc-600 group-hover:text-amber-400 group-hover:translate-x-1 transition-all mt-1"
                />
              </div>
              <p className="text-sm text-zinc-500 leading-relaxed">
                {section.description}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* Meta */}
      <section className="px-6 lg:px-12 py-8 border-t border-zinc-800">
        <div className="flex flex-wrap gap-6 text-xs text-zinc-600">
          <div>
            <span className="text-zinc-500">Документов:</span> 15
          </div>
          <div>
            <span className="text-zinc-500">Объём:</span> ~340KB
          </div>
          <div>
            <span className="text-zinc-500">Платформа:</span> ArduPilot GCS
          </div>
          <div>
            <span className="text-zinc-500">Стадия:</span> Analysis complete
          </div>
        </div>
      </section>
    </div>
  );
}

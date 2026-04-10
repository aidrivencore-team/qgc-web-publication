import Link from "next/link";
import { Search, Layers, Briefcase, Target, Monitor, Settings, Anchor, ClipboardList, ArrowRight } from "lucide-react";

const sections = [
  {
    title: "Аудит кодовой базы",
    description:
      "Общий анализ репозитория QGroundControl: стек, модули, зависимости, архитектурные паттерны.",
    href: "/audit/",
    icon: Search,
    color: "from-cyan-500 to-blue-600",
  },
  {
    title: "Архитектура системы",
    description:
      "Слоевая архитектура, потоки данных, MVC/MVVM на базе Fact System, lifecycle от запуска до завершения.",
    href: "/architecture/",
    icon: Layers,
    color: "from-emerald-500 to-teal-600",
  },
  {
    title: "Продуктовая логика",
    description:
      "Функции системы, пользовательские сценарии, роли, сущности и ключевые архитектурные решения.",
    href: "/product-logic/",
    icon: Briefcase,
    color: "from-amber-500 to-orange-600",
  },
  {
    title: "Целевое состояние",
    description:
      "Gap Analysis и Target Architecture: от QGC к специализированной Maritime GCS для надводных аппаратов.",
    href: "/target-state/",
    icon: Target,
    color: "from-rose-500 to-pink-600",
  },
  {
    title: "UI / UX анализ",
    description:
      "Глубокий анализ экранов: Fly View (оперативное управление), Plan View (миссии), Setup (конфигурация).",
    href: "/ui-analysis/",
    icon: Monitor,
    color: "from-indigo-500 to-violet-600",
  },
  {
    title: "Инструменты и настройки",
    description:
      "Analyze Tools, Application Settings и карта UI-действий пользователя.",
    href: "/tools-and-config/",
    icon: Settings,
    color: "from-slate-400 to-zinc-500",
  },
  {
    title: "Maritime / Boat",
    description:
      "Режимы управления ArduPilot Boat, логика поведения системы и SITL тест-план для надводных аппаратов.",
    href: "/maritime/",
    icon: Anchor,
    color: "from-sky-500 to-blue-700",
  },
  {
    title: "Обзор продукта",
    description:
      "System Capabilities, User Workflows и Feature Analysis — полная продуктовая картина QGC.",
    href: "/product-overview/",
    icon: ClipboardList,
    color: "from-lime-500 to-green-600",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-zinc-800">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-blue-600/5" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
        <div className="relative px-6 lg:px-12 py-16 lg:py-24 max-w-4xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900/50 text-xs text-zinc-500 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Core Analysis — Done
          </div>
          <h1 className="text-3xl lg:text-5xl font-bold text-white mb-4 leading-tight">
            QGroundControl
            <br />
            <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              Maritime GCS Analysis
            </span>
          </h1>
          <p className="text-lg text-zinc-400 max-w-2xl leading-relaxed mb-8">
            Комплексный технический аудит наземной станции управления QGroundControl
            и проектирование целевой архитектуры для автономных надводных аппаратов (ASV).
          </p>

          <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
              <span className="font-mono text-cyan-400">Qt6 / C++20</span>
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
              Этот проект — результат глубокого реверс-инжиниринга кодовой базы
              QGroundControl (~200K LOC, C++/QML) с целью определения оптимального
              пути трансформации GCS для управления морскими автономными аппаратами.
            </p>
            <p>
              Анализ охватывает архитектуру монолитного Qt-приложения, продуктовую логику,
              потоки данных и ключевые инженерные компромиссы. Результат — обоснованная
              рекомендация по архитектурному направлению (QGC Fork + API extraction)
              с поэтапным планом реализации.
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
                  <h3 className="font-semibold text-white group-hover:text-cyan-400 transition-colors">
                    {section.title}
                  </h3>
                </div>
                <ArrowRight
                  size={16}
                  className="text-zinc-600 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all mt-1"
                />
              </div>
              <p className="text-sm text-zinc-500 leading-relaxed">
                {section.description}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* Also: Mission Planner */}
      <section className="px-6 lg:px-12 py-8 border-t border-zinc-800">
        <Link
          href="/mp/"
          className="group flex items-center gap-4 p-5 rounded-xl border border-zinc-800 hover:border-amber-500/30 hover:bg-amber-500/5 transition-all duration-300 max-w-xl"
        >
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 opacity-80 group-hover:opacity-100 transition-opacity shrink-0">
            <span className="text-white font-bold text-sm">M</span>
          </div>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">
              Также в проекте
            </div>
            <div className="text-sm font-medium text-zinc-300 group-hover:text-amber-400 transition-colors">
              Mission Planner — Technical Analysis
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">
              15 документов • C# / WinForms • ArduPilot GCS
            </div>
          </div>
          <ArrowRight
            size={16}
            className="text-zinc-600 group-hover:text-amber-400 group-hover:translate-x-1 transition-all shrink-0"
          />
        </Link>
      </section>

      {/* Meta */}
      <section className="px-6 lg:px-12 py-8 border-t border-zinc-800">
        <div className="flex flex-wrap gap-6 text-xs text-zinc-600">
          <div>
            <span className="text-zinc-500">Документов:</span> 34
          </div>
          <div>
            <span className="text-zinc-500">Проектов:</span> 2
          </div>
          <div>
            <span className="text-zinc-500">Фокус:</span> Maritime ASV
          </div>
          <div>
            <span className="text-zinc-500">Стадия:</span> Full analysis complete
          </div>
        </div>
      </section>
    </div>
  );
}

export interface NavItem {
  title: string;
  href: string;
  icon: string;
  children?: { title: string; href: string }[];
}

export interface NavSection {
  label: string;
  slug: string;
  items: NavItem[];
}

/** QGroundControl navigation */
export const qgcNavigation: NavItem[] = [
  {
    title: "Обзор",
    href: "/",
    icon: "home",
  },
  {
    title: "Аудит кодовой базы",
    href: "/audit/",
    icon: "search",
  },
  {
    title: "Архитектура системы",
    href: "/architecture/",
    icon: "layers",
    children: [
      { title: "Потоки данных", href: "/architecture/#динамика-и-жизненный-цикл-системы-qgroundcontrol-data-flow" },
    ],
  },
  {
    title: "Продуктовая логика",
    href: "/product-logic/",
    icon: "briefcase",
    children: [
      { title: "Архитектурные решения", href: "/product-logic/#анализ-ключевых-архитектурных-решений-qgroundcontrol" },
    ],
  },
  {
    title: "Целевое состояние",
    href: "/target-state/",
    icon: "target",
    children: [
      { title: "Target Architecture", href: "/target-state/#target-architecture-maritime-ground-control-station" },
    ],
  },
  {
    title: "UI / UX анализ",
    href: "/ui-analysis/",
    icon: "monitor",
    children: [
      { title: "Fly View", href: "/ui-analysis/#fly-view" },
      { title: "Plan View", href: "/ui-analysis/#plan-view" },
      { title: "Setup / Config", href: "/ui-analysis/#setup-view" },
    ],
  },
  {
    title: "Инструменты и настройки",
    href: "/tools-and-config/",
    icon: "settings",
    children: [
      { title: "Analyze Tools", href: "/tools-and-config/#analyze-tools" },
      { title: "Application Settings", href: "/tools-and-config/#application-settings" },
      { title: "UI Action Map", href: "/tools-and-config/#ui-action-map" },
    ],
  },
  {
    title: "Maritime / Boat",
    href: "/maritime/",
    icon: "anchor",
    children: [
      { title: "Режимы Boat", href: "/maritime/#boat-modes" },
      { title: "SITL тест-план", href: "/maritime/#sitl-test-plan" },
    ],
  },
  {
    title: "Обзор продукта",
    href: "/product-overview/",
    icon: "clipboard",
    children: [
      { title: "System Capabilities", href: "/product-overview/#system-capabilities" },
      { title: "User Workflows", href: "/product-overview/#user-workflows" },
      { title: "Feature Analysis", href: "/product-overview/#feature-analysis" },
    ],
  },
];

/** Mission Planner navigation */
export const mpNavigation: NavItem[] = [
  {
    title: "Обзор MP",
    href: "/mp/",
    icon: "home",
  },
  {
    title: "Аудит и архитектура",
    href: "/mp/audit/",
    icon: "search",
    children: [
      { title: "System Architecture", href: "/mp/audit/#architecture" },
      { title: "Data Flow", href: "/mp/audit/#data-flow" },
    ],
  },
  {
    title: "Продуктовая логика",
    href: "/mp/product-logic/",
    icon: "briefcase",
    children: [
      { title: "Architecture Decisions", href: "/mp/product-logic/#decisions" },
    ],
  },
  {
    title: "Модули и интерфейсы",
    href: "/mp/modules/",
    icon: "layers",
    children: [
      { title: "Protocols", href: "/mp/modules/#protocols" },
      { title: "External Interfaces", href: "/mp/modules/#interfaces" },
    ],
  },
  {
    title: "Качество и производительность",
    href: "/mp/quality/",
    icon: "shield",
    children: [
      { title: "Performance", href: "/mp/quality/#performance" },
    ],
  },
  {
    title: "Риски и дорожная карта",
    href: "/mp/roadmap/",
    icon: "map",
    children: [
      { title: "Risk Assessment", href: "/mp/roadmap/#risks" },
    ],
  },
  {
    title: "Обзор продукта",
    href: "/mp/product/",
    icon: "clipboard",
    children: [
      { title: "System Capabilities", href: "/mp/product/#capabilities" },
      { title: "User Workflows", href: "/mp/product/#workflows" },
      { title: "Feature Analysis", href: "/mp/product/#features" },
    ],
  },
];

/** Combined project sections for the sidebar */
export const projectSections: NavSection[] = [
  { label: "QGroundControl", slug: "qgc", items: qgcNavigation },
  { label: "Mission Planner", slug: "mp", items: mpNavigation },
];

/** Backward-compatible flat navigation (used by getPrevNext) */
export const navigation = qgcNavigation;

export function getPrevNext(currentPath: string) {
  // Determine which navigation set to use
  const isMP = currentPath.startsWith("/mp");
  const nav = isMP ? mpNavigation : qgcNavigation;

  const flat = nav.map((item) => ({
    title: item.title,
    href: item.href,
  }));
  const index = flat.findIndex(
    (item) => item.href === currentPath || item.href === currentPath + "/"
  );
  return {
    prev: index > 0 ? flat[index - 1] : null,
    next: index < flat.length - 1 ? flat[index + 1] : null,
  };
}

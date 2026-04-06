export interface NavItem {
  title: string;
  href: string;
  icon: string;
  children?: { title: string; href: string }[];
}

export const navigation: NavItem[] = [
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
];

export function getPrevNext(currentPath: string) {
  const flat = navigation.map((item) => ({
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

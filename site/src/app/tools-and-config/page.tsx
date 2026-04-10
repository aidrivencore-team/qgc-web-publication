import { Metadata } from "next";
import { getDocuments } from "@/lib/content";
import { getPrevNext } from "@/lib/navigation";
import { ContentPage } from "@/components/content/ContentPage";

export const metadata: Metadata = {
  title: "Инструменты и настройки",
  description:
    "Анализ инструментов QGroundControl: Analyze Tools, Application Settings, карта UI-действий пользователя.",
};

export default async function ToolsAndConfigPage() {
  const documents = await getDocuments("qgroundcontrol", [
    "11_ANALYZE_TOOLS_DEEP_ANALYSIS.md",
    "12_APPLICATION_SETTINGS_DEEP_ANALYSIS.md",
    "13_UI_ACTION_MAP.md",
  ]);
  const prevNext = getPrevNext("/tools-and-config/");

  return <ContentPage documents={documents} prevNext={prevNext} />;
}

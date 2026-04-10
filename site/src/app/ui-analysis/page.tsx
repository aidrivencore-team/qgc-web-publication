import { Metadata } from "next";
import { getDocuments } from "@/lib/content";
import { getPrevNext } from "@/lib/navigation";
import { ContentPage } from "@/components/content/ContentPage";

export const metadata: Metadata = {
  title: "UI / UX анализ",
  description:
    "Глубокий анализ экранов QGroundControl: Fly View (оперативное управление), Plan View (планирование миссий), Setup (конфигурация аппарата).",
};

export default async function UiAnalysisPage() {
  const documents = await getDocuments("qgroundcontrol", [
    "08_FLY_VIEW_DEEP_ANALYSIS.md",
    "09_PLAN_VIEW_DEEP_ANALYSIS.md",
    "10_SETUP_DEEP_ANALYSIS.md",
  ]);
  const prevNext = getPrevNext("/ui-analysis/");

  return <ContentPage documents={documents} prevNext={prevNext} />;
}

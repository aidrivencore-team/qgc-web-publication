import { Metadata } from "next";
import { getDocuments } from "@/lib/content";
import { getPrevNext } from "@/lib/navigation";
import { ContentPage } from "@/components/content/ContentPage";

export const metadata: Metadata = {
  title: "MP — Риски и дорожная карта",
  description:
    "Risk assessment и modernization roadmap Mission Planner.",
};

export default async function MPRoadmapPage() {
  const documents = await getDocuments("mission-planner", [
    "11_RISK_ASSESSMENT.md",
    "12_MODERNIZATION_ROADMAP.md",
  ]);
  const prevNext = getPrevNext("/mp/roadmap/");

  return <ContentPage documents={documents} prevNext={prevNext} />;
}

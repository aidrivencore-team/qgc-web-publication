import { Metadata } from "next";
import { getDocuments } from "@/lib/content";
import { getPrevNext } from "@/lib/navigation";
import { ContentPage } from "@/components/content/ContentPage";

export const metadata: Metadata = {
  title: "MP — Качество и производительность",
  description:
    "Testing & quality, performance и scalability анализ Mission Planner.",
};

export default async function MPQualityPage() {
  const documents = await getDocuments("mission-planner", [
    "09_TESTING_AND_QUALITY.md",
    "10_PERFORMANCE_AND_SCALABILITY.md",
  ]);
  const prevNext = getPrevNext("/mp/quality/");

  return <ContentPage documents={documents} prevNext={prevNext} />;
}

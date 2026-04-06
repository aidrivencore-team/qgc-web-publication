import { Metadata } from "next";
import { getDocuments } from "@/lib/content";
import { getPrevNext } from "@/lib/navigation";
import { ContentPage } from "@/components/content/ContentPage";

export const metadata: Metadata = {
  title: "Целевое состояние",
  description:
    "Gap Analysis и Target Architecture: от QGroundControl к специализированной Maritime GCS для автономных надводных аппаратов.",
};

export default async function TargetStatePage() {
  const documents = await getDocuments([
    "06_GAP_ANALYSIS.md",
    "07_TARGET_ARCHITECTURE.md",
  ]);
  const prevNext = getPrevNext("/target-state/");

  return <ContentPage documents={documents} prevNext={prevNext} />;
}

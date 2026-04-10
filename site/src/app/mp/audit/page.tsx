import { Metadata } from "next";
import { getDocuments } from "@/lib/content";
import { getPrevNext } from "@/lib/navigation";
import { ContentPage } from "@/components/content/ContentPage";

export const metadata: Metadata = {
  title: "MP — Аудит и архитектура",
  description:
    "Codebase audit, системная архитектура и потоки данных Mission Planner.",
};

export default async function MPAuditPage() {
  const documents = await getDocuments("mission-planner", [
    "01_CODEBASE_AUDIT_REPORT.md",
    "02_SYSTEM_ARCHITECTURE.md",
    "03_DATA_FLOW.md",
  ]);
  const prevNext = getPrevNext("/mp/audit/");

  return <ContentPage documents={documents} prevNext={prevNext} />;
}

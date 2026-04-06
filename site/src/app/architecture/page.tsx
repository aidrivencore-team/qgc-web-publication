import { Metadata } from "next";
import { getDocuments } from "@/lib/content";
import { getPrevNext } from "@/lib/navigation";
import { ContentPage } from "@/components/content/ContentPage";

export const metadata: Metadata = {
  title: "Архитектура системы",
  description:
    "Архитектура QGroundControl: слоевая структура, ключевые модули, Fact System, потоки данных и lifecycle системы.",
};

export default async function ArchitecturePage() {
  const documents = await getDocuments([
    "02_SYSTEM_ARCHITECTURE.md",
    "03_DATA_FLOW.md",
  ]);
  const prevNext = getPrevNext("/architecture/");

  return <ContentPage documents={documents} prevNext={prevNext} />;
}

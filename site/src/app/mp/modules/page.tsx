import { Metadata } from "next";
import { getDocuments } from "@/lib/content";
import { getPrevNext } from "@/lib/navigation";
import { ContentPage } from "@/components/content/ContentPage";

export const metadata: Metadata = {
  title: "MP — Модули и интерфейсы",
  description:
    "Module map, протоколы коммуникации и внешние интерфейсы Mission Planner.",
};

export default async function MPModulesPage() {
  const documents = await getDocuments("mission-planner", [
    "06_MODULE_MAP.md",
    "07_COMMUNICATION_AND_PROTOCOLS.md",
    "08_EXTERNAL_INTERFACES.md",
  ]);
  const prevNext = getPrevNext("/mp/modules/");

  return <ContentPage documents={documents} prevNext={prevNext} />;
}

import { Metadata } from "next";
import { getDocuments } from "@/lib/content";
import { getPrevNext } from "@/lib/navigation";
import { ContentPage } from "@/components/content/ContentPage";

export const metadata: Metadata = {
  title: "MP — Продуктовая логика",
  description:
    "Product logic и ключевые архитектурные решения Mission Planner.",
};

export default async function MPProductLogicPage() {
  const documents = await getDocuments("mission-planner", [
    "04_PRODUCT_LOGIC.md",
    "05_ARCHITECTURE_DECISIONS.md",
  ]);
  const prevNext = getPrevNext("/mp/product-logic/");

  return <ContentPage documents={documents} prevNext={prevNext} />;
}

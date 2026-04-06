import { Metadata } from "next";
import { getDocuments } from "@/lib/content";
import { getPrevNext } from "@/lib/navigation";
import { ContentPage } from "@/components/content/ContentPage";

export const metadata: Metadata = {
  title: "Продуктовая логика",
  description:
    "Продуктовая логика QGroundControl: функции, сценарии использования, роли пользователей и ключевые архитектурные решения.",
};

export default async function ProductLogicPage() {
  const documents = await getDocuments([
    "04_PRODUCT_LOGIC.md",
    "05_ARCHITECTURE_DECISIONS.md",
  ]);
  const prevNext = getPrevNext("/product-logic/");

  return <ContentPage documents={documents} prevNext={prevNext} />;
}

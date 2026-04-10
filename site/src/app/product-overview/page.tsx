import { Metadata } from "next";
import { getDocuments } from "@/lib/content";
import { getPrevNext } from "@/lib/navigation";
import { ContentPage } from "@/components/content/ContentPage";

export const metadata: Metadata = {
  title: "Обзор продукта",
  description:
    "Системные возможности QGroundControl, пользовательские сценарии и анализ продуктовых функций.",
};

export default async function ProductOverviewPage() {
  const documents = await getDocuments("qgroundcontrol", [
    "16_QGC_SYSTEM_CAPABILITIES.md",
    "17_QGC_USER_WORKFLOWS.md",
    "18_QGC_PRODUCT_FEATURE_ANALYSIS.md",
  ]);
  const prevNext = getPrevNext("/product-overview/");

  return <ContentPage documents={documents} prevNext={prevNext} />;
}

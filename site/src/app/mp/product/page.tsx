import { Metadata } from "next";
import { getDocuments } from "@/lib/content";
import { getPrevNext } from "@/lib/navigation";
import { ContentPage } from "@/components/content/ContentPage";

export const metadata: Metadata = {
  title: "MP — Обзор продукта",
  description:
    "System capabilities, user workflows и feature analysis Mission Planner.",
};

export default async function MPProductPage() {
  const documents = await getDocuments("mission-planner", [
    "13_SYSTEM_CAPABILITIES.md",
    "14_USER_WORKFLOWS.md",
    "15_PRODUCT_FEATURE_ANALYSIS.md",
  ]);
  const prevNext = getPrevNext("/mp/product/");

  return <ContentPage documents={documents} prevNext={prevNext} />;
}

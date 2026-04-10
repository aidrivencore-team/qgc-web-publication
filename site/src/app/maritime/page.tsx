import { Metadata } from "next";
import { getDocuments } from "@/lib/content";
import { getPrevNext } from "@/lib/navigation";
import { ContentPage } from "@/components/content/ContentPage";

export const metadata: Metadata = {
  title: "Maritime / Boat",
  description:
    "Анализ морских режимов ArduPilot Boat: режимы управления, поведение системы и SITL тест-план для надводных аппаратов.",
};

export default async function MaritimePage() {
  const documents = await getDocuments("qgroundcontrol", [
    "14_BOAT_MODES_AND_BEHAVIOR.md",
    "15_SITL_BOAT_TEST_PLAN.md",
  ]);
  const prevNext = getPrevNext("/maritime/");

  return <ContentPage documents={documents} prevNext={prevNext} />;
}

import { Metadata } from "next";
import { getDocuments } from "@/lib/content";
import { getPrevNext } from "@/lib/navigation";
import { ContentPage } from "@/components/content/ContentPage";

export const metadata: Metadata = {
  title: "Аудит кодовой базы",
  description:
    "Полный аудит репозитория QGroundControl: стек технологий, модули, зависимости, архитектурные паттерны MVC/MVVM.",
};

export default async function AuditPage() {
  const documents = await getDocuments(["01_CODEBASE_AUDIT_REPORT.md"]);
  const prevNext = getPrevNext("/audit/");

  return <ContentPage documents={documents} prevNext={prevNext} />;
}

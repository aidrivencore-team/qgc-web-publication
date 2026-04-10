import type { Metadata } from "next";
import { Sidebar } from "@/components/layout/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    template: "%s — GCS Analysis",
    default: "GCS Analysis — QGroundControl & Mission Planner",
  },
  description:
    "Комплексный технический анализ QGroundControl и Mission Planner: архитектура, продуктовая логика, модернизация GCS для автономных надводных аппаратов.",
  metadataBase: new URL("https://qgc-web-publication.vercel.app"),
  openGraph: {
    title: "GCS Analysis",
    description:
      "Технический аудит QGroundControl & Mission Planner → Maritime GCS",
    type: "website",
    locale: "ru_RU",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="font-['Inter',sans-serif]"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        <Sidebar />
        <main className="lg:pl-64 min-h-screen">{children}</main>
      </body>
    </html>
  );
}

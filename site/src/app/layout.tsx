import type { Metadata } from "next";
import { Sidebar } from "@/components/layout/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    template: "%s — QGC Maritime Analysis",
    default: "QGC Maritime Analysis — Техническая публикация",
  },
  description:
    "Комплексный технический анализ QGroundControl и целевая архитектура Maritime Ground Control Station для автономных надводных аппаратов.",
  metadataBase: new URL("https://qgc-web-publication.vercel.app"),
  openGraph: {
    title: "QGC Maritime Analysis",
    description:
      "Технический аудит QGroundControl → Maritime GCS Architecture",
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

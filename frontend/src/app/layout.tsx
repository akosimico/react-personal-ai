import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal RAG Engine",
  description: "AI Knowledge Base Workspace",
  icons: {
    icon: "/logo.png"
  }
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "ULTRA X — X Layer analytics",
  description: "On-chain analytics for X Layer (chain ID 196)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body
        className="min-h-screen font-sans antialiased"
        style={{ background: "var(--bg)", color: "var(--text)" }}
      >
        <Nav />
        <main className="mx-auto max-w-7xl px-4 pb-16 pt-6">{children}</main>
      </body>
    </html>
  );
}

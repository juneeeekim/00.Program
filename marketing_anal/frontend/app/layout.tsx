/**
 * ==================================================
 * Root Layout Component
 * ==================================================
 * Phase 5: Clothes - Premium Typography
 * 
 * Features:
 * - Inter font from Google Fonts
 * - Optimized font loading
 * - SEO metadata
 * ==================================================
 */

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Configure Inter font with optimal settings
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Marketing Analytics Dashboard | Director's Console",
  description: "Premium marketing analytics dashboard for data-driven decision making",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}

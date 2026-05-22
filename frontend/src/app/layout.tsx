import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import SessionGuardian from "@/components/SessionGuardian";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Zoom Clone",
  description: "A professional video conferencing platform clone",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans bg-white text-zoom-text" suppressHydrationWarning>
          <SessionGuardian>
          {children}
        </SessionGuardian>
        </body>
    </html>
  );
}

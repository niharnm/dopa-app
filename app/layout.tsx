import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import { Denver } from "@/components/denver/Denver";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono-var",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dopa – Pre-spend creative intelligence",
  description:
    "Upload an ad to predict average click-through rate and inspect its modeled cortical response with TRIBE v2.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} h-full antialiased`}>
      <body
        suppressHydrationWarning
        className="min-h-full flex flex-col font-sans"
      >
        {children}
        <Denver />
      </body>
    </html>
  );
}

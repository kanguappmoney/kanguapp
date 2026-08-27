import type { Metadata, Viewport } from "next";
import { Poppins, Inter } from "next/font/google";
import "./globals.css";
import { RegisterSW } from "@/components/RegisterSW";

// Guia de marca: títulos Poppins SemiBold, corpo Inter Regular.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-poppins",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kangu",
  description: "Gestão de transporte escolar",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Kangu",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d1b3d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${poppins.variable} ${inter.variable}`}>
      <body className="font-sans">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}

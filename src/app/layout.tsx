import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { GoogleTranslateController } from "@/components/language-toggle";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Roatan Self Storage | Facturación",
  description: "Dashboard de facturación, BAC, CAI y Storeganise",
  icons: {
    icon: "/logologin.png",
    shortcut: "/logologin.png",
    apple: "/logologin.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <GoogleTranslateController />
        {children}
      </body>
    </html>
  );
}

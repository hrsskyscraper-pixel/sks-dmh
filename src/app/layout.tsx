import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { FONT_SCALE_COOKIE, normalizeFontScale } from "@/lib/font-scale";
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
  title: "Mission Board",
  description: "GAPから、次の一歩へ。",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // ユーザーごとの文字サイズ設定を Cookie から読み、<html> に適用する（SSRでチラつかせない）。
  // DB が正の値で、ログイン後に FontScaleSync が Cookie を最新化する。
  const cookieStore = await cookies();
  const fontScale = normalizeFontScale(cookieStore.get(FONT_SCALE_COOKIE)?.value);

  return (
    <html lang="en" style={{ fontSize: `${fontScale}%` }}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

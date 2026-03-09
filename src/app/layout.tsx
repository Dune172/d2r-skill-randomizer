import type { Metadata } from "next";
import { Cinzel } from "next/font/google";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const cinzel = Cinzel({ variable: "--font-cinzel", subsets: ["latin"], weight: ["400", "700", "900"], display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL('https://d2rrandomizer.com'),
  title: {
    default: 'D2R Randomizer — Diablo 2 Resurrected Skill Randomizer Mod',
    template: '%s | D2R Randomizer',
  },
  description: 'Generate a free, unique skill randomizer mod for Diablo 2 Resurrected. Each seed shuffles all 7 class skill trees for a fresh playthrough. Download and install in minutes.',
  keywords: ['Diablo 2 Resurrected', 'D2R', 'randomizer', 'mod', 'skill randomizer', 'Reign of the Warlock'],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'D2R Randomizer — Diablo 2 Resurrected Skill Randomizer Mod',
    description: 'Generate a free, unique skill randomizer mod for Diablo 2 Resurrected. Each seed shuffles all 7 class skill trees for a fresh playthrough.',
    url: 'https://d2rrandomizer.com',
    siteName: 'D2R Randomizer',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'D2R Randomizer — Diablo 2 Resurrected Skill Randomizer Mod',
    description: 'Generate a free, unique skill randomizer mod for Diablo 2 Resurrected. Each seed shuffles all 7 class skill trees for a fresh playthrough.',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}

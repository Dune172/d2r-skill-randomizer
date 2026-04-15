import type { Metadata } from "next";
import { Cinzel } from "next/font/google";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SiteNav from "@/app/components/SiteNav";
import SiteFooter from "@/app/components/SiteFooter";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const cinzel = Cinzel({ variable: "--font-cinzel", subsets: ["latin"], weight: ["400", "700", "900"], display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL('https://d2rrandomizer.com'),
  title: {
    default: 'D2R Randomizer — Diablo 2 Resurrected Skill Randomizer Mod',
    template: '%s | D2R Randomizer',
  },
  description: 'Generate a free skill randomizer mod for Diablo 2 Resurrected. Each seed shuffles all 8 class skill trees for a fresh playthrough.',
  keywords: ['Diablo 2 Resurrected', 'D2R', 'randomizer', 'mod', 'skill randomizer', 'Reign of the Warlock'],
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
  },
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'D2R Randomizer — Diablo 2 Resurrected Skill Randomizer Mod',
    description: 'Generate a free, unique skill randomizer mod for Diablo 2 Resurrected. Each seed shuffles all 8 class skill trees for a fresh playthrough.',
    url: 'https://d2rrandomizer.com',
    siteName: 'D2R Randomizer',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'D2R Randomizer — Diablo 2 Resurrected Skill Randomizer Mod',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'D2R Randomizer — Diablo 2 Resurrected Skill Randomizer Mod',
    description: 'Generate a free, unique skill randomizer mod for Diablo 2 Resurrected. Each seed shuffles all 8 class skill trees for a fresh playthrough.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} antialiased min-h-screen flex flex-col`}>
        <script dangerouslySetInnerHTML={{ __html: `(function(){
  function maybeReload(){
    var n=parseInt(sessionStorage.getItem('_cr')||'0');
    if(n<3){sessionStorage.setItem('_cr',String(n+1));location.reload();}
  }
  window.addEventListener('error',function(e){
    if(e.error&&e.error.name==='ChunkLoadError'){maybeReload();}
    else if(String(e.message||'').toLowerCase().indexOf('chunk')!==-1){maybeReload();}
  });
  window.addEventListener('unhandledrejection',function(e){
    var r=e.reason;
    if(r&&(r.name==='ChunkLoadError'||String(r.message||'').toLowerCase().indexOf('chunk')!==-1)){maybeReload();}
  });
})();` }} />
        <SiteNav />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}

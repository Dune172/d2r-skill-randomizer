import type { Metadata } from "next";
import { Cinzel } from "next/font/google";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SiteNav from "@/app/components/SiteNav";
import SiteFooter from "@/app/components/SiteFooter";
// Boot-time warmup is wired up via src/instrumentation.ts (Next.js register()
// hook) — runs once per process before any request is served.

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
    // Hostinger CDN 403s requests for .ico/.svg paths and serves its own HTML
    // error page instead of proxying to the Next.js upstream. So we deliberately
    // advertise only the extension-less dynamic icon routes — those bypass the
    // CDN interception and actually return PNGs. If Hostinger CDN is ever
    // reconfigured to pass /favicon.ico through, we can add it back here and
    // restore src/app/favicon.ico from git history.
    icon: [
      { url: '/favicon.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon', sizes: '192x192', type: 'image/png' },
    ],
    apple: { url: '/apple-icon', sizes: '180x180', type: 'image/png' },
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
    // og:image / twitter:image are populated by each page's opengraph-image.tsx
  },
  twitter: {
    card: 'summary_large_image',
    title: 'D2R Randomizer — Diablo 2 Resurrected Skill Randomizer Mod',
    description: 'Generate a free, unique skill randomizer mod for Diablo 2 Resurrected. Each seed shuffles all 8 class skill trees for a fresh playthrough.',
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
        {/* First-party attribution beacon: one hit per browser session, no cookies.
            Aggregate-only storage — see src/lib/traffic-stats.ts. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){
  try{
    if(sessionStorage.getItem('_hit'))return;
    sessionStorage.setItem('_hit','1');
    var p=new URLSearchParams(location.search);
    var data=JSON.stringify({path:location.pathname,utm_source:p.get('utm_source')||'',ref:document.referrer||''});
    if(navigator.sendBeacon){navigator.sendBeacon('/api/hit',new Blob([data],{type:'application/json'}));}
    else{fetch('/api/hit',{method:'POST',headers:{'Content-Type':'application/json'},body:data,keepalive:true});}
  }catch(e){}
})();` }} />
        <SiteNav />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}

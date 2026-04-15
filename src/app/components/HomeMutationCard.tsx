import Image from 'next/image';
import type { MutationDef } from '@/lib/mutations/registry';

export function HomeMutationCard({ mutation }: { mutation: MutationDef }) {
  return (
    <div
      tabIndex={0}
      aria-label={`${mutation.name}: ${mutation.description}`}
      className="card-ornate group relative flex flex-col items-center
        border border-[#3a1510] bg-[#0c0304] panel-shadow p-3 w-36
        hover:-translate-y-0.5 hover:border-[#c8942a]/50
        hover:shadow-[0_0_18px_rgba(200,148,42,0.12)]
        focus:outline-none focus-visible:border-[#c8942a]/60
        transition-all duration-200 select-none cursor-default"
    >
      <div className="w-24 h-24 flex items-center justify-center mb-2 overflow-hidden">
        <Image
          src={`/mutations/${mutation.id}.png`}
          alt=""
          width={96}
          height={96}
          sizes="96px"
          className="object-contain group-hover:opacity-90 transition-opacity duration-200"
        />
      </div>
      <p className="font-cinzel font-bold text-[#c8942a] text-xs tracking-[0.1em] text-center leading-tight">
        {mutation.name}
      </p>
      {/* Mobile: inline description, always shown */}
      <p className="text-[11px] text-[#a89060]/85 leading-snug mt-1.5 text-center md:hidden">
        {mutation.description}
      </p>
      {/* Desktop: CSS-only tooltip on hover or keyboard focus */}
      <div
        role="tooltip"
        className="invisible opacity-0
          group-hover:visible group-hover:opacity-100
          group-focus-within:visible group-focus-within:opacity-100
          transition-opacity duration-150
          hidden md:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10
          w-48 border border-[#c8942a]/40 bg-[#0c0304]/95 p-2.5
          text-[11px] text-[#a89060] leading-relaxed font-sans pointer-events-none"
      >
        {mutation.description}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#c8942a]/40" />
      </div>
    </div>
  );
}

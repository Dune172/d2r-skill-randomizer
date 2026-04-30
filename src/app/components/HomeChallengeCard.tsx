import Link from 'next/link';
import { getActivePair, getWeekName } from '@/lib/mutations/registry';
import { HomeMutationCard } from './HomeMutationCard';

export function HomeChallengeCard({ weekNumber }: { weekNumber: number }) {
  const weekName = getWeekName(weekNumber);
  const [mutA, mutB] = getActivePair(weekNumber);

  return (
    <div className="border border-[#c8942a]/25 bg-[#0c0304] panel-shadow p-7 text-center">
      <p className="font-cinzel text-[10px] tracking-[0.4em] text-[#7a5818] uppercase mb-3">
        Weekly Challenge
      </p>

      <div className="font-cinzel font-black text-3xl md:text-4xl text-[#c8942a] glow-gold tracking-[0.12em] uppercase mb-5 leading-tight">
        {weekName}
      </div>

      <div className="flex flex-wrap justify-center gap-3 mb-6">
        <HomeMutationCard mutation={mutA} />
        <HomeMutationCard mutation={mutB} />
      </div>

      <Link
        href="/challenge"
        className="font-cinzel tracking-[0.2em] uppercase text-xs px-6 py-2.5 bg-[#7a1f0a] hover:bg-[#9a2c0f] border border-[#c8942a]/40 text-[#e8c87a] transition-colors panel-shadow inline-block"
      >
        Play The Challenge
      </Link>
    </div>
  );
}

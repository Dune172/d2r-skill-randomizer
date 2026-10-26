import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import ContentPage, { contentMetadata } from '@/app/components/ContentPage';
import { MUTATIONS, getMutationIds, getWeekName } from '@/lib/mutations/registry';
import { getCurrentWeekNumber } from '@/lib/challenge/week';

// Hourly so the "featured in" lists pick up a new month's challenge.
export const revalidate = 3600;

export const metadata: Metadata = contentMetadata(
  '/mutations',
  'D2R Randomizer Mutations Guide',
  'Every D2R Randomizer mutation explained: what each rule change does in Diablo 2 Resurrected, strategy tips, and which monthly challenges featured it.',
);

/** Hand-written strategy notes, keyed by mutation id. */
const TIPS: Record<string, string[]> = {
  hyperdrive: [
    'Ranged monsters close the gap almost instantly, so standing still to cast is risky. Keep moving and fight from doorways.',
    'Crowd control (freezes, slows, stuns and knockback) is worth more than usual. Faster Hit Recovery helps you get out of hit-lock.',
    'Your own +30% movement makes town runs and backtracking quicker, which partly offsets the danger.',
  ],
  'heavy-burden': [
    'Plan for extra Strength. Heavy armor that you could normally wear at a given level may now be out of reach.',
    'Magic armor is unusually valuable: the chance-to-cast-when-hit effects grow stronger with item level, so a blue chest can beat a rare one early.',
    'Light armor with low requirements still gets the defense bonus and keeps your stat points free.',
  ],
  'hollow-shell': [
    'Keep the Hollow Locket equipped. Its regeneration is your main source of sustain, since potions cost five times as much.',
    'With half the life, burst damage is the main threat. Lightning-heavy monsters and archers deserve respect.',
    'Faster mana regeneration rewards spending mana freely between fights. Rest briefly instead of drinking.',
  ],
  bloodthirst: [
    'Spreading damage across a pack lets every monster heal back up. Finish one target before moving to the next.',
    'Burst damage and high single-target damage beat slow damage-over-time builds here.',
    'Gear with Prevent Monster Heal is worth looking for, and your hireling adds steady pressure that keeps targets from recovering.',
  ],
  'the-horde': [
    'Area damage shines. Skills that hit many monsters at once clear huge packs far faster than single-target attacks.',
    'Fight in corridors and doorways so the pack has to come to you a few at a time.',
    'Experience per kill is lower, but there are many more kills, and more monsters means more drops.',
  ],
  'glass-cannon': [
    'Fights end quickly in both directions. Kill first: everything has half its usual life.',
    'Resistances and life matter more than usual because every hit lands twice as hard.',
    'Ranged builds and anything that controls distance have a big advantage. Do not let packs surround you.',
  ],
  pestilence: [
    'Poison resistance becomes a top priority. Look for it on rings, amulets, shields and charms.',
    'Antidote potions are expensive. Keep a few for bosses and rely on resistance and Poison Length Reduced for everyday fights.',
    'Poison keeps ticking after you retreat, so drink a healing potion early rather than waiting.',
  ],
  'arcane-surge': [
    'Every skill costs two and a half times its normal mana. Mana leech, mana regeneration and Energy are worth more than usual.',
    'Elemental skills hit 50% harder, so fire, cold, lightning and poison builds get the payoff. Physical skills pay the cost with no bonus.',
    'Carry mana potions, and lean on cheap filler skills for trash monsters.',
  ],
  'house-always-wins': [
    'Gambling is the only way to upgrade weapons and armor. Spend gold at Gheed, Elzix and the other gamble vendors whenever you are in town.',
    'Starting gear, quest rewards and Charsi’s imbue have to carry you early, so use them carefully.',
    'Gold drops are massive. Keep an eye on your gold cap and visit the gamble screen before your stash fills.',
  ],
  'tempered-edge': [
    'Physical damage builds get stronger: monsters lose 40 physical resistance.',
    'Monsters that already resist an element heavily can now reach 100% and become immune. Have a second damage type, or lean on your hireling.',
    'Casters should look for -enemy resistance gear and skills that pierce resistance.',
  ],
  'titans-grip': [
    'Weapons with stat requirements deal double damage, so it pays to put more points into Strength and Dexterity.',
    'Magic weapons can roll chance-to-cast effects from a wide pool of skills, and existing procs trigger twice as often. Even casters can benefit from a good proc weapon.',
    'Proc skill level scales with item level, so weapons found later in the game cast much stronger skills.',
  ],
  'mystery-box': [
    'You will not know what a skill is until you use it. Put single points into several top-row skills early and test them.',
    'Completing the Den of Evil lets Akara reset your skills and stats once, so early mistakes can be undone.',
    'Write down what each slot turned out to be. The trees stay disguised for the whole run.',
  ],
  'dead-reckoning': [
    'Fewer stat points per level means you cannot afford to waste any. Put in exactly what your gear needs and the rest into Vitality.',
    'Items drop more often and at higher quality, so gear with stat bonuses and good charms make up the difference.',
    'Check item requirements before investing; a lucky drop may be worth reshaping your build around.',
  ],
  entropy: [
    'Equipment wears out four times as fast, and repairs cost ten times as much. Watch the durability warning icons.',
    'Carry a backup weapon on weapon swap, and keep enough gold for repairs before you buy anything else.',
    'Items that repair themselves over time or are indestructible are especially valuable.',
  ],
  molasses: [
    'Monsters are slow but every hit lands twice as hard. Kiting is the plan: attack, step back, attack again.',
    'Ranged builds and anything with knockback or slows are comfortable. Melee builds should avoid getting surrounded.',
    'Do not trade hits with bosses. Their damage is doubled too.',
  ],
  'no-guard': [
    'Defense does nothing, so monsters will hit you almost every time. Life, resistances, block chance and damage reduction are your protection.',
    'You also hit almost every time, because monsters have zero defense. Attack Rating barely matters.',
    'Skills that grant defense are removed from the trees, so you may find different skills in their place.',
  ],
  'court-of-kings': [
    'Champion and unique packs are everywhere, and many carry auras. Watch for Fanaticism, Might and Conviction.',
    'These monsters drop better items and give more experience than common monsters, so the run rewards you for fighting them.',
    'Learn the dangerous modifier combinations, such as Lightning Enchanted with Multiple Shots, and pull them away from their pack.',
  ],
  'band-of-brothers': [
    'Your hireling does the heavy lifting. Give them your best weapon and armor upgrades before your own.',
    'You gain much less life per point of Vitality, so let the hireling stand in front and support from behind.',
    'An Act II mercenary’s aura or an Act III mercenary’s spells become far more important with their boosted skill levels.',
  ],
  'forgotten-arts': [
    'Skill trees are disabled. Buy early spell books from Akara and pick up every spell you find while exploring.',
    'Cube three matching copies into a stronger book. You keep your levels when you upgrade, so hold on to duplicates.',
    'Keep the Horadric Cube you start with close at hand; it is how your character grows.',
  ],
};

export default function MutationsPage() {
  const current = getCurrentWeekNumber();

  // Challenge numbers each mutation appeared in, up to and including the live one.
  const featured = new Map<number, number[]>();
  for (let c = 1; c <= current; c++) {
    for (const id of getMutationIds(c)) {
      featured.set(id, [...(featured.get(id) ?? []), c]);
    }
  }

  // Only mutations that have already been revealed in a challenge.
  const entries = Object.entries(MUTATIONS)
    .map(([key, def]) => ({ key: Number(key), def }))
    .filter(({ key }) => featured.has(key))
    .sort((a, b) => a.def.name.localeCompare(b.def.name));

  return (
    <ContentPage
      eyebrow="Guide"
      title="Mutations Guide"
      updated="2026-10-26"
      intro={
        <>
          <p className="mb-4">
            Mutations are rule changes layered on top of a randomized seed. Some make monsters faster or
            tougher, some change how you gear up, and some hide your skills entirely. Each monthly{' '}
            <Link href="/challenge" className="text-[#c8942a] underline underline-offset-4">Mutation Challenge</Link>{' '}
            combines two or three of them, and everyone plays the same seed and settings.
          </p>
          <p>
            This guide covers all {entries.length} mutations that have appeared so far: what each one does,
            how to play around it, and which challenges used it. Past challenges can be replayed from the{' '}
            <Link href="/archive" className="text-[#c8942a] underline underline-offset-4">archive</Link>.
          </p>
        </>
      }
      related={[
        { href: '/challenge', label: 'Current challenge' },
        { href: '/archive', label: 'Challenge archive' },
        { href: '/faq', label: 'FAQ' },
      ]}
    >
      <nav aria-label="Mutations" className="mb-10">
        <ul className="list-none! pl-0! grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
          {entries.map(({ def }) => (
            <li key={def.id}>
              <a href={`#${def.id}`}>{def.name}</a>
            </li>
          ))}
        </ul>
      </nav>

      <h2>How mutations work</h2>
      <p>
        A mutation edits the game&apos;s data files when your mod is generated, exactly like the skill
        shuffle. Nothing runs in the background while you play. Mutations that would cancel each other out,
        such as Molasses and Hyperdrive, are never paired in the same challenge. Challenge mods also turn off
        Race Mode, so every class is randomized and you can pick whichever one you like.
      </p>
      <p>
        Most mutations push you toward a particular style: area damage against The Horde, kiting against
        Molasses, resistances against Pestilence. Reading the active mutations before you choose a class
        is the easiest way to make a challenge run go smoothly.
      </p>

      {entries.map(({ key, def }) => {
        const challenges = featured.get(key) ?? [];
        const tips = TIPS[def.id] ?? [];
        return (
          <section key={def.id} id={def.id} className="scroll-mt-24 border-t border-[#1a0a06] pt-2 mt-10">
            <h2 className="mt-6!">{def.name}</h2>
            <div className="flex flex-col sm:flex-row gap-5 items-start">
              <Image
                src={`/mutations/${def.id}.webp`}
                alt=""
                width={112}
                height={112}
                className="shrink-0 border border-[#3a1510] bg-[#0c0304]"
              />
              <div className="min-w-0">
                <p className="text-[#e8d5a0]">{def.description}</p>
              </div>
            </div>
            {tips.length > 0 && (
              <>
                <h3>Strategy</h3>
                <ul>
                  {tips.map((t) => <li key={t}>{t}</li>)}
                </ul>
              </>
            )}
            <p className="text-xs text-[#a89060]">
              Featured in:{' '}
              {challenges.map((c, i) => (
                <span key={c}>
                  {i > 0 && ', '}
                  {getWeekName(c)} (#{c}){c === current && ' — live now'}
                </span>
              ))}
            </p>
          </section>
        );
      })}
    </ContentPage>
  );
}

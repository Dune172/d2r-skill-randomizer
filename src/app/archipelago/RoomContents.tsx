'use client';

import { useEffect, useMemo, useState } from 'react';
import { ApLocation, ApNames, activeLocations } from '@/lib/archipelago/checks';
import { AP_OPTIONS, AP_RANDOM, ApOptionValues, WHOLE_DIFFICULTY_GOALS } from '@/lib/archipelago/options';

const ACT_NAMES = ['Act I', 'Act II', 'Act III', 'Act IV', 'Act V'];
const KIND_NAMES: Record<ApLocation[2], string> = {
  quest: 'Quests', waypoint: 'Waypoints', area: 'Areas', level: 'Character levels',
};

/** The index of a choice option's value, or -1 when it is left to chance. */
function choiceIndex(key: string, value: string | number | boolean | undefined): number {
  const option = AP_OPTIONS.find(o => o.key === key);
  if (!option || option.type !== 'choice' || value === AP_RANDOM) return -1;
  return option.choices.findIndex(c => c.value === value);
}

/**
 * "What's in a room": the items a slot can receive and the checks it holds with the
 * options chosen above. The list (about 37 KB) loads only when the section is opened.
 */
export default function RoomContents({ values }: { values: ApOptionValues }) {
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState<ApNames | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || names) return;
    import('@/lib/archipelago/ap-names.json')
      .then(m => setNames((m.default ?? m) as unknown as ApNames))
      .catch(() => setFailed(true));
  }, [open, names]);

  const goalDifficulty = choiceIndex('goal_difficulty', values.goal_difficulty);
  const wholeDifficulty = WHOLE_DIFFICULTY_GOALS.includes(String(values.goal_type));
  const goalAct = wholeDifficulty ? 4 : choiceIndex('goal_boss', values.goal_boss);
  const random = goalDifficulty < 0 || goalAct < 0 || values.goal_type === AP_RANDOM;

  const checks = useMemo(() => {
    if (!names || random) return null;
    return activeLocations(names, {
      goalDifficulty, goalAct,
      waypoints: values.include_waypoints === true,
      areas: values.include_areas === true,
      levels: values.include_level_milestones === true,
    });
  }, [names, random, goalDifficulty, goalAct, values.include_waypoints, values.include_areas, values.include_level_milestones]);

  // Grouped as players meet them: difficulty, then act, then the kind of check.
  const groups = useMemo(() => {
    if (!checks || !names) return [];
    const byKey = new Map<string, { title: string; kinds: Map<string, string[]> }>();
    for (const [, name, kind, difficulty, act] of checks) {
      const title = kind === 'level' ? 'Character levels' : `${names.difficulty[difficulty]} ${ACT_NAMES[act]}`;
      let group = byKey.get(title);
      if (!group) byKey.set(title, group = { title, kinds: new Map() });
      const list = group.kinds.get(kind) ?? [];
      list.push(name.replace(/^(Normal|Nightmare|Hell) (A\d|WP|Area): /, ''));
      group.kinds.set(kind, list);
    }
    return [...byKey.values()];
  }, [checks, names]);

  const traps = Number(values.trap_percentage) > 0 || values.trap_percentage === AP_RANDOM;
  const keys = values.key_items === true;
  const pooled = values.stat_points !== 'vanilla';

  return (
    <details
      className="rounded border border-[#2a1508]/60 bg-[#080203]/40"
      onToggle={e => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer select-none px-3 py-2 font-cinzel text-[11px] tracking-[0.22em] uppercase text-[#c8942a] hover:text-[#e0ac4a]">
        What&rsquo;s in your game{' '}
        <span className="normal-case tracking-normal text-[#a89060]">
          {checks ? `(${checks.length} checks with these options)` : '(items and checks)'}
        </span>
      </summary>
      <div className="space-y-4 p-3 pt-1 text-sm text-[#c8b890]">
        {failed && <p className="text-[#e06060]">The list could not be loaded. Try again in a moment.</p>}
        {!names && !failed && <p className="text-[#a89060]">Loading…</p>}
        {names && (
          <>
            <div>
              <h4 className="font-cinzel text-[11px] tracking-[0.22em] uppercase text-[#c8942a] mb-1">Items you can receive</h4>
              <ul className="space-y-0.5 text-xs leading-relaxed">
                <li><span className="text-[#e8d5a0]">Progressive Skill Point</span>: the main item; spend it like a normal skill point.</li>
                {pooled && <li><span className="text-[#e8d5a0]">Stat Points</span>: five attribute points, in place of the ones level-ups no longer give.</li>}
                {keys && <li><span className="text-[#e8d5a0]">Progressive Horadric Key</span>: two let the Cube make the Horadric Staff, five Khalim&rsquo;s Will.</li>}
                <li><span className="text-[#e8d5a0]">Gold</span>: the filler; more at higher levels.</li>
                {traps && (
                  <li>
                    <span className="text-[#e8d5a0]">Traps</span>:{' '}
                    {names.items.filter(i => i.group === 'Traps').map(i => i.name).join(', ')}.
                  </li>
                )}
              </ul>
            </div>
            {random ? (
              <p className="text-xs text-[#a89060]">
                The goal is left to chance, so which checks your game holds is decided when the room is generated.
              </p>
            ) : (
              <div className="space-y-3">
                <h4 className="font-cinzel text-[11px] tracking-[0.22em] uppercase text-[#c8942a]">
                  Your {checks?.length} checks
                </h4>
                {groups.map(group => (
                  <details key={group.title} className="rounded border border-[#2a1508]/60 px-3 py-1.5">
                    <summary className="cursor-pointer select-none text-[#e8d5a0]">
                      {group.title}{' '}
                      <span className="text-xs text-[#a89060]">
                        ({[...group.kinds.values()].reduce((n, l) => n + l.length, 0)})
                      </span>
                    </summary>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      {[...group.kinds.entries()].map(([kind, list]) => (
                        <div key={kind}>
                          <p className="text-[11px] uppercase tracking-[0.15em] text-[#a89060] mb-0.5">
                            {KIND_NAMES[kind as ApLocation[2]]}
                          </p>
                          <p className="text-xs leading-relaxed">{list.join(', ')}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
                <p className="text-xs text-[#a89060]">
                  Town areas and town waypoints are never checks. Nothing past your goal is a check either.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </details>
  );
}

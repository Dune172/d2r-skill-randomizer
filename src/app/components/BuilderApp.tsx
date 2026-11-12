'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BuilderTreeGrid, { type DragPayload } from '@/components/builder/BuilderTreeGrid';
import BuildOptionsPanel from '@/components/builder/BuildOptionsPanel';
import PagePicker, { MiniLayout } from '@/components/builder/PagePicker';
import SkillPalette from '@/components/builder/SkillPalette';
import ClassTreeCard from '@/components/ClassTreeCard';
import { InstallInstructions } from './InstallInstructions';
import type { BuilderCatalog } from '@/lib/builder/catalog';
import {
  type BuildIssue,
  type ClassBuild,
  PAGE_REFS,
  SLOTS_PER_CLASS,
  checkClassBuildSet,
  classNameOf,
  emptyBuild,
  fillEmptySlots,
  hasErrors,
  orderedSlotKeys,
  pageKey,
  pruneSlots,
  resolvePages,
  skillsInBuilds,
} from '@/lib/builder/class-build';
import { decodeClassBuildSet, encodeClassBuildSet } from '@/lib/builder/class-build-codec';
import {
  DEFAULT_MOD_OPTIONS,
  type ModOptions,
  buildDownloadQuery,
  buildRandomizeBody,
  buildShareQuery,
  optionParams,
  parseModOptions,
  withBaseGame,
} from '@/lib/builder/mod-options';
import RotwSwitch from '@/components/RotwSwitch';
import { generateMod } from '@/lib/generate-mod';
import { CLASS_DEFS } from '@/lib/randomizer/config';
import { baseGameConflict } from '@/lib/base-game';
import type { ClassCode, PreviewData, TreePage } from '@/lib/randomizer/types';
import { classTheme } from '@/lib/ui/class-theme';

type Step = 'class' | 'layout' | 'skills' | 'finish';
const STEPS: { id: Step; label: string }[] = [
  { id: 'class', label: 'Class' },
  { id: 'layout', label: 'Layout' },
  { id: 'skills', label: 'Skills' },
  { id: 'finish', label: 'Build' },
];

/** The game draws SkillPage 3 on the left: screen tab n shows tabIndex 3 − n. */
const SCREEN_ORDER = [2, 1, 0];

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

const BTN = 'px-3 py-1.5 rounded border font-cinzel text-[10px] tracking-[0.16em] uppercase transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const BTN_QUIET = `${BTN} border-[#3a1510] bg-[#0c0405] text-[#c8a870] hover:border-[#7a3020] hover:text-[#f0d090]`;
const BTN_PRIMARY = `${BTN} border-[#8b2820] bg-gradient-to-b from-[#5c1010] to-[#380808] text-[#f0c040] hover:from-[#701414]`;

export default function BuilderApp({ catalog }: { catalog: BuilderCatalog }) {
  // The class being edited, and the build's other hand-built classes (a build can
  // hand-build several; they all share spec's seed).
  const [spec, setSpec] = useState<ClassBuild | null>(null);
  const [others, setOthers] = useState<ClassBuild[]>([]);
  const [step, setStep] = useState<Step>('class');
  const [options, setOptions] = useState<ModOptions>(DEFAULT_MOD_OPTIONS);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [layoutTab, setLayoutTab] = useState(2);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<'build' | 'preview' | null>(null);
  // What was last built: the download and install steps only apply while the
  // build and its options are unchanged.
  const [built, setBuilt] = useState<{ code: string; opts: string; modName: string; seed: number } | null>(null);
  const [preview, setPreview] = useState<{ code: string; data: PreviewData } | null>(null);
  const [openCards, setOpenCards] = useState<ReadonlySet<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const stepperRef = useRef<HTMLElement>(null);
  const firstStep = useRef(true);

  // Each step starts at the top of the builder, not wherever the last one was scrolled.
  useEffect(() => {
    if (firstStep.current) { firstStep.current = false; return; }
    if ((stepperRef.current?.getBoundingClientRect().top ?? 0) < 0) {
      stepperRef.current?.scrollIntoView({ block: 'start' });
    }
  }, [step]);

  // --- Lookups ---------------------------------------------------------------
  const treePages = useMemo(
    () => new Map<string, TreePage>(catalog.pages.map(p => [p.key, p])),
    [catalog],
  );
  const pageByKey = useMemo(() => new Map(catalog.pages.map(p => [p.key, p])), [catalog]);
  const skillByName = useMemo(() => new Map(catalog.skills.map(s => [s.skill, s])), [catalog]);

  const pages = spec ? resolvePages(spec, treePages) : null;
  // Slots in reading order (row, then left-to-right on screen) — the order clicks
  // fill empty slots in. Placement order for the mod is orderedSlotKeys'.
  const keys = useMemo(() => {
    if (!pages) return [];
    const pos = (k: string) => k.split('-').map(Number);
    return orderedSlotKeys(pages).sort((a, b) => {
      const [ta, ra, ca] = pos(a), [tb, rb, cb] = pos(b);
      return ra - rb || SCREEN_ORDER.indexOf(ta) - SCREEN_ORDER.indexOf(tb) || ca - cb;
    });
  }, [pages]);
  const placed = useMemo(() => new Set(Object.values(spec?.slots ?? {})), [spec]);
  const placedCount = spec ? Object.keys(spec.slots).length : 0;
  // Every hand-built class, the one being edited first (its issues keep their slots).
  const allSpecs = useMemo(
    () => (spec ? [spec, ...others.map(o => ({ ...o, seed: spec.seed }))] : []),
    [spec, others],
  );
  const takenByOthers = useMemo(() => skillsInBuilds(others), [others]);
  const allPlaced = useMemo(() => skillsInBuilds(allSpecs), [allSpecs]);
  const builtCodes = new Set(allSpecs.map(s => s.classCode));
  // A base-game mod (no Reign of the Warlock) has no Warlock and no Warlock skills.
  const warlockSkills = useMemo(
    () => new Set(catalog.skills.filter(s => s.charclass === 'war').map(s => s.skill)),
    [catalog.skills],
  );
  const baseGameError = baseGameConflict({
    baseGame: options.baseGame,
    warlockInBuild: builtCodes.has('war') || [...allPlaced].some(name => warlockSkills.has(name)),
  });
  const randomCount = (options.baseGame ? CLASS_DEFS.length - 1 : CLASS_DEFS.length) - allSpecs.length;

  const editIssues = useMemo(
    () => (spec ? checkClassBuildSet(allSpecs, catalog.skills, treePages, { requireComplete: false }) : []),
    [spec, allSpecs, catalog.skills, treePages],
  );
  const issuesBySlot = useMemo(() => {
    const m = new Map<string, BuildIssue>();
    for (const i of editIssues) {
      if (i.slot && (!m.has(i.slot) || i.severity === 'error')) m.set(i.slot, i);
    }
    return m;
  }, [editIssues]);
  const errors = editIssues.filter(i => i.severity === 'error');
  const warnings = editIssues.filter(i => i.severity === 'warning');
  const complete = placedCount === SLOTS_PER_CLASS;
  const othersIncomplete = others.filter(o => Object.keys(o.slots).length < SLOTS_PER_CLASS);
  const buildable = !!spec && complete && othersIncomplete.length === 0 && !hasErrors(editIssues) && !baseGameError;

  const code = useMemo(() => {
    if (!spec) return null;
    try {
      return encodeClassBuildSet(allSpecs, catalog.skills, treePages);
    } catch {
      return null;
    }
  }, [spec, allSpecs, catalog.skills, treePages]);
  const optsKey = optionParams(options);
  // The preview depends on the build and on the mutations (No Guard, Mystery Box).
  const previewKey = code ? `${code}|${options.mutations.join('.')}` : null;
  const isBuilt = !!built && built.code === code && built.opts === optsKey;

  // --- Load a shared link -----------------------------------------------------
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shared = params.get('b');
    if (!shared) return;
    try {
      const [first, ...rest] = decodeClassBuildSet(shared, catalog.skills, treePages);
      setSpec(first);
      setOthers(rest);
      setOptions(parseModOptions(params));
      const full = [first, ...rest].every(s => Object.keys(s.slots).length === SLOTS_PER_CLASS);
      setStep(full ? 'finish' : 'skills');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'That build link could not be read.');
    }
  }, [catalog.skills, treePages]);

  // Keep the address bar a live share link, drafts included.
  useEffect(() => {
    if (!code) return;
    window.history.replaceState(null, '', `${window.location.pathname}?${buildShareQuery(code, options)}`);
  }, [code, options]);

  // --- Editing ----------------------------------------------------------------
  const update = useCallback((fn: (s: ClassBuild) => ClassBuild) => {
    setSpec(s => (s ? fn(s) : s));
    setMessage(null);
  }, []);

  /**
   * Edit a class: switch to one already in the build, or start a new one beside
   * the rest. The class being left stays in the build unless nothing was placed on it.
   */
  const pickClass = (classCode: ClassCode) => {
    if (!spec || spec.classCode !== classCode) {
      const kept = spec && placedCount > 0 ? [...others, spec] : others;
      const existing = kept.find(o => o.classCode === classCode);
      const seed = spec?.seed ?? randomSeed();
      setOthers(kept.filter(o => o.classCode !== classCode));
      setSpec(existing ? { ...existing, seed } : emptyBuild(classCode, seed));
      setSelectedKey(null);
      setLayoutTab(2);
      setMessage(null);
      setStep(existing && Object.keys(existing.slots).length === SLOTS_PER_CLASS ? 'finish' : 'layout');
      return;
    }
    setStep('layout');
  };

  /** Take a hand-built class out of the build; it goes back to being randomized. */
  const removeOther = (classCode: ClassCode) => {
    if (!window.confirm(`Remove your ${classNameOf(classCode)} from this build? Its skills go back to the randomized classes.`)) return;
    setOthers(list => list.filter(o => o.classCode !== classCode));
  };

  const setPage = (tabIndex: number, key: string) => {
    const ref = PAGE_REFS.find(r => pageKey(r) === key);
    if (!ref) return;
    update(s => {
      const next = { ...s, pages: s.pages.map((p, i) => (i === tabIndex ? { ...ref } : p)) as ClassBuild['pages'] };
      const nextPages = resolvePages(next, treePages);
      return nextPages ? pruneSlots(next, nextPages) : next;
    });
    setSelectedKey(null);
  };

  const withSlots = (s: ClassBuild, fn: (slots: Record<string, string>) => void): ClassBuild => {
    const slots = { ...s.slots };
    fn(slots);
    return { ...s, slots };
  };

  /** Put a skill in a slot. Anything already there goes back to the palette. */
  const placeAt = (key: string, skill: string) => {
    update(s => withSlots(s, slots => {
      for (const [k, v] of Object.entries(slots)) if (v === skill) delete slots[k];
      slots[key] = skill;
    }));
  };

  /** Move a placed skill to another slot, swapping with whatever is there. */
  const moveSlot = (from: string, to: string) => {
    if (from === to) return;
    update(s => withSlots(s, slots => {
      const a = slots[from], b = slots[to];
      if (b) slots[from] = b; else delete slots[from];
      if (a) slots[to] = a;
    }));
  };

  const removeAt = (key: string) => update(s => withSlots(s, slots => { delete slots[key]; }));

  const nextEmpty = (after: string | null, slots: Record<string, string>) => {
    const start = after ? keys.indexOf(after) + 1 : 0;
    return [...keys.slice(start), ...keys.slice(0, start)].find(k => !slots[k]) ?? null;
  };

  const handlePick = (skill: string) => {
    if (!spec) return;
    const target = selectedKey ?? nextEmpty(null, spec.slots);
    if (!target) {
      setMessage('Every slot is full — select a slot to replace, or remove a skill first.');
      return;
    }
    const wasEmpty = !spec.slots[target];
    placeAt(target, skill);
    // Filling empty slots in a row flows on to the next empty one.
    setSelectedKey(wasEmpty ? nextEmpty(target, { ...spec.slots, [target]: skill }) : null);
  };

  const handleSlotClick = (key: string) => {
    if (!spec) return;
    if (selectedKey === key) return setSelectedKey(null);
    if (selectedKey && spec.slots[selectedKey]) {
      moveSlot(selectedKey, key);
      return setSelectedKey(null);
    }
    setSelectedKey(key);
  };

  const handleDrop = (key: string, payload: DragPayload) => {
    if (payload.from) moveSlot(payload.from, key);
    else placeAt(key, payload.skill);
    setSelectedKey(null);
  };

  // Delete removes the selected skill, Escape clears the selection.
  useEffect(() => {
    if (step !== 'skills') return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') setSelectedKey(null);
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedKey && spec?.slots[selectedKey]) {
        e.preventDefault();
        removeAt(selectedKey);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // --- Build ------------------------------------------------------------------
  const handlePreview = async () => {
    if (!code || !previewKey) return;
    setBusy('preview');
    setMessage(null);
    try {
      const res = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classBuild: code, mutations: options.mutations, baseGame: options.baseGame }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Preview failed.');
      setPreview({ code: previewKey, data });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Preview failed.');
    } finally {
      setBusy(null);
    }
  };

  const handleBuild = async () => {
    if (!code || !buildable) return;
    setBusy('build');
    setMessage(null);
    try {
      const res = await generateMod(buildRandomizeBody(code, options), m => setMessage(m || null));
      setBuilt({
        code,
        opts: optsKey,
        modName: typeof res?.modName === 'string' ? res.modName : '',
        seed: Number(res?.seed ?? spec!.seed),
      });
      setMessage(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Build failed.');
    } finally {
      setBusy(null);
    }
  };

  const handleCopyShare = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  // --- Render -----------------------------------------------------------------
  const stepEnabled = (id: Step) => id === 'class' || !!spec;

  const grids = () => pages && spec && (
    <div className="grid grid-cols-3 gap-2 sm:gap-4">
      {SCREEN_ORDER.map((tabIndex, i) => (
        <BuilderTreeGrid
          key={tabIndex}
          tabIndex={tabIndex}
          screenTab={i + 1}
          page={pageByKey.get(pageKey(spec.pages[tabIndex]))!}
          slots={spec.slots}
          skillByName={skillByName}
          selectedKey={selectedKey}
          issues={issuesBySlot}
          onSlotClick={handleSlotClick}
          onRemove={key => { removeAt(key); if (selectedKey === key) setSelectedKey(null); }}
          onDrop={handleDrop}
        />
      ))}
    </div>
  );

  const theme = spec ? classTheme(spec.classCode) : null;
  const selectedLabel = selectedKey
    ? (() => {
      const [tab, row, col] = selectedKey.split('-').map(Number);
      return `tab ${SCREEN_ORDER.indexOf(tab) + 1}, row ${row}, column ${col}`;
    })()
    : 'the first empty slot';

  return (
    <div className="max-w-6xl mx-auto px-4 pb-16">
      {/* Stepper */}
      <nav ref={stepperRef} aria-label="Builder steps" className="scroll-mt-20 -mx-4 px-4 py-3 mb-6 border-b border-[#3a1510]">
        <ol className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-3">
          {STEPS.map((s, i) => {
            const active = s.id === step;
            return (
              <li key={s.id} className="flex items-center gap-1.5 sm:gap-3">
                {i > 0 && <span aria-hidden="true" className="w-3 sm:w-6 h-px bg-[#3a1510]" />}
                <button
                  type="button"
                  disabled={!stepEnabled(s.id)}
                  onClick={() => setStep(s.id)}
                  aria-current={active ? 'step' : undefined}
                  className={`flex items-center gap-1.5 font-cinzel text-[11px] tracking-[0.16em] uppercase transition-colors disabled:opacity-40 ${
                    active ? 'text-[#f0c040]' : 'text-[#8a7050] hover:text-[#c8a870]'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full border flex items-center justify-center text-[10px] ${
                    active ? 'border-[#f0c040]' : 'border-[#5a4020]'
                  }`}>{i + 1}</span>
                  {s.label}
                  {s.id === 'class' && spec && (
                    <span className="normal-case tracking-normal text-[10px]" style={{ color: theme!.frame }}>
                      · {classNameOf(spec.classCode)}{others.length > 0 ? ` +${others.length}` : ''}
                    </span>
                  )}
                  {s.id === 'skills' && spec && (
                    <span className={`tracking-normal text-[10px] ${complete ? 'text-[#78c078]' : 'text-[#8a7050]'}`}>
                      {placedCount}/{SLOTS_PER_CLASS}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
        {message && <p role="status" className="text-center text-[#e08080] text-xs mt-2">{message}</p>}
      </nav>

      {/* Game version: on every step, since it decides which classes and skills you can use. */}
      <div className="-mt-2 mb-6">
        <RotwSwitch
          id="b-rotw"
          baseGame={options.baseGame}
          onChange={on => setOptions(o => withBaseGame(o, on))}
          offNote={baseGameError ?? 'Base-game mod: play a non-expansion character. No Warlock or Warlock skills, Open Acts or mutations.'}
        />
      </div>

      {/* 1. Class */}
      {step === 'class' && (
        <section aria-labelledby="step-class">
          <h2 id="step-class" className="sr-only">Choose a class</h2>
          <p className="text-center text-sm text-[#a89060]/80 mb-5">
            Pick the class you&rsquo;ll play. You design its three skill trees, and every class you don&rsquo;t
            build is randomized from the skills you leave behind.
          </p>
          <p className="text-center text-[11px] text-[#8a7a5a] -mt-3 mb-5">
            Playing with friends? Build as many classes as you like, even all eight. Each skill can only be on one class.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {CLASS_DEFS.map(def => {
              const t = classTheme(def.code);
              const current = spec?.classCode === def.code;
              const other = others.find(o => o.classCode === def.code);
              const inBuild = current || !!other;
              const needsExpansion = options.baseGame && def.code === 'war' && !inBuild;
              return (
                <button
                  key={def.code}
                  type="button"
                  onClick={() => pickClass(def.code)}
                  disabled={needsExpansion}
                  aria-pressed={current}
                  style={{ borderColor: current ? '#f0c040' : t.frame, borderStyle: inBuild ? 'solid' : 'dashed' }}
                  className="rounded-lg border-2 bg-[#0c0304] px-3 py-5 text-center hover:bg-[#1a0808] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="block font-cinzel font-bold tracking-[0.14em] uppercase text-sm" style={{ color: t.frame }}>
                    {def.name}
                  </span>
                  <span className="block mt-1 text-[10px] text-[#7a6a4a]">
                    {needsExpansion ? 'Needs Reign of the Warlock'
                      : current ? `Editing · ${placedCount}/${SLOTS_PER_CLASS} placed`
                      : other ? `In this build · ${Object.keys(other.slots).length}/${SLOTS_PER_CLASS}`
                        : spec ? 'Add to this build' : 'Start building'}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* 2. Layout */}
      {step === 'layout' && spec && (
        <section aria-labelledby="step-layout" className="space-y-5">
          <div className="text-center">
            <h2 id="step-layout" className="font-cinzel font-bold text-sm tracking-[0.18em] uppercase text-[#c8942a]">
              Choose each tab&rsquo;s layout
            </h2>
            <p className="text-[11px] text-[#8a7a5a] mt-1 max-w-2xl mx-auto">
              Every tab uses one of the 24 vanilla tree pages — its socket positions, artwork and prerequisite
              arrows. Any page can go on any tab, and a page can be used more than once.
            </p>
          </div>

          <div role="tablist" aria-label="Tab to edit" className="grid grid-cols-3 gap-2 max-w-xl mx-auto">
            {SCREEN_ORDER.map((tabIndex, i) => {
              const page = pageByKey.get(pageKey(spec.pages[tabIndex]))!;
              const active = layoutTab === tabIndex;
              return (
                <button
                  key={tabIndex}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setLayoutTab(tabIndex)}
                  className={`rounded border px-2 py-2 flex flex-col items-center gap-1.5 transition-colors ${
                    active ? 'border-[#f0c040] bg-[#1a1006]' : 'border-[#3a1510] bg-[#0c0405] hover:border-[#7a3020]'
                  }`}
                >
                  <span className="font-cinzel text-[10px] tracking-[0.18em] uppercase text-[#c8942a]">Tab {i + 1}</span>
                  <MiniLayout page={page} size="md" />
                  <span className="text-[10px] text-[#a89060] text-center leading-tight">
                    {classNameOf(page.classCode)}<br />{page.label}
                  </span>
                </button>
              );
            })}
          </div>

          <PagePicker
            pages={catalog.pages}
            value={pageKey(spec.pages[layoutTab])}
            onPick={key => setPage(layoutTab, key)}
          />

          {placedCount > 0 && (
            <p className="text-center text-[10px] text-[#7a6a4a]">
              Changing a page keeps skills on sockets that still exist; the rest go back to the skill list.
            </p>
          )}

          <div className="flex justify-center gap-2">
            <button type="button" className={BTN_QUIET} onClick={() => setStep('class')}>Back</button>
            <button type="button" className={BTN_PRIMARY} onClick={() => setStep('skills')}>Next: place skills</button>
          </div>
        </section>
      )}

      {/* 3. Skills */}
      {step === 'skills' && spec && (
        <section aria-labelledby="step-skills" className="space-y-4">
          <h2 id="step-skills" className="sr-only">Place skills</h2>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button type="button" className={BTN_QUIET} disabled={complete}
              onClick={() => { update(s => fillEmptySlots(s, catalog.skills, treePages, randomSeed(),
                options.baseGame ? new Set([...takenByOthers, ...warlockSkills]) : takenByOthers)); setSelectedKey(null); }}>
              Fill empty slots
            </button>
            <button type="button" className={BTN_QUIET} disabled={placedCount === 0}
              onClick={() => {
                if (window.confirm('Remove every skill from this class?')) { update(s => ({ ...s, slots: {} })); setSelectedKey(null); }
              }}>
              Clear all
            </button>
            <button type="button" className={BTN_PRIMARY} onClick={() => setStep('finish')}>Next: build</button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-5 items-start">
            <div className="rounded-lg border border-[#3a1510] bg-[#0c0304] p-3 space-y-3">
              {grids()}
              <p className="text-[10px] text-[#7a6a4a] leading-relaxed">
                Select a slot and pick a skill, or drag skills onto slots. Select a placed skill and click another
                slot to move or swap it; drag it back to the list (or press Delete) to remove it. The row sets the
                required level — a skill in row 1 is available at level 1.
              </p>
            </div>
            <SkillPalette
              skills={catalog.skills}
              classCode={spec.classCode}
              placed={placed}
              taken={takenByOthers}
              targetLabel={selectedLabel}
              onPick={handlePick}
              onReturn={key => { removeAt(key); setSelectedKey(null); }}
            />
          </div>

          <IssueList errors={errors} warnings={warnings} />
          {baseGameError && (
            <p className="text-center text-[11px] text-[#e0a060]">{baseGameError}</p>
          )}
        </section>
      )}

      {/* 4. Build */}
      {step === 'finish' && spec && (
        <section aria-labelledby="step-finish" className="space-y-5">
          <h2 id="step-finish" className="sr-only">Build the mod</h2>
          <div className="rounded-lg border border-[#3a1510] bg-[#0c0304] p-3">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="font-cinzel text-[11px] tracking-[0.18em] uppercase" style={{ color: theme!.frame }}>
                Your {classNameOf(spec.classCode)}
              </span>
              <span className="flex gap-2">
                <button type="button" className={BTN_QUIET} onClick={() => setStep('skills')}>Edit skills</button>
                {randomCount > 0 && (
                  <button type="button" className={BTN_QUIET} onClick={() => setStep('class')}>Build another class</button>
                )}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
                {SCREEN_ORDER.map((tabIndex, i) => (
                  <BuilderTreeGrid
                    key={tabIndex}
                    tabIndex={tabIndex}
                    screenTab={i + 1}
                    page={pageByKey.get(pageKey(spec.pages[tabIndex]))!}
                    slots={spec.slots}
                    skillByName={skillByName}
                    issues={issuesBySlot}
                    onSlotClick={key => { setSelectedKey(key); setStep('skills'); }}
                    onRemove={removeAt}
                    onDrop={handleDrop}
                  />
                ))}
            </div>
          </div>

          {others.length > 0 && (
            <div className="rounded-lg border border-[#3a1510] bg-[#0c0304] p-3 space-y-2">
              <h3 className="font-cinzel font-bold text-[11px] tracking-[0.18em] uppercase text-[#c8942a]">
                Also hand-built in this mod
              </h3>
              <ul className="space-y-1.5">
                {others.map(o => {
                  const n = Object.keys(o.slots).length;
                  return (
                    <li key={o.classCode} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[12px]" style={{ color: classTheme(o.classCode).frame }}>
                        {classNameOf(o.classCode)}{' '}
                        <span className={`text-[10px] ${n === SLOTS_PER_CLASS ? 'text-[#78c078]' : 'text-[#e0a060]'}`}>{n}/{SLOTS_PER_CLASS}</span>
                      </span>
                      <span className="flex gap-2">
                        <button type="button" className={BTN_QUIET} onClick={() => pickClass(o.classCode)}>Edit</button>
                        <button type="button" className={BTN_QUIET} onClick={() => removeOther(o.classCode)}>Remove</button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {othersIncomplete.length > 0 && (
            <p className="text-center text-[11px] text-[#e0a060]">
              Finish {othersIncomplete.map(o => classNameOf(o.classCode)).join(' and ')} before building: every slot needs a skill.
            </p>
          )}
          {!complete && (
            <p className="text-center text-[11px] text-[#e0a060]">
              {SLOTS_PER_CLASS - placedCount} slot{SLOTS_PER_CLASS - placedCount === 1 ? ' is' : 's are'} still
              empty. Fill them on the Skills step (or use &ldquo;Fill empty slots&rdquo;) before building.
            </p>
          )}
          <IssueList errors={errors} warnings={warnings} />

          {randomCount > 0 && (
          <div className="rounded-lg border border-[#3a1510] bg-[#0c0304] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-cinzel font-bold text-[11px] tracking-[0.18em] uppercase text-[#c8942a]">
                  {randomCount === 7 ? 'The other seven classes' : `The other ${randomCount} class${randomCount === 1 ? '' : 'es'}`}
                </h3>
                <p className="text-[10px] text-[#7a6a4a] mt-0.5">
                  Randomized from the skills you didn&rsquo;t take (roll #{spec.seed}). Class-locked skills you left
                  out are swapped for stand-ins on another class, like in a normal seed.
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" className={BTN_QUIET}
                  onClick={() => { update(s => ({ ...s, seed: randomSeed() })); setPreview(null); }}>
                  Reroll
                </button>
                <button type="button" className={BTN_QUIET} disabled={!buildable || busy !== null} onClick={handlePreview}>
                  {busy === 'preview' ? 'Loading…' : preview?.code === previewKey ? 'Refresh preview' : 'Preview'}
                </button>
              </div>
            </div>
            {preview && preview.code === previewKey && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                {preview.data.classes.filter(c => !builtCodes.has(c.code)).map(cls => (
                  <ClassTreeCard
                    key={cls.code}
                    code={cls.code}
                    name={cls.name}
                    tabs={cls.tabs}
                    masked={preview.data.masked}
                    expanded={openCards.has(cls.code)}
                    onToggleExpanded={() => setOpenCards(prev => {
                      const next = new Set(prev);
                      if (!next.delete(cls.code)) next.add(cls.code);
                      return next;
                    })}
                  />
                ))}
              </div>
            )}
          </div>
          )}

          <BuildOptionsPanel value={options} onChange={setOptions} buildSkills={allPlaced} />

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              className={`${BTN_PRIMARY} px-6 py-2 text-[11px]`}
              disabled={!buildable || busy !== null || isBuilt}
              onClick={handleBuild}
              title={!buildable ? 'Fill every slot and fix the problems above first.' : undefined}
            >
              {busy === 'build' ? 'Building…' : isBuilt ? 'Built' : 'Build mod'}
            </button>
            {isBuilt && code && (
              <a
                href={`/api/download?${buildDownloadQuery(code, options)}`}
                className={`${BTN} px-6 py-2 text-[11px] border-[#283878] bg-gradient-to-b from-[#1c2a5c] to-[#101838] text-[#c8d8f8] hover:from-[#243472]`}
              >
                Download zip
              </a>
            )}
            <button type="button" className={BTN_QUIET} disabled={!code} onClick={handleCopyShare}>
              {copied ? 'Link copied!' : 'Copy share link'}
            </button>
          </div>

          {isBuilt && built && (
            <div className="rounded-lg border border-[#3a1510] bg-[#0c0304] p-4">
              <h3 className="font-cinzel font-bold text-[11px] tracking-[0.18em] uppercase text-[#c8942a] mb-3">Install</h3>
              <InstallInstructions seed={built.seed} raceMode={false} baseGame={options.baseGame} modName={built.modName || undefined} openActs={options.openActs} mutations={options.mutations} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function IssueList({ errors, warnings }: { errors: BuildIssue[]; warnings: BuildIssue[] }) {
  if (errors.length === 0 && warnings.length === 0) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {errors.length > 0 && (
        <div className="rounded-lg border border-[#7a3020] bg-[#160607] p-3">
          <h3 className="font-cinzel text-[10px] tracking-[0.2em] uppercase text-[#e08040] mb-1.5">Fix before building</h3>
          <ul className="space-y-1">
            {errors.map((e, i) => <li key={i} className="text-[11px] text-[#c8a870]">• {e.message}</li>)}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-lg border border-[#5a4a18] bg-[#0c0405] p-3">
          <h3 className="font-cinzel text-[10px] tracking-[0.2em] uppercase text-[#c8a840] mb-1.5">Builds, but won&rsquo;t work</h3>
          <ul className="space-y-1">
            {warnings.map((w, i) => <li key={i} className="text-[11px] text-[#a89060]">• {w.message}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

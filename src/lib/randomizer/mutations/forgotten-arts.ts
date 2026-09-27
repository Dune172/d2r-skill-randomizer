/** Inventory spellbooks. Applied after skill-ID remapping, never before it. */
type Table = { headers: string[]; rows: string[][] };

// Spells, Necromancer/Warlock summons and their masteries. No class-gated
// attacks, channels, forms, traps or skill-copying shadows.
// Capped at 42: every spell adds two frames to the one shared HD icon sheet,
// and D2R cannot load a sprite wider than 16384px (40 + 42*2 frames * 132px).
export const BOOK_SPELLS = [
  'Fire Bolt', 'Ice Bolt', 'Charged Bolt', 'Ice Blast', 'Frost Nova',
  'Static Field', 'Fire Ball', 'Lightning', 'Nova',
  'Glacial Spike', 'Fire Wall', 'Teleport', 'Chain Lightning', 'Meteor',
  'Blizzard', 'Frozen Orb', 'Teeth', 'Corpse Explosion',
  'Bone Spear', 'Bone Spirit', 'Poison Nova', 'Amplify Damage',
  'Life Tap', 'Decrepify',
  'Lower Resist', 'Holy Bolt', 'Blessed Hammer', 'Fist of the Heavens',
  'Raise Skeleton', 'Skeleton Mastery', 'Raise Skeletal Mage', 'Clay Golem',
  'Golem Mastery', 'BloodGolem', 'IronGolem', 'FireGolem', 'Summon Resist', 'Revive',
  'Summon Goatman', 'Summon Tainted', 'Summon Defiler', 'Demonic Mastery',
] as const;

export const EARLY_BOOK_SPELLS = ['Fire Bolt', 'Ice Bolt', 'Charged Bolt', 'Teeth', 'Raise Skeleton', 'Holy Bolt'] as const;
export const AKARA_SPELLS = ['Fire Bolt', 'Ice Bolt', 'Charged Bolt', 'Holy Bolt'] as const;
export const AKARA_SHOP_WEIGHTS = {
  'Fire Bolt': 8, 'Ice Bolt': 8, 'Charged Bolt': 1,
  'Teeth': 1, 'Raise Skeleton': 8, 'Holy Bolt': 8,
} as const;
export const SPELL_SHOP_ACTS = [
  { act: 1, code: 'fs6', vendors: ['Akara'], maxSpellTier: 6 },
  { act: 2, code: 'f02', vendors: ['Lysander', 'Drognan'], maxSpellTier: 12 },
  { act: 3, code: 'f03', vendors: ['Alkor', 'Ormus'], maxSpellTier: 18 },
  { act: 4, code: 'f04', vendors: ['Jamella'], maxSpellTier: 24 },
  { act: 5, code: 'f05', vendors: ['Malah'], maxSpellTier: 30 },
] as const;

export function spellShopPrice(skill: string, tier: number): number {
  if (['Fire Bolt', 'Ice Bolt', 'Holy Bolt', 'Raise Skeleton'].includes(skill)) return 7500;
  if (['Charged Bolt', 'Teeth'].includes(skill)) return 12500;
  const price = tier <= 1 ? 7500 : tier <= 6 ? 12500 : tier <= 12 ? 20000
    : tier <= 18 ? 30000 : tier <= 24 ? 45000 : 60000;
  // These spells have unusually strong utility or scaling for their native tier.
  return ['Static Field', 'Corpse Explosion', 'Teleport', 'Blessed Hammer'].includes(skill)
    ? Math.min(60000, price * 1.5) : price;
}

export const SPELL_EXPLORATION_REWARDS = ['Corpsefire', 'Boneash', 'Griswold'] as const;

export const FORGOTTEN_ARTS_EQUIPMENT = {
  bonuses: [
    { level: 1, maxlevel: 34, min: 1, max: 2 },
    { level: 35, maxlevel: 59, min: 2, max: 4 },
    { level: 60, maxlevel: 0, min: 4, max: 6 },
  ],
  charges: { maxSkillLevel: 20, levelsPerItemLevels: 4, baseCharges: 40 },
} as const;

// First-clear tuning assumption, not a measured route or a guaranteed reward.
// Count granted levels across all carried spells, including the starting scroll.
export const FORGOTTEN_ARTS_PROGRESSION = {
  act1: {
    targetTotalSkillLevels: [13, 17],
    startingSkillLevels: 1,
    ordinaryKillsPerScroll: 90,
    assumedOrdinaryKills: [630, 990],
    referenceOrdinaryKills: 810,
    encounterSkillLevels: 3,
    assumedPurchasedSkillLevels: 1,
    assumedContainerSkillLevels: 1,
  },
} as const;

// Carried levels stack without a cap and common scrolls are plentiful, so a
// synergy keeps only this percentage of its native per-level rate, set by the
// source spell's rarity tier (its original required level).
export const FORGOTTEN_ARTS_SYNERGY_KEEP: Readonly<Record<number, number>> = {
  1: 20, 6: 26, 12: 32, 18: 38, 24: 44, 30: 50,
};

export interface ForgottenArtsContext {
  skills: Table;
  skilldesc: Table;
  vanillaSkills: Table;
  vanillaSkilldesc: Table;
  charstats: Table;
  uniqueitems: Table;
  treasureclass: Table;
  itemtypes: Table;
  misc: Table;
  itemstatcost: Table;
  cubemain: Table;
  objects: Table;
  superuniques: Table;
  equipmentProperties: Table[];
  displayNames: ReadonlyMap<string, string>;
  iconCels: ReadonlyMap<string, number>;
}

export interface SpellBook {
  key: string;
  name: string;
  skill: string;
  skillId: number;
  code: string;
  requiredLevel: number;
  dropLevel: number;
  bonus: number;
  source: 'drop' | 'shop' | 'craft';
  shopBaseCost?: number;
  legacyCode?: string;
  shopWeight?: number;
  shopAct?: number;
}

/** Read only actual hard-point synergy references, not arbitrary skill lookups. */
export function buildSpellSynergyDescriptions(skills: Table, displayNames: ReadonlyMap<string, string>) {
  const catalogue = new Set<string>(BOOK_SPELLS);
  const receives = new Map(BOOK_SPELLS.map(skill => {
    const row = skills.rows.find(r => r[0] === skill);
    if (!row) throw new Error(`Missing synergy source: ${skill}`);
    const sources = new Set(row.flatMap(cell => Array.from(cell.matchAll(/skill\('([^']+)'\.blvl\)/g), m => m[1])));
    return [skill, BOOK_SPELLS.filter(name => sources.has(name) && catalogue.has(name))] as const;
  }));
  return BOOK_SPELLS.map(skill => {
    const strengthenedBy = receives.get(skill)!;
    const lines = ['Synergies:', ...(strengthenedBy.length
      ? strengthenedBy.map(name => displayNames.get(name) ?? name) : ['None'])];
    // Item stat descriptions render multiline strings from bottom to top.
    return { skill, strengthenedBy, text: lines.reverse().join('\n') };
  });
}

/** Cosmetic stats keep descriptions out of ground labels and saved item names. */
export function addSpellSynergyTooltips(
  ctx: Pick<ForgottenArtsContext, 'itemstatcost' | 'uniqueitems' | 'cubemain' | 'vanillaSkills' | 'displayNames'> & { properties: Table },
  books: readonly SpellBook[],
) {
  const descriptions = buildSpellSynergyDescriptions(ctx.vanillaSkills, ctx.displayNames);
  const nextStatId = ctx.itemstatcost.rows.length;
  if (nextStatId + descriptions.length >= 511) throw new Error('Not enough saved stat IDs for spell descriptions');
  return descriptions.map((description, index) => {
    const stat = `fa_synergy_${index}`, property = `fa-synergy-${index}`, key = `D2RR_FA_Synergy_${index}`;
    if (ctx.itemstatcost.rows.some(r => r[0] === stat) || ctx.properties.rows.some(r => r[0] === property)) throw new Error('Duplicate spell description stat');
    append(ctx.itemstatcost, {
      Stat: stat, '*ID': String(nextStatId + index), 'Send Bits': '1', 'Save Bits': '1',
      'Save Add': '0', Add: '0', Multiply: '0', descpriority: '1', descfunc: '19', descval: '0',
      descstrpos: key, descstrneg: key, '*eol': '0',
    });
    append(ctx.properties, { code: property, '*Id': String(ctx.properties.rows.length), '*Enabled': '1', func1: '1', stat1: stat, '*eol': '0' });
    for (const book of books.filter(b => b.skill === description.skill)) {
      const unique = ctx.uniqueitems.rows.find(r => r[0] === book.key)!;
      if (get(ctx.uniqueitems, unique, 'prop3')) throw new Error(`Occupied tooltip property: ${book.key}`);
      for (const [field, value] of Object.entries({ prop3: property, min3: '1', max3: '1' })) set(ctx.uniqueitems, unique, field, value);
      // Recreate this exact spell variant; its skill bonus, art and valuation stay unchanged.
      append(ctx.cubemain, {
        description: `Forgotten Arts: refresh description ${book.key}`, enabled: '1', version: '100',
        numinputs: '1', 'input 1': book.key, output: book.key, lvl: String(book.dropLevel), '*eol': '0',
      });
    }
    return { ...description, key, stat, property };
  });
}

const get = (table: Table, row: string[], column: string) => row[table.headers.indexOf(column)] ?? '';
function set(table: Table, row: string[], column: string, value: string) {
  const index = table.headers.indexOf(column);
  if (index < 0) throw new Error(`Forgotten Arts: missing column ${column}`);
  row[index] = value;
}
/** Rarity tier of a catalogue spell: its original required level. */
function spellTier(vanillaSkills: Table, name: string) {
  const row = vanillaSkills.rows.find(r => r[0] === name);
  if (!row) throw new Error(`Forgotten Arts: missing original spell ${name}`);
  return Number(get(vanillaSkills, row, 'reqlevel')) || 1;
}
export function synergyKeep(vanillaSkills: Table, name: string) {
  const keep = FORGOTTEN_ARTS_SYNERGY_KEEP[spellTier(vanillaSkills, name)];
  if (keep === undefined) throw new Error(`Forgotten Arts: no synergy rate for ${name}'s tier`);
  return keep;
}
/** Masteries work while carried or equipped; charges could never cast them. */
export function isPassiveSpell(vanillaSkills: Table, name: string) {
  const row = vanillaSkills.rows.find(r => r[0] === name);
  return !!row && get(vanillaSkills, row, 'passive') === '1';
}
function append(table: Table, values: Record<string, string>) {
  const row = new Array<string>(table.headers.length).fill('');
  for (const [column, value] of Object.entries(values)) set(table, row, column, value);
  table.rows.push(row);
  return row;
}

/** All parameters here are final physical skill rows, after the seed remap. */
function addSpellEquipment(ctx: ForgottenArtsContext) {
  const [prefixes, suffixes] = ctx.equipmentProperties;
  if (!prefixes || !suffixes) throw new Error('Forgotten Arts: missing equipment affix tables');
  const ids = new Map(BOOK_SPELLS.map(name => [name, ctx.skills.rows.findIndex(r => r[0] === name)]));
  const originalTier = (name: string) => spellTier(ctx.vanillaSkills, name);
  const grantCodes = new Set(['skill', 'oskill', 'skilltab', 'skilltab-war',
    'ama', 'sor', 'nec', 'pal', 'bar', 'dru', 'ass', 'war', 'randclassskill', 'skill-rand']);
  const selectSpell = (param: string, salt: number, tier: number, charged: boolean) => {
    const castable = (name: string) => !charged || !isPassiveSpell(ctx.vanillaSkills, name);
    const referenced = /^\d+$/.test(param) ? ctx.skills.rows[Number(param)]?.[0] : param;
    if (ids.has(referenced as typeof BOOK_SPELLS[number]) && castable(referenced!)) return referenced as typeof BOOK_SPELLS[number];
    const eligible = BOOK_SPELLS.filter(name => originalTier(name) <= Math.max(1, tier) && castable(name));
    return eligible[salt % eligible.length];
  };
  // Unique equipment keeps its other properties. Dead class/tree bonuses
  // become specific catalogue spells; existing +All Skills remains useful.
  for (const [rowIndex, row] of ctx.uniqueitems.rows.entries()) {
    const tier = Number(get(ctx.uniqueitems, row, 'lvl')) || 1;
    for (let slot = 1; slot <= 12; slot++) {
      const code = get(ctx.uniqueitems, row, `prop${slot}`);
      if (!grantCodes.has(code) && code !== 'charged') continue;
      const param = get(ctx.uniqueitems, row, `par${slot}`);
      const name = selectSpell(code === 'skill' || code === 'oskill' || code === 'charged' ? param : '', rowIndex + slot, tier, code === 'charged');
      set(ctx.uniqueitems, row, `par${slot}`, String(ids.get(name)));
      if (code === 'charged') {
        // Native PropertyFunc19: (ilvl - reqlevel) / 4 + 1, capped at maxlvl.
        set(ctx.uniqueitems, row, `max${slot}`, '0');
      } else {
        const band = FORGOTTEN_ARTS_EQUIPMENT.bonuses.find(b => !b.maxlevel || tier <= b.maxlevel)!;
        set(ctx.uniqueitems, row, `prop${slot}`, 'oskill');
        set(ctx.uniqueitems, row, `min${slot}`, String(band.min));
        set(ctx.uniqueitems, row, `max${slot}`, String(band.max));
      }
    }
  }
  // Keep original row positions for saved affix IDs. Disable obsolete grants
  // and charges instead of letting class-specific names describe other spells.
  for (const table of [prefixes, suffixes]) for (const row of table.rows) {
    if ([1, 2, 3].some(slot => grantCodes.has(get(table, row, `mod${slot}code`))
      || get(table, row, `mod${slot}code`) === 'charged')) set(table, row, 'spawnable', '0');
  }
  const group = Math.max(...[prefixes, suffixes].flatMap(t => t.rows.map(r => Number(get(t, r, 'group')) || 0))) + 1;
  for (const name of BOOK_SPELLS) {
    const id = ids.get(name)!;
    const tier = originalTier(name);
    const common = {
      version: '100', spawnable: '1', rare: '1', frequency: '1',
      itype1: 'weap', itype2: 'armo', itype3: 'amul', itype4: 'ring',
      multiply: '0', add: '0',
    };
    for (const band of FORGOTTEN_ARTS_EQUIPMENT.bonuses) {
      const level = Math.max(band.level, tier);
      append(prefixes, {
        ...common, Name: `D2RR_FA_Power_${id}`, group: String(group),
        level: String(level), maxlevel: String(band.maxlevel), levelreq: String(Math.max(7, Math.floor(level * 0.75))),
        mod1code: 'oskill', mod1param: String(id), mod1min: String(band.min), mod1max: String(band.max),
      });
    }
    if (isPassiveSpell(ctx.vanillaSkills, name)) continue;
    append(suffixes, {
      ...common, Name: `D2RR_FA_Charges_${id}`, group: String(group + 1),
      level: String(tier), levelreq: String(Math.max(1, Math.floor(tier * 0.75))),
      mod1code: 'charged', mod1param: String(id),
      mod1min: String(FORGOTTEN_ARTS_EQUIPMENT.charges.baseCharges), mod1max: '0',
    });
  }
}

function boostActOneScrollDrops(table: Table) {
  const scale = FORGOTTEN_ARTS_PROGRESSION.act1.ordinaryKillsPerScroll;
  for (const row of table.rows) {
    // Normal melee/caster/ranged monsters and early quill beasts. Wraiths
    // already exceed this rate. Leave bosses, chests and later acts alone.
    if (!/^(Act 1 (H2H|Cast|Miss) [ABC]|Quill [1-4])$/.test(row[0])) continue;
    const noDrop = Number(get(table, row, 'NoDrop'));
    let total = noDrop;
    let goodWeight = 0;
    let slot = 0;
    for (let n = 1; n <= 10; n++) {
      const item = get(table, row, `Item${n}`);
      const weight = Number(get(table, row, `Prob${n}`)) || 0;
      total += weight;
      if (item === 'Act 1 Good') goodWeight += weight;
      if (!slot && !item) slot = n;
    }
    // Half the existing Good roll already yields a scroll. Add only the
    // shortfall to reach the target, taking it from NoDrop. Scaling to integer
    // weights preserves every existing item's absolute base-player chance.
    const extraWeight = total - goodWeight * scale / 2;
    if (!slot || get(table, row, 'Picks') !== '1'
      || extraWeight <= 0 || extraWeight > noDrop * scale) {
      throw new Error(`Forgotten Arts: cannot tune Act I drops in ${row[0]}`);
    }
    for (let n = 1; n <= 10; n++) {
      if (get(table, row, `Item${n}`)) {
        set(table, row, `Prob${n}`, String((Number(get(table, row, `Prob${n}`)) || 0) * scale));
      }
    }
    set(table, row, 'NoDrop', String(noDrop * scale - extraWeight));
    set(table, row, `Item${slot}`, 'D2RR_FA_Act 1 Good');
    set(table, row, `Prob${slot}`, String(extraWeight));
  }
}

function addConsolidationAndShop(ctx: ForgottenArtsContext, books: SpellBook[]) {
  const shopBases: string[][] = [];
  for (const skill of BOOK_SPELLS) {
    const scroll = books.find(b => b.skill === skill && b.bonus === 1)!;
    const book = books.find(b => b.skill === skill && b.bonus === 3)!;
    const variants = [scroll];
    if ((AKARA_SPELLS as readonly string[]).includes(skill)) {
      const shopIndex = AKARA_SPELLS.indexOf(skill as typeof AKARA_SPELLS[number]);
      const code = `fs${shopIndex}`;
      const legacyCode = `fa${shopIndex.toString().padStart(2, '0')}`;
      if (ctx.misc.rows.some(r => get(ctx.misc, r, 'code') === code)) throw new Error(`Forgotten Arts: duplicate item code ${code}`);
      const base = ctx.misc.rows.find(r => get(ctx.misc, r, 'code') === 'cm1');
      if (!base) throw new Error('Forgotten Arts: missing small charm base');
      const item = [...base];
      shopBases.push(item);
      const key = `${scroll.key}_Akara`;
      // A dedicated base with one eligible unique makes vendor stock a named
      // spell. Never expose generic charm bases or advanced drop tiers to shops.
      const values: Record<string, string> = {
        name: key, code, namestr: key, level: '1', levelreq: '0', unique: '1',
        rarity: '0', spawnable: '1', cost: '7500', 'gamble cost': '0',
        invfile: 'invrsc', flippyfile: 'flprsc', alternategfx: 'rsc',
        bitfield1: '1', PermStoreItem: '0', multibuy: '0',
        AkaraMin: '1', AkaraMax: '1', AkaraMagicMin: '1', AkaraMagicMax: '1', AkaraMagicLvl: '25',
      };
      for (const [column, value] of Object.entries(values)) set(ctx.misc, item, column, value);
      // Four-character codes load as items but cannot resolve HD artwork.
      // Retain their base rows for saved purchases, without stocking them.
      const legacy = [...item];
      for (const [column, value] of Object.entries({ code: legacyCode, spawnable: '0',
        PermStoreItem: '0', multibuy: '0', AkaraMin: '0', AkaraMax: '0', AkaraMagicMin: '0', AkaraMagicMax: '0' })) {
        set(ctx.misc, legacy, column, value);
      }
      ctx.misc.rows.push(legacy);
      const unique = [...ctx.uniqueitems.rows.find(r => r[0] === scroll.key)!];
      ctx.uniqueitems.rows.push(unique);
      for (const [column, value] of Object.entries({ index: key, code, lvl: '1', 'cost mult': '0', 'cost add': '0' })) {
        set(ctx.uniqueitems, unique, column, value);
      }
      const shop: SpellBook = { ...scroll, key, code, legacyCode, source: 'shop', shopBaseCost: 7500 };
      books.push(shop);
      variants.push(shop);
      // Keep the unique row IDs unchanged. A saved legacy base still carries
      // its spell; cubing it alone replaces only the base with the visible one.
      // Each legacy base was exclusive to one spell, so this cannot reroll it.
      append(ctx.cubemain, {
        description: `Forgotten Arts: repair legacy ${legacyCode} shop scroll icon`,
        enabled: '1', version: '100', numinputs: '1',
        'input 1': `"${legacyCode},uni"`, output: key, lvl: '1', '*eol': '0',
      });
    }

    const recipe = (inputs: { item: SpellBook; quantity: number }[], output: SpellBook) => {
      const values: Record<string, string> = {
        description: `Forgotten Arts: ${inputs.map(i => `${i.quantity} ${i.item.key}`).join(' + ')} -> ${output.key}`,
        enabled: '1', version: '100', numinputs: '3', output: output.key,
        lvl: String(Math.max(1, output.dropLevel)), '*eol': '0',
      };
      inputs.forEach(({ item, quantity }, i) => {
        // Name lookup enforces unique identity, not merely a shared charm base.
        values[`input ${i + 1}`] = quantity === 1 ? item.key : `"${item.key},qty=${quantity}"`;
      });
      append(ctx.cubemain, values);
    };
    recipe([{ item: scroll, quantity: 3 }], book);
    if (variants.length === 2) {
      for (let bought = 1; bought <= 3; bought++) {
        recipe([
          ...(bought < 3 ? [{ item: scroll, quantity: 3 - bought }] : []),
          { item: variants[1], quantity: bought },
        ], book);
      }
    }
    let previous = book;
    for (const [kind, bonus] of [['Grimoire', 9], ['Codex', 27]] as const) {
      const key = `D2RR_FA_${book.skillId}_${kind}`;
      const unique = [...ctx.uniqueitems.rows.find(r => r[0] === book.key)!];
      ctx.uniqueitems.rows.push(unique);
      for (const [column, value] of Object.entries({ index: key, spawnable: '0', min1: String(bonus), max1: String(bonus), 'cost add': String(2000 * (bonus - 3)) })) {
        set(ctx.uniqueitems, unique, column, value);
      }
      const crafted: SpellBook = { ...book, key, name: book.name.replace(/^Book/, kind), bonus, source: 'craft' };
      books.push(crafted);
      recipe([{ item: previous, quantity: 3 }], crafted);
      previous = crafted;
    }
  }
  ctx.misc.rows.push(...shopBases);
}

/** Run after the staff is appended, keeping every existing saved unique ID. */
export function configureForgottenArtsShop(
  ctx: Pick<ForgottenArtsContext, 'misc' | 'uniqueitems' | 'cubemain'>,
  books: SpellBook[],
): void {
  const template = books.find(b => b.source === 'shop')!;
  const templateBase = ctx.misc.rows.find(r => get(ctx.misc, r, 'code') === template.code)!;
  for (const [i, skill] of ['Teeth', 'Raise Skeleton'].entries()) {
    const scroll = books.find(b => b.skill === skill && b.source === 'drop' && b.bonus === 1)!;
    const tome = books.find(b => b.skill === skill && b.source === 'drop' && b.bonus === 3)!;
    const code = `fs${i + 4}`, key = `${scroll.key}_Akara`;
    if (ctx.misc.rows.some(r => get(ctx.misc, r, 'code') === code)) throw new Error(`Duplicate shop code ${code}`);
    const base = [...templateBase];
    for (const [field, value] of Object.entries({ code, name: key, namestr: key })) set(ctx.misc, base, field, value);
    ctx.misc.rows.push(base);
    const unique = [...ctx.uniqueitems.rows.find(r => r[0] === template.key)!];
    for (const [field, value] of Object.entries({ index: key, code, par1: String(scroll.skillId) })) set(ctx.uniqueitems, unique, field, value);
    ctx.uniqueitems.rows.push(unique);
    books.push({ ...scroll, key, code, source: 'shop', shopBaseCost: 7500 });
    for (let bought = 1; bought <= 3; bought++) {
      const inputs = [
        ...(bought < 3 ? [{ key: scroll.key, quantity: 3 - bought }] : []),
        { key, quantity: bought },
      ];
      const values: Record<string, string> = {
        description: `Forgotten Arts: ${bought} bought ${skill} scrolls -> ${tome.key}`,
        enabled: '1', version: '100', numinputs: '3', output: tome.key,
        lvl: String(tome.dropLevel), '*eol': '0',
      };
      inputs.forEach((input, n) => {
        values[`input ${n + 1}`] = input.quantity === 1 ? input.key : `"${input.key},qty=${input.quantity}"`;
      });
      append(ctx.cubemain, values);
    }
  }
  // Keep all six previous shop bases/unique IDs for saved purchases and recipes,
  // but retire their individually fixed stock entries.
  for (const book of books.filter(b => b.source === 'shop')) {
    const base = ctx.misc.rows.find(r => get(ctx.misc, r, 'code') === book.code)!;
    for (const field of ['AkaraMin', 'AkaraMax', 'AkaraMagicMin', 'AkaraMagicMax']) {
      set(ctx.misc, base, field, '0');
    }
  }
  // The game's unique roll chooses among these six spell variants every time
  // Akara creates stock. Rarity is local to this shop-only base, never cm1/cm2.
  const code = 'fs6';
  if (ctx.misc.rows.some(r => get(ctx.misc, r, 'code') === code)) throw new Error(`Duplicate shop code ${code}`);
  const poolBase = [...templateBase];
  for (const [field, value] of Object.entries({ code, AkaraMin: '3', AkaraMax: '3',
    AkaraMagicMin: '3', AkaraMagicMax: '3', AkaraMagicLvl: '25', PermStoreItem: '0', multibuy: '0' })) {
    set(ctx.misc, poolBase, field, value);
  }
  ctx.misc.rows.push(poolBase);
  for (const [skill, weight] of Object.entries(AKARA_SHOP_WEIGHTS)) {
    const oldShop = books.find(b => b.skill === skill && b.source === 'shop')!;
    const scroll = books.find(b => b.skill === skill && b.source === 'drop' && b.bonus === 1)!;
    const tome = books.find(b => b.skill === skill && b.source === 'drop' && b.bonus === 3)!;
    const key = `${oldShop.key}_Roll`;
    const unique = [...ctx.uniqueitems.rows.find(r => r[0] === oldShop.key)!];
    for (const [field, value] of Object.entries({ index: key, code, rarity: String(weight) })) set(ctx.uniqueitems, unique, field, value);
    ctx.uniqueitems.rows.push(unique);
    books.push({ ...scroll, key, code, source: 'shop', shopBaseCost: 7500, shopWeight: weight });
    // Accept every mix of current purchases, previous purchases and drops.
    for (let current = 1; current <= 3; current++) for (let previous = 0; previous <= 3 - current; previous++) {
      const inputs = [
        { key, quantity: current }, { key: oldShop.key, quantity: previous },
        { key: scroll.key, quantity: 3 - current - previous },
      ].filter(input => input.quantity > 0);
      const values: Record<string, string> = {
        description: `Forgotten Arts: ${current} refreshed + ${previous} prior ${skill} scrolls -> ${tome.key}`,
        enabled: '1', version: '100', numinputs: '3', output: tome.key,
        lvl: String(tome.dropLevel), '*eol': '0',
      };
      inputs.forEach((input, n) => {
        values[`input ${n + 1}`] = input.quantity === 1 ? input.key : `"${input.key},qty=${input.quantity}"`;
      });
      append(ctx.cubemain, values);
    }
  }
  expandPotionVendorShops(ctx, books);
}

function expandPotionVendorShops(
  ctx: Pick<ForgottenArtsContext, 'misc' | 'uniqueitems' | 'cubemain'>, books: SpellBook[],
) {
  const template = ctx.misc.rows.find(r => get(ctx.misc, r, 'code') === 'fs6')!;
  // Vendor upgrade codes are evaluated at runtime in Nightmare/Hell above
  // character level 25. All acts then draw from the full Act V catalogue.
  set(ctx.misc, template, 'NightmareUpgrade', 'f05');
  set(ctx.misc, template, 'HellUpgrade', 'f05');
  for (const item of books.filter(b => b.code === 'fs6')) {
    item.shopAct = 1;
    item.shopBaseCost = spellShopPrice(item.skill, item.dropLevel);
    const unique = ctx.uniqueitems.rows.find(r => r[0] === item.key)!;
    set(ctx.uniqueitems, unique, 'cost add', String(item.shopBaseCost - 7500));
  }
  const appended = new Set<string>();
  for (const pool of SPELL_SHOP_ACTS.filter(pool => pool.act > 1)) {
    if (ctx.misc.rows.some(r => get(ctx.misc, r, 'code') === pool.code)) throw new Error(`Duplicate shop code ${pool.code}`);
    const base = [...template];
    set(ctx.misc, base, 'code', pool.code);
    // Cloned stock must not leak to the previous act's vendor.
    for (const field of ctx.misc.headers.filter(h => /(?:MagicMin|MagicMax|Min|Max)$/.test(h))) {
      if (SPELL_SHOP_ACTS.some(p => p.vendors.some(vendor => field.startsWith(vendor)))) set(ctx.misc, base, field, '0');
    }
    for (const vendor of pool.vendors) {
      for (const suffix of ['Min', 'Max', 'MagicMin', 'MagicMax']) set(ctx.misc, base, `${vendor}${suffix}`, '3');
      set(ctx.misc, base, `${vendor}MagicLvl`, '25');
    }
    if (pool.act === 5) for (const field of ['NightmareUpgrade', 'HellUpgrade']) set(ctx.misc, base, field, 'xxx');
    ctx.misc.rows.push(base);
    for (const scroll of books.filter(b => b.source === 'drop' && b.bonus === 1 && b.dropLevel <= pool.maxSpellTier)) {
      const key = `D2RR_FA_${scroll.skillId}_Shop${pool.act}`;
      const price = spellShopPrice(scroll.skill, scroll.dropLevel);
      const weight = AKARA_SHOP_WEIGHTS[scroll.skill as keyof typeof AKARA_SHOP_WEIGHTS]
        ?? (scroll.dropLevel >= 24 || ['Static Field', 'Corpse Explosion', 'Teleport', 'Blessed Hammer'].includes(scroll.skill) ? 2 : 4);
      const unique = [...ctx.uniqueitems.rows.find(r => r[0] === scroll.key)!];
      for (const [field, value] of Object.entries({ index: key, code: pool.code, lvl: '1', rarity: String(weight),
        'cost mult': '0', 'cost add': String(price - 7500) })) set(ctx.uniqueitems, unique, field, value);
      ctx.uniqueitems.rows.push(unique);
      books.push({ ...scroll, key, code: pool.code, source: 'shop', shopBaseCost: price, shopWeight: weight, shopAct: pool.act });
      appended.add(key);
    }
  }
  // Append only combinations involving a new regional purchase; retain every
  // old recipe and accept purchases from different acts without conversion.
  for (const skill of BOOK_SPELLS) {
    const variants = books.filter(b => b.skill === skill && b.bonus === 1);
    const tome = books.find(b => b.skill === skill && b.source === 'drop' && b.bonus === 3)!;
    for (let a = 0; a < variants.length; a++) for (let b = a; b < variants.length; b++) for (let c = b; c < variants.length; c++) {
      const inputs = [variants[a], variants[b], variants[c]];
      if (!inputs.some(item => appended.has(item.key))) continue;
      const quantities = new Map<string, number>();
      for (const item of inputs) quantities.set(item.key, (quantities.get(item.key) ?? 0) + 1);
      const values: Record<string, string> = {
        description: `Forgotten Arts: regional ${inputs.map(i => i.key).join(' + ')} -> ${tome.key}`,
        enabled: '1', version: '100', numinputs: '3', output: tome.key, lvl: String(tome.dropLevel), '*eol': '0',
      };
      [...quantities].forEach(([key, quantity], n) => {
        values[`input ${n + 1}`] = quantity === 1 ? key : `"${key},qty=${quantity}"`;
      });
      append(ctx.cubemain, values);
    }
  }
}

/** Preserve the shipped asset maps and give every custom item explicit HD art. */
export function buildForgottenArtsItemGraphics(
  books: readonly SpellBook[],
  items: Record<string, { asset: string }>[],
  uniques: Record<string, { normal: string; uber: string; ultra: string }>[],
) {
  const scroll = items.find(entry => entry.isc)?.isc.asset;
  const book = items.find(entry => entry.ibk)?.ibk.asset;
  if (!scroll || !book) throw new Error('Forgotten Arts: missing original scroll/book HD assets');
  // These two bases are the mutation's scroll/book carriers. Give the base
  // lookup the same artwork, including saved items whose unique override is
  // bypassed by the client's charm renderer.
  items.find(entry => entry.cm1)!.cm1.asset = 'scroll/forgotten_arts_scroll';
  items.find(entry => entry.cm2)!.cm2.asset = 'book/forgotten_arts_book';
  // HD inventory lookup can resolve uniqueitems.invfile through items.json,
  // independently of the unique's name. Register that bridge explicitly.
  // The ordinary isc/ibk base codes still point at the original red artwork.
  for (const [key, asset] of [
    ['invrsc', 'scroll/forgotten_arts_scroll'],
    ['invrbk', 'book/forgotten_arts_book'],
  ]) {
    if (items.some(entry => entry[key])) throw new Error(`Forgotten Arts: art alias collision ${key}`);
    items.push({ [key]: { asset } });
  }
  for (const item of books) {
    const asset = item.bonus === 1 ? 'scroll/forgotten_arts_scroll' : 'book/forgotten_arts_book';
    if (item.source === 'shop') {
      if (item.code.length !== 3) throw new Error(`Forgotten Arts: HD item code must have three characters: ${item.code}`);
      if (!items.some(entry => entry[item.code])) items.push({ [item.code]: { asset } });
    }
    uniques.push({ [item.key.toLowerCase()]: { normal: asset, uber: asset, ultra: asset } });
  }
  return { items, uniques };
}

function addExplorationRewards(ctx: ForgottenArtsContext) {
  const table = ctx.treasureclass;
  // Regional late-area chest pools: 5% per pick, four normal picks per call.
  // Preserve all existing loot chances; add the spell chance from empty rolls.
  for (const row of table.rows) {
    const match = /^(Act [1-5](?: \([NH]\))?) Chest C$/.exec(row[0]);
    if (!match) continue;
    const good = `${match[1]} Good`;
    const noDrop = Number(get(table, row, 'NoDrop'));
    let total = noDrop, goodWeight = 0, slot = 0;
    for (let n = 1; n <= 10; n++) {
      const weight = Number(get(table, row, `Prob${n}`)) || 0;
      total += weight;
      if (get(table, row, `Item${n}`) === good) goodWeight += weight;
      if (!slot && !get(table, row, `Item${n}`)) slot = n;
    }
    const extra = total - goodWeight * 10;
    if (!slot || extra <= 0 || extra > noDrop * 20) throw new Error(`Forgotten Arts: cannot tune ${row[0]}`);
    for (let n = 1; n <= 10; n++) if (get(table, row, `Item${n}`)) {
      set(table, row, `Prob${n}`, String((Number(get(table, row, `Prob${n}`)) || 0) * 20));
    }
    set(table, row, 'NoDrop', String(noDrop * 20 - extra));
    set(table, row, `Item${slot}`, `D2RR_FA_${good}`);
    set(table, row, `Prob${slot}`, String(extra));
  }
  for (const name of ['Bookshelf1', 'Bookshelf2']) {
    const row = ctx.objects.rows.find(r => r[0] === name);
    if (!row) throw new Error(`Forgotten Arts: missing ${name}`);
    // Function 14 opens once and rolls the regional chest TC. Function 26
    // hard-codes portal/identify items. Preserve the shelf's art and placement.
    set(ctx.objects, row, 'OperateFn', '14');
  }
  for (const name of SPELL_EXPLORATION_REWARDS) {
    const row = ctx.superuniques.rows.find(r => r[0] === name);
    if (!row) throw new Error(`Forgotten Arts: missing ${name}`);
    for (const column of name === 'Griswold' ? ['TC', 'TC(N)', 'TC(H)'] : ['TC']) {
      const original = get(ctx.superuniques, row, column);
      const key = `D2RR_FA_Reward_${name}${column.slice(2)}`;
      // Award the early scroll first, then retain the original loot pool.
      append(table, { 'Treasure Class': key, Picks: '-2', NoDrop: '0',
        Item1: 'D2RR_FA_Act 1 Good', Prob1: '1', Item2: original, Prob2: '1', '*eol': '0' });
      set(ctx.superuniques, row, column, key);
    }
  }
}

/**
 * Point a restored spell's synergies at carried levels, weighted by each
 * source's rarity. Terms are weighted before a single /100 so integer calc
 * math keeps fractional per-level rates. Non-catalogue sources stay on hard
 * points, which are always zero here.
 *
 * A reference with no per-level coefficient is a level use, not a percentage
 * synergy: Demonic Mastery's pet-count thresholds and the Defiler's bonus
 * damage levels count whole carried levels.
 */
function scaleSpellSynergies(
  ctx: Pick<ForgottenArtsContext, 'skills' | 'skilldesc' | 'vanillaSkills' | 'vanillaSkilldesc'>,
  row: string[], desc?: string[],
) {
  const spells = new Set<string>(BOOK_SPELLS);
  const sources = new Set<string>();
  // `* par7` (Glacial Spike's Blizzard radius) or `*skill('FireGolem'.par8)` (golems).
  const reference = /skill\('([^']+)'\.blvl\)(\s*\*\s*(?:par\d+|skill\('[^']+'\.par\d+\)))?/g;
  for (const [table, cells] of [[ctx.skills, row], [ctx.skilldesc, desc ?? []]] as const) {
    for (let i = 0; i < cells.length; i++) {
      const synergyColumn = table === ctx.skills && table.headers[i].endsWith('SymPerCalc');
      let weightedColumn = false;
      const next = cells[i].replace(reference, (match, name: string, multiplier?: string) => {
        if (!spells.has(name)) return match;
        if (!synergyColumn && !multiplier) return `skill('${name}'.lvl)`;
        sources.add(name);
        const term = `skill('${name}'.lvl)*${synergyKeep(ctx.vanillaSkills, name)}${multiplier ?? ''}`;
        if (synergyColumn) weightedColumn = true;
        return synergyColumn ? term : `${term} / 100`;
      });
      cells[i] = weightedColumn ? `(${next})/100` : next;
    }
  }
  if (!desc) return;

  // Tooltip "+X% per level" lines name the source by its skill name string.
  const spellByString = new Map<string, string>();
  for (const name of spells) {
    const descName = get(ctx.vanillaSkills, ctx.vanillaSkills.rows.find(r => r[0] === name)!, 'skilldesc');
    const originalDesc = ctx.vanillaSkilldesc.rows.find(r => r[0] === descName);
    if (originalDesc) spellByString.set(get(ctx.vanillaSkilldesc, originalDesc, 'str name'), name);
  }
  for (const [i, header] of ctx.skilldesc.headers.entries()) {
    const slot = /^dsc3textb(\d+)$/.exec(header)?.[1];
    const source = spellByString.get(desc[i]);
    // Skip the "Receives Bonuses From" header, which names the spell itself.
    if (!slot || !source || source === row[0]) continue;
    const calc = get(ctx.skilldesc, desc, `dsc3calca${slot}`);
    if (!/^(?:par\d+|skill\('[^']+'\.par\d+\))$/.test(calc)) continue;
    if (!sources.has(source)) throw new Error(`Forgotten Arts: ${row[0]} tooltip lists ${source} without a matching synergy`);
    // Rounded to the nearest whole percent; the damage formula keeps the fraction.
    set(ctx.skilldesc, desc, `dsc3calca${slot}`, `(${calc}*${synergyKeep(ctx.vanillaSkills, source)}+50)/100`);
  }
}

export function applyForgottenArts(ctx: ForgottenArtsContext): SpellBook[] {
  const { skills, skilldesc, charstats, uniqueitems, treasureclass } = ctx;
  if (uniqueitems.rows.some(row => row[0].startsWith('D2RR_FA_'))) {
    throw new Error('Forgotten Arts has already been applied');
  }
  const originals = new Map(ctx.vanillaSkills.rows.map(row => [row[0], row]));
  const spells = new Set<string>(BOOK_SPELLS);
  const available = new Map<string, string[]>();
  for (const name of BOOK_SPELLS) {
    const icon = ctx.iconCels.get(name);
    if (icon === undefined || !Number.isInteger(icon) || icon < 0 || icon % 2 !== 0) {
      throw new Error(`Forgotten Arts: missing or invalid icon for ${name}`);
    }
  }

  // The spell catalogue has fixed identities; randomized tree synergies and
  // class-dependent edits must not leak into an inventory-based spell system.
  for (const row of skills.rows) {
    if (!spells.has(row[0])) continue;
    const original = originals.get(row[0]);
    if (!original) throw new Error(`Forgotten Arts: missing original spell ${row[0]}`);
    row.splice(0, row.length, ...original);
    const descName = get(skills, row, 'skilldesc');
    const desc = skilldesc.rows.find(r => r[0] === descName);
    const originalDesc = ctx.vanillaSkilldesc.rows.find(r => r[0] === descName);
    if (!desc || !originalDesc) throw new Error(`Forgotten Arts: missing description ${descName}`);
    desc.splice(0, desc.length, ...originalDesc);
    scaleSpellSynergies(ctx, row, desc);
    // Pets attack with their own classless skill rows, which the tree shuffle
    // rewrites alongside the summon. Restore those too, so a skeleton mage's
    // bolt never scales off an unrelated carried spell. Class skills a pet
    // borrows (Fire Golem's Holy Fire, the Tainted's Blood Boil) stay put.
    for (let n = 1; n <= 6; n++) {
      const pet = get(skills, row, `sumskill${n}`);
      const originalPet = originals.get(pet);
      if (!pet || pet === row[0] || !originalPet || get(ctx.vanillaSkills, originalPet, 'charclass')) continue;
      const petRow = skills.rows.find(r => r[0] === pet);
      if (!petRow) throw new Error(`Forgotten Arts: missing pet skill ${pet}`);
      petRow.splice(0, petRow.length, ...originalPet);
      scaleSpellSynergies(ctx, petRow);
    }
  }

  for (const row of skills.rows) {
    const original = originals.get(row[0]);
    if (!original || !get(ctx.vanillaSkills, original, 'charclass')) continue;
    // Hide all class trees and reject even quest-awarded point spending.
    set(skills, row, 'skpoints', '999');
    for (const col of ['reqskill1', 'reqskill2', 'reqskill3']) set(skills, row, col, '');
    const desc = skilldesc.rows.find(r => r[0] === get(skills, row, 'skilldesc'));
    if (desc) {
      for (const col of ['SkillPage', 'SkillRow', 'SkillColumn']) set(skilldesc, desc, col, '0');
    }
    if (!spells.has(row[0])) continue;
    // Remove class ownership so carried copies stack equally for every class.
    set(skills, row, 'charclass', '');
    // Progression belongs to loot tiers, never to the character equipping it.
    set(skills, row, 'reqlevel', '1');
    set(skills, row, 'maxlvl', '20'); // ceiling for native item-level charge scaling
    // All spells in this catalogue work with the universal SC cast animation.
    set(skills, row, 'anim', 'SC');
    set(skills, row, 'seqtrans', 'SC');
    set(skills, row, 'seqnum', '');
    set(skills, row, 'seqinput', '');
    if (desc) {
      set(skilldesc, desc, 'ListRow', '0');
      set(skilldesc, desc, 'IconCel', String(ctx.iconCels.get(row[0])));
    }
    available.set(row[0], row);
  }
  for (const name of BOOK_SPELLS) {
    if (!available.has(name)) throw new Error(`Forgotten Arts: missing spell ${name}`);
  }

  addSpellEquipment(ctx);
  for (const row of ctx.itemtypes.rows) set(ctx.itemtypes, row, 'StaffMods', '');

  // Charm bases ship with palette 0 (no inventory color transform). Enable
  // their native inventory palette so spell uniques can request purple.
  // Portal/identify scroll and tome bases are untouched.
  for (const code of ['cm1', 'cm2']) {
    const base = ctx.misc.rows.find(r => get(ctx.misc, r, 'code') === code);
    if (!base) throw new Error(`Forgotten Arts: missing charm base ${code}`);
    set(ctx.misc, base, 'InvTrans', '8');
    set(ctx.misc, base, 'cost', code === 'cm1' ? '2000' : '6000');
    set(ctx.misc, base, 'invfile', code === 'cm1' ? 'invrsc' : 'invrbk');
    const itemType = ctx.itemtypes.rows.find(r => get(ctx.itemtypes, r, 'Code') === get(ctx.misc, base, 'type'));
    if (!itemType) throw new Error(`Forgotten Arts: missing item type for ${code}`);
    set(ctx.itemtypes, itemType, 'VarInvGfx', '0');
    for (let n = 1; n <= 6; n++) set(ctx.itemtypes, itemType, `InvGfx${n}`, '');
    // D2R's HD unique-art path also needs the base-item override enabled.
    // uniqueitems.invfile alone can leave charm variants on the base graphic.
    // Shop bases clone this row, so they must inherit the override too.
    set(ctx.misc, base, 'uniqueinvfile', code === 'cm1' ? 'invrsc' : 'invrbk');
    // Unique title only: avoids both the shop's duplicate title and the
    // starter/drop item's Small/Large Charm subtitle. Magic names are unchanged.
    set(ctx.misc, base, 'SkipName', '1');
  }

  // ITEMS_GetRequiredLevel adds six to classless oskills even at reqlevel=1.
  // Cancel all seven on these uniques. The vanilla stat cannot save negatives;
  // reserve seven values below zero without changing the seven-bit field width.
  // This mutation requires fresh characters (old upgraded items used Save Add=0).
  const levelReqStat = ctx.itemstatcost.rows.find(r => r[0] === 'item_levelreq');
  if (!levelReqStat) throw new Error('Forgotten Arts: missing item_levelreq stat');
  set(ctx.itemstatcost, levelReqStat, 'Save Add', '7');

  const books: SpellBook[] = [];
  for (const name of BOOK_SPELLS) {
    const row = available.get(name)!;
    const skillId = skills.rows.indexOf(row); // physical row, not the stale *Id
    const tier = spellTier(ctx.vanillaSkills, name);
    for (const [kind, code, bonus, extraLevel, graphic] of [
      ['Scroll', 'cm1', 1, 0, 'invrsc'],
      ['Book', 'cm2', 3, 6, 'invrbk'],
    ] as const) {
      const key = `D2RR_FA_${skillId}_${kind}`;
      const dropLevel = tier + extraLevel;
      const displayName = `${kind} of ${ctx.displayNames.get(name) ?? name}`;
      append(uniqueitems, {
        index: key, version: '100', disabled: '0', spawnable: '1', rarity: '1',
        nolimit: '1', carry1: '0', code, lvl: String(name === 'Fire Bolt' && kind === 'Scroll' ? 1 : Math.max(2, dropLevel)),
        'lvl req': '0', invfile: graphic, invtransform: 'lpur', flippyfile: kind === 'Scroll' ? 'flprsc' : 'flprbk',
        prop1: 'oskill', par1: String(skillId), min1: String(bonus), max1: String(bonus), '*eol': '0',
        prop2: 'levelreq', min2: '-7', max2: '-7',
        'cost mult': '0', 'cost add': '0',
      });
      books.push({ key, name: displayName, skill: name, skillId, code, requiredLevel: 0, dropLevel, bonus, source: 'drop' });
    }
  }
  addConsolidationAndShop(ctx, books);

  for (const row of charstats.rows) {
    if (!get(charstats, row, 'class') || !get(charstats, row, 'str')) continue;
    set(charstats, row, 'SkillsPerLevel', '0');
    set(charstats, row, 'StartSkill', '');
    let added = false;
    for (let n = 1; n <= 10; n++) {
      const code = get(charstats, row, `item${n}`);
      if (code && code !== '0') continue;
      set(charstats, row, `item${n}`, 'cm1');
      set(charstats, row, `item${n}loc`, '');
      set(charstats, row, `item${n}count`, '1');
      set(charstats, row, `item${n}quality`, '7');
      added = true;
      break;
    }
    if (!added) throw new Error(`Forgotten Arts: no starting item slot for ${row[0]}`);
    if (!Array.from({ length: 10 }, (_, i) => get(charstats, row, `item${i + 1}`)).includes('box')) {
      const slot = Array.from({ length: 10 }, (_, i) => i + 1)
        .find(n => !get(charstats, row, `item${n}`) || get(charstats, row, `item${n}`) === '0');
      if (!slot) throw new Error(`Forgotten Arts: no starting Cube slot for ${row[0]}`);
      for (const [column, value] of Object.entries({ [`item${slot}`]: 'box', [`item${slot}loc`]: '', [`item${slot}count`]: '1', [`item${slot}quality`]: '2' })) {
        set(charstats, row, column, value);
      }
    }
  }

  // Weighted trees respect TC's ten-entry limit. Add books to the existing
  // Good pool without replacing gems/runes/jewelry or special quest drops.
  const goodRows = treasureclass.rows.filter(r => /^Act [1-5]( \([NH]\))? Good$/.test(r[0]));
  if (goodRows.length !== 15) throw new Error('Forgotten Arts: unexpected Good treasure classes');
  const originalRowCount = treasureclass.rows.length;
  for (const good of goodRows) {
    const act = Number(good[0][4]);
    const cap = good[0].includes('(') ? 99 : [0, 6, 18, 24, 30, 36][act];
    const pool = books.filter(book => book.source === 'drop' && book.dropLevel <= cap
      && (good[0] !== 'Act 1 Good' || (EARLY_BOOK_SPELLS as readonly string[]).includes(book.skill)));
    const root = `D2RR_FA_${good[0]}`;
    const chunks: string[] = [];
    for (let i = 0; i < pool.length; i += 10) {
      const key = `${root}_${i / 10}`;
      const values: Record<string, string> = { 'Treasure Class': key, Picks: '1', NoDrop: '0', '*eol': '0' };
      pool.slice(i, i + 10).forEach((book, j) => {
        values[`Item${j + 1}`] = book.key;
        values[`Prob${j + 1}`] = '1';
      });
      append(treasureclass, values);
      chunks.push(key);
    }
    const values: Record<string, string> = { 'Treasure Class': root, Picks: '1', NoDrop: '0', '*eol': '0' };
    chunks.forEach((key, j) => {
      values[`Item${j + 1}`] = key;
      values[`Prob${j + 1}`] = String(Math.min(10, pool.length - j * 10));
    });
    append(treasureclass, values);
    let total = 0;
    let slot = 0;
    for (let n = 1; n <= 10; n++) {
      total += Number(get(treasureclass, good, `Prob${n}`)) || 0;
      if (!slot && !get(treasureclass, good, `Item${n}`)) slot = n;
    }
    if (!slot) throw new Error(`Forgotten Arts: full treasure class ${good[0]}`);
    set(treasureclass, good, `Item${slot}`, root);
    set(treasureclass, good, `Prob${slot}`, String(Math.max(1, total)));
  }
  boostActOneScrollDrops(treasureclass);
  // TC references must point backwards. Keep the original group/level ordering
  // intact while placing all new leaf/root definitions before their consumers.
  const definitions = treasureclass.rows.splice(originalRowCount);
  treasureclass.rows.splice(treasureclass.rows.indexOf(goodRows[0]), 0, ...definitions);
  // Encounter wrappers reference existing Super pools, so append them only
  // after all original definitions (including those pools) are in place.
  addExplorationRewards(ctx);
  return books;
}

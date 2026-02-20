import { ClassCode, ClassDef } from './types';

export const CLASS_DEFS: ClassDef[] = [
  { name: 'Amazon', code: 'ama', charclass: 'ama', spritePrefix: 'am', iconFolder: 'Amazon' },
  { name: 'Sorceress', code: 'sor', charclass: 'sor', spritePrefix: 'so', iconFolder: 'Sorceress' },
  { name: 'Necromancer', code: 'nec', charclass: 'nec', spritePrefix: 'ne', iconFolder: 'Necro' },
  { name: 'Paladin', code: 'pal', charclass: 'pal', spritePrefix: 'pa', iconFolder: 'Paladin' },
  { name: 'Barbarian', code: 'bar', charclass: 'bar', spritePrefix: 'ba', iconFolder: 'Barbarian' },
  { name: 'Druid', code: 'dru', charclass: 'dru', spritePrefix: 'dr', iconFolder: 'Druid' },
  { name: 'Assassin', code: 'ass', charclass: 'ass', spritePrefix: 'as', iconFolder: 'Assassin' },
  { name: 'Warlock', code: 'war', charclass: 'war', spritePrefix: 'wa', iconFolder: 'Warlock' },
];

export const CLASS_BY_CODE = new Map<ClassCode, ClassDef>(
  CLASS_DEFS.map(c => [c.code, c])
);

// Map from charclass values in skills.txt to our ClassCode
export const CHARCLASS_TO_CODE: Record<string, ClassCode> = {
  ama: 'ama',
  sor: 'sor',
  nec: 'nec',
  pal: 'pal',
  bar: 'bar',
  dru: 'dru',
  ass: 'ass',
  war: 'war',
};

// Classes that have sprite data
export const SPRITE_CLASSES: ClassCode[] = ['ama', 'sor', 'nec', 'pal', 'bar', 'dru', 'ass', 'war'];

// Weapon types that are class-restricted (only Assassin can equip h2h/h2h2 claws)
export const CLASS_RESTRICTED_TYPES = new Set(['h2h', 'h2h2']);

// The weapon item type each class naturally uses — for Normal Logic remapping
export const CLASS_NATURAL_WEAPON: Record<string, string> = {
  ama: 'miss',  // Amazon → missiles
  sor: 'staf',  // Sorceress → staves
  nec: 'wand',  // Necromancer → wands
  pal: 'mele',  // Paladin → melee
  bar: 'mele',  // Barbarian → melee
  dru: 'mele',  // Druid → melee
  ass: 'h2h',   // Assassin → stays as claws (no remap needed)
  war: 'weap',  // Warlock → weapons
};

// Grid dimensions
export const GRID_ROWS = 6;
export const GRID_COLS = 3;
export const SKILLS_PER_CLASS = 30;
export const TREES_PER_CLASS = 3;

// Icon dimensions
export const ICON_WIDTH = 132;
export const ICON_HEIGHT = 130;
export const ICONS_PER_CLASS = 60; // 30 skills × 2 frames each (normal + pressed)

// Sprite header size
export const SPRITE_HEADER_SIZE = 40;

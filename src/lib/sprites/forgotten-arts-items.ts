import fs from 'fs';
import path from 'path';

/** Native sprite-color rules: artwork stays byte-identical to the game source. */
export function buildForgottenArtsItemAssets(): Map<string, Buffer> {
  const source = path.join(process.cwd(), 'data', 'sprites', 'forgotten-arts-items');
  const files = new Map<string, Buffer>();
  const ranges: unknown[] = [];
  const transforms: unknown[] = [];
  for (const kind of ['scroll', 'book']) {
    const asset = `${kind}/forgotten_arts_${kind}`;
    // Reuse the original ground model and its texture dependencies under the
    // new alias. The selective purple rule below applies to inventory sprites.
    const unit = JSON.parse(fs.readFileSync(path.join(source, kind + '.json'), 'utf8'));
    // A copied UnitDefinition must identify its new alias, not the original
    // Identify item. Its model/texture dependencies remain native game assets.
    unit.name = `forgotten_arts_${kind}`;
    files.set(`hd/items/misc/${asset}.json`, Buffer.from(JSON.stringify(unit)));
    // Small/large charm types have three inventory variants, including a
    // variation stored on existing items. D2R can append 1/2/3 to the HD alias;
    // ship every path rather than allowing shop stock to request a missing file.
    // New carriers disable variant selection; retain files for old saved variants.
    for (const variant of ['', '1', '2', '3']) {
      const sprite = `data/hd/global/ui/items/misc/${asset}${variant}`;
      for (const suffix of ['.sprite', '.lowend.sprite']) {
        files.set(`hd/global/ui/items/misc/${asset}${variant}${suffix}`, fs.readFileSync(path.join(source, kind + suffix)));
      }
      ranges.push([sprite, {
        // Native color-range pairs use a center and tolerance, as in the shipped
        // grey/brown overrides. Select Identify's red/red-brown accents, leaving
        // the yellow-gold fittings and unsaturated parchment out.
        hue: [0.04, 0.06], saturation: [0.6, 0.4], value: [0.51, 0.49],
      }]);
      transforms.push([sprite, 'lpur', {
        comment: 'Forgotten Arts: shift Identify red binding/cover to purple; preserve parchment and gold',
        hsvTransform: [-0.24, 0.0, 0.03, 0.0],
        tintTransform: [0.0, 0.0, 0.0, 0.0],
      }]);
    }
  }
  let layout = fs.readFileSync(path.join(source, 'globaldatahd.json'), 'utf8');
  // Native layouts contain comments and trailing commas. Insert only our
  // entries; do not parse/rewrite the rest of the game's global UI definition.
  for (const [field, entries] of [['colorRangeOverride', ranges], ['colorTransformOverride', transforms]] as const) {
    const marker = `"${field}": [`;
    if (layout.split(marker).length !== 2) throw new Error(`Forgotten Arts: missing/ambiguous ${field}`);
    layout = layout.replace(marker, `${marker}\n${entries.map(entry => JSON.stringify(entry)).join(',\n')},`);
  }
  files.set('global/ui/layouts/globaldatahd.json', Buffer.from(layout, 'utf8'));
  return files;
}

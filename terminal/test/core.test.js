const test = require('node:test');
const assert = require('node:assert/strict');
const assertLoose = require('node:assert');
const { loadBlasonCore } = require('./support/extract-core');

test('constantes de grille figées', () => {
  const { COLS, ROWS, DOT_W, DOT_H } = loadBlasonCore();
  assert.equal(COLS, 80);
  assert.equal(ROWS, 50);
  assert.equal(DOT_W, 160);
  assert.equal(DOT_H, 200);
});

test('hashString déterministe', () => {
  const { hashString } = loadBlasonCore();
  assert.equal(hashString('sthol'), hashString('sthol'));
  assert.notEqual(hashString('sthol'), hashString('kaldrek'));
});

test('mulberry32 reproductible', () => {
  const { mulberry32 } = loadBlasonCore();
  const a = mulberry32(123), b = mulberry32(123);
  assertLoose.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

test('slugify utilise la forme échappée des diacritiques', () => {
  const { slugify } = loadBlasonCore();
  assert.equal(slugify('Épée Ardente'), 'epee-ardente');
  assert.equal(slugify(''), 'blason');
});

test('deriveParams: même famille pour même familyRng, micro variable', () => {
  const { mulberry32, deriveParams } = loadBlasonCore();
  const p1 = deriveParams(mulberry32(42), mulberry32(1));
  const p2 = deriveParams(mulberry32(42), mulberry32(2));
  // macro stable (dépend de familyRng seul)
  assert.deepEqual(p1.symmetry, p2.symmetry);
  assert.equal(p1.frame, p2.frame);
  // micro variable (dépend de variantRng)
  assert.notDeepEqual(p1.clusters, p2.clusters);
});

test('deriveParams: bornes des paramètres', () => {
  const { mulberry32, deriveParams } = loadBlasonCore();
  const p = deriveParams(mulberry32(7), mulberry32(9));
  assert.ok(['axial', 'radial'].includes(p.symmetry.type));
  assert.ok(p.clusters.length >= 3 && p.clusters.length <= 7);
  assert.ok(p.jitter >= 0.3 && p.jitter <= 0.8);
  assert.ok(['brackets', 'box', 'ticks'].includes(p.frame));
  for (const c of p.clusters) {
    assert.ok(c.distance >= 0.15 && c.distance <= 0.9);
    assert.ok(c.particleCount > 0);
  }
});

test('gaussianRandom: renvoie un nombre fini', () => {
  const { mulberry32, gaussianRandom } = loadBlasonCore();
  const rng = mulberry32(3);
  for (let i = 0; i < 20; i++) assert.ok(Number.isFinite(gaussianRandom(rng)));
});

test('generateParticles: respecte la symétrie radiale (k centres)', () => {
  const { mulberry32, generateParticles } = loadBlasonCore();
  const params = { symmetry: { type: 'radial', k: 4 }, sectorAngle: Math.PI / 2,
    clusters: [{ angle: 0.3, distance: 0.5, radius: 0.1, particleCount: 10 }],
    jitter: 0.5, paletteBias: 0.5, densityBand: 1, frame: 'box' };
  const pts = generateParticles(params, mulberry32(1), 160, 200);
  assert.equal(pts.length, 4 * 10); // k centres × particleCount
  for (const p of pts) { assert.ok(Number.isFinite(p.x)); assert.ok(Number.isFinite(p.y)); }
});

test('generateParticles: axial = 2 centres miroir', () => {
  const { mulberry32, generateParticles } = loadBlasonCore();
  const params = { symmetry: { type: 'axial', k: 2 }, sectorAngle: Math.PI,
    clusters: [{ angle: 0.3, distance: 0.5, radius: 0.1, particleCount: 5 }],
    jitter: 0.5, paletteBias: 0.5, densityBand: 1, frame: 'box' };
  const pts = generateParticles(params, mulberry32(1), 160, 200);
  assert.equal(pts.length, 2 * 5);
});

test('rasterizeToDotField: longueur et normalisation', () => {
  const { rasterizeToDotField } = loadBlasonCore();
  const field = rasterizeToDotField([{ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 10, y: 10 }], 160, 200);
  assert.equal(field.length, 160 * 200);
  let max = 0; for (const v of field) if (v > max) max = v;
  assert.equal(max, 1); // pic normalisé à 1
  assert.equal(field[5 * 160 + 5], 1); // cellule à 2 hits = max
  assert.equal(field[10 * 160 + 10], 0.5); // cellule à 1 hit = moitié
});

test('rasterizeToDotField: ignore les points hors champ', () => {
  const { rasterizeToDotField } = loadBlasonCore();
  const field = rasterizeToDotField([{ x: -1, y: 5 }, { x: 999, y: 5 }], 160, 200);
  let sum = 0; for (const v of field) sum += v;
  assert.equal(sum, 0);
});

test('dotFieldToBraille: dimensions de la grille', () => {
  const { dotFieldToBraille } = loadBlasonCore();
  const field = new Float64Array(160 * 200);
  const cells = dotFieldToBraille(field, 80, 50);
  assert.equal(cells.length, 50);
  assert.equal(cells[0].length, 80);
});

test('dotFieldToBraille: champ vide = blank braille U+2800', () => {
  const { dotFieldToBraille } = loadBlasonCore();
  const cells = dotFieldToBraille(new Float64Array(160 * 200), 80, 50);
  assert.equal(cells[0][0].char, '⠀');
  assert.equal(cells[0][0].intensity, 0);
  assert.equal(cells[0][0].layer, 'braille');
});

test('dotFieldToBraille: point haut-gauche allume dot1 (0x2801)', () => {
  const { dotFieldToBraille } = loadBlasonCore();
  const field = new Float64Array(160 * 200);
  field[0] = 1; // sous-point (0,0) de la cellule (0,0)
  const cells = dotFieldToBraille(field, 80, 50);
  assert.equal(cells[0][0].char, '⠁'); // dot1
});

test('dotFieldToBraille: cellule pleine = 0x28FF', () => {
  const { dotFieldToBraille } = loadBlasonCore();
  const field = new Float64Array(160 * 200);
  for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) field[dy * 160 + dx] = 1;
  const cells = dotFieldToBraille(field, 80, 50);
  assert.equal(cells[0][0].char, '⣿');
  assert.equal(cells[0][0].intensity, 1);
});

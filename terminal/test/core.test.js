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

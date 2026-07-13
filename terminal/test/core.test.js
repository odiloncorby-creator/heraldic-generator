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

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBlasonCore } = require('./support/extract-core');

test('hashString est déterministe pour un même texte', () => {
  const { hashString } = loadBlasonCore();
  assert.equal(hashString('sthol'), hashString('sthol'));
});

test('hashString diffère pour des textes différents', () => {
  const { hashString } = loadBlasonCore();
  assert.notEqual(hashString('sthol'), hashString('kaldrek'));
});

test('hashString accepte les phrases et retourne un entier non signé 32 bits', () => {
  const { hashString } = loadBlasonCore();
  const h = hashString('une phrase assez longue avec espaces et Majuscules');
  assert.ok(Number.isInteger(h));
  assert.ok(h >= 0 && h <= 0xFFFFFFFF);
});

test('mulberry32 produit des séquences identiques pour des seeds identiques', () => {
  const { mulberry32 } = loadBlasonCore();
  const rngA = mulberry32(12345);
  const rngB = mulberry32(12345);
  const drawsA = Array.from({ length: 5 }, () => rngA());
  const drawsB = Array.from({ length: 5 }, () => rngB());
  assert.deepEqual(drawsA, drawsB);
});

test('mulberry32 reste dans [0, 1)', () => {
  const { mulberry32 } = loadBlasonCore();
  const rng = mulberry32(7);
  for (let i = 0; i < 200; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `valeur hors bornes: ${v}`);
  }
});

test('mulberry32 produit des séquences différentes pour des seeds différents', () => {
  const { mulberry32 } = loadBlasonCore();
  const rngA = mulberry32(1);
  const rngB = mulberry32(2);
  assert.notEqual(rngA(), rngB());
});

test('deriveParams est déterministe pour un même rng', () => {
  const { mulberry32, deriveParams } = loadBlasonCore();
  const paramsA = deriveParams(mulberry32(999));
  const paramsB = deriveParams(mulberry32(999));
  assert.deepEqual(paramsA, paramsB);
});

test('deriveParams choisit une symétrie valide', () => {
  const { mulberry32, deriveParams } = loadBlasonCore();
  const { symmetry } = deriveParams(mulberry32(1));
  assert.ok(symmetry.type === 'axial' || symmetry.type === 'radial');
  if (symmetry.type === 'radial') {
    assert.ok([3, 4, 6, 8].includes(symmetry.k));
  }
});

test('deriveParams génère entre 3 et 7 clusters', () => {
  const { mulberry32, deriveParams } = loadBlasonCore();
  for (let seed = 0; seed < 20; seed++) {
    const { clusters } = deriveParams(mulberry32(seed));
    assert.ok(clusters.length >= 3 && clusters.length <= 7, `seed ${seed}: ${clusters.length} clusters`);
  }
});

test('deriveParams contraint chaque cluster dans le secteur de base', () => {
  const { mulberry32, deriveParams } = loadBlasonCore();
  for (let seed = 0; seed < 20; seed++) {
    const { clusters, sectorAngle } = deriveParams(mulberry32(seed));
    for (const cluster of clusters) {
      assert.ok(cluster.angle >= 0 && cluster.angle < sectorAngle);
      assert.ok(cluster.distance > 0 && cluster.distance <= 1);
    }
  }
});

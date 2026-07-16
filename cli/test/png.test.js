const test = require('node:test');
const assert = require('node:assert/strict');
const { buildGrid } = require('../lib/core');
const { serializeSvg } = require('../lib/serialize');
const { serializeSvgToPngBuffer } = require('../lib/png');

test('serializeSvgToPngBuffer: produit un buffer PNG valide', async () => {
  const grid = buildGrid('sthol', 1);
  const svg = serializeSvg(grid);
  const buffer = await serializeSvgToPngBuffer(svg);
  const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.ok(buffer.subarray(0, 8).equals(PNG_MAGIC));
});

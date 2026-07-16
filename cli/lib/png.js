'use strict';

const sharp = require('sharp');

async function serializeSvgToPngBuffer(svgString) {
  return sharp(Buffer.from(svgString)).png().toBuffer();
}

module.exports = { serializeSvgToPngBuffer };

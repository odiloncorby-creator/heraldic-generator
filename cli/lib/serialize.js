'use strict';

const { formatSeedLine } = require('./core');

function parseColor(color) {
  if (color[0] === '#') {
    return [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];
  }
  const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  return m ? [+m[1], +m[2], +m[3]] : [255, 255, 255];
}

function serializeText(grid) {
  const art = grid.cells.map(row => row.map(c => c.char).join('')).join('\n');
  return `${art}\n\n${formatSeedLine(grid.meta)}`;
}

function serializeAnsi(grid) {
  const RESET = '\x1b[0m';
  const art = grid.cells.map(row => {
    let line = '', last = null;
    for (const cell of row) {
      if (cell.color !== last) {
        const [r, g, b] = parseColor(cell.color);
        line += `\x1b[38;2;${r};${g};${b}m`;
        last = cell.color;
      }
      line += cell.char;
    }
    return line + RESET;
  }).join('\n');
  return `${art}\n\n${formatSeedLine(grid.meta)}`;
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function serializeSvg(grid, opts) {
  opts = opts || {};
  const cw = opts.cellW || 13.5, ch = opts.cellH || 27, fs = opts.fontSize || 24;
  const w = grid.cols * cw, h = (grid.rows + 1) * ch;
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
  out += `<rect width="${w}" height="${h}" fill="#0A0A0A"/>`;
  out += `<g font-family="monospace" font-size="${fs}" xml:space="preserve">`;
  for (let r = 0; r < grid.rows; r++) {
    const y = ((r + 0.8) * ch).toFixed(1);
    for (let c = 0; c < grid.cols; c++) {
      const cell = grid.cells[r][c];
      if (cell.char === ' ' || cell.char === '⠀') continue;
      const x = (c * cw).toFixed(1);
      out += `<text x="${x}" y="${y}" fill="${cell.color}">${escapeXml(cell.char)}</text>`;
    }
  }
  const seedY = ((grid.rows + 0.8) * ch).toFixed(1);
  out += `<text x="0" y="${seedY}" fill="#8A9AD4">${escapeXml(formatSeedLine(grid.meta))}</text>`;
  out += `</g></svg>`;
  return out;
}

module.exports = { parseColor, serializeText, serializeAnsi, escapeXml, serializeSvg };

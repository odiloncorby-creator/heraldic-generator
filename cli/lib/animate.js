'use strict';

const SCRAMBLE_CHARS = '⠿⣿⢿⡿⣻⠷█▓▒░/\\|+°';
const DECODE_DURATION_MS = 500;
const DECODE_STAGGER_MS = 500;

function computeDecodeFrame(grid, t, rng) {
  const cx = (grid.cols - 1) / 2, cy = (grid.rows - 1) / 2;
  const maxD = Math.hypot(cx, cy);
  let done = true;
  const cells = [];
  for (let r = 0; r < grid.rows; r++) {
    const row = [];
    for (let c = 0; c < grid.cols; c++) {
      const cell = grid.cells[r][c];
      const d = Math.hypot(c - cx, r - cy) / maxD;
      const cellStart = d * DECODE_STAGGER_MS;
      if (t >= cellStart + DECODE_DURATION_MS) {
        row.push({ char: cell.char, color: cell.color });
      } else if (t < cellStart) {
        row.push({ char: cell.char === '⠀' ? '⠀' : ' ', color: cell.color });
        done = false;
      } else {
        const ch = SCRAMBLE_CHARS[Math.floor(rng() * SCRAMBLE_CHARS.length)];
        row.push({ char: ch, color: cell.color });
        done = false;
      }
    }
    cells.push(row);
  }
  return { done, cells };
}

module.exports = { SCRAMBLE_CHARS, DECODE_DURATION_MS, DECODE_STAGGER_MS, computeDecodeFrame };

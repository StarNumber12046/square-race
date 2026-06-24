/**
 * Procedural map generator for Square Race.
 *
 * The track is divided into a grid of vertical "columns". For each column we
 * independently decide:
 *   - How many gaps to punch through it (1–3)
 *   - Where each gap sits vertically
 *   - Whether to add horizontal shelves between this column and the next,
 *     forming enclosed tunnel segments
 *
 * A seeded PRNG (mulberry32) is used so a given seed always produces the
 * same map — useful for replays and sharing.
 */

import type { Platform, Checkpoint, FinishZone } from './types';
import { CANVAS_W, CANVAS_H } from './engine';

// ─── PRNG ─────────────────────────────────────────────────────────────────────

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WALL       = 12;   // border thickness
const COL_W      = 14;   // barrier column width
const MIN_GAP    = 72;   // min gap height (must comfortably fit a 22px racer)
const MAX_GAP    = 110;  // max gap height
const SHELF_T    = 12;   // horizontal shelf thickness
const INNER_TOP  = WALL;
const INNER_BOT  = CANVAS_H - WALL;
const TRACK_H    = INNER_BOT - INNER_TOP; // usable vertical space

// ─── Types ────────────────────────────────────────────────────────────────────

interface Column {
  x: number;
  gaps: Array<[number, number]>; // [gapTop, gapBot] in canvas coords
}

interface ProceduralMap {
  platforms: Platform[];
  checkpoints: Checkpoint[];
  finish: FinishZone;
  seed: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Punch a column with given gaps; return the solid wall segments. */
function buildColumn(x: number, gaps: Array<[number, number]>): Platform[] {
  const segs: Platform[] = [];
  let cursor = INNER_TOP;
  const sorted = [...gaps].sort((a, b) => a[0] - b[0]);
  for (const [gt, gb] of sorted) {
    if (cursor < gt)
      segs.push({ x, y: cursor, width: COL_W, height: gt - cursor, type: 'normal' });
    cursor = gb;
  }
  if (cursor < INNER_BOT)
    segs.push({ x, y: cursor, width: COL_W, height: INNER_BOT - cursor, type: 'normal' });
  return segs;
}

/**
 * Given two adjacent columns, punch horizontal shelves in the space between
 * them to form tunnels.  We treat each "channel" between vertically-adjacent
 * gaps (or between a wall and the first/last gap) as a candidate tunnel.
 * A shelf is added at the top and bottom of each such channel, leaving the
 * interior open for the racers to travel through.
 */
function buildShelvesBetween(
  leftCol: Column,
  rightCol: Column,
  rng: () => number,
): Platform[] {
  const shelves: Platform[] = [];

  // Collect all gap midpoints from both columns as horizontal "connection" Y coords
  const allGaps = [...leftCol.gaps, ...rightCol.gaps].sort((a, b) => a[0] - b[0]);

  // Derive horizontal bands that exist between the column pair
  // We'll identify the open vertical ranges and decide to wall off or leave open
  const bands: Array<[number, number]> = [];
  let cursor = INNER_TOP;
  for (const [gt, gb] of allGaps) {
    if (gt > cursor + 20) bands.push([cursor, gt]);
    cursor = Math.max(cursor, gb);
  }
  if (cursor < INNER_BOT - 20) bands.push([cursor, INNER_BOT]);

  const xStart = leftCol.x + COL_W;
  const xEnd   = rightCol.x;
  if (xEnd <= xStart + 10) return [];

  // For each band, randomly decide to add a shelf ceiling and/or floor to create
  // an enclosed tunnel corridor effect
  for (const [top, bot] of bands) {
    const height = bot - top;
    if (height < 30) continue;

    // With 65% probability, cap this band with shelves to form a tunnel
    if (rng() < 0.65) {
      // Ceiling shelf at band top
      shelves.push({ x: xStart, y: top, width: xEnd - xStart, height: SHELF_T, type: 'normal' });
      // Floor shelf at band bottom
      shelves.push({ x: xStart, y: bot - SHELF_T, width: xEnd - xStart, height: SHELF_T, type: 'normal' });
    } else if (height > 80 && rng() < 0.5) {
      // Wide band: add a single divider shelf partway through
      const midY = top + height * (0.35 + rng() * 0.3);
      shelves.push({ x: xStart, y: midY, width: xEnd - xStart, height: SHELF_T, type: 'normal' });
    }
  }

  return shelves;
}

/**
 * Generate non-overlapping gaps for a column.
 * numGaps: 1–3
 */
function generateGaps(numGaps: number, rng: () => number): Array<[number, number]> {
  const gaps: Array<[number, number]> = [];
  const slotH = TRACK_H / numGaps;
  for (let i = 0; i < numGaps; i++) {
    const gapH   = MIN_GAP + rng() * (MAX_GAP - MIN_GAP);
    const slotTop = INNER_TOP + i * slotH;
    const maxTop  = slotTop + slotH - gapH - 4;
    const gapTop  = slotTop + 4 + rng() * Math.max(0, maxTop - slotTop - 4);
    const gapBot  = gapTop + gapH;
    if (gapBot <= INNER_BOT) gaps.push([gapTop, gapBot]);
  }
  return gaps;
}

// ─── Main generator ───────────────────────────────────────────────────────────

export function generateMap(seed?: number): ProceduralMap {
  const usedSeed = seed ?? (Math.random() * 0xffffffff) | 0;
  const rng = mulberry32(usedSeed);

  // How many barrier columns? 4–7
  const numCols = 4 + Math.floor(rng() * 4);

  // Spread columns evenly across the track (leave room for spawn and finish)
  const trackStart = 140;
  const trackEnd   = CANVAS_W - 75;
  const step       = (trackEnd - trackStart) / (numCols + 1);

  const columns: Column[] = [];
  for (let i = 0; i < numCols; i++) {
    const x = Math.round(trackStart + step * (i + 1));
    // 1 gap for first/last column; 1–3 for middle ones
    const maxGaps = i === 0 || i === numCols - 1 ? 2 : 3;
    const numGaps = 1 + Math.floor(rng() * maxGaps);
    const gaps    = generateGaps(numGaps, rng);
    columns.push({ x, gaps });
  }

  const platforms: Platform[] = [];

  // Border walls
  platforms.push({ x: 0, y: 0,              width: CANVAS_W, height: WALL,    type: 'normal' });
  platforms.push({ x: 0, y: CANVAS_H - WALL, width: CANVAS_W, height: WALL,   type: 'normal' });
  platforms.push({ x: 0, y: 0,              width: WALL,     height: CANVAS_H, type: 'normal' });

  // Barrier columns
  for (const col of columns) {
    platforms.push(...buildColumn(col.x, col.gaps));
  }

  // Horizontal shelves between adjacent column pairs
  // Add a virtual "left wall column" so shelves can extend from the start
  const virtualLeft: Column = { x: WALL, gaps: [{ 0: INNER_TOP, 1: INNER_BOT } as unknown as [number, number]].map(() => [INNER_TOP, INNER_BOT] as [number, number]) };
  const extCols = [virtualLeft, ...columns];
  for (let i = 0; i < extCols.length - 1; i++) {
    platforms.push(...buildShelvesBetween(extCols[i], extCols[i + 1], rng));
  }
  // Also between last column and finish zone
  const virtualRight: Column = { x: CANVAS_W - 75, gaps: [[INNER_TOP, INNER_BOT]] };
  platforms.push(...buildShelvesBetween(extCols[extCols.length - 1], virtualRight, rng));

  // Checkpoints — one per inter-column gap, placed at the midpoint X and centremost gap Y
  const checkpoints: Checkpoint[] = columns.map(col => {
    const gaps = col.gaps;
    const midGap = gaps[Math.floor(gaps.length / 2)];
    const cy = (midGap[0] + midGap[1]) / 2;
    return { x: col.x + COL_W + step * 0.5, y: cy, radius: 16, passed: [false, false, false, false] };
  });

  // Finish zone
  const finish: FinishZone = {
    x: CANVAS_W - 62,
    y: WALL,
    width: 62,
    height: CANVAS_H - WALL * 2,
  };

  return { platforms, checkpoints, finish, seed: usedSeed };
}

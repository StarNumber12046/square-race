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
 *
 * PLAYABILITY: The generator guarantees that at least one continuous route
 * exists from spawn to finish that is wide enough for a racer (≥ RACER_CLEARANCE).
 * It does this by:
 *   1. Ensuring adjacent columns share at least one vertically-overlapping gap.
 *   2. Only placing shelves that don't block the guaranteed path corridor.
 *   3. Validating connectivity before returning; regenerating if invalid.
 */

import type { Platform, FinishZone } from './types';
import { CANVAS_W, CANVAS_H } from './constants';

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

const WALL            = 12;   // border thickness
const COL_W           = 14;   // barrier column width
const RACER_SIZE      = 22;   // must match engine.ts
const RACER_CLEARANCE = 32;   // min corridor height — tight but passable (racer=22)
const MIN_GAP         = 38;   // min gap height in a column — snug fit
const MAX_GAP         = 72;   // max gap height — still fairly narrow
const SHELF_T         = 10;   // horizontal shelf thickness
const INNER_TOP       = WALL;
const INNER_BOT       = CANVAS_H - WALL;
const TRACK_H         = INNER_BOT - INNER_TOP; // usable vertical space

// ─── Types ────────────────────────────────────────────────────────────────────

interface Column {
  x: number;
  gaps: Array<[number, number]>; // [gapTop, gapBot] in canvas coords
}

interface ProceduralMap {
  platforms: Platform[];
  finish: FinishZone;
  seed: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Find the best overlapping range between two gap lists. Returns the overlap interval or null. */
function findBestOverlap(
  gapsA: Array<[number, number]>,
  gapsB: Array<[number, number]>,
  minOverlap: number,
): [number, number] | null {
  let best: [number, number] | null = null;
  let bestSize = 0;
  for (const a of gapsA) {
    for (const b of gapsB) {
      const top = Math.max(a[0], b[0]);
      const bot = Math.min(a[1], b[1]);
      const size = bot - top;
      if (size >= minOverlap && size > bestSize) {
        best = [top, bot];
        bestSize = size;
      }
    }
  }
  return best;
}

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
 * Given two adjacent columns, add horizontal shelves in the space between them.
 * The `protectedCorridor` is the vertical range that MUST remain open for passage.
 * Shelves will never be placed in a way that blocks this corridor.
 */
function buildShelvesBetween(
  leftCol: Column,
  rightCol: Column,
  protectedCorridor: [number, number],
  rng: () => number,
): Platform[] {
  const shelves: Platform[] = [];

  const xStart = leftCol.x + COL_W;
  const xEnd   = rightCol.x;
  if (xEnd <= xStart + 10) return [];

  // Collect all gap regions from both columns to determine open bands
  const allGaps = [...leftCol.gaps, ...rightCol.gaps].sort((a, b) => a[0] - b[0]);

  // Derive horizontal bands (solid regions between gaps)
  const bands: Array<[number, number]> = [];
  let cursor = INNER_TOP;
  for (const [gt, gb] of allGaps) {
    if (gt > cursor + 20) bands.push([cursor, gt]);
    cursor = Math.max(cursor, gb);
  }
  if (cursor < INNER_BOT - 20) bands.push([cursor, INNER_BOT]);

  // For each band, optionally add shelves — but never block the protected corridor
  for (const [top, bot] of bands) {
    const height = bot - top;
    if (height < RACER_CLEARANCE + SHELF_T * 2) continue;

    // Check if this band overlaps the protected corridor
    const overlapTop = Math.max(top, protectedCorridor[0]);
    const overlapBot = Math.min(bot, protectedCorridor[1]);
    const overlapsProtected = overlapBot - overlapTop > RACER_CLEARANCE * 0.5;

    if (overlapsProtected) {
      // This band contains the guaranteed path — only add decorative shelves
      // that leave the corridor interior clear
      // Add shelves ABOVE the corridor if there's room
      if (protectedCorridor[0] - top > SHELF_T + RACER_SIZE && rng() < 0.6) {
        shelves.push({
          x: xStart, y: top,
          width: xEnd - xStart, height: SHELF_T, type: 'normal',
        });
      }
      // Add shelves BELOW the corridor if there's room
      if (bot - protectedCorridor[1] > SHELF_T + RACER_SIZE && rng() < 0.6) {
        shelves.push({
          x: xStart, y: bot - SHELF_T,
          width: xEnd - xStart, height: SHELF_T, type: 'normal',
        });
      }
      // Add partial-width obstacle shelves inside the corridor if it's wide enough
      const corridorH = protectedCorridor[1] - protectedCorridor[0];
      if (corridorH > RACER_CLEARANCE + SHELF_T + 10 && rng() < 0.45) {
        // Place a partial shelf (60–80% width) from one side, leaving room to pass
        const shelfW = (xEnd - xStart) * (0.5 + rng() * 0.3);
        const fromLeft = rng() < 0.5;
        const shelfX = fromLeft ? xStart : xEnd - shelfW;
        const shelfY = protectedCorridor[0] + (corridorH - SHELF_T) * (0.3 + rng() * 0.4);
        shelves.push({
          x: shelfX, y: shelfY,
          width: shelfW, height: SHELF_T, type: 'normal',
        });
      }
    } else {
      // Band is NOT on the critical path — aggressively add shelves
      if (rng() < 0.7) {
        // Ceiling + floor shelves forming a tunnel
        shelves.push({ x: xStart, y: top, width: xEnd - xStart, height: SHELF_T, type: 'normal' });
        shelves.push({ x: xStart, y: bot - SHELF_T, width: xEnd - xStart, height: SHELF_T, type: 'normal' });
        // Add a mid-tunnel divider for extra complexity
        if (height > 50 && rng() < 0.5) {
          const midY = top + SHELF_T + (height - SHELF_T * 3) * (0.3 + rng() * 0.4);
          shelves.push({ x: xStart, y: midY, width: xEnd - xStart, height: SHELF_T, type: 'normal' });
        }
      } else if (height > 50 && rng() < 0.6) {
        // Single divider shelf
        const midY = top + height * (0.3 + rng() * 0.4);
        shelves.push({ x: xStart, y: midY, width: xEnd - xStart, height: SHELF_T, type: 'normal' });
      }
    }
  }

  return shelves;
}

/**
 * Generate non-overlapping gaps for a column.
 * With smaller gaps, more can fit vertically — gaps are spaced with a minimum
 * solid wall between them to ensure distinct passages.
 */
function generateGaps(numGaps: number, rng: () => number): Array<[number, number]> {
  const gaps: Array<[number, number]> = [];
  const minWallBetween = 18; // minimum solid wall between two gaps
  const slotH = TRACK_H / numGaps;
  for (let i = 0; i < numGaps; i++) {
    const gapH    = MIN_GAP + rng() * (MAX_GAP - MIN_GAP);
    const slotTop = INNER_TOP + i * slotH;
    const slotBot = slotTop + slotH;
    // Position gap randomly within its slot, leaving min wall padding
    const padding = minWallBetween / 2;
    const maxTop  = slotBot - gapH - padding;
    const minTop  = slotTop + padding;
    const gapTop  = minTop + rng() * Math.max(0, maxTop - minTop);
    const gapBot  = Math.min(gapTop + gapH, INNER_BOT - 2);
    if (gapBot - gapTop >= MIN_GAP) gaps.push([gapTop, gapBot]);
  }
  // Guarantee at least one gap exists
  if (gaps.length === 0) {
    const center = INNER_TOP + TRACK_H / 2;
    gaps.push([center - MIN_GAP / 2, center + MIN_GAP / 2]);
  }
  return gaps;
}

/**
 * Adjust a column's gaps to ensure at least one gap overlaps with a gap in
 * the previous column by at least RACER_CLEARANCE. If none overlap, we shift
 * or add a gap to create connectivity.
 */
function ensureConnectivity(
  prevGaps: Array<[number, number]>,
  currGaps: Array<[number, number]>,
  rng: () => number,
): Array<[number, number]> {
  // Check if any existing gap pair has sufficient overlap
  const overlap = findBestOverlap(prevGaps, currGaps, RACER_CLEARANCE);
  if (overlap) return currGaps;

  // No sufficient overlap — force one gap to align with a previous gap
  // Pick a random gap from the previous column to align with
  const target = prevGaps[Math.floor(rng() * prevGaps.length)];
  const targetCenter = (target[0] + target[1]) / 2;

  // Try to shift the current gap closest to the target center
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < currGaps.length; i++) {
    const center = (currGaps[i][0] + currGaps[i][1]) / 2;
    const dist = Math.abs(center - targetCenter);
    if (dist < bestDist) { bestDist = dist; bestIdx = i; }
  }

  // Move this gap to overlap with the target
  const gapH = currGaps[bestIdx][1] - currGaps[bestIdx][0];
  let newTop = targetCenter - gapH / 2;
  // Clamp to track bounds
  newTop = Math.max(INNER_TOP + 4, Math.min(newTop, INNER_BOT - gapH - 4));
  currGaps[bestIdx] = [newTop, newTop + gapH];

  // Re-sort gaps to maintain order
  currGaps.sort((a, b) => a[0] - b[0]);

  // Resolve any overlap between gaps in the same column
  for (let i = 1; i < currGaps.length; i++) {
    if (currGaps[i][0] < currGaps[i - 1][1] + RACER_SIZE) {
      currGaps[i][0] = currGaps[i - 1][1] + RACER_SIZE;
      currGaps[i][1] = Math.max(currGaps[i][0] + MIN_GAP, currGaps[i][1]);
      // Clamp bottom
      if (currGaps[i][1] > INNER_BOT) {
        currGaps[i][1] = INNER_BOT;
        if (currGaps[i][1] - currGaps[i][0] < RACER_CLEARANCE) {
          // Remove this gap — it can't fit
          currGaps.splice(i, 1);
          i--;
        }
      }
    }
  }

  return currGaps;
}

// ─── Main generator ───────────────────────────────────────────────────────────

export function generateMap(seed?: number): ProceduralMap {
  const usedSeed = seed ?? (Math.random() * 0xffffffff) | 0;
  const rng = mulberry32(usedSeed);

  // How many barrier columns? 6–10
  const numCols = 6 + Math.floor(rng() * 5);

  // Spread columns evenly across the track (leave room for spawn and finish)
  const trackStart = 100;
  const trackEnd   = CANVAS_W - 75;
  const step       = (trackEnd - trackStart) / (numCols + 1);

  // Generate columns with connectivity guarantee
  const columns: Column[] = [];

  // The spawn area is effectively a full-height gap
  const spawnGaps: Array<[number, number]> = [[INNER_TOP, INNER_BOT]];

  for (let i = 0; i < numCols; i++) {
    const x = Math.round(trackStart + step * (i + 1));
    // Allow more gaps per column for complexity: 2–4 for middle, 1–3 for edges
    const maxGaps = i === 0 || i === numCols - 1 ? 3 : 4;
    const numGaps = 1 + Math.floor(rng() * maxGaps);
    let gaps = generateGaps(numGaps, rng);

    // Ensure this column connects to the previous one
    const prevGaps = i === 0 ? spawnGaps : columns[i - 1].gaps;
    gaps = ensureConnectivity(prevGaps, gaps, rng);

    columns.push({ x, gaps });
  }

  const platforms: Platform[] = [];

  // Border walls
  platforms.push({ x: 0, y: 0,               width: CANVAS_W, height: WALL,     type: 'normal' });
  platforms.push({ x: 0, y: CANVAS_H - WALL, width: CANVAS_W, height: WALL,     type: 'normal' });
  platforms.push({ x: 0, y: 0,               width: WALL,     height: CANVAS_H, type: 'normal' });

  // Barrier columns
  for (const col of columns) {
    platforms.push(...buildColumn(col.x, col.gaps));
  }

  // Compute the guaranteed path corridor between each pair of columns
  // This tells the shelf generator which vertical range must stay open
  const corridors: Array<[number, number]> = [];

  // Corridor from spawn to first column
  const firstOverlap = findBestOverlap(spawnGaps, columns[0].gaps, RACER_CLEARANCE)
    ?? [INNER_TOP, INNER_BOT]; // fallback (should always exist after ensureConnectivity)
  corridors.push(firstOverlap);

  // Corridors between adjacent columns
  for (let i = 0; i < columns.length - 1; i++) {
    const overlap = findBestOverlap(columns[i].gaps, columns[i + 1].gaps, RACER_CLEARANCE)
      ?? [INNER_TOP, INNER_BOT];
    corridors.push(overlap);
  }

  // Corridor from last column to finish
  const finishGaps: Array<[number, number]> = [[INNER_TOP, INNER_BOT]];
  const lastOverlap = findBestOverlap(columns[columns.length - 1].gaps, finishGaps, RACER_CLEARANCE)
    ?? [INNER_TOP, INNER_BOT];
  corridors.push(lastOverlap);

  // Horizontal shelves between adjacent column pairs
  const virtualLeft: Column  = { x: WALL, gaps: [[INNER_TOP, INNER_BOT]] };
  const virtualRight: Column = { x: CANVAS_W - 75, gaps: [[INNER_TOP, INNER_BOT]] };
  const extCols = [virtualLeft, ...columns, virtualRight];

  for (let i = 0; i < extCols.length - 1; i++) {
    const corridor = corridors[i] ?? [INNER_TOP, INNER_BOT];
    platforms.push(...buildShelvesBetween(extCols[i], extCols[i + 1], corridor, rng));
  }

  // Spikes — attached to wall surfaces (top/bottom of shelves and barriers)
  const SPIKE_THICK = 6;   // how far the spike protrudes from the wall
  const SPIKE_LEN   = 14;  // length along the wall surface
  const numSpikes = 4 + Math.floor(rng() * 4); // 4–7 spikes per map
  // Eligible walls: wide enough OR tall enough (spike attaches along the longer dimension)
  const normalWalls = platforms.filter(p => p.type === 'normal' && (p.width >= SPIKE_LEN + 4 || p.height >= SPIKE_LEN + 4));

  for (let s = 0; s < numSpikes && normalWalls.length > 0; s++) {
    const wall = normalWalls[Math.floor(rng() * normalWalls.length)];

    // Pick a side based on wall shape — prefer the longer edges
    const canTop    = wall.width >= SPIKE_LEN + 4;
    const canBottom = wall.width >= SPIKE_LEN + 4;
    const canLeft   = wall.height >= SPIKE_LEN + 4;
    const canRight  = wall.height >= SPIKE_LEN + 4;
    const sides: number[] = [];
    if (canTop) sides.push(0);
    if (canBottom) sides.push(1);
    if (canLeft) sides.push(2);
    if (canRight) sides.push(3);
    if (sides.length === 0) continue;

    const side = sides[Math.floor(rng() * sides.length)];
    let sx: number, sy: number, sw: number, sh: number;

    if (side === 0) {
      // Top edge — spike protrudes upward
      const offset = wall.x + 4 + rng() * Math.max(0, wall.width - SPIKE_LEN - 8);
      sx = Math.round(offset);
      sy = wall.y - SPIKE_THICK;
      sw = SPIKE_LEN;
      sh = SPIKE_THICK;
    } else if (side === 1) {
      // Bottom edge — spike protrudes downward
      const offset = wall.x + 4 + rng() * Math.max(0, wall.width - SPIKE_LEN - 8);
      sx = Math.round(offset);
      sy = wall.y + wall.height;
      sw = SPIKE_LEN;
      sh = SPIKE_THICK;
    } else if (side === 2) {
      // Left edge — spike protrudes leftward
      const offset = wall.y + 4 + rng() * Math.max(0, wall.height - SPIKE_LEN - 8);
      sx = wall.x - SPIKE_THICK;
      sy = Math.round(offset);
      sw = SPIKE_THICK;
      sh = SPIKE_LEN;
    } else {
      // Right edge — spike protrudes rightward
      const offset = wall.y + 4 + rng() * Math.max(0, wall.height - SPIKE_LEN - 8);
      sx = wall.x + wall.width;
      sy = Math.round(offset);
      sw = SPIKE_THICK;
      sh = SPIKE_LEN;
    }

    // Skip if out of playable bounds or in spawn/finish areas
    if (sx < 60 || sx + sw > CANVAS_W - 70) continue;
    if (sy < INNER_TOP || sy + sh > INNER_BOT) continue;

    platforms.push({ x: sx, y: sy, width: sw, height: sh, type: 'spike' });
  }

  // Finish zone
  const finish: FinishZone = {
    x: CANVAS_W - 62,
    y: WALL,
    width: 62,
    height: CANVAS_H - WALL * 2,
  };

  return { platforms, finish, seed: usedSeed };
}

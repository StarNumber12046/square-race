import type {
  Racer,
  Platform,
  Checkpoint,
  FinishZone,
  RacerColor,
} from './types';
import { generateMap } from './mapgen';

export const CANVAS_W = 900;
export const CANVAS_H = 500;

const RACER_SIZE = 22;
const BASE_SPEED = 6;

const COLORS: RacerColor[] = ['red', 'blue', 'yellow', 'green'];
export const HEX_COLORS: Record<RacerColor, string> = {
  red:    '#e84040',
  blue:   '#4070e8',
  yellow: '#f0c030',
  green:  '#40c060',
};

// ─── Map ──────────────────────────────────────────────────────────────────────

export function buildMap(seed?: number): {
  platforms: Platform[];
  checkpoints: Checkpoint[];
  finish: FinishZone;
  seed: number;
} {
  return generateMap(seed);
}

// ─── Racer spawn ──────────────────────────────────────────────────────────────

export function spawnRacers(): Racer[] {
  // Stack 4 racers in the left corridor, spread vertically
  const positions = [80, 180, 280, 380]; // y centres
  return COLORS.map((color, i) => {
    const angleDeg = 30 + Math.random() * 15;
    const rad = (angleDeg * Math.PI) / 180;
    const sign = i % 2 === 0 ? 1 : -1;
    const speed = BASE_SPEED + Math.random() * 1.5;
    return {
      id: i,
      color,
      x: 30 + Math.random() * 8,
      y: positions[i] + (Math.random() - 0.5) * 12,
      vx:  speed * Math.cos(rad),
      vy: sign * speed * Math.sin(rad),
      size: RACER_SIZE,
      stunTimer: 0,
      finished: false,
      finishRank: null,
      trail: [],
    };
  });
}

// ─── Physics ──────────────────────────────────────────────────────────────────

function rectOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function resolveRacerPlatform(r: Racer, p: Platform) {
  const half = r.size / 2;
  const rL = r.x - half, rR = r.x + half;
  const rT = r.y - half, rB = r.y + half;

  if (!rectOverlap(rL, rT, r.size, r.size, p.x, p.y, p.width, p.height)) return;

  const oL = rR - p.x;
  const oR = (p.x + p.width)  - rL;
  const oT = rB - p.y;
  const oB = (p.y + p.height) - rT;

  const minH = Math.min(oT, oB);
  const minV = Math.min(oL, oR);

  if (minH <= minV) {
    // horizontal surface → invert vy
    if (oT < oB) { r.y -= oT; } else { r.y += oB; }
    r.vy = -r.vy;
  } else {
    // vertical surface → invert vx
    if (oL < oR) { r.x -= oL; } else { r.x += oR; }
    r.vx = -r.vx;
  }
}

function resolveRacerRacer(a: Racer, b: Racer) {
  const half = a.size / 2;
  const aL = a.x-half, aR = a.x+half, aT = a.y-half, aB = a.y+half;
  const bL = b.x-half, bR = b.x+half, bT = b.y-half, bB = b.y+half;

  if (!rectOverlap(aL, aT, a.size, a.size, bL, bT, b.size, b.size)) return;

  const oL = aR - bL, oR = bR - aL;
  const oT = aB - bT, oB = bB - aT;
  const minH = Math.min(oT, oB);
  const minV = Math.min(oL, oR);

  if (minH <= minV) {
    const push = minH / 2 + 0.5;
    if (oT < oB) { a.y -= push; b.y += push; } else { a.y += push; b.y -= push; }
    [a.vy, b.vy] = [b.vy, a.vy];
  } else {
    const push = minV / 2 + 0.5;
    if (oL < oR) { a.x -= push; b.x += push; } else { a.x += push; b.x -= push; }
    [a.vx, b.vx] = [b.vx, a.vx];
  }
}

export function stepPhysics(
  racers: Racer[],
  platforms: Platform[],
  checkpoints: Checkpoint[],
  finish: FinishZone,
  finishCount: { value: number },
) {
  for (const r of racers) {
    if (r.finished) continue;

    r.x += r.vx;
    r.y += r.vy;

    // Speed normalisation — billiard: keep speed roughly constant
    const spd = Math.hypot(r.vx, r.vy);
    const target = BASE_SPEED + r.id * 0.2; // slight spread
    if (spd > 0) {
      const factor = target / spd;
      // Soft-clamp: only correct when drifting far from target
      if (spd > target * 1.5 || spd < target * 0.6) {
        r.vx *= factor;
        r.vy *= factor;
      }
    }

    for (const p of platforms) resolveRacerPlatform(r, p);
    for (const o of racers) { if (o.id !== r.id && !o.finished) resolveRacerRacer(r, o); }

    // Canvas bounds
    const h = r.size / 2;
    if (r.y - h < 0)        { r.y = h;           r.vy =  Math.abs(r.vy); }
    if (r.y + h > CANVAS_H) { r.y = CANVAS_H - h; r.vy = -Math.abs(r.vy); }
    if (r.x - h < 0)        { r.x = h;            r.vx =  Math.abs(r.vx); }
    if (r.x + h > CANVAS_W) { r.x = CANVAS_W - h; r.vx = -Math.abs(r.vx); }

    // Trail
    r.trail.push({ x: r.x, y: r.y });
    if (r.trail.length > 20) r.trail.shift();

    // Checkpoints
    for (const cp of checkpoints) {
      if (!cp.passed[r.id]) {
        if (Math.hypot(r.x - cp.x, r.y - cp.y) < cp.radius + r.size / 2)
          cp.passed[r.id] = true;
      }
    }

    // Finish
    if (rectOverlap(r.x-h, r.y-h, r.size, r.size, finish.x, finish.y, finish.width, finish.height)) {
      r.finished = true;
      r.finishRank = ++finishCount.value;
      r.vx = 0; r.vy = 0;
    }
  }
}

export function getRankings(racers: Racer[]): Racer[] {
  return [...racers].sort((a, b) => {
    if (a.finished && b.finished) return (a.finishRank ?? 99) - (b.finishRank ?? 99);
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.x - a.x;
  });
}

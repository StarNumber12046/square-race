import type {
  Racer,
  Platform,
  Checkpoint,
  FinishZone,
  RacerColor,
} from './types';

export const CANVAS_W = 900;
export const CANVAS_H = 500;

const RACER_SIZE = 24;
// Base speed magnitude — angle will be 30–45°
const BASE_SPEED = 6;

const COLORS: RacerColor[] = ['red', 'blue', 'yellow', 'green'];
export const HEX_COLORS: Record<RacerColor, string> = {
  red: '#e84040',
  blue: '#4070e8',
  yellow: '#f0c030',
  green: '#40c060',
};

// ─── Map builder ──────────────────────────────────────────────────────────────

export function buildMap(): {
  platforms: Platform[];
  checkpoints: Checkpoint[];
  finish: FinishZone;
} {
  const platforms: Platform[] = [];

  // Top & bottom walls
  platforms.push({ x: 0, y: 0,            width: CANVAS_W, height: 14,  type: 'normal' });
  platforms.push({ x: 0, y: CANVAS_H - 14, width: CANVAS_W, height: 14, type: 'normal' });
  // Left wall (behind start — acts as backstop only, racers move right)
  platforms.push({ x: 0, y: 0, width: 14, height: CANVAS_H, type: 'normal' });

  // ── Zig-zag obstacles ──────────────────────────────────────────────────────
  // Vertical baffles placed across the track, alternating top-attached and
  // bottom-attached so there's always a gap to squeeze through.
  //
  // Format: [x, y, w, h]   (left edge, top edge, width, height)
  const baffles: [number, number, number, number, 'normal' | 'spike'][] = [
    // first column — top baffle
    [200, 14, 18, 280, 'normal'],
    // first column — bottom baffle (gap in middle)
    [200, 360, 18, CANVAS_H - 360 - 14, 'normal'],

    // spike strip across mid-track
    [310, 190, 120, 18, 'spike'],

    // second column — bottom baffle
    [420, 200, 18, CANVAS_H - 200 - 14, 'normal'],
    // second column — top baffle
    [420, 14, 18, 160, 'normal'],

    // spike strip
    [530, 80, 120, 18, 'spike'],

    // third column — top baffle
    [640, 14, 18, 260, 'normal'],
    // third column — bottom baffle
    [640, 340, 18, CANVAS_H - 340 - 14, 'normal'],

    // spike strip near finish
    [750, 200, 100, 18, 'spike'],
  ];

  for (const [x, y, w, h, type] of baffles) {
    platforms.push({ x, y, width: w, height: h, type });
  }

  // ── Checkpoints ──────────────────────────────────────────────────────────
  const checkpoints: Checkpoint[] = [
    { x: 300, y: CANVAS_H / 2, radius: 18, passed: [false, false, false, false] },
    { x: 520, y: CANVAS_H / 2, radius: 18, passed: [false, false, false, false] },
    { x: 730, y: CANVAS_H / 2, radius: 18, passed: [false, false, false, false] },
  ];

  // ── Finish zone (right side) ──────────────────────────────────────────────
  const finish: FinishZone = {
    x: CANVAS_W - 60,
    y: 14,
    width: 60,
    height: CANVAS_H - 28,
  };

  return { platforms, checkpoints, finish };
}

// ─── Racer spawner ────────────────────────────────────────────────────────────

export function spawnRacers(): Racer[] {
  // 4 racers stacked vertically on the left, evenly spaced
  const laneHeight = (CANVAS_H - 28) / 4;
  return COLORS.map((color, i) => {
    // angle between 30° and 45°, randomised slightly per racer
    const angleDeg = 30 + Math.random() * 15;
    const angleRad = (angleDeg * Math.PI) / 180;
    // alternate up/down vertical component
    const sign = i % 2 === 0 ? 1 : -1;
    const speed = BASE_SPEED + Math.random() * 1.5;
    return {
      id: i,
      color,
      x: 40 + Math.random() * 10,
      y: 14 + laneHeight * i + laneHeight / 2 + (Math.random() - 0.5) * 10,
      vx: speed * Math.cos(angleRad),
      vy: sign * speed * Math.sin(angleRad),
      size: RACER_SIZE,
      stunTimer: 0,
      finished: false,
      finishRank: null,
      trail: [],
    };
  });
}

// ─── Collision helpers ────────────────────────────────────────────────────────

function rectOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/**
 * Resolve racer vs axis-aligned platform with strict velocity inversion:
 *  - Hit a horizontal surface (top/bottom of platform) → invert vy
 *  - Hit a vertical surface  (left/right of platform) → invert vx
 */
function resolveRacerPlatform(r: Racer, p: Platform) {
  const half = r.size / 2;
  const rLeft   = r.x - half;
  const rRight  = r.x + half;
  const rTop    = r.y - half;
  const rBottom = r.y + half;

  if (!rectOverlap(rLeft, rTop, r.size, r.size, p.x, p.y, p.width, p.height)) return;

  const overlapLeft   = rRight  - p.x;
  const overlapRight  = (p.x + p.width)  - rLeft;
  const overlapTop    = rBottom - p.y;
  const overlapBottom = (p.y + p.height) - rTop;

  const minH = Math.min(overlapTop, overlapBottom);
  const minV = Math.min(overlapLeft, overlapRight);

  const spikeMult = p.type === 'spike' ? 1.4 : 1.0;

  if (minH <= minV) {
    // Horizontal surface hit → invert vy
    if (overlapTop < overlapBottom) {
      r.y -= overlapTop;
    } else {
      r.y += overlapBottom;
    }
    r.vy = -r.vy * spikeMult;
    if (p.type === 'spike') { r.vx *= 0.7; r.stunTimer = 20; }
  } else {
    // Vertical surface hit → invert vx
    if (overlapLeft < overlapRight) {
      r.x -= overlapLeft;
    } else {
      r.x += overlapRight;
    }
    r.vx = -r.vx * spikeMult;
    if (p.type === 'spike') { r.vy *= 0.7; r.stunTimer = 20; }
  }
}

/**
 * Resolve two racers colliding:
 *  - Determine collision axis (horizontal vs vertical overlap)
 *  - Swap the appropriate velocity components
 */
function resolveRacerRacer(a: Racer, b: Racer) {
  const half = a.size / 2; // both same size
  const aLeft   = a.x - half; const aRight  = a.x + half;
  const aTop    = a.y - half; const aBottom = a.y + half;
  const bLeft   = b.x - half; const bRight  = b.x + half;
  const bTop    = b.y - half; const bBottom = b.y + half;

  if (!rectOverlap(aLeft, aTop, a.size, a.size, bLeft, bTop, b.size, b.size)) return;

  const overlapLeft   = aRight  - bLeft;
  const overlapRight  = bRight  - aLeft;
  const overlapTop    = aBottom - bTop;
  const overlapBottom = bBottom - aTop;

  const minH = Math.min(overlapTop, overlapBottom);
  const minV = Math.min(overlapLeft, overlapRight);

  if (minH <= minV) {
    // Horizontal collision → swap vy
    const push = minH / 2 + 0.5;
    if (overlapTop < overlapBottom) { a.y -= push; b.y += push; }
    else                            { a.y += push; b.y -= push; }
    [a.vy, b.vy] = [b.vy, a.vy];
  } else {
    // Vertical collision → swap vx
    const push = minV / 2 + 0.5;
    if (overlapLeft < overlapRight) { a.x -= push; b.x += push; }
    else                            { a.x += push; b.x -= push; }
    [a.vx, b.vx] = [b.vx, a.vx];
  }
}

// ─── Main physics step ────────────────────────────────────────────────────────

export function stepPhysics(
  racers: Racer[],
  platforms: Platform[],
  checkpoints: Checkpoint[],
  finish: FinishZone,
  finishCount: { value: number },
) {
  for (const r of racers) {
    if (r.finished) continue;

    if (r.stunTimer > 0) r.stunTimer--;

    r.x += r.vx;
    r.y += r.vy;

    // Speed clamp (no gravity — pure billiard)
    const speed = Math.sqrt(r.vx * r.vx + r.vy * r.vy);
    const maxSpeed = 12;
    const minSpeed = 4;
    if (speed > maxSpeed) { r.vx *= maxSpeed / speed; r.vy *= maxSpeed / speed; }
    if (speed < minSpeed && speed > 0) { r.vx *= minSpeed / speed; r.vy *= minSpeed / speed; }

    // Platform collisions
    for (const p of platforms) {
      resolveRacerPlatform(r, p);
    }

    // Racer-racer collisions
    for (const other of racers) {
      if (other.id !== r.id && !other.finished) {
        resolveRacerRacer(r, other);
      }
    }

    // Canvas boundary (top/bottom → invert vy; left → invert vx; right handled by finish)
    const half = r.size / 2;
    if (r.y - half < 0)            { r.y = half;            r.vy =  Math.abs(r.vy); }
    if (r.y + half > CANVAS_H)     { r.y = CANVAS_H - half; r.vy = -Math.abs(r.vy); }
    if (r.x - half < 0)            { r.x = half;            r.vx =  Math.abs(r.vx); }
    if (r.x + half > CANVAS_W)     { r.x = CANVAS_W - half; r.vx = -Math.abs(r.vx); }

    // Trail
    r.trail.push({ x: r.x, y: r.y });
    if (r.trail.length > 18) r.trail.shift();

    // Checkpoints
    for (const cp of checkpoints) {
      if (!cp.passed[r.id]) {
        const dx = r.x - cp.x;
        const dy = r.y - cp.y;
        if (Math.sqrt(dx * dx + dy * dy) < cp.radius + r.size / 2) {
          cp.passed[r.id] = true;
        }
      }
    }

    // Finish zone
    if (rectOverlap(r.x - half, r.y - half, r.size, r.size,
                    finish.x, finish.y, finish.width, finish.height)) {
      r.finished = true;
      r.finishRank = ++finishCount.value;
      r.vx = 0; r.vy = 0;
    }
  }
}

// ─── Rankings ─────────────────────────────────────────────────────────────────

export function getRankings(racers: Racer[]): Racer[] {
  return [...racers].sort((a, b) => {
    if (a.finished && b.finished) return (a.finishRank ?? 99) - (b.finishRank ?? 99);
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.x - a.x; // higher x = further right = better rank
  });
}

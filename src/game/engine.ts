import type {
  Racer,
  Platform,
  Checkpoint,
  FinishZone,
  RacerColor,
} from './types';

export const CANVAS_W = 900;
export const CANVAS_H = 500;

const RACER_SIZE = 22;
const BASE_SPEED = 6;
const WALL = 12; // border wall thickness

const COLORS: RacerColor[] = ['red', 'blue', 'yellow', 'green'];
export const HEX_COLORS: Record<RacerColor, string> = {
  red:    '#e84040',
  blue:   '#4070e8',
  yellow: '#f0c030',
  green:  '#40c060',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a vertical barrier column with named gap openings.
 *  gaps: array of [gapTop, gapBottom] in canvas coords.
 *  Returns the wall segments (the solid parts between / outside the gaps). */
function vBarrier(
  x: number,
  thickness: number,
  gaps: Array<[number, number]>,
): Platform[] {
  const segs: Platform[] = [];
  let cursor = WALL;
  const bottom = CANVAS_H - WALL;
  // Sort gaps top-to-bottom
  const sorted = [...gaps].sort((a, b) => a[0] - b[0]);
  for (const [gt, gb] of sorted) {
    if (cursor < gt) {
      segs.push({ x, y: cursor, width: thickness, height: gt - cursor, type: 'normal' });
    }
    cursor = gb;
  }
  if (cursor < bottom) {
    segs.push({ x, y: cursor, width: thickness, height: bottom - cursor, type: 'normal' });
  }
  return segs;
}

/** Horizontal shelf — full-width minus cutouts at left/right ends to allow entry/exit. */
function hShelf(
  y: number,
  thickness: number,
  xStart: number,
  xEnd: number,
): Platform {
  return { x: xStart, y, width: xEnd - xStart, height: thickness, type: 'normal' };
}

// ─── Map ──────────────────────────────────────────────────────────────────────

export function buildMap(): {
  platforms: Platform[];
  checkpoints: Checkpoint[];
  finish: FinishZone;
} {
  const platforms: Platform[] = [];

  // ── Border walls ──────────────────────────────────────────────────────────
  platforms.push({ x: 0, y: 0,            width: CANVAS_W, height: WALL,   type: 'normal' }); // top
  platforms.push({ x: 0, y: CANVAS_H-WALL,width: CANVAS_W, height: WALL,   type: 'normal' }); // bottom
  platforms.push({ x: 0, y: 0,            width: WALL,     height: CANVAS_H,type: 'normal' }); // left

  // ── Column 1  (x=155)  — two gaps: upper-left + lower-right routing ───────
  //    Gaps: [80,152]  [320,392]
  platforms.push(...vBarrier(155, 14, [[80, 152], [320, 392]]));

  // ── Horizontal divider between the two col-1 gaps (forces bounce routing) ─
  //    sits in the mid-section between x=155 and col2, attached to top wall
  platforms.push(hShelf(130, 12, 155+14, 290));      // top shelf in upper corridor
  platforms.push(hShelf(340, 12, 155+14, 290));      // floor shelf in lower corridor

  // ── Column 2  (x=290)  — single central gap ───────────────────────────────
  //    Gap: [195, 267]  (centre of canvas ≈ 250)
  platforms.push(...vBarrier(290, 14, [[195, 267]]));

  // ── Narrow horizontal tunnel between col2 and col3 ────────────────────────
  //    Top wall of upper channel and bottom wall of lower channel
  platforms.push(hShelf( 90, 12, 304, 430));   // upper channel ceiling
  platforms.push(hShelf(160, 12, 304, 430));   // upper channel floor
  platforms.push(hShelf(310, 12, 304, 430));   // lower channel ceiling
  platforms.push(hShelf(390, 12, 304, 430));   // lower channel floor

  // ── Column 3  (x=430)  — three gaps: top, mid, bottom ────────────────────
  //    Gaps: [WALL,90]  [160,310]  [390,CANVAS_H-WALL]
  platforms.push(...vBarrier(430, 14, [
    [WALL, 90],
    [160, 310],
    [390, CANVAS_H - WALL],
  ]));

  // ── Funnel chamber between col3 and col4 ─────────────────────────────────
  //    Two angled shelves pinching toward the centre tunnel
  platforms.push(hShelf( 80, 12, 444, 570));   // top pinch
  platforms.push(hShelf(220, 12, 444, 570));   // upper-mid divider
  platforms.push(hShelf(270, 12, 444, 570));   // lower-mid divider
  platforms.push(hShelf(400, 12, 444, 570));   // bottom pinch

  // ── Column 4  (x=570)  — two gaps: upper + lower ─────────────────────────
  //    Gaps: [80,220]  [270,400]
  platforms.push(...vBarrier(570, 14, [[80, 220], [270, 400]]));

  // ── S-bend corridors between col4 and col5 ────────────────────────────────
  platforms.push(hShelf(160, 12, 584, 700));   // upper corridor floor
  platforms.push(hShelf( 80, 12, 584, 700));   // upper corridor ceiling (joins top wall)
  platforms.push(hShelf(340, 12, 584, 700));   // lower corridor ceiling
  platforms.push(hShelf(410, 12, 584, 700));   // lower corridor floor

  // ── Column 5  (x=700)  — single centre-bottom gap ────────────────────────
  //    Gap: [200, 410]  (wide central opening)
  platforms.push(...vBarrier(700, 14, [[200, 410]]));

  // ── Final approach corridor (col5 → finish) ───────────────────────────────
  //    Top and bottom shelves funnel into a central corridor before finish
  platforms.push(hShelf(200, 12, 714, 838));
  platforms.push(hShelf(410, 12, 714, 838));

  // ── Checkpoints (centre of each major gap) ───────────────────────────────
  const checkpoints: Checkpoint[] = [
    { x: 224, y: 231, radius: 16, passed: [false,false,false,false] }, // col1-2 passage
    { x: 360, y: 231, radius: 16, passed: [false,false,false,false] }, // col2-3 passage
    { x: 500, y: 231, radius: 16, passed: [false,false,false,false] }, // col3-4 passage
    { x: 635, y: 231, radius: 16, passed: [false,false,false,false] }, // col4-5 passage
  ];

  // ── Finish zone ───────────────────────────────────────────────────────────
  const finish: FinishZone = {
    x: CANVAS_W - 62,
    y: WALL,
    width: 62,
    height: CANVAS_H - WALL * 2,
  };

  return { platforms, checkpoints, finish };
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

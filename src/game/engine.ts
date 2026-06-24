import type {
  Racer,
  Platform,
  Checkpoint,
  FinishZone,
  GameConfig,
  RacerColor,
} from './types';

const CANVAS_W = 600;
const CANVAS_H = 800;
const GRAVITY = 0.4;
const FRICTION = 0.985;
const RACER_SIZE = 22;
const BOUNCE = 0.6;

const COLORS: RacerColor[] = ['red', 'blue', 'yellow', 'green'];
const HEX: Record<RacerColor, string> = {
  red: '#e84040',
  blue: '#4070e8',
  yellow: '#f0c030',
  green: '#40c060',
};

export function buildMap(): { platforms: Platform[]; checkpoints: Checkpoint[]; finish: FinishZone } {
  const platforms: Platform[] = [];

  // ── Bottom starting gate separators ──────────────────────────────────────
  // Four lanes: each ~100px wide, separated by thin walls
  for (let i = 1; i <= 3; i++) {
    platforms.push({ x: i * 137 - 6, y: 700, width: 12, height: 90, type: 'normal' });
  }

  // ── Floor ─────────────────────────────────────────────────────────────────
  platforms.push({ x: 0, y: 780, width: CANVAS_W, height: 20, type: 'normal' });

  // ── Zig-zag corridor system ────────────────────────────────────────────────
  // Each row alternates left-open and right-open
  const zigzag: Array<[number, number, number, boolean]> = [
    // [y, x, width, leftGap]
    [650, 100, 440, false],   // gap on left
    [580, 60, 440, true],     // gap on right
    [510, 100, 440, false],
    [440, 60, 440, true],
    [370, 100, 440, false],
    [300, 60, 440, true],
    [230, 100, 440, false],
    [160, 60, 440, true],
  ];

  for (const [y, x, w, leftGap] of zigzag) {
    if (leftGap) {
      // gap on left: platform starts from gap end
      platforms.push({ x: 120, y, width: x + w - 120, height: 14, type: 'normal' });
    } else {
      // gap on right: platform ends before gap
      platforms.push({ x, y, width: CANVAS_W - x - 100, height: 14, type: 'normal' });
    }
  }

  // ── Spike blocks ─────────────────────────────────────────────────────────
  const spikes: Array<[number, number, number]> = [
    [220, 615, 60],
    [350, 615, 60],
    [160, 470, 70],
    [340, 470, 70],
    [240, 320, 55],
    [370, 320, 55],
    [180, 175, 65],
    [320, 175, 65],
  ];
  for (const [x, y, w] of spikes) {
    platforms.push({ x, y, width: w, height: 16, type: 'spike' });
  }

  // ── Left/right walls ──────────────────────────────────────────────────────
  platforms.push({ x: -10, y: 0, width: 10, height: CANVAS_H, type: 'normal' });
  platforms.push({ x: CANVAS_W, y: 0, width: 10, height: CANVAS_H, type: 'normal' });

  // ── Checkpoints ──────────────────────────────────────────────────────────
  const checkpoints: Checkpoint[] = [
    { x: 300, y: 620, radius: 18, passed: [false, false, false, false] },
    { x: 300, y: 490, radius: 18, passed: [false, false, false, false] },
    { x: 300, y: 350, radius: 18, passed: [false, false, false, false] },
    { x: 300, y: 210, radius: 18, passed: [false, false, false, false] },
  ];

  // ── Finish zone ──────────────────────────────────────────────────────────
  const finish: FinishZone = { x: 0, y: 0, width: 120, height: 60 };

  return { platforms, checkpoints, finish };
}

export function spawnRacers(): Racer[] {
  return COLORS.map((color, i) => {
    const laneCenter = 68 + i * 137 + (Math.random() * 10 - 5);
    return {
      id: i,
      color,
      x: laneCenter,
      y: 750,
      vx: (Math.random() - 0.5) * 1.5,
      vy: -Math.random() * 2 - 1,
      size: RACER_SIZE,
      stunTimer: 0,
      finished: false,
      finishRank: null,
      trail: [],
    };
  });
}

function rectOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function resolveRacerPlatform(r: Racer, p: Platform) {
  const rLeft = r.x - r.size / 2;
  const rRight = r.x + r.size / 2;
  const rTop = r.y - r.size / 2;
  const rBottom = r.y + r.size / 2;

  if (!rectOverlap(rLeft, rTop, r.size, r.size, p.x, p.y, p.width, p.height)) return;

  const overlapLeft = rRight - p.x;
  const overlapRight = p.x + p.width - rLeft;
  const overlapTop = rBottom - p.y;
  const overlapBottom = p.y + p.height - rTop;

  const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

  const spikeBounceMult = p.type === 'spike' ? 1.8 : 1.0;
  const spikeSlow = p.type === 'spike' ? 0.4 : 1.0;

  if (minOverlap === overlapTop) {
    r.y -= overlapTop;
    r.vy = -Math.abs(r.vy) * BOUNCE * spikeBounceMult;
    r.vx *= spikeSlow;
    if (p.type === 'spike') r.stunTimer = 30;
  } else if (minOverlap === overlapBottom) {
    r.y += overlapBottom;
    r.vy = Math.abs(r.vy) * BOUNCE * spikeBounceMult;
    r.vx *= spikeSlow;
    if (p.type === 'spike') r.stunTimer = 30;
  } else if (minOverlap === overlapLeft) {
    r.x -= overlapLeft;
    r.vx = -Math.abs(r.vx) * BOUNCE * spikeBounceMult;
    r.vy *= spikeSlow;
    if (p.type === 'spike') r.stunTimer = 30;
  } else {
    r.x += overlapRight;
    r.vx = Math.abs(r.vx) * BOUNCE * spikeBounceMult;
    r.vy *= spikeSlow;
    if (p.type === 'spike') r.stunTimer = 30;
  }
}

function resolveRacerRacer(a: Racer, b: Racer) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = a.size;
  if (dist < minDist && dist > 0) {
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = minDist - dist;
    a.x -= nx * overlap * 0.5;
    a.y -= ny * overlap * 0.5;
    b.x += nx * overlap * 0.5;
    b.y += ny * overlap * 0.5;
    const relVx = a.vx - b.vx;
    const relVy = a.vy - b.vy;
    const dot = relVx * nx + relVy * ny;
    if (dot > 0) {
      const impulse = dot * 0.9;
      a.vx -= impulse * nx;
      a.vy -= impulse * ny;
      b.vx += impulse * nx;
      b.vy += impulse * ny;
    }
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

    // Gravity
    r.vy += GRAVITY;

    // Stun damping
    if (r.stunTimer > 0) {
      r.stunTimer--;
      r.vx *= 0.88;
      r.vy *= 0.88;
    } else {
      r.vx *= FRICTION;
    }

    // Upward impulse boost: when near a zig-zag gap, give slight upward nudge
    if (r.vy > 8) r.vy = 8;
    if (r.vx > 10) r.vx = 10;
    if (r.vx < -10) r.vx = -10;

    r.x += r.vx;
    r.y += r.vy;

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

    // Canvas side walls
    if (r.x - r.size / 2 < 0) { r.x = r.size / 2; r.vx = Math.abs(r.vx) * BOUNCE; }
    if (r.x + r.size / 2 > CANVAS_W) { r.x = CANVAS_W - r.size / 2; r.vx = -Math.abs(r.vx) * BOUNCE; }
    if (r.y + r.size / 2 > CANVAS_H) { r.y = CANVAS_H - r.size / 2; r.vy = -Math.abs(r.vy) * BOUNCE; }

    // Upward force to keep things moving through the maze
    if (r.vy > 2 && r.stunTimer === 0) {
      r.vy -= 0.15; // slight upward bias
    }

    // Trail
    r.trail.push({ x: r.x, y: r.y });
    if (r.trail.length > 20) r.trail.shift();

    // Checkpoint detection
    for (const cp of checkpoints) {
      if (!cp.passed[r.id]) {
        const dx = r.x - cp.x;
        const dy = r.y - cp.y;
        if (Math.sqrt(dx * dx + dy * dy) < cp.radius + r.size / 2) {
          cp.passed[r.id] = true;
        }
      }
    }

    // Finish zone detection
    if (rectOverlap(r.x - r.size / 2, r.y - r.size / 2, r.size, r.size, finish.x, finish.y, finish.width, finish.height)) {
      r.finished = true;
      r.finishRank = ++finishCount.value;
      r.vx = 0;
      r.vy = 0;
    }
  }
}

export function getRankings(racers: Racer[]): Racer[] {
  return [...racers].sort((a, b) => {
    if (a.finished && b.finished) return (a.finishRank ?? 99) - (b.finishRank ?? 99);
    if (a.finished) return -1;
    if (b.finished) return 1;
    return a.y - b.y; // lower y = higher up = better rank
  });
}

export const config: GameConfig = {
  canvasWidth: CANVAS_W,
  canvasHeight: CANVAS_H,
  gravity: GRAVITY,
  friction: FRICTION,
};

export const HEX_COLORS = HEX;

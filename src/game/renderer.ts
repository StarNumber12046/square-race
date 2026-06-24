import type { Racer, Platform, Checkpoint, FinishZone } from './types';
import { HEX_COLORS } from './engine';

const CHECKER_SIZE = 15;

function drawCheckerboard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const cols = Math.ceil(w / CHECKER_SIZE);
  const rows = Math.ceil(h / CHECKER_SIZE);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? '#000' : '#fff';
      ctx.fillRect(x + col * CHECKER_SIZE, y + row * CHECKER_SIZE, CHECKER_SIZE, CHECKER_SIZE);
    }
  }
  ctx.restore();
  // Green overlay
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#00cc44';
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#00aa33';
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function drawPlatform(ctx: CanvasRenderingContext2D, p: Platform) {
  if (p.type === 'spike') {
    // Brown base
    ctx.fillStyle = '#8B5E3C';
    ctx.fillRect(p.x, p.y, p.width, p.height);
    // Fence-like texture lines
    ctx.strokeStyle = '#5a3a1a';
    ctx.lineWidth = 1.5;
    const spacing = 12;
    const count = Math.floor(p.width / spacing);
    for (let i = 0; i <= count; i++) {
      const lx = p.x + i * spacing;
      ctx.beginPath();
      ctx.moveTo(lx, p.y);
      ctx.lineTo(lx, p.y + p.height);
      ctx.stroke();
    }
    // Top spikes
    ctx.fillStyle = '#6b3a1f';
    const spikeW = 8;
    const spikeCount = Math.floor(p.width / spikeW);
    for (let i = 0; i < spikeCount; i++) {
      const sx = p.x + i * spikeW;
      ctx.beginPath();
      ctx.moveTo(sx, p.y);
      ctx.lineTo(sx + spikeW / 2, p.y - 7);
      ctx.lineTo(sx + spikeW, p.y);
      ctx.closePath();
      ctx.fill();
    }
    // Border
    ctx.strokeStyle = '#4a2a0f';
    ctx.lineWidth = 1;
    ctx.strokeRect(p.x, p.y, p.width, p.height);
  } else if (p.height < 20 && p.width > 50) {
    // Zig-zag platform: gray
    ctx.fillStyle = '#b0b0b0';
    ctx.fillRect(p.x, p.y, p.width, p.height);
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.strokeRect(p.x, p.y, p.width, p.height);
    // Hatching
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 0.5;
    const step = 10;
    for (let offset = 0; offset < p.width + p.height; offset += step) {
      ctx.beginPath();
      ctx.moveTo(p.x + offset, p.y);
      ctx.lineTo(p.x + offset - p.height, p.y + p.height);
      ctx.stroke();
    }
  } else {
    // Wall/separator: dark gray
    ctx.fillStyle = '#555';
    ctx.fillRect(p.x, p.y, p.width, p.height);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.strokeRect(p.x, p.y, p.width, p.height);
  }
}

function drawCheckpoint(ctx: CanvasRenderingContext2D, cp: Checkpoint, _racers: Racer[]) {
  const anyPassed = cp.passed.some(Boolean);
  // Outer circle
  ctx.beginPath();
  ctx.arc(cp.x, cp.y, cp.radius, 0, Math.PI * 2);
  ctx.fillStyle = anyPassed ? '#ff7700' : '#ffaa44';
  ctx.fill();
  ctx.strokeStyle = anyPassed ? '#cc4400' : '#cc7700';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Triangle inside
  ctx.beginPath();
  ctx.moveTo(cp.x, cp.y - cp.radius * 0.6);
  ctx.lineTo(cp.x + cp.radius * 0.5, cp.y + cp.radius * 0.4);
  ctx.lineTo(cp.x - cp.radius * 0.5, cp.y + cp.radius * 0.4);
  ctx.closePath();
  ctx.fillStyle = anyPassed ? '#fff' : '#333';
  ctx.fill();
}

function drawRacer(ctx: CanvasRenderingContext2D, r: Racer, alpha = 1) {
  const hex = HEX_COLORS[r.color];
  const half = r.size / 2;

  // Trail
  for (let i = 0; i < r.trail.length; i++) {
    const t = r.trail[i];
    const trailAlpha = (i / r.trail.length) * 0.3 * alpha;
    ctx.globalAlpha = trailAlpha;
    ctx.fillStyle = hex;
    const ts = r.size * 0.4 * (i / r.trail.length);
    ctx.fillRect(t.x - ts / 2, t.y - ts / 2, ts, ts);
  }
  ctx.globalAlpha = alpha;

  // Stun flash
  if (r.stunTimer > 0 && Math.floor(r.stunTimer / 4) % 2 === 0) {
    ctx.fillStyle = '#ffffff';
  } else {
    ctx.fillStyle = hex;
  }

  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;

  ctx.fillRect(r.x - half, r.y - half, r.size, r.size);

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Border
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(r.x - half, r.y - half, r.size, r.size);

  // Eyes
  ctx.fillStyle = '#fff';
  ctx.fillRect(r.x - 6, r.y - 5, 4, 5);
  ctx.fillRect(r.x + 2, r.y - 5, 4, 5);
  ctx.fillStyle = '#000';
  ctx.fillRect(r.x - 5, r.y - 4, 2, 3);
  ctx.fillRect(r.x + 3, r.y - 4, 2, 3);

  ctx.globalAlpha = 1;
}

function drawStartingGateLabels(ctx: CanvasRenderingContext2D) {
  const colors: Array<[string, number]> = [
    ['#e84040', 68],
    ['#4070e8', 205],
    ['#f0c030', 342],
    ['#40c060', 479],
  ];
  for (const [color, cx] of colors) {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.12;
    ctx.fillRect(cx - 60, 700, 120, 80);
    ctx.globalAlpha = 1;
  }
}

export function render(
  ctx: CanvasRenderingContext2D,
  racers: Racer[],
  platforms: Platform[],
  checkpoints: Checkpoint[],
  finish: FinishZone,
  tick: number,
) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Subtle grid
  ctx.strokeStyle = '#f0f0f0';
  ctx.lineWidth = 0.5;
  for (let gx = 0; gx < W; gx += 30) {
    ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
  }
  for (let gy = 0; gy < H; gy += 30) {
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
  }

  // Starting gate lane highlights
  drawStartingGateLabels(ctx);

  // Platforms
  for (const p of platforms) {
    // Skip walls (too wide or invisible sentinels)
    if (p.x < 0 || p.x >= W) continue;
    drawPlatform(ctx, p);
  }

  // Checkpoints
  for (const cp of checkpoints) {
    drawCheckpoint(ctx, cp, racers);
  }

  // Finish zone
  drawCheckerboard(ctx, finish.x, finish.y, finish.width, finish.height);
  ctx.fillStyle = '#00aa33';
  ctx.font = 'bold 11px monospace';
  ctx.fillText('FINISH', finish.x + 14, finish.y + 35);

  // Racers
  for (const r of racers) {
    drawRacer(ctx, r, r.finished ? 0.5 : 1);
  }

  // Finish banner pulse
  if (racers.some(r => r.finished)) {
    const pulse = 0.5 + 0.5 * Math.sin(tick * 0.1);
    ctx.strokeStyle = `rgba(0, 200, 80, ${pulse})`;
    ctx.lineWidth = 4;
    ctx.strokeRect(finish.x, finish.y, finish.width, finish.height);
  }
}

import type { Racer, Platform, Checkpoint, FinishZone } from './types';
import { HEX_COLORS, CANVAS_W, CANVAS_H } from './engine';

const CHECKER_SIZE = 18;

function drawCheckerboard(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
) {
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
  // green tint
  ctx.save();
  ctx.globalAlpha = 0.3;
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
    ctx.fillStyle = '#8B5E3C';
    ctx.fillRect(p.x, p.y, p.width, p.height);
    // fence lines
    ctx.strokeStyle = '#5a3a1a';
    ctx.lineWidth = 1.5;
    const isHoriz = p.width > p.height;
    if (isHoriz) {
      const spacing = 12;
      for (let lx = p.x; lx < p.x + p.width; lx += spacing) {
        ctx.beginPath(); ctx.moveTo(lx, p.y); ctx.lineTo(lx, p.y + p.height); ctx.stroke();
      }
      // top spikes
      ctx.fillStyle = '#6b3a1f';
      const sw = 8;
      for (let sx = p.x; sx < p.x + p.width; sx += sw) {
        ctx.beginPath();
        ctx.moveTo(sx, p.y);
        ctx.lineTo(sx + sw / 2, p.y - 7);
        ctx.lineTo(sx + sw, p.y);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      // vertical spike block — spikes face left
      const sw = 8;
      for (let sy = p.y; sy < p.y + p.height; sy += sw) {
        ctx.beginPath();
        ctx.moveTo(p.x, sy);
        ctx.lineTo(p.x - 7, sy + sw / 2);
        ctx.lineTo(p.x, sy + sw);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.strokeStyle = '#4a2a0f';
    ctx.lineWidth = 1;
    ctx.strokeRect(p.x, p.y, p.width, p.height);
  } else {
    // normal baffle — dark slate
    ctx.fillStyle = '#4a5568';
    ctx.fillRect(p.x, p.y, p.width, p.height);
    // highlight edge
    ctx.strokeStyle = '#718096';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(p.x, p.y, p.width, p.height);
    // hatching
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.x, p.y, p.width, p.height);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    const step = 8;
    for (let off = 0; off < p.width + p.height + step; off += step) {
      ctx.beginPath();
      ctx.moveTo(p.x + off, p.y);
      ctx.lineTo(p.x + off - p.height, p.y + p.height);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawCheckpoint(ctx: CanvasRenderingContext2D, cp: Checkpoint) {
  const anyPassed = cp.passed.some(Boolean);
  ctx.beginPath();
  ctx.arc(cp.x, cp.y, cp.radius, 0, Math.PI * 2);
  ctx.fillStyle = anyPassed ? '#ff7700' : '#ffcc44';
  ctx.fill();
  ctx.strokeStyle = anyPassed ? '#cc4400' : '#cc9900';
  ctx.lineWidth = 2;
  ctx.stroke();
  // triangle
  const r = cp.radius;
  ctx.beginPath();
  ctx.moveTo(cp.x, cp.y - r * 0.55);
  ctx.lineTo(cp.x + r * 0.48, cp.y + r * 0.38);
  ctx.lineTo(cp.x - r * 0.48, cp.y + r * 0.38);
  ctx.closePath();
  ctx.fillStyle = anyPassed ? '#fff' : '#333';
  ctx.fill();
}

function drawRacer(ctx: CanvasRenderingContext2D, r: Racer) {
  const hex = HEX_COLORS[r.color];
  const half = r.size / 2;

  // Trail
  for (let i = 0; i < r.trail.length; i++) {
    const t = r.trail[i];
    const a = (i / r.trail.length) * 0.28;
    ctx.globalAlpha = a;
    ctx.fillStyle = hex;
    const ts = r.size * 0.35 * (i / r.trail.length);
    ctx.fillRect(t.x - ts / 2, t.y - ts / 2, ts, ts);
  }
  ctx.globalAlpha = 1;

  // Stun flash
  if (r.stunTimer > 0 && Math.floor(r.stunTimer / 3) % 2 === 0) {
    ctx.fillStyle = '#ffffff';
  } else {
    ctx.fillStyle = hex;
  }

  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.fillRect(r.x - half, r.y - half, r.size, r.size);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(r.x - half, r.y - half, r.size, r.size);

  // Eyes — face right
  ctx.fillStyle = '#fff';
  ctx.fillRect(r.x + 2, r.y - 6, 4, 5);
  ctx.fillRect(r.x + 2, r.y + 2, 4, 5);
  ctx.fillStyle = '#000';
  ctx.fillRect(r.x + 4, r.y - 5, 2, 3);
  ctx.fillRect(r.x + 4, r.y + 3, 2, 3);
}

function drawLaneStripes(ctx: CanvasRenderingContext2D) {
  // subtle horizontal lane guidelines
  const lanes = 4;
  const laneH = (CANVAS_H - 28) / lanes;
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let i = 1; i < lanes; i++) {
    const ly = 14 + i * laneH;
    ctx.beginPath();
    ctx.setLineDash([8, 8]);
    ctx.moveTo(14, ly);
    ctx.lineTo(CANVAS_W - 60, ly);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

export function render(
  ctx: CanvasRenderingContext2D,
  racers: Racer[],
  platforms: Platform[],
  checkpoints: Checkpoint[],
  finish: FinishZone,
  tick: number,
) {
  // Background
  ctx.fillStyle = '#1a1f2e';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  drawLaneStripes(ctx);

  // Platforms
  for (const p of platforms) {
    drawPlatform(ctx, p);
  }

  // Checkpoints
  for (const cp of checkpoints) {
    drawCheckpoint(ctx, cp);
  }

  // Finish zone
  drawCheckerboard(ctx, finish.x, finish.y, finish.width, finish.height);
  ctx.fillStyle = '#00ee55';
  ctx.font = 'bold 12px monospace';
  ctx.save();
  ctx.translate(finish.x + finish.width / 2, finish.y + finish.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('FINISH', -24, 4);
  ctx.restore();

  // Racers
  for (const r of racers) {
    ctx.globalAlpha = r.finished ? 0.45 : 1;
    drawRacer(ctx, r);
    ctx.globalAlpha = 1;
  }

  // Finish pulse
  if (racers.some(r => r.finished)) {
    const pulse = 0.5 + 0.5 * Math.sin(tick * 0.12);
    ctx.strokeStyle = `rgba(0,220,80,${pulse})`;
    ctx.lineWidth = 4;
    ctx.strokeRect(finish.x, finish.y, finish.width, finish.height);
  }
}

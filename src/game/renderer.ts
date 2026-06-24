import type { Racer, Platform, FinishZone } from './types';
import { HEX_COLORS, CANVAS_W, CANVAS_H } from './engine';

const CHECKER_SIZE = 18;

function drawCheckerboard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const cols = Math.ceil(w / CHECKER_SIZE);
  const rows = Math.ceil(h / CHECKER_SIZE);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#000' : '#fff';
      ctx.fillRect(x + c * CHECKER_SIZE, y + r * CHECKER_SIZE, CHECKER_SIZE, CHECKER_SIZE);
    }
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.28; ctx.fillStyle = '#00cc44';
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#00aa33'; ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function drawSpike(ctx: CanvasRenderingContext2D, p: Platform) {
  // Red hazard block with diagonal stripes
  ctx.fillStyle = '#8b1a1a';
  ctx.fillRect(p.x, p.y, p.width, p.height);

  // Diagonal warning stripes
  ctx.save();
  ctx.beginPath();
  ctx.rect(p.x, p.y, p.width, p.height);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,60,60,0.6)';
  ctx.lineWidth = 2;
  const stripeGap = 8;
  for (let d = -p.height; d < p.width + p.height; d += stripeGap) {
    ctx.beginPath();
    ctx.moveTo(p.x + d, p.y);
    ctx.lineTo(p.x + d - p.height, p.y + p.height);
    ctx.stroke();
  }
  ctx.restore();

  // Border glow
  ctx.strokeStyle = '#ff3333';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(p.x, p.y, p.width, p.height);
}

function drawWall(ctx: CanvasRenderingContext2D, p: Platform) {
  const isThick = p.width > p.height; // horizontal shelf vs vertical barrier

  // Base fill — slightly different shade for horizontal vs vertical
  ctx.fillStyle = isThick ? '#2d3a50' : '#374a65';
  ctx.fillRect(p.x, p.y, p.width, p.height);

  // Inner bevel highlight (top/left edge)
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y + p.height);
  ctx.lineTo(p.x, p.y);
  ctx.lineTo(p.x + p.width, p.y);
  ctx.stroke();

  // Inner bevel shadow (bottom/right edge)
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(p.x + p.width, p.y);
  ctx.lineTo(p.x + p.width, p.y + p.height);
  ctx.lineTo(p.x, p.y + p.height);
  ctx.stroke();
}

function drawRacer(ctx: CanvasRenderingContext2D, r: Racer) {
  const hex = HEX_COLORS[r.color];
  const half = r.size / 2;

  // Trail
  for (let i = 0; i < r.trail.length; i++) {
    const t = r.trail[i];
    ctx.globalAlpha = (i / r.trail.length) * 0.25;
    ctx.fillStyle = hex;
    const ts = r.size * 0.38 * (i / r.trail.length);
    ctx.fillRect(t.x - ts / 2, t.y - ts / 2, ts, ts);
  }
  ctx.globalAlpha = 1;

  // Body
  ctx.fillStyle = hex;
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
  ctx.fillRect(r.x - half, r.y - half, r.size, r.size);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Border
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(r.x - half, r.y - half, r.size, r.size);

  // Sheen
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(r.x - half + 2, r.y - half + 2, r.size * 0.55, r.size * 0.35);

  // Eyes facing right
  ctx.fillStyle = '#fff';
  ctx.fillRect(r.x + 2, r.y - 6, 4, 5);
  ctx.fillRect(r.x + 2, r.y + 2, 4, 5);
  ctx.fillStyle = '#000';
  ctx.fillRect(r.x + 4, r.y - 5, 2, 3);
  ctx.fillRect(r.x + 4, r.y + 3, 2, 3);
}

/** Paint the open-air tunnel passages as slightly lighter bg so corridors read clearly */
function drawTunnelAmbience(ctx: CanvasRenderingContext2D) {
  // Horizontal band in the mid-corridor zone — very subtle
  const grad = ctx.createLinearGradient(0, 0, CANVAS_W, 0);
  grad.addColorStop(0,   'rgba(60,80,120,0.0)');
  grad.addColorStop(0.15,'rgba(60,80,120,0.12)');
  grad.addColorStop(0.85,'rgba(60,80,120,0.12)');
  grad.addColorStop(1,   'rgba(60,80,120,0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

export function render(
  ctx: CanvasRenderingContext2D,
  racers: Racer[],
  platforms: Platform[],
  finish: FinishZone,
  tick: number,
) {
  // Background
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  drawTunnelAmbience(ctx);

  // Walls and spikes
  for (const p of platforms) {
    if (p.type === 'spike') drawSpike(ctx, p);
    else drawWall(ctx, p);
  }

  // Finish
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
    ctx.globalAlpha = r.finished ? 0.4 : 1;
    drawRacer(ctx, r);
    // Stun indicator — flashing red ring
    if (r.stunTimer > 0) {
      const flash = Math.sin(tick * 0.5) > 0 ? 0.8 : 0.3;
      ctx.globalAlpha = flash;
      ctx.strokeStyle = '#ff2222';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.size * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      // "X" eyes
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(r.x + 1, r.y - 5); ctx.lineTo(r.x + 5, r.y - 1);
      ctx.moveTo(r.x + 5, r.y - 5); ctx.lineTo(r.x + 1, r.y - 1);
      ctx.moveTo(r.x + 1, r.y + 2); ctx.lineTo(r.x + 5, r.y + 6);
      ctx.moveTo(r.x + 5, r.y + 2); ctx.lineTo(r.x + 1, r.y + 6);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // Finish pulse
  if (racers.some(r => r.finished)) {
    const pulse = 0.5 + 0.5 * Math.sin(tick * 0.12);
    ctx.strokeStyle = `rgba(0,220,80,${pulse})`;
    ctx.lineWidth = 4;
    ctx.strokeRect(finish.x, finish.y, finish.width, finish.height);
  }
}

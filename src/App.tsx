import { useRef, useEffect, useState, useCallback } from 'react';
import type { Racer, GameState } from './game/types';
import { buildMap, spawnRacers, stepPhysics, getRankings, config, HEX_COLORS } from './game/engine';
import { render } from './game/renderer';
import './App.css';

const TICK_MS = 1000 / 60;

const RANK_LABELS = ['🥇', '🥈', '🥉', '4th'];
const COLOR_LABELS: Record<string, string> = {
  red: 'Red',
  blue: 'Blue',
  yellow: 'Yellow',
  green: 'Green',
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const tickRef = useRef(0);
  const lastTimeRef = useRef(0);

  const [gameState, setGameState] = useState<GameState>('idle');
  const [rankings, setRankings] = useState<Racer[]>([]);
  const [winner, setWinner] = useState<Racer | null>(null);

  // Game data stored in refs so animation loop doesn't re-create
  const racersRef = useRef<Racer[]>([]);
  const mapRef = useRef(buildMap());
  const finishCountRef = useRef({ value: 0 });

  const resetGame = useCallback(() => {
    racersRef.current = spawnRacers();
    mapRef.current = buildMap();
    finishCountRef.current = { value: 0 };
    setRankings([...racersRef.current]);
    setWinner(null);
  }, []);

  const randomizeMap = useCallback(() => {
    mapRef.current = buildMap(); // future: randomize obstacle layout
    racersRef.current = spawnRacers();
    finishCountRef.current = { value: 0 };
    setRankings([...racersRef.current]);
    setWinner(null);
    setGameState('idle');
  }, []);

  // Initial render (idle state)
  useEffect(() => {
    resetGame();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    render(ctx, racersRef.current, mapRef.current.platforms, mapRef.current.checkpoints, mapRef.current.finish, 0);
  }, [resetGame]);

  const startRace = useCallback(() => {
    resetGame();
    setGameState('racing');
  }, [resetGame]);

  // Game loop
  useEffect(() => {
    if (gameState !== 'racing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const loop = (timestamp: number) => {
      if (timestamp - lastTimeRef.current >= TICK_MS) {
        lastTimeRef.current = timestamp;
        tickRef.current++;

        const racers = racersRef.current;
        const { platforms, checkpoints, finish } = mapRef.current;
        const finishCount = finishCountRef.current;

        // Give periodic upward impulses to racers that are stuck
        for (const r of racers) {
          if (!r.finished) {
            // Random upward nudge every ~120 ticks per racer
            if (Math.random() < 0.012) {
              r.vy -= 4 + Math.random() * 3;
              r.vx += (Math.random() - 0.5) * 3;
            }
          }
        }

        stepPhysics(racers, platforms, checkpoints, finish, finishCount);
        render(ctx, racers, platforms, checkpoints, finish, tickRef.current);

        const ranked = getRankings(racers);
        setRankings([...ranked]);

        const allFinished = racers.every(r => r.finished);
        const anyFinished = racers.some(r => r.finished);

        if (anyFinished && !winner) {
          const w = racers.find(r => r.finishRank === 1);
          if (w) setWinner({ ...w });
        }

        if (allFinished) {
          setGameState('finished');
          return;
        }
      }

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [gameState, winner]);

  return (
    <div className="app">
      <h1 className="title">⬛ Square Race</h1>
      <div className="main-layout">
        {/* Canvas */}
        <div className="canvas-wrapper">
          <canvas
            ref={canvasRef}
            width={config.canvasWidth}
            height={config.canvasHeight}
            className="game-canvas"
          />
          {gameState === 'idle' && (
            <div className="canvas-overlay">
              <p>Press <strong>Start Race</strong> to begin!</p>
            </div>
          )}
          {gameState === 'finished' && winner && (
            <div className="canvas-overlay finished">
              <p>🏁 Race Over!</p>
              <p className="winner-text" style={{ color: HEX_COLORS[winner.color] }}>
                {COLOR_LABELS[winner.color]} wins!
              </p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="sidebar">
          {/* Leaderboard */}
          <div className="leaderboard">
            <h2>🏁 Standings</h2>
            {rankings.length === 0
              ? <p className="dim">Waiting…</p>
              : rankings.map((r, i) => (
                <div
                  key={r.id}
                  className={`rank-row ${r.finished ? 'finished-row' : ''}`}
                  style={{ borderLeft: `4px solid ${HEX_COLORS[r.color]}` }}
                >
                  <span className="rank-label">{RANK_LABELS[i]}</span>
                  <span
                    className="racer-name"
                    style={{ color: HEX_COLORS[r.color] }}
                  >
                    {COLOR_LABELS[r.color]}
                  </span>
                  {r.finished && <span className="done-badge">✓</span>}
                </div>
              ))}
          </div>

          {/* Legend */}
          <div className="legend">
            <h3>Legend</h3>
            <div className="legend-item">
              <div className="swatch" style={{ background: '#8B5E3C' }} />
              <span>Spike block (slow)</span>
            </div>
            <div className="legend-item">
              <div className="swatch" style={{ background: '#b0b0b0' }} />
              <span>Platform</span>
            </div>
            <div className="legend-item">
              <div className="swatch" style={{ background: '#ff7700', borderRadius: '50%' }} />
              <span>Checkpoint</span>
            </div>
            <div className="legend-item">
              <div className="swatch" style={{ background: '#00cc44' }} />
              <span>Finish zone</span>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="controls">
        <button
          className="btn btn-start"
          onClick={startRace}
          disabled={gameState === 'racing'}
        >
          🚀 Start Race
        </button>
        <button
          className="btn btn-reset"
          onClick={() => { resetGame(); setGameState('idle'); }}
        >
          🔄 Reset
        </button>
        <button
          className="btn btn-random"
          onClick={randomizeMap}
        >
          🎲 Randomize
        </button>
      </div>
    </div>
  );
}

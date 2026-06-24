import { useRef, useEffect, useState, useCallback } from 'react';
import type { Racer, GameState } from './game/types';
import { buildMap, spawnRacers, stepPhysics, getRankings, HEX_COLORS, CANVAS_W, CANVAS_H } from './game/engine';
import { render } from './game/renderer';
import './App.css';

const TICK_MS = 1000 / 60;
const RANK_LABELS = ['🥇', '🥈', '🥉', '4th'];
const COLOR_LABELS: Record<string, string> = {
  red: 'Red', blue: 'Blue', yellow: 'Yellow', green: 'Green',
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);
  const tickRef   = useRef(0);
  const lastTimeRef = useRef(0);

  const [gameState, setGameState] = useState<GameState>('idle');
  const [rankings, setRankings]   = useState<Racer[]>([]);
  const [winner, setWinner]       = useState<Racer | null>(null);
  const winnerRef = useRef<Racer | null>(null);

  const racersRef      = useRef<Racer[]>([]);
  const mapRef         = useRef(buildMap());
  const finishCountRef = useRef({ value: 0 });

  const resetGame = useCallback(() => {
    racersRef.current      = spawnRacers();
    mapRef.current         = buildMap();
    finishCountRef.current = { value: 0 };
    winnerRef.current      = null;
    setRankings([...racersRef.current]);
    setWinner(null);
  }, []);

  // Draw initial idle frame
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

        const racers      = racersRef.current;
        const { platforms, checkpoints, finish } = mapRef.current;
        const finishCount = finishCountRef.current;

        stepPhysics(racers, platforms, checkpoints, finish, finishCount);
        render(ctx, racers, platforms, checkpoints, finish, tickRef.current);

        const ranked = getRankings(racers);
        setRankings([...ranked]);

        if (!winnerRef.current) {
          const w = racers.find(r => r.finishRank === 1);
          if (w) { winnerRef.current = { ...w }; setWinner({ ...w }); }
        }

        if (racers.every(r => r.finished)) {
          setGameState('finished');
          return;
        }
      }
      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [gameState]);

  return (
    <div className="app">
      <h1 className="title">⬛ Square Race</h1>

      <div className="main-layout">
        {/* Canvas */}
        <div className="canvas-wrapper">
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
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
                  <span className="racer-name" style={{ color: HEX_COLORS[r.color] }}>
                    {COLOR_LABELS[r.color]}
                  </span>
                  {r.finished && <span className="done-badge">✓</span>}
                </div>
              ))}
          </div>

          <div className="legend">
            <h3>Legend</h3>
            <div className="legend-item"><div className="swatch" style={{ background: '#8B5E3C' }} /><span>Spike (slow)</span></div>
            <div className="legend-item"><div className="swatch" style={{ background: '#4a5568' }} /><span>Baffle wall</span></div>
            <div className="legend-item"><div className="swatch" style={{ background: '#ff7700', borderRadius: '50%' }} /><span>Checkpoint</span></div>
            <div className="legend-item"><div className="swatch" style={{ background: '#00cc44' }} /><span>Finish zone</span></div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="controls">
        <button className="btn btn-start" onClick={startRace} disabled={gameState === 'racing'}>
          🚀 Start Race
        </button>
        <button className="btn btn-reset" onClick={() => { resetGame(); setGameState('idle'); }}>
          🔄 Reset
        </button>
        <button className="btn btn-random" onClick={() => { resetGame(); setGameState('idle'); }}>
          🎲 Randomize
        </button>
      </div>
    </div>
  );
}

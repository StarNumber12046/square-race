export type RacerColor = 'red' | 'blue' | 'yellow' | 'green';

export interface Racer {
  id: number;
  color: RacerColor;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  stunTimer: number;
  finished: boolean;
  finishRank: number | null;
  trail: Array<{ x: number; y: number }>;
}

export interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'normal' | 'spike';
}

export interface Checkpoint {
  x: number;
  y: number;
  radius: number;
  passed: boolean[];  // one per racer
}

export interface FinishZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type GameState = 'idle' | 'racing' | 'finished';

export interface GameConfig {
  canvasWidth: number;
  canvasHeight: number;
  gravity: number;
  friction: number;
}

import { useEffect, useRef, useState, useCallback } from 'react';
import { GameLoop } from './game/GameLoop';
import { MobileInput, KeyboardInput } from './game/InputManager';
import { MobileHUD } from './components/MobileHUD';
import { BotDifficulty } from './game/BotAI';
import { WeaponType } from './game/Types';

type GameState = 'MENU' | 'PLAYING' | 'GAMEOVER';

const CANVAS_W = 1280;
const CANVAS_H = 720;

export default function App() {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const wrapperRef   = useRef<HTMLDivElement>(null);
  const gameRef      = useRef<GameLoop | null>(null);

  const [mobileInput] = useState(() => new MobileInput());
  const [gameState,  setGameState]  = useState<GameState>('MENU');
  const [winner,     setWinner]     = useState<number>(0);
  const [difficulty, setDifficulty] = useState<BotDifficulty>('MEDIUM');
  const [weapon,     setWeapon]     = useState<WeaponType>('UNARMED');

  // ── Canvas scale-to-fit ────────────────────────────────────────────────────
  // The canvas always renders at 1280×720; a CSS transform scales the wrapper
  // to fill any viewport while preserving the aspect ratio.  Because the
  // MobileHUD lives *inside* the same wrapper it scales with the canvas, so
  // button positions always align with the game visuals.
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const recalc = () => {
      const sx = window.innerWidth  / CANVAS_W;
      const sy = window.innerHeight / CANVAS_H;
      setScale(Math.min(sx, sy));
    };
    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, []);

  // ── Game lifecycle ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current) return;

    const keyboardInput = new KeyboardInput();
    const inputProvider = {
      getInput: () => {
        const kb = keyboardInput.getInput();
        const mb = mobileInput.getInput();
        return {
          dirX:    kb.dirX   !== 0 ? kb.dirX   : mb.dirX,
          jump:    kb.jump   || mb.jump,
          punch:   kb.punch  || mb.punch,
          kick:    kb.kick   || mb.kick,
          block:   kb.block  || mb.block,
          dash:    kb.dash   || mb.dash,
          special: kb.special || mb.special,
        };
      },
    };

    const game = new GameLoop(canvasRef.current, inputProvider, weapon);
    game.bot.difficulty = difficulty;
    game.onGameOver = (w) => { setWinner(w); setGameState('GAMEOVER'); };
    gameRef.current = game;

    if (gameState === 'PLAYING') game.start();

    return () => { game.stop(); keyboardInput.destroy(); };
  }, [gameState, mobileInput, difficulty, weapon]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const requestFullscreen = useCallback(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  const handlePlay = useCallback(() => {
    // Resume audio context on user gesture
    gameRef.current?.soundEngine.resume();
    requestFullscreen();
    if (gameRef.current) gameRef.current.reset();
    setGameState('PLAYING');
  }, [requestFullscreen]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    // Outer shell: fills viewport, clips overflow, centers the scaled wrapper
    <div
      className="w-full h-screen bg-black overflow-hidden flex items-center justify-center select-none touch-none font-sans"
    >
      {/*
        Inner wrapper: always 1280×720 in logical space.
        CSS transform scales it to fit the viewport without changing layout.
        overflow-hidden here clips any sub-pixel bleed at the edges.
      */}
      <div
        ref={wrapperRef}
        style={{
          width:           CANVAS_W,
          height:          CANVAS_H,
          transform:       `scale(${scale})`,
          transformOrigin: 'center center',
          flexShrink:      0,
          position:        'relative',
          overflow:        'hidden',
        }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{ display: 'block' }}
        />

        {/* MobileHUD lives inside the scaled wrapper — positions always align */}
        {gameState === 'PLAYING' && <MobileHUD mobileInput={mobileInput} />}

        {/* ── MENU ────────────────────────────────────────────────────────── */}
        {gameState === 'MENU' && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-50">
            <h1 className="text-8xl text-white font-bold mb-8 tracking-tighter">
              DOJO BRAWL
            </h1>

            <div className="flex flex-col items-center gap-2 mb-8">
              <span className="text-gray-400 font-bold tracking-widest text-sm">WEAPON STYLE</span>
              <div className="flex gap-4">
                {(['UNARMED', 'KATANA', 'STAFF'] as WeaponType[]).map(w => (
                  <button
                    key={w}
                    onClick={() => setWeapon(w)}
                    className={`px-6 py-3 rounded-xl font-bold transition-all border-2 ${
                      weapon === w
                        ? 'bg-amber-600 border-amber-500 text-white shadow-[0_0_15px_rgba(217,119,6,0.5)]'
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col items-center gap-2 mb-12">
              <span className="text-gray-400 font-bold tracking-widest text-sm">OPPONENT</span>
              <div className="flex gap-4">
                {(['EASY', 'MEDIUM', 'HARD', 'IMPOSSIBLE'] as BotDifficulty[]).map(level => (
                  <button
                    key={level}
                    onClick={() => setDifficulty(level)}
                    className={`px-4 py-2 rounded-lg font-bold transition-colors ${
                      difficulty === level
                        ? 'bg-white text-black'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {level === 'IMPOSSIBLE' ? 'GEMINI' : level}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-6">
              <button
                onClick={handlePlay}
                className="px-8 py-4 bg-white hover:bg-gray-200 text-black font-bold rounded-full text-2xl shadow-xl transition-transform active:scale-95"
              >
                FIGHT
              </button>
              <button
                onClick={requestFullscreen}
                className="px-8 py-4 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-full text-2xl shadow-xl transition-transform active:scale-95 border-2 border-gray-700"
              >
                FULLSCREEN
              </button>
            </div>
          </div>
        )}

        {/* ── GAME OVER ───────────────────────────────────────────────────── */}
        {gameState === 'GAMEOVER' && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50">
            <h1 className="text-8xl text-white font-bold mb-4 tracking-tighter">
              {winner === 1 ? 'PLAYER 1 WINS' : 'BOT WINS'}
            </h1>
            <button
              onClick={handlePlay}
              className="px-8 py-4 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-full text-2xl shadow-xl mt-8 transition-transform active:scale-95"
            >
              TRY AGAIN
            </button>
          </div>
        )}

        {/* Portrait warning lives inside too so it also scales correctly */}
        <div className="portrait-warning absolute inset-0 z-[100] bg-black text-white hidden flex-col items-center justify-center text-center p-8">
          <h2 className="text-3xl font-bold mb-4">Please Rotate Your Device</h2>
          <p className="text-gray-400 text-lg">This game is best played in landscape mode.</p>
        </div>
      </div>
    </div>
  );
}

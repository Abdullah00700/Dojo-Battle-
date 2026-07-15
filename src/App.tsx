import { useEffect, useRef, useState } from 'react';
import { GameLoop } from './game/GameLoop';
import { MobileInput, KeyboardInput } from './game/InputManager';
import { MobileHUD } from './components/MobileHUD';
import { BotDifficulty } from './game/BotAI';
import { WeaponType } from './game/Types';

type GameState = 'MENU' | 'PLAYING' | 'GAMEOVER';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mobileInput] = useState(() => new MobileInput());
  const [gameState, setGameState] = useState<GameState>('MENU');
  const [winner, setWinner] = useState<number>(0);
  const [difficulty, setDifficulty] = useState<BotDifficulty>('MEDIUM');
  const [weapon, setWeapon] = useState<WeaponType>('UNARMED');
  const gameRef = useRef<GameLoop | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    
    // Support both Keyboard (for testing) and Mobile HUD
    const keyboardInput = new KeyboardInput();
    
    // Composite provider prioritizing keyboard if active, else mobile
    const inputProvider = {
        getInput: () => {
            const kb = keyboardInput.getInput();
            const mb = mobileInput.getInput();
            return {
                dirX: kb.dirX !== 0 ? kb.dirX : mb.dirX,
                jump: kb.jump || mb.jump,
                punch: kb.punch || mb.punch,
                kick: kb.kick || mb.kick,
                block: kb.block || mb.block,
                dash: kb.dash || mb.dash,
                special: kb.special || mb.special,
            };
        }
    };

    const game = new GameLoop(canvasRef.current, inputProvider, weapon);
    game.bot.difficulty = difficulty;
    game.onGameOver = (w) => {
        setWinner(w);
        setGameState('GAMEOVER');
    };
    gameRef.current = game;

    if (gameState === 'PLAYING') {
       game.start();
    }

    return () => {
        game.stop();
        keyboardInput.destroy();
    };
  }, [gameState, mobileInput, difficulty, weapon]);

  const requestFullscreen = () => {
      if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
      }
  };

  const handlePlay = () => {
      requestFullscreen();
      if (gameRef.current) gameRef.current.reset();
      setGameState('PLAYING');
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden flex items-center justify-center select-none touch-none font-sans">
      <canvas 
        ref={canvasRef} 
        width={1280} 
        height={720} 
        className="w-full h-full object-contain bg-slate-900" 
      />
      
      {gameState === 'PLAYING' && <MobileHUD mobileInput={mobileInput} />}

      {gameState === 'MENU' && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-50">
              <h1 className="text-6xl md:text-8xl text-white font-bold mb-8 tracking-tighter">DOJO BRAWL</h1>
              
              <div className="flex flex-col items-center gap-2 mb-8">
                  <span className="text-gray-400 font-bold tracking-widest text-sm">WEAPON STYLE</span>
                  <div className="flex gap-4">
                      {(['UNARMED', 'KATANA', 'STAFF'] as WeaponType[]).map(w => (
                          <button
                              key={w}
                              onClick={() => setWeapon(w)}
                              className={`px-6 py-3 rounded-xl font-bold transition-all border-2 ${weapon === w ? 'bg-amber-600 border-amber-500 text-white shadow-[0_0_15px_rgba(217,119,6,0.5)]' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}
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
                              className={`px-4 py-2 rounded-lg font-bold transition-colors ${difficulty === level ? 'bg-white text-black' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
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

      {gameState === 'GAMEOVER' && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50">
              <h1 className="text-6xl md:text-8xl text-white font-bold mb-4 tracking-tighter">
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

      <div className="portrait-warning fixed inset-0 z-[100] bg-black text-white flex-col items-center justify-center text-center p-8 hidden">
          <h2 className="text-3xl font-bold mb-4">Please Rotate Your Device</h2>
          <p className="text-gray-400 text-lg">This game is best played in landscape mode.</p>
      </div>
    </div>
  );
}

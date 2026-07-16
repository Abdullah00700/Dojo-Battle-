# Dojo Brawl

A canvas-based 2D fighting game built with React + Vite + TypeScript, originally exported from Google AI Studio.

## How to run

The app starts automatically via the **Start application** workflow.

```
./node_modules/.bin/vite --port=5000 --host=0.0.0.0
```

Open the **Webview** tab to play. No API key is needed — the Gemini reference is only a difficulty-label in the UI.

## Stack

- **React 19** + **TypeScript** — UI and game-state wrappers
- **Vite 6** — dev server and bundler
- **Tailwind CSS v4** — menu styling
- **HTML5 Canvas** — all game rendering (no game engine library)

## Game architecture

| File | Role |
|---|---|
| `src/App.tsx` | React shell: menu, game-over screen, difficulty/weapon selection |
| `src/game/GameLoop.ts` | `requestAnimationFrame` loop, hit-stop, screen shake |
| `src/game/Stickman.ts` | Character entity: state machine, 24-fps skeletal animation, physics |
| `src/game/Renderer.ts` | Canvas drawing: background, stickmen, HUD, particles |
| `src/game/PhysicsEngine.ts` | Hit detection, knockback, parry windows, pushbox |
| `src/game/BotAI.ts` | Difficulty-scaled opponent AI with predictive mode |
| `src/game/InputManager.ts` | Keyboard + mobile HUD unified input |
| `src/game/ParticleManager.ts` | Hit puffs, motion lines |

## Key design decisions

- **24-fps animation quantisation** — `stateTimer` is snapped to `Math.floor(t * 24) / 24` before computing joint positions, giving the crisp sprite-animation feel of classic fighting games while gameplay runs at full framerate.
- **Wall jump: one per ground contact** — `canWallJump` starts `true`, is consumed on each wall jump, and resets to `true` on landing.
- **No external API calls** — the game runs entirely offline in the browser.

## User preferences

- Keep the existing file structure and canvas-based rendering approach.
- Maintain 24-fps quantised skeletal animation for all character states.

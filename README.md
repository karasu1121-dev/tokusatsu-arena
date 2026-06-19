# Tokusatsu-arena

A browser-based 3D tokusatsu action game built with Three.js. A giant hero
defends a destructible city from a chasing kaiju.

## Play

### Quick start (Windows)
1. Install Node.js LTS from <https://nodejs.org/>
2. Double-click `play.bat`
3. Your browser opens automatically at http://localhost:8000/

### Manual
```bash
node serve.js
# then open http://localhost:8000/
```

## Controls

| Input | Action |
|-------|--------|
| WASD | Move |
| SHIFT | Sprint (smashes through buildings) |
| SPACE | Jump (stand on rooftops) |
| Left click / J | Punch |
| Right click / K | Kick |
| F | Beam (10s cooldown, aims forward) |
| V | Toggle camera (fight-view ↔ follow-cam) |
| Mouse | Look around (follow-cam mode) |
| Q / E | Keyboard camera turn (follow-cam mode) |
| ESC | Pause menu |
| O | Settings (rebind keys, mouse sensitivity, model picker…) |
| M | Mute |

## Customising

- **Character model**: drop a `.glb` into `assets/` → in-game settings dropdown picks it up
- **Mixamo animations**: add `.fbx` files to `assets/` and reference them in `MIXAMO_CLIPS` (in `src/main.js`)
- **Keybinds**: change them live in the settings panel (persisted to localStorage)

## Levels

Pick a stage from the start screen:

- **第一關 — 鋼鐵都市**: the original neon/day/sunset sea-city. Fight the **Kaiju**, a
  bipedal dinosaur with a claw swipe and an instant red eye-beam.
- **第二關 — 軍艦島工廠**: a Gunkanjima-style concrete island packed with pipes,
  smokestacks and glowing blast furnaces (all destructible / explosive). Fight the
  **Slag Crab** (熔爐巨蟹), a low six-legged molten brute with three distinct attacks —
  a twin-pincer slam, an arcing 3-shot molten volley, and a rushing charge dash.

## Tech

- Three.js r160 + GLTFLoader + FBXLoader (all vendored locally — no CDN at runtime)
- Tiny Node http server (`serve.js`) with `/api/models` endpoint that auto-lists `assets/*.glb`
- No build step — ES modules via import map
- Web Audio API for synthesised sound effects (no audio files)

## Project structure

```
silver-giant/
├── index.html               game entry + HUD + settings panel
├── play.bat                 Windows launcher
├── serve.js                 static file server (Node)
├── src/                     game logic
│   ├── main.js              renderer, input, game loop, collisions, camera
│   ├── player.js            procedural fallback hero
│   ├── player_model.js      glTF / Mixamo-driven character + AnimationMixer
│   ├── enemy.js             Kaiju AI (Level 1), attack + beam
│   ├── enemy2.js            Slag Crab AI (Level 2): pincer slam, molten volley, charge
│   ├── world.js             city + factory-island worlds, sea, rigid-body block physics
│   ├── effects.js           beams, debris, hit particles
│   ├── audio.js             Web Audio synthesiser
│   ├── hud.js               on-screen status
│   └── anim_retarget.js     Mixamo FBX → target rig delta retargeting
├── assets/                  models + Mixamo animations
└── vendor/                  Three.js + addons
```

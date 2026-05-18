import * as THREE from 'three';
import { Ultraman } from './player.js';
import { ModelUltraman, loadModel } from './player_model.js';
import { loadMixamoClip } from './anim_retarget.js';
import { Kaiju } from './enemy.js';
import { createWorld, updateBuildings, settleStacks, physicsBuildings, animateSea } from './world.js';
import { Effects } from './effects.js';
import { HUD } from './hud.js';
import { SoundManager } from './audio.js';

// ---------- Settings (persisted to localStorage) — must be declared before
// any other module-scope code that reads `settings`.
const SETTINGS_DEFAULTS = {
  invertY:     true,
  mouseSens:   1.0,
  sfxVolume:   0.45,
  camDistance: 60,
  model:       './assets/ultraman_mixamo_rigged.glb',
  modelScales: {                    // per-model URL → scale override
    './assets/ultraman_mixamo_rigged.glb': 1.5,
  },
  showColorTimer: false,            // hide chest sphere — generic rigs don't match Ultraman style
  forceTouchUI:   false,            // force-show the on-screen joystick + buttons (auto for touch devices)
  keys: {
    punch:  'KeyJ',
    kick:   'KeyK',
    jump:   'Space',
    beam:   'KeyF',
    sprint: 'ShiftLeft',
    camera: 'KeyV',
    mute:   'KeyM',
    menu:   'KeyO',
  },
};
const settings = Object.assign({}, SETTINGS_DEFAULTS,
  JSON.parse(localStorage.getItem('ultraman_settings') || '{}'));
// Merge nested defaults (so future-added bindings get defaults)
settings.keys = Object.assign({}, SETTINGS_DEFAULTS.keys, settings.keys || {});

// Pick a character model (glTF/GLB). If it has skeletal animation clips named
// Idle/Walking/Running/Jump/Punch/Death they're used; otherwise the bones are
// driven procedurally (works on a bare Reallusion CC rig, Mixamo skeleton, etc.).
// Set MODEL_URL = null to skip and use the procedural Ultraman.
//
// NOTE on Mixamo retargeting: arbitrary glTF rigs (e.g. CC_Base from Sketchfab)
// have local bone axes that differ from Mixamo's convention. Even with delta
// retargeting the shoulder twist + elbow hinge end up wrong. For "no-pain
// Mixamo", use a Mixamo-native skeleton: download "Y Bot" from mixamo.com as
// glTF, place at assets/, and animations apply 1:1.
//
// Active model — picked in the Settings panel (persisted to localStorage).
// Defaults to Y Bot for first-time users (Mixamo-native rig).
const DEFAULT_MODEL = './assets/ultraman_mixamo_rigged.glb';
const MODEL_URL = settings.model || DEFAULT_MODEL;

// ----- Renderer -----
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.getElementById('app').appendChild(renderer.domElement);

// ----- World -----
const { scene, buildings } = createWorld();

// ----- Camera -----
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 3500);
camera.position.set(0, 90, 180);

// ----- Entities (procedural fallback first; swap if model loads) -----
let ultraman = new Ultraman();
ultraman.group.position.set(-65, 0, 55);
scene.add(ultraman.group);

const kaiju = new Kaiju();
kaiju.group.position.set(65, 0, -55);
scene.add(kaiju.group);

// Face each other at start
{
  const dx = kaiju.group.position.x - ultraman.group.position.x;
  const dz = kaiju.group.position.z - ultraman.group.position.z;
  ultraman.facing = Math.atan2(dx, dz);
  ultraman.group.rotation.y = ultraman.facing;
  kaiju.facing = Math.atan2(-dx, -dz);
  kaiju.group.rotation.y = kaiju.facing;
}

// ----- Systems -----
const effects = new Effects(scene);
const hud = new HUD();
const sfx = new SoundManager();

// dev hook — lets the console inspect/poke entities
if (typeof window !== 'undefined') window.__game = {
  get ultraman() { return ultraman; }, kaiju, effects, buildings,
  THREE,
  destroyBuildingsOnBeam: (...a) => destroyBuildingsOnBeam(...a),
  collideWithBuildings:   (...a) => collideWithBuildings(...a),
};

// ----- Async model swap -----
const modelStatus = document.createElement('div');
modelStatus.style.cssText = 'position:fixed;right:16px;top:60px;color:#fff;font-size:11px;opacity:0.6;text-shadow:0 1px 2px #000;pointer-events:none';
document.body.appendChild(modelStatus);
modelStatus.textContent = MODEL_URL ? '載入 3D 模型中…' : '使用程序角色';

// Mixamo FBX animations layered onto the rig. With a Mixamo-native skeleton
// (Y Bot) these retarget cleanly because rest poses match.
const MIXAMO_CLIPS = {
  idle:  { url: './assets/Idle.fbx',                loop: true,  timeScale: 1.0 },
  walk:  { url: './assets/Walking.fbx',             loop: true,  timeScale: 1.0 },
  run:   { url: './assets/Running.fbx',             loop: true,  timeScale: 1.0 },
  punch: { url: './assets/Cross Punch.fbx',         loop: false, fitDuration: 0.9 },
  kick:  { url: './assets/Mma Kick.fbx',            loop: false, fitDuration: 1.1 },
  jump:  { url: './assets/Jumping.fbx',             loop: true,  timeScale: 1.0 },
  beam:  { url: './assets/Rifle Aiming Idle.fbx',   loop: true,  timeScale: 1.0 },
  death: { url: './assets/Death From Front Headshot.fbx', loop: false, fitDuration: 2.0 },
};

if (MODEL_URL) {
  loadModel(MODEL_URL)
    .then(async gltf => {
      const scaleOverride = (settings.modelScales || {})[MODEL_URL];
      const m = new ModelUltraman(gltf, scaleOverride != null ? { scale: scaleOverride } : {});
      m.group.position.copy(ultraman.group.position);
      m.facing = ultraman.facing;
      m.group.rotation.y = ultraman.group.rotation.y;
      m.hp = ultraman.hp;
      scene.remove(ultraman.group);
      ultraman = m;
      scene.add(ultraman.group);
      modelStatus.textContent = `✓ 已載入模型 (${gltf.animations.length} 個動畫)`;

      // Pull in Mixamo clips and retarget them onto this rig
      const loaded = [];
      for (const [state, opts] of Object.entries(MIXAMO_CLIPS)) {
        try {
          const clip = await loadMixamoClip(opts.url, m.model);
          // Stretch clip time scale so it fits the game state's duration
          const finalOpts = { ...opts };
          if (opts.fitDuration) {
            finalOpts.timeScale = clip.duration / opts.fitDuration;
          }
          m.addMixamoClip(state, clip, finalOpts);
          // Lengthen the game-side timer so the player actually sees the anim
          if (state === 'punch' && opts.fitDuration) m.punchDuration = opts.fitDuration;
          if (state === 'kick'  && opts.fitDuration) m.kickDuration  = opts.fitDuration;
          loaded.push(`${state}(${clip.duration.toFixed(1)}s)`);
        } catch (err) {
          console.warn(`Mixamo clip ${opts.url} 載入失敗：`, err.message);
        }
      }
      if (loaded.length) {
        modelStatus.textContent += `  +Mixamo: ${loaded.join(', ')}`;
      }
      setTimeout(() => modelStatus.remove(), 4500);
    })
    .catch(err => {
      console.warn('模型載入失敗，沿用程序角色:', err.message);
      modelStatus.textContent = '⚠ 模型載入失敗 — 使用程序角色';
      setTimeout(() => modelStatus.remove(), 4000);
    });
}

// ----- Input -----
const keys = Object.create(null);

// Action triggers — wired to remappable keys + mouse buttons
function doPunch() {
  if (!gameStarted || gameOver || paused) return;
  const before = ultraman.punching;
  ultraman.punch();
  if (!before && ultraman.punching) sfx.punch();
}
function doKick() {
  if (!gameStarted || gameOver || paused) return;
  const before = ultraman.kicking;
  ultraman.kick();
  if (!before && ultraman.kicking) sfx.punch();
}
function doJump() {
  if (!gameStarted || gameOver || paused) return;
  const before = ultraman.onGround;
  ultraman.jump();
  if (before && !ultraman.onGround) sfx.jump();
}
function toggleCamera() {
  if (!gameStarted || gameOver) return;
  cameraMode = cameraMode === 'fight' ? 'follow' : 'fight';
  if (cameraMode === 'follow') {
    cameraYaw = ultraman.group.rotation.y;
    // Pointer-lock the cursor for mouse-look (no-op on touch devices)
    if (renderer.domElement.requestPointerLock) {
      renderer.domElement.requestPointerLock();
    }
  } else if (document.pointerLockElement) {
    document.exitPointerLock();
  }
}
function doBeam() {
  if (!gameStarted || gameOver || paused) return;
  const before = ultraman.beaming;
  ultraman.tryBeam(effects, (/*origin, target*/) => {
    cameraShake = Math.max(cameraShake, 1.4);
    sfx.beamFire();
  });
  if (!before && ultraman.beaming) sfx.beamCharge();
}

addEventListener('keydown', e => {
  // Keybind-listening mode (settings) — capture first
  if (bindingAction) {
    if (e.code !== 'Escape') {
      settings.keys[bindingAction] = e.code;
      saveSettings();
      refreshKeybinds();
    }
    bindingAction = null;
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  if (!keys[e.code] && gameStarted && !gameOver && !paused) {
    const k = settings.keys;
    if      (e.code === k.beam)   doBeam();
    else if (e.code === k.jump)   doJump();
    else if (e.code === k.punch)  doPunch();
    else if (e.code === k.kick)   doKick();
    else if (e.code === k.mute)   sfx.setMuted(!sfx.muted);
    else if (e.code === k.menu)   togglePauseMenu();
    else if (e.code === k.camera) toggleCamera();
  }
  // Q/E hold to rotate the follow cam (independent of WASD)
  if (e.code === 'KeyQ') cameraTurnRate = -1.6;
  if (e.code === 'KeyE') cameraTurnRate =  1.6;
  // Escape opens the pause menu (browser also auto-releases pointer lock).
  // During game over, ANY key returns the player to the start screen.
  if (gameStarted && gameOver) {
    e.preventDefault();
    location.reload();
    return;
  }
  if (e.code === 'Escape' && gameStarted) {
    e.preventDefault();
    togglePauseMenu();
  }
  keys[e.code] = true;
  if (e.code === 'Space' || e.code === 'F1') e.preventDefault();
});
addEventListener('keyup', e => {
  if (e.code === 'KeyQ' || e.code === 'KeyE') cameraTurnRate = 0;
  keys[e.code] = false;
});
addEventListener('mousedown', e => {
  if (!gameStarted || gameOver || paused) return;
  if (e.button === 0) doPunch();
  else if (e.button === 2) doKick();
});
addEventListener('contextmenu', e => e.preventDefault());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ----- Game state -----
let gameStarted = false;
let gameOver = false;
let paused    = false;
let cameraShake = 0;
let sweepBeamMesh = null;        // active SweepBeam during ultraman.beamActive
let cameraMode = 'fight';      // 'fight' (auto-frame both) | 'follow' (behind player)
let cameraYaw  = 0;            // mouse-orbit yaw (decoupled from player.facing when idle)
let cameraPitch = -0.15;       // negative = looking slightly down at the player
let cameraTurnRate = 0;        // Q/E rotate the follow cam (radians/sec)

function saveSettings() { localStorage.setItem('ultraman_settings', JSON.stringify(settings)); }
sfx.setVolume(settings.sfxVolume);

// Keybind remap state — set when user clicks a keybind button; next keydown captures
let bindingAction = null;
function formatKeyCode(code) {
  if (!code) return '—';
  if (code.startsWith('Key'))   return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Space')         return 'Space';
  if (code.startsWith('Arrow')) return code.slice(5) + '↑↓←→'[['Up','Down','Left','Right'].indexOf(code.slice(5))];
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl';
  if (code === 'AltLeft' || code === 'AltRight') return 'Alt';
  return code;
}
function refreshKeybinds() {
  document.querySelectorAll('.keybind-btn').forEach(btn => {
    const a = btn.dataset.action;
    btn.classList.remove('listening');
    btn.textContent = formatKeyCode(settings.keys[a]);
  });
}
// Model picker — populates dropdown from /api/models (served by serve.js)
async function populateModels() {
  const sel = document.getElementById('set-model');
  if (!sel) return;
  let files = [];
  try {
    const r = await fetch('/api/models');
    if (r.ok) files = await r.json();
  } catch { /* fall through to fallback */ }
  if (!files.length) {
    // Fallback (offline / file://): show known assets
    files = [
      './assets/y_bot_from_mixamo.glb',
      './assets/ultraman_mixamo_rigged.glb',
      './assets/ultraman_rig_updated.glb',
      './assets/RobotExpressive.glb',
    ];
  }
  // Always include the currently-active model even if dir scan missed it
  if (!files.includes(settings.model)) files.unshift(settings.model);
  sel.innerHTML = '';
  for (const f of files) {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f.split('/').pop().replace(/\.glb$/i, '');
    if (f === settings.model) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => {
    settings.model = sel.value;
    saveSettings();
    document.getElementById('model-apply-note').classList.add('show');
    // Auto-reload after a short delay so the user sees the note
    setTimeout(() => location.reload(), 600);
  });
}
populateModels();

// ---------- Touch controls ----------
const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
function applyTouchVisibility() {
  document.body.classList.toggle('touch-on', isTouch || !!settings.forceTouchUI);
}
applyTouchVisibility();

const stickVec = { x: 0, y: 0 };       // joystick output, range [-1,1]
let sprintTouched = false;
(function initTouchUI() {
  const stick = document.getElementById('touch-stick');
  const thumb = document.getElementById('touch-stick-thumb');
  let stickTouchId = null;

  function updateStick(t) {
    const rect = stick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top  + rect.height / 2;
    const maxR = rect.width / 2 - 35;
    let dx = t.clientX - cx;
    let dy = t.clientY - cy;
    const m = Math.hypot(dx, dy);
    if (m > maxR) { dx = dx / m * maxR; dy = dy / m * maxR; }
    thumb.style.transform = `translate(${dx}px, ${dy}px)`;
    stickVec.x = dx / maxR;
    stickVec.y = dy / maxR;
  }
  function clearStick() {
    thumb.style.transform = 'translate(0, 0)';
    stickVec.x = 0; stickVec.y = 0;
  }
  stick.addEventListener('touchstart', e => {
    const t = e.changedTouches[0];
    stickTouchId = t.identifier;
    updateStick(t);
    e.preventDefault();
  }, { passive: false });
  stick.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) if (t.identifier === stickTouchId) updateStick(t);
    e.preventDefault();
  }, { passive: false });
  const endStick = e => {
    for (const t of e.changedTouches) if (t.identifier === stickTouchId) {
      stickTouchId = null;
      clearStick();
    }
    e.preventDefault();
  };
  stick.addEventListener('touchend', endStick, { passive: false });
  stick.addEventListener('touchcancel', endStick, { passive: false });

  // Action buttons
  document.querySelectorAll('#touch-actions .tb, #touch-topright .tb').forEach(btn => {
    const action = btn.dataset.action;
    const press = e => {
      e.preventDefault();
      btn.classList.add('held');
      if (action === 'sprint')      sprintTouched = true;
      else if (action === 'punch')  doPunch();
      else if (action === 'kick')   doKick();
      else if (action === 'jump')   doJump();
      else if (action === 'beam')   doBeam();
      else if (action === 'menu')   { if (gameStarted && !gameOver) togglePauseMenu(); }
      else if (action === 'camera') toggleCamera();
    };
    const release = e => {
      e.preventDefault();
      btn.classList.remove('held');
      if (action === 'sprint') sprintTouched = false;
    };
    btn.addEventListener('touchstart', press, { passive: false });
    btn.addEventListener('touchend',   release, { passive: false });
    btn.addEventListener('touchcancel', release, { passive: false });
    // Also accept mouse for testing on desktop
    btn.addEventListener('mousedown', press);
    btn.addEventListener('mouseup',   release);
    btn.addEventListener('mouseleave', release);
  });

  // Camera look — drag in the right portion of the screen rotates the follow cam
  const lookArea = document.getElementById('touch-look-area');
  let lookId = null, lookLastX = 0, lookLastY = 0;
  lookArea.addEventListener('touchstart', e => {
    const t = e.changedTouches[0];
    lookId = t.identifier;
    lookLastX = t.clientX; lookLastY = t.clientY;
    e.preventDefault();
  }, { passive: false });
  lookArea.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) if (t.identifier === lookId) {
      const dx = t.clientX - lookLastX;
      const dy = t.clientY - lookLastY;
      lookLastX = t.clientX; lookLastY = t.clientY;
      if (cameraMode === 'follow') {
        const sens = 0.006 * settings.mouseSens;
        cameraYaw   -= dx * sens;
        cameraPitch += dy * sens * (settings.invertY ? 1 : -1);
        cameraPitch = Math.max(-1.0, Math.min(0.6, cameraPitch));
      }
    }
    e.preventDefault();
  }, { passive: false });
  const endLook = e => {
    for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
  };
  lookArea.addEventListener('touchend', endLook, { passive: false });
  lookArea.addEventListener('touchcancel', endLook, { passive: false });
})();

// Show/hide the on-character chest sphere + light based on settings.
function applyColorTimerVisibility() {
  const u = window.__game && window.__game.ultraman;
  if (!u) return;
  const v = !!settings.showColorTimer;
  if (u.colorTimer) u.colorTimer.visible = v;
  if (u.timerLight) u.timerLight.visible = v;
}
// Apply on first load (and once more after model swap completes)
applyColorTimerVisibility();
setTimeout(applyColorTimerVisibility, 1200);
setTimeout(applyColorTimerVisibility, 4000);

// Live-adjustable per-model scale slider — modifies the loaded mesh on the fly
function initModelScaleSlider() {
  const slider = document.getElementById('set-model-scale');
  const valEl  = document.getElementById('val-model-scale');
  if (!slider || !valEl) return;
  function syncFromLoadedModel() {
    const u = window.__game && window.__game.ultraman;
    const cur = u && u.model ? u.model.scale.x : (settings.modelScales[settings.model] ?? 22);
    slider.value = cur;
    valEl.textContent = (+cur).toFixed(1) + '×';
  }
  // Try syncing now and again once model has had time to load
  syncFromLoadedModel();
  setTimeout(syncFromLoadedModel, 1500);
  setTimeout(syncFromLoadedModel, 4000);
  slider.addEventListener('input', () => {
    const val = parseFloat(slider.value);
    valEl.textContent = val.toFixed(1) + '×';
    settings.modelScales = settings.modelScales || {};
    settings.modelScales[settings.model] = val;
    saveSettings();
    const u = window.__game && window.__game.ultraman;
    if (u && u.model) u.model.scale.setScalar(val);
  });
}
initModelScaleSlider();

document.querySelectorAll('.keybind-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (bindingAction) {
      // Cancel previous listen
      document.querySelectorAll('.keybind-btn').forEach(b => b.classList.remove('listening'));
    }
    bindingAction = btn.dataset.action;
    btn.classList.add('listening');
    btn.textContent = '按下按鍵…';
  });
});

// Bind the settings panel inputs to the `settings` object + live effects.
function initSettingsUI() {
  const $ = id => document.getElementById(id);
  const fields = [
    { input: 'set-invert-y',   key: 'invertY',        type: 'check' },
    { input: 'set-show-timer', key: 'showColorTimer', type: 'check' },
    { input: 'set-force-touch', key: 'forceTouchUI', type: 'check' },
    { input: 'set-mouse-sens', key: 'mouseSens',      type: 'range', valOut: 'val-mouse-sens', fmt: v => v.toFixed(1) + '×' },
    { input: 'set-sfx-vol',    key: 'sfxVolume',      type: 'range', valOut: 'val-sfx-vol',    fmt: v => Math.round(v * 100) + '%' },
    { input: 'set-cam-dist',   key: 'camDistance',    type: 'range', valOut: 'val-cam-dist',   fmt: v => v + 'u' },
  ];
  function refresh() {
    for (const f of fields) {
      const el = $(f.input);
      if (f.type === 'check') el.checked = !!settings[f.key];
      else                    el.value   = settings[f.key];
      if (f.valOut) $(f.valOut).textContent = f.fmt(settings[f.key]);
    }
  }
  for (const f of fields) {
    $(f.input).addEventListener('input', e => {
      settings[f.key] = f.type === 'check' ? e.target.checked : parseFloat(e.target.value);
      if (f.valOut) $(f.valOut).textContent = f.fmt(settings[f.key]);
      // live-apply side effects
      if (f.key === 'sfxVolume') sfx.setVolume(settings.sfxVolume);
      if (f.key === 'showColorTimer') applyColorTimerVisibility();
      if (f.key === 'forceTouchUI')   applyTouchVisibility();
      saveSettings();
    });
  }
  $('set-close').addEventListener('click', () => $('settings-panel').classList.remove('open'));
  $('set-reset').addEventListener('click', () => {
    Object.assign(settings, SETTINGS_DEFAULTS);
    sfx.setVolume(settings.sfxVolume);
    refresh();
    saveSettings();
  });
  refresh();
  refreshKeybinds();
}
function togglePauseMenu() {
  paused = !paused;
  document.getElementById('settings-panel').classList.toggle('open', paused);
  if (!paused) {
    // Resume — re-acquire pointer for follow cam
    if (cameraMode === 'follow' && renderer.domElement.requestPointerLock) {
      renderer.domElement.requestPointerLock();
    }
    // Wipe input state so a held key during pause doesn't re-trigger
    for (const k of Object.keys(keys)) keys[k] = false;
    cameraTurnRate = 0;
  } else if (document.pointerLockElement) {
    document.exitPointerLock();
  }
}
// Browser auto-releases pointer lock on Esc — open the menu then too.
// (Skip when the game is already over so the defeat/victory screen stays clean.)
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && cameraMode === 'follow' && gameStarted && !paused && !gameOver) {
    togglePauseMenu();
  }
});
initSettingsUI();
// Close button doubles as resume
document.getElementById('set-close').addEventListener('click', () => {
  if (paused) togglePauseMenu();
});

// Mouse-look: pointer lock; movement updates yaw/pitch each frame.
addEventListener('mousemove', e => {
  if (cameraMode !== 'follow') return;
  if (document.pointerLockElement !== renderer.domElement) return;
  const sens = 0.003 * settings.mouseSens;
  cameraYaw   -= e.movementX * sens;
  cameraPitch += e.movementY * sens * (settings.invertY ? 1 : -1);
  cameraPitch = Math.max(-1.0, Math.min(0.6, cameraPitch));
});

document.getElementById('start-btn').addEventListener('click', () => {
  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  gameStarted = true;
  sfx.unlock();      // first user gesture — needed for Web Audio
});

function showMessage(text, sub, color, withRetry = false) {
  const m = document.getElementById('message');
  m.innerHTML = text +
    (sub ? `<span id="message-sub">${sub}</span>` : '') +
    (withRetry ? '<button id="retry-btn">RETRY</button>' : '');
  m.style.color = color || '#fff';
  m.classList.add('show');
  if (withRetry) {
    document.getElementById('retry-btn').addEventListener('click', () => location.reload());
  }
}

function horizontalDist(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function resolveOverlap(a, b) {
  const dx = b.group.position.x - a.group.position.x;
  const dz = b.group.position.z - a.group.position.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  const minD = a.radius + b.radius;
  if (d < minD && d > 0.01) {
    const push = (minD - d) / 2;
    const nx = dx / d, nz = dz / d;
    a.group.position.x -= nx * push;
    a.group.position.z -= nz * push;
    b.group.position.x += nx * push;
    b.group.position.z += nz * push;
  }
}

// World-space extent of a building block — handles both standing AABBs and
// blocks toppled 90° on the X or Z axis. Used for collision and standing.
function buildingExtent(b) {
  const ud = b.userData;
  if (!ud.fallen) {
    return {
      xMin: b.position.x - ud.w / 2, xMax: b.position.x + ud.w / 2,
      zMin: b.position.z - ud.d / 2, zMax: b.position.z + ud.d / 2,
      topY: b.position.y + ud.h / 2,
    };
  }
  // Block rotated 90° in place — what was vertical is now horizontal
  if (ud.fallAxis === 'x') {
    return {
      xMin: b.position.x - ud.h / 2, xMax: b.position.x + ud.h / 2,
      zMin: b.position.z - ud.d / 2, zMax: b.position.z + ud.d / 2,
      topY: ud.w,
    };
  }
  return {
    xMin: b.position.x - ud.w / 2, xMax: b.position.x + ud.w / 2,
    zMin: b.position.z - ud.h / 2, zMax: b.position.z + ud.h / 2,
    topY: ud.d,
  };
}

// Highest building top under entity's feet (or 0 = ground).
function findStandingY(entity, buildings) {
  const ex = entity.group.position.x;
  const ez = entity.group.position.z;
  const er = entity.radius * 0.65;        // forgiving "still on edge"
  let groundY = 0;
  for (const b of buildings) {
    const e = buildingExtent(b);
    if (ex > e.xMin - er && ex < e.xMax + er &&
        ez > e.zMin - er && ez < e.zMax + er) {
      if (e.topY > groundY) groundY = e.topY;
    }
  }
  return groundY;
}

// Circle vs building blocks (axis-aligned in their current orientation).
//  - Feet above the rooftop → no collision (you can leap over or stand on top)
//  - Sprint-tackle or stomp-from-above → topple the block
//  - Small unfallen blocks get PUSHED instead of blocking the player
//  - Larger standing blocks block walking, push entity out
function collideWithBuildings(entity, buildings, isPlayer = false) {
  const ex = entity.group.position.x;
  const ey = entity.group.position.y;
  const ez = entity.group.position.z;
  const er = entity.radius;
  const wasFalling = entity.velocity.y < -10;
  const isSprinting = !!entity.isSprinting;

  for (const b of buildings) {
    const e = buildingExtent(b);
    if (ey >= e.topY - 0.5) continue;       // standing on top OR leaping over
    if (b.userData.fallen) continue;        // walkable rubble on the side

    const hw = (e.xMax - e.xMin) / 2;
    const hd = (e.zMax - e.zMin) / 2;
    const cx = (e.xMin + e.xMax) / 2;
    const cz = (e.zMin + e.zMax) / 2;
    const closestX = Math.max(cx - hw, Math.min(ex, cx + hw));
    const closestZ = Math.max(cz - hd, Math.min(ez, cz + hd));
    const dx = ex - closestX;
    const dz = ez - closestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq >= er * er) continue;

    // Sprint-tackle or stomp-from-above → smash the block
    if (isSprinting || (wasFalling && ey < e.topY * 0.6)) {
      const force = wasFalling ? 65 : 55;     // stomp is heavier than tackle
      kickBuilding(b, entity.velocity.x || (ex - cx),
                      entity.velocity.z || (ez - cz), force);
      cameraShake = Math.max(cameraShake, 0.5);
      continue;
    }

    // Small / lightweight blocks get pushed instead of stopping the player.
    // (Big skyscraper-sized blocks still block.)
    const isSmall = isPlayer && b.userData.w < 20 && b.userData.h < 22 && b.userData.d < 20;
    if (isSmall) {
      const dist = Math.sqrt(distSq) || 0.001;
      const push = (er - dist) + 0.2;
      // Move the block opposite to the contact direction
      b.position.x -= (dx / dist) * push;
      b.position.z -= (dz / dist) * push;
      continue;
    }

    // Solid block — push entity out
    if (distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      entity.group.position.x = closestX + (dx / dist) * er;
      entity.group.position.z = closestZ + (dz / dist) * er;
    } else {
      const exits = [
        { v: cx - hw - er, axis: 'x', d: Math.abs(ex - (cx - hw)) },
        { v: cx + hw + er, axis: 'x', d: Math.abs((cx + hw) - ex) },
        { v: cz - hd - er, axis: 'z', d: Math.abs(ez - (cz - hd)) },
        { v: cz + hd + er, axis: 'z', d: Math.abs((cz + hd) - ez) },
      ];
      exits.sort((a, b) => a.d - b.d);
      if (exits[0].axis === 'x') entity.group.position.x = exits[0].v;
      else                       entity.group.position.z = exits[0].v;
    }
  }
}

// After entity.update integrates gravity, lift the entity onto a rooftop
// if it's standing inside the footprint of a (taller-than-current-y) block.
function applyStanding(entity, buildings) {
  const standY = findStandingY(entity, buildings);
  if (standY <= 0) return;
  if (entity.group.position.y < standY + 0.01 && entity.velocity.y <= 0.5) {
    entity.group.position.y = standY;
    entity.velocity.y = 0;
    entity.onGround = true;
  }
}

// Punch-range scan: any building within reach in the player's facing direction
// gets toppled on the impact frame.
function punchTipBuildings(entity, buildings) {
  const fx = Math.sin(entity.group.rotation.y);
  const fz = Math.cos(entity.group.rotation.y);
  const reach = 24;
  const px = entity.group.position.x + fx * (entity.radius + reach * 0.5);
  const pz = entity.group.position.z + fz * (entity.radius + reach * 0.5);
  let tipped = false;
  for (const b of buildings) {
    if (b.userData.fallen) continue;
    const dx = px - b.position.x;
    const dz = pz - b.position.z;
    if (Math.abs(dx) < b.userData.w / 2 + reach * 0.4 &&
        Math.abs(dz) < b.userData.d / 2 + reach * 0.4) {
      kickBuilding(b, fx, fz, 45);     // punch — moderate force forward
      tipped = true;
    }
  }
  return tipped;
}

// Kick a block with rigid-body physics — gives it linear + angular velocity
// in the impact direction. `force` ~ 30–90 (units/sec base speed).
function kickBuilding(b, dirX, dirZ, force = 40) {
  if (b.userData.kicked) return;
  b.userData.kicked = true;
  b.userData.fallen = true;          // disables collision / standing-on
  const mag = Math.max(0.001, Math.hypot(dirX, dirZ));
  const nx = dirX / mag, nz = dirZ / mag;
  b.userData.vel = new THREE.Vector3(nx * force, force * 0.45, nz * force);
  // Spin around an axis perpendicular to the kick direction (tumbling).
  const spin = force * 0.18 + 2;
  b.userData.angVel = new THREE.Vector3(
    nz * spin * (Math.random() * 0.6 + 0.7),     // pitch around camera-right
    (Math.random() - 0.5) * spin * 0.4,          // little yaw
    -nx * spin * (Math.random() * 0.6 + 0.7)
  );
  b.userData.atRest = false;
  effects.spawnDebris(b.position.clone().setY(b.userData.h));
  sfx.buildingFall();
}
// Back-compat — older call sites still use tipBuilding(b, dx, dz)
function tipBuilding(b, dirX, dirZ) { kickBuilding(b, dirX, dirZ, 40); }

// Forward-fire beam: damage the kaiju if its body intersects the ray segment.
const _tmpHitK = new THREE.Vector3();
const _tmpSphere = new THREE.Sphere();
// Per-frame damage for the sweep beam — `dpsScale` × dt ≈ damage this frame.
function damageKaijuPerFrame(origin, target, dt, dps) {
  if (kaiju.hp <= 0) return false;
  const dir = new THREE.Vector3().subVectors(target, origin).normalize();
  const ray = new THREE.Ray(origin, dir);
  const maxDist = origin.distanceTo(target);
  _tmpSphere.center.copy(kaiju.upperBodyPosition());
  _tmpSphere.radius = kaiju.radius + 6;
  const hit = ray.intersectSphere(_tmpSphere, _tmpHitK);
  if (hit && origin.distanceTo(_tmpHitK) <= maxDist) {
    kaiju.damage(dps * dt);
    return true;
  }
  return false;
}

function damageUltramanOnBeam(origin, target) {
  if (ultraman.hp <= 0) return;
  const dir = new THREE.Vector3().subVectors(target, origin).normalize();
  const ray = new THREE.Ray(origin, dir);
  const maxDist = origin.distanceTo(target);
  _tmpSphere.center.copy(ultraman.upperBodyPosition());
  _tmpSphere.radius = ultraman.radius + 6;
  const hit = ray.intersectSphere(_tmpSphere, _tmpHitK);
  if (hit && origin.distanceTo(_tmpHitK) <= maxDist) {
    ultraman.damage(30);
    effects.spawnImpact(_tmpSphere.center.clone());
    cameraShake = Math.max(cameraShake, 1.4);
    sfx.hit();
  }
}
function damageKaijuOnBeam(origin, target) {
  if (kaiju.hp <= 0) return;
  const dir = new THREE.Vector3().subVectors(target, origin).normalize();
  const ray = new THREE.Ray(origin, dir);
  const maxDist = origin.distanceTo(target);
  _tmpSphere.center.copy(kaiju.upperBodyPosition());
  _tmpSphere.radius = kaiju.radius + 6;
  const hit = ray.intersectSphere(_tmpSphere, _tmpHitK);
  if (hit && origin.distanceTo(_tmpHitK) <= maxDist) {
    kaiju.damage(45);
    effects.spawnImpact(_tmpSphere.center.clone());
    cameraShake = Math.max(cameraShake, 1.2);
    sfx.hit();
  }
}

// Ray-cast the beam through the city — every building on its path topples.
const _tmpHit = new THREE.Vector3();
const _tmpBox = new THREE.Box3();
const _tmpSize = new THREE.Vector3();
function destroyBuildingsOnBeam(origin, target) {
  const dir = new THREE.Vector3().subVectors(target, origin).normalize();
  const ray = new THREE.Ray(origin, dir);
  const maxDist = origin.distanceTo(target);
  for (const b of buildings) {
    if (b.userData.fallen) continue;
    _tmpSize.set(b.userData.w, b.userData.h, b.userData.d);
    _tmpBox.setFromCenterAndSize(b.position, _tmpSize);
    if (ray.intersectBox(_tmpBox, _tmpHit)) {
      if (origin.distanceTo(_tmpHit) < maxDist) {
        kickBuilding(b, dir.x, dir.z, 95);    // beam — strong blow-back
      }
    }
  }
}

// Find the closest unfallen building the beam ray hits before reaching `target`.
// Returns { building, point, dist } or null if nothing's in the way.
function firstBuildingHit(origin, target) {
  const dir = new THREE.Vector3().subVectors(target, origin).normalize();
  const ray = new THREE.Ray(origin, dir);
  const maxDist = origin.distanceTo(target);
  let best = null;
  for (const b of buildings) {
    if (b.userData.fallen) continue;
    _tmpSize.set(b.userData.w, b.userData.h, b.userData.d);
    _tmpBox.setFromCenterAndSize(b.position, _tmpSize);
    const hit = ray.intersectBox(_tmpBox, _tmpHit);
    if (!hit) continue;
    const d = origin.distanceTo(_tmpHit);
    if (d > maxDist) continue;
    if (!best || d < best.dist) best = { building: b, point: _tmpHit.clone(), dist: d };
  }
  return best;
}

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  try { _animate_inner(); } catch (e) { console.error('animate threw:', e); }
}
function _animate_inner() {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (gameStarted && !gameOver && !paused) {
    // ----- Input direction -----
    const dir = new THREE.Vector3();
    if (cameraMode === 'follow') {
      const camFwd     = new THREE.Vector3(Math.sin(cameraYaw), 0, Math.cos(cameraYaw));
      const screenRight = new THREE.Vector3(-Math.cos(cameraYaw), 0, Math.sin(cameraYaw));
      if (keys.KeyW) dir.add(camFwd);
      if (keys.KeyS) dir.addScaledVector(camFwd, -1);
      if (keys.KeyA) dir.addScaledVector(screenRight, -1);
      if (keys.KeyD) dir.add(screenRight);
      // Touch joystick: y- = forward, x = right
      if (stickVec.x || stickVec.y) {
        dir.addScaledVector(camFwd,     -stickVec.y);
        dir.addScaledVector(screenRight, stickVec.x);
      }
    } else {
      if (keys.KeyW) dir.z -= 1;
      if (keys.KeyS) dir.z += 1;
      if (keys.KeyA) dir.x -= 1;
      if (keys.KeyD) dir.x += 1;
      if (stickVec.x || stickVec.y) { dir.x += stickVec.x; dir.z += stickVec.y; }
    }
    if (dir.lengthSq() > 0) dir.normalize();

    const sprint = sprintTouched || !!(keys[settings.keys.sprint] || keys.ShiftLeft || keys.ShiftRight);
    if (cameraMode === 'follow') {
      // Stellar-Blade style: mouse orbits the player (player doesn't rotate
      // while standing still); when WASD is pressed, player snaps to the
      // camera's forward direction so "W" means run into the screen.
      cameraYaw += cameraTurnRate * dt;
      const moving = dir.lengthSq() > 0;
      if (moving) {
        ultraman.facing = cameraYaw;
        ultraman.group.rotation.y = cameraYaw;
        ultraman.move(dir, sprint, dt);
        ultraman.facing = cameraYaw;
      } else {
        ultraman.move(dir, sprint, dt);             // idle — facing stays put
      }
    } else {
      ultraman.move(dir, sprint, dt);
    }

    const wasAir = !ultraman.onGround;
    ultraman.update(dt);
    if (wasAir && ultraman.onGround) sfx.land();
    kaiju.update(dt, ultraman);
    effects.update(dt);
    updateBuildings(buildings, dt);    // legacy 90° tip animation (unused now)
    physicsBuildings(buildings, dt);   // free-tumble for kicked blocks
    settleStacks(buildings, dt);
    animateSea(scene, dt);

    // ----- Collisions -----
    resolveOverlap(ultraman, kaiju);
    collideWithBuildings(ultraman, buildings, true);   // pushes small blocks
    applyStanding(ultraman, buildings);                // stand on rooftops

    // Kaiju is destructive — knocks down any building it walks through
    // (keeps the simple chase AI from getting stuck in the city grid).
    for (const b of buildings) {
      if (b.userData.fallen) continue;
      const dx = kaiju.group.position.x - b.position.x;
      const dz = kaiju.group.position.z - b.position.z;
      const bw = b.userData.w + kaiju.radius * 1.4;
      const bd = b.userData.d + kaiju.radius * 1.4;
      if (Math.abs(dx) < bw / 2 && Math.abs(dz) < bd / 2) {
        // Kaiju rams through — push in kaiju velocity direction
        kickBuilding(b, kaiju.velocity.x || dx, kaiju.velocity.z || dz, 50);
        cameraShake = Math.max(cameraShake, 0.35);
      }
    }

    // Punch hit detection — only during the impact window
    if (ultraman.punching && ultraman.punchActive && !ultraman.punchHit) {
      const dist = horizontalDist(ultraman.group.position, kaiju.group.position);
      let connected = false;
      if (dist < ultraman.radius + kaiju.radius + 6) {
        const dx = kaiju.group.position.x - ultraman.group.position.x;
        const dz = kaiju.group.position.z - ultraman.group.position.z;
        const angle = Math.atan2(dx, dz);
        let da = angle - ultraman.group.rotation.y;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) < 1.0) {
          ultraman.punchHit = true;
          kaiju.damage(10);
          effects.spawnImpact(kaiju.upperBodyPosition());
          cameraShake = Math.max(cameraShake, 0.7);
          sfx.hit();
          connected = true;
        }
      }
      // Also try to topple a building in front (Ultraman demolishes architecture)
      if (!connected && punchTipBuildings(ultraman, buildings)) {
        ultraman.punchHit = true;
        cameraShake = Math.max(cameraShake, 0.5);
      }
    }

    // Kick hit detection — bigger reach + damage than punch
    if (ultraman.kicking && ultraman.kickActive && !ultraman.kickHit) {
      const dist = horizontalDist(ultraman.group.position, kaiju.group.position);
      let connected = false;
      if (dist < ultraman.radius + kaiju.radius + 8) {
        const dx = kaiju.group.position.x - ultraman.group.position.x;
        const dz = kaiju.group.position.z - ultraman.group.position.z;
        const angle = Math.atan2(dx, dz);
        let da = angle - ultraman.group.rotation.y;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) < 1.1) {
          ultraman.kickHit = true;
          kaiju.damage(15);
          effects.spawnImpact(kaiju.upperBodyPosition());
          cameraShake = Math.max(cameraShake, 1.0);
          sfx.hit();
          connected = true;
        }
      }
      // Heavy kick can also smash buildings ahead with extra force
      if (!connected) {
        const fx = Math.sin(ultraman.group.rotation.y);
        const fz = Math.cos(ultraman.group.rotation.y);
        const reach = 28;
        const px = ultraman.group.position.x + fx * (ultraman.radius + reach * 0.5);
        const pz = ultraman.group.position.z + fz * (ultraman.radius + reach * 0.5);
        for (const b of buildings) {
          if (b.userData.fallen) continue;
          const dx = px - b.position.x, dz = pz - b.position.z;
          if (Math.abs(dx) < b.userData.w / 2 + reach * 0.4 &&
              Math.abs(dz) < b.userData.d / 2 + reach * 0.4) {
            kickBuilding(b, fx, fz, 60);
            ultraman.kickHit = true;
            cameraShake = Math.max(cameraShake, 0.7);
            break;
          }
        }
      }
    }

    // Kaiju attack hit
    if (kaiju.attackHitFrame && !kaiju.attackLanded) {
      const dist = horizontalDist(ultraman.group.position, kaiju.group.position);
      if (dist < kaiju.attackRange + ultraman.radius - 2) {
        kaiju.attackLanded = true;
        ultraman.damage(10);
        effects.spawnImpact(ultraman.upperBodyPosition());
        cameraShake = Math.max(cameraShake, 1.0);
        sfx.hit();
      }
    }

    // Ultraman sweep-beam — tracked each frame from the player's facing.
    // SweepBeam mesh is created on rising edge, updated, then disposed.
    if (ultraman.beamActive) {
      if (!sweepBeamMesh) sweepBeamMesh = effects.createSweepBeam(0x88eeff);
      const origin = ultraman.beamOrigin;
      const target = ultraman.beamTarget;
      const blocker = firstBuildingHit(origin, target);
      const effectiveTarget = blocker ? blocker.point : target;
      sweepBeamMesh.update(origin, effectiveTarget);
      if (blocker) {
        const d = new THREE.Vector3().subVectors(effectiveTarget, origin).normalize();
        kickBuilding(blocker.building, d.x, d.z, 95);
      } else {
        // Per-frame DPS that totals ~70 damage over the 1s sweep on a held target
        if (damageKaijuPerFrame(origin, target, dt, 70)) {
          effects.spawnImpact(kaiju.upperBodyPosition());
          cameraShake = Math.max(cameraShake, 0.4);
        }
        destroyBuildingsOnBeam(origin, target);
      }
    } else if (sweepBeamMesh) {
      sweepBeamMesh.dispose();
      sweepBeamMesh = null;
    }

    // Kaiju ranged beam — fires forward, but STOPS at the first building it
    // hits (still destroys that building). Won't pass through to hit player
    // if there's a wall in between.
    if (kaiju.beamFiredThisFrame) {
      const origin = kaiju.upperBodyPosition();
      origin.x += Math.sin(kaiju.group.rotation.y) * 8;
      origin.z += Math.cos(kaiju.group.rotation.y) * 8;
      const target = origin.clone();
      target.x += Math.sin(kaiju.group.rotation.y) * 500;
      target.z += Math.cos(kaiju.group.rotation.y) * 500;
      target.y -= 6;
      const blocker = firstBuildingHit(origin, target);
      const effectiveTarget = blocker ? blocker.point : target;
      effects.fireBeam(origin, effectiveTarget, null, 0xff3322);
      if (blocker) {
        // Beam absorbed by building — destroy it, player is safe
        const d = new THREE.Vector3().subVectors(effectiveTarget, origin).normalize();
        kickBuilding(blocker.building, d.x, d.z, 95);
      } else {
        // Clear line of sight — beam reaches and can damage player
        damageUltramanOnBeam(origin, effectiveTarget);
      }
      cameraShake = Math.max(cameraShake, 1.3);
      sfx.beamFire();
      kaiju.beamFiredThisFrame = false;
    }

    // Win/lose
    if (ultraman.hp <= 0) {
      gameOver = true;
      showMessage('敗 北', '怪獸佔據了都市…', '#ff4466', true);
      sfx.defeat();
      if (document.pointerLockElement) document.exitPointerLock();
    } else if (kaiju.hp <= 0) {
      gameOver = true;
      showMessage('勝 利', '都市的和平守住了', '#ffe44a', true);
      sfx.victory();
      if (document.pointerLockElement) document.exitPointerLock();
    }

    hud.update(ultraman, kaiju);
  } else if (gameOver) {
    // Keep updating so the death / victory animations keep playing
    ultraman.update(dt);
    kaiju.update(dt, ultraman);
    effects.update(dt);
    updateBuildings(buildings, dt);
    physicsBuildings(buildings, dt);
  }

  // ----- Camera -----
  let lookTarget;
  if (cameraMode === 'follow') {
    // Orbit camera: yaw (mouse-X / Q-E) + pitch (mouse-Y) at fixed distance.
    const dist = settings.camDistance;
    const lookDir = new THREE.Vector3(
      Math.sin(cameraYaw) * Math.cos(cameraPitch),
      -Math.sin(cameraPitch),
      Math.cos(cameraYaw) * Math.cos(cameraPitch)
    );
    const desiredCam = ultraman.group.position.clone()
      .sub(lookDir.clone().multiplyScalar(dist));
    desiredCam.y += 22;                         // baseline so we sit above feet
    camera.position.lerp(desiredCam, 0.15);
    lookTarget = ultraman.group.position.clone();
    lookTarget.y += 24;
  } else {
    // Fighting-game framing
    const mid = new THREE.Vector3().lerpVectors(ultraman.group.position, kaiju.group.position, 0.5);
    mid.y = 25;
    const sep = horizontalDist(ultraman.group.position, kaiju.group.position);
    const camDist = Math.max(120, sep * 1.05 + 60);
    const camHeight = camDist * 0.42;
    const desiredCam = new THREE.Vector3(mid.x, mid.y + camHeight, mid.z + camDist);
    camera.position.lerp(desiredCam, 0.06);
    lookTarget = mid;
  }

  if (cameraShake > 0) {
    camera.position.x += (Math.random() - 0.5) * cameraShake * 2.5;
    camera.position.y += (Math.random() - 0.5) * cameraShake * 2.5;
    cameraShake = Math.max(0, cameraShake - dt * 5);
  }

  camera.lookAt(lookTarget);
  renderer.render(scene, camera);
}

animate();

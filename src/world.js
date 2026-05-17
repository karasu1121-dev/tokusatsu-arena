import * as THREE from 'three';

// ---------- Procedural textures (Canvas-generated) ----------
function makeCanvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// Glass curtain wall — dark blue panes with a grid of lit / dim windows.
// Returns { map, emissive } so the lit windows actually glow at night.
function makeGlassTexture(cols = 6, rows = 12) {
  const size = 256;
  const c = makeCanvas(size), ctx = c.getContext('2d');
  const ec = makeCanvas(size), ectx = ec.getContext('2d');
  ctx.fillStyle = '#10182a'; ctx.fillRect(0, 0, size, size);
  ectx.fillStyle = '#000';   ectx.fillRect(0, 0, size, size);
  const cw = size / cols, rh = size / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const lit = Math.random() < 0.55;
      const px = col * cw + 1.5, py = r * rh + 1.5;
      const pw = cw - 3, ph = rh - 3;
      // Diffuse: pane colour
      ctx.fillStyle = lit ? '#ffd066' : '#1c2740';
      ctx.fillRect(px, py, pw, ph);
      // Small frame highlight on inner edge
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(px, py, pw, 1);
      // Emissive: only the lit panes
      ectx.fillStyle = lit ? '#ffcc66' : '#000';
      ectx.fillRect(px, py, pw, ph);
    }
  }
  const map  = new THREE.CanvasTexture(c);
  const emis = new THREE.CanvasTexture(ec);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  emis.wrapS = emis.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, emissive: emis };
}

// Concrete / office wall — tonal noise + faint window slits.
function makeConcreteTexture() {
  const size = 256;
  const c = makeCanvas(size), ctx = c.getContext('2d');
  const ec = makeCanvas(size), ectx = ec.getContext('2d');
  ctx.fillStyle = '#8a857a'; ctx.fillRect(0, 0, size, size);
  ectx.fillStyle = '#000';   ectx.fillRect(0, 0, size, size);
  // Noise
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 50;
    img.data[i]   = Math.max(0, Math.min(255, img.data[i]   + n));
    img.data[i+1] = Math.max(0, Math.min(255, img.data[i+1] + n));
    img.data[i+2] = Math.max(0, Math.min(255, img.data[i+2] + n));
  }
  ctx.putImageData(img, 0, 0);
  // Horizontal window strips
  const rows = 6;
  for (let r = 1; r < rows; r++) {
    const y = (r / rows) * size;
    for (let x = 6; x < size - 6; x += 18) {
      const lit = Math.random() < 0.4;
      ctx.fillStyle = lit ? '#ffb866' : '#2a313e';
      ctx.fillRect(x, y - 3, 12, 6);
      ectx.fillStyle = lit ? '#ff9844' : '#000';
      ectx.fillRect(x, y - 3, 12, 6);
    }
  }
  const map  = new THREE.CanvasTexture(c);
  const emis = new THREE.CanvasTexture(ec);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  emis.wrapS = emis.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, emissive: emis };
}

// Low-rise / residential brick — terracotta blocks with a few windows.
function makeBrickTexture() {
  const size = 256;
  const c = makeCanvas(size), ctx = c.getContext('2d');
  const ec = makeCanvas(size), ectx = ec.getContext('2d');
  ctx.fillStyle = '#7a4034'; ctx.fillRect(0, 0, size, size);
  ectx.fillStyle = '#000';   ectx.fillRect(0, 0, size, size);
  // Mortar lines
  ctx.fillStyle = '#3a1d18';
  const brickW = 32, brickH = 16;
  for (let row = 0; row < size / brickH; row++) {
    const off = (row % 2) * brickW / 2;
    ctx.fillRect(0, row * brickH, size, 1);          // horizontal mortar
    for (let x = -brickW + off; x < size; x += brickW) {
      ctx.fillRect(x, row * brickH, 1, brickH);      // vertical mortar
    }
  }
  // A couple of windows
  for (let r = 0; r < 3; r++) {
    const wx = 40 + Math.random() * 150;
    const wy = 40 + r * 80;
    const lit = Math.random() < 0.45;
    ctx.fillStyle = lit ? '#ffcc55' : '#0a0c14';
    ctx.fillRect(wx, wy, 28, 36);
    ctx.fillStyle = '#000';
    ctx.fillRect(wx + 13, wy, 2, 36);                // window cross
    ctx.fillRect(wx, wy + 17, 28, 2);
    ectx.fillStyle = lit ? '#ff9933' : '#000';
    ectx.fillRect(wx, wy, 28, 36);
  }
  const map  = new THREE.CanvasTexture(c);
  const emis = new THREE.CanvasTexture(ec);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  emis.wrapS = emis.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, emissive: emis };
}

// Animated sea — blue gradient + low-frequency wave noise, scrolled by main loop.
function makeWaterTexture() {
  const size = 512;
  const c = makeCanvas(size), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size*0.7);
  g.addColorStop(0, '#1c4870');
  g.addColorStop(1, '#0c2840');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  // Wave streaks
  for (let i = 0; i < 80; i++) {
    const y = Math.random() * size;
    const len = 30 + Math.random() * 120;
    const x = Math.random() * size;
    ctx.strokeStyle = `rgba(180,220,255,${0.06 + Math.random() * 0.10})`;
    ctx.lineWidth = 1 + Math.random() * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + len * 0.3, y - 4, x + len * 0.6, y + 4, x + len, y);
    ctx.stroke();
  }
  // Sparkles
  for (let i = 0; i < 200; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.4 + Math.random() * 0.4})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWorld() {
  const scene = new THREE.Scene();

  // Sunset sky + atmospheric fog
  scene.background = new THREE.Color(0xff7755);
  scene.fog = new THREE.Fog(0xff8866, 280, 950);

  // Lights
  const hemi = new THREE.HemisphereLight(0xff9966, 0x223344, 0.7);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffe0bb, 2.2);
  sun.position.set(160, 260, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 900;
  sun.shadow.camera.left = -380;
  sun.shadow.camera.right = 380;
  sun.shadow.camera.top = 380;
  sun.shadow.camera.bottom = -380;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  // Rim light (cool back-fill for tokusatsu look)
  const rim = new THREE.DirectionalLight(0x6688ff, 0.35);
  rim.position.set(-200, 150, -150);
  scene.add(rim);

  // Sea — large animated plane around the city
  const waterTex = makeWaterTexture();
  waterTex.repeat.set(40, 40);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.MeshStandardMaterial({
      map: waterTex, color: 0x4a86b8,
      roughness: 0.25, metalness: 0.55,
    })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.4;        // slightly below the city ground = looks like the city is on a small island
  sea.receiveShadow = true;
  scene.add(sea);
  scene.userData.seaTexture = waterTex;     // hook for main.js to scroll UV each frame

  // City island ground — covers the buildable area + a small beach margin.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(720, 720),
    new THREE.MeshStandardMaterial({ color: 0x484440, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Roads (subtle grid)
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 1 });
  for (let i = -300; i <= 300; i += 60) {
    const ew = new THREE.Mesh(new THREE.PlaneGeometry(700, 10), roadMat);
    ew.rotation.x = -Math.PI / 2;
    ew.position.set(0, 0.05, i);
    ew.receiveShadow = true;
    scene.add(ew);

    const ns = new THREE.Mesh(new THREE.PlaneGeometry(10, 700), roadMat);
    ns.rotation.x = -Math.PI / 2;
    ns.position.set(i, 0.05, 0);
    ns.receiveShadow = true;
    scene.add(ns);
  }

  // ---------- Buildings — simple solid colours, leave the centre clear ----------
  const buildings = [];
  for (let bx = -270; bx <= 270; bx += 60) {
    for (let bz = -270; bz <= 270; bz += 60) {
      if (Math.abs(bx) < 80 && Math.abs(bz) < 80) continue;
      const count = Math.random() < 0.55 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const w = 12 + Math.random() * 14;
        const d = 12 + Math.random() * 14;
        const totalH = 15 + Math.random() * 50;
        const ox = (Math.random() - 0.5) * (44 - w);
        const oz = (Math.random() - 0.5) * (44 - d);

        const hue = 200 + Math.random() * 40;
        const sat = 0.10 + Math.random() * 0.15;
        const lit = 0.32 + Math.random() * 0.22;
        const col = new THREE.Color().setHSL(hue / 360, sat, lit);
        const mat = new THREE.MeshStandardMaterial({
          color: col,
          roughness: 0.75,
          metalness: 0.1,
          emissive: 0xffaa55,
          emissiveIntensity: 0.04 + Math.random() * 0.06,
        });

        const stackable = totalH > 22 && Math.random() < 0.4;
        const blocks = stackable ? 2 + Math.floor(Math.random() * 3) : 1;
        const blockH = totalH / blocks;
        let curY = 0;
        for (let s = 0; s < blocks; s++) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(w, blockH, d), mat);
          b.position.set(bx + ox, curY + blockH / 2, bz + oz);
          b.castShadow = true;
          b.receiveShadow = true;
          b.userData = {
            w, h: blockH, d,
            fallen: false, fallSpeed: 0, baseY: curY + blockH / 2,
            stackIndex: s, stackTotal: blocks,
          };
          scene.add(b);
          buildings.push(b);
          curY += blockH;
        }
      }
    }
  }

  return { scene, buildings };
}

// Animate the sea — scroll its texture UV offset for shimmer.
export function animateSea(scene, dt) {
  const tex = scene.userData.seaTexture;
  if (!tex) return;
  tex.offset.x += dt * 0.012;
  tex.offset.y += dt * 0.008;
}

// Cascade gravity: when a block under a stack falls or is pushed, the blocks
// stacked above should drop. Called from main once per frame.
const _tmpFallVy = new WeakMap();
export function settleStacks(buildings, dt) {
  for (const b of buildings) {
    if (b.userData.kicked) continue;        // physics-driven, handles its own gravity
    if (b.userData.fallen) continue;
    if (b.userData.h <= 0) continue;
    const baseY = b.position.y - b.userData.h / 2;
    if (baseY < 0.5) continue;        // already on the ground
    const supported = buildings.some(o => {
      if (o === b || o.userData.fallen) return false;
      if (Math.abs(o.position.x - b.position.x) > 0.5) return false;
      if (Math.abs(o.position.z - b.position.z) > 0.5) return false;
      const oTop = o.position.y + o.userData.h / 2;
      return Math.abs(oTop - baseY) < 1.0;
    });
    if (supported) { _tmpFallVy.set(b, 0); continue; }
    let vy = (_tmpFallVy.get(b) || 0) - 60 * dt;
    b.position.y += vy * dt;
    const newBaseY = b.position.y - b.userData.h / 2;
    if (newBaseY <= 0) {
      b.position.y = b.userData.h / 2;
      vy = 0;
    }
    _tmpFallVy.set(b, vy);
  }
}

// Rigid-body physics for blocks that have been "kicked" (punch/sprint-tackle/
// beam): free-flying with gravity, angular velocity, and ground bounce until
// they come to rest. Blocks remain marked `fallen` (no collision, walkable).
const _GRAVITY = -180;
const _AIR_DRAG = 0.985;
const _ANG_DRAG = 0.96;
const _BOUNCE_E = 0.32;       // energy retained on each ground bounce
const _GROUND_FRICTION = 0.78;
export function physicsBuildings(buildings, dt) {
  for (const b of buildings) {
    const ud = b.userData;
    if (!ud.kicked || ud.atRest) continue;

    // Integrate linear motion
    ud.vel.y += _GRAVITY * dt;
    b.position.x += ud.vel.x * dt;
    b.position.y += ud.vel.y * dt;
    b.position.z += ud.vel.z * dt;
    ud.vel.multiplyScalar(_AIR_DRAG);

    // Integrate angular motion
    b.rotation.x += ud.angVel.x * dt;
    b.rotation.y += ud.angVel.y * dt;
    b.rotation.z += ud.angVel.z * dt;
    ud.angVel.multiplyScalar(_ANG_DRAG);

    // World bounds — keep within arena
    if (Math.abs(b.position.x) > 700) ud.vel.x = -ud.vel.x * 0.5;
    if (Math.abs(b.position.z) > 700) ud.vel.z = -ud.vel.z * 0.5;

    // Ground collision (treat block centre as floor reference for simplicity)
    const halfDiag = Math.max(ud.w, ud.h, ud.d) / 2;
    const restY = halfDiag * 0.4;
    if (b.position.y < restY) {
      b.position.y = restY;
      if (ud.vel.y < 0) {
        ud.vel.y = -ud.vel.y * _BOUNCE_E;
        ud.vel.x *= _GROUND_FRICTION;
        ud.vel.z *= _GROUND_FRICTION;
        ud.angVel.multiplyScalar(_BOUNCE_E + 0.3);
      }
      // Settle when energy is low
      if (ud.vel.lengthSq() < 4 && ud.angVel.lengthSq() < 0.2) {
        ud.atRest = true;
        ud.vel.set(0, 0, 0);
        ud.angVel.set(0, 0, 0);
      }
    }
  }
}

export function updateBuildings(buildings, dt) {
  for (const b of buildings) {
    if (b.userData.kicked) continue;     // physics-driven, owns its own rotation
    if (!b.userData.fallen) continue;
    if (b.userData.done) continue;
    b.userData.fallSpeed += dt * 5;
    const axis = b.userData.fallAxis;
    const dir = b.userData.fallDir;
    const step = b.userData.fallSpeed * dt * dir;
    if (axis === 'x') {
      b.rotation.z += step;
      if (Math.abs(b.rotation.z) >= Math.PI / 2) {
        b.rotation.z = (Math.PI / 2) * dir;
        b.position.y = b.userData.w / 2;
        b.userData.done = true;
      }
    } else {
      b.rotation.x += step;
      if (Math.abs(b.rotation.x) >= Math.PI / 2) {
        b.rotation.x = (Math.PI / 2) * -dir; // x-axis rotation reads opposite visually
        b.position.y = b.userData.d / 2;
        b.userData.done = true;
      }
    }
  }
}

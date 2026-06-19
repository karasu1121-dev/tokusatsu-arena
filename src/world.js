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

const LIGHTING_PRESETS = [
  {
    name: 'sunset',
    background: 0xff7755,
    fog: 0xff8866,
    fogNear: 280,
    fogFar: 950,
    hemiSky: 0xff9966,
    hemiGround: 0x223344,
    hemiIntensity: 0.7,
    sunColor: 0xffe0bb,
    sunIntensity: 2.2,
    sunPosition: [160, 260, 90],
    rimColor: 0x6688ff,
    rimIntensity: 0.35,
    waterColor: 0x4a86b8,
    groundColor: 0x484440,
    roadColor: 0x1c1c20,
    buildingLight: 0.04,
    buildingLightVariance: 0.06,
    buildingLitBoost: 1.0,
    exposure: 1.1,
  },
  {
    name: 'day',
    background: 0x8fd3ff,
    fog: 0xb9e4ff,
    fogNear: 360,
    fogFar: 1200,
    hemiSky: 0xdff6ff,
    hemiGround: 0x6b786f,
    hemiIntensity: 1.05,
    sunColor: 0xfff4d6,
    sunIntensity: 2.6,
    sunPosition: [120, 300, 180],
    rimColor: 0xd6f3ff,
    rimIntensity: 0.2,
    waterColor: 0x4fb3d8,
    groundColor: 0x53564a,
    roadColor: 0x25272b,
    buildingLight: 0.0,
    buildingLightVariance: 0.015,
    buildingLitBoost: 0.35,
    exposure: 1.0,
  },
  {
    name: 'night',
    background: 0x070b1d,
    fog: 0x101735,
    fogNear: 230,
    fogFar: 900,
    hemiSky: 0x405b96,
    hemiGround: 0x151a26,
    hemiIntensity: 0.85,
    sunColor: 0xb8ccff,
    sunIntensity: 1.35,
    sunPosition: [-180, 230, -120],
    rimColor: 0x66aaff,
    rimIntensity: 1.25,
    waterColor: 0x285d8f,
    groundColor: 0x39445a,
    roadColor: 0x171e31,
    buildingLight: 0.2,
    buildingLightVariance: 0.22,
    buildingLitBoost: 2.0,
    exposure: 1.8,
    stars: true,
    useBuildingTextures: false,
    neonStreets: true,
    buildingDoubleChance: 0.25,
    buildingShadows: false,
  },
];

function pickLightingPreset() {
  return LIGHTING_PRESETS[Math.floor(Math.random() * LIGHTING_PRESETS.length)];
}

function addNightStars(scene) {
  const count = 450;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 700 + Math.random() * 1700;
    positions[i * 3] = Math.sin(angle) * radius;
    positions[i * 3 + 1] = 280 + Math.random() * 850;
    positions[i * 3 + 2] = Math.cos(angle) * radius;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xdde8ff,
    size: 3.0,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  scene.add(new THREE.Points(geo, mat));
}

function addNeonStreets(scene) {
  const cyanMat = new THREE.MeshBasicMaterial({
    color: 0x26f5ff,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
  });
  const magentaMat = new THREE.MeshBasicMaterial({
    color: 0xff3ff2,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
  });

  for (let i = -300; i <= 300; i += 60) {
    const ew = new THREE.Mesh(new THREE.PlaneGeometry(700, 1.8), cyanMat);
    ew.rotation.x = -Math.PI / 2;
    ew.position.set(0, 0.09, i - 5.4);
    scene.add(ew);

    const ns = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 700), magentaMat);
    ns.rotation.x = -Math.PI / 2;
    ns.position.set(i + 5.4, 0.1, 0);
    scene.add(ns);
  }

  for (let x = -240; x <= 240; x += 120) {
    for (let z = -240; z <= 240; z += 120) {
      const color = ((x + z) / 120) % 2 === 0 ? 0x26f5ff : 0xff3ff2;
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(2.6, 8, 6),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.7,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      glow.position.set(x, 8, z);
      scene.add(glow);
    }
  }
}

function addOilTanks(scene, buildings) {
  const tankCount = 10;
  const tankMat = new THREE.MeshStandardMaterial({
    color: 0xb9bec7,
    metalness: 0.45,
    roughness: 0.42,
    emissive: 0x331100,
    emissiveIntensity: 0.08,
  });

  const clearYard = (pos, radius) => {
    for (let i = buildings.length - 1; i >= 0; i--) {
      const b = buildings[i];
      if (b.userData.isOilTank) continue;
      const dx = b.position.x - pos.x;
      const dz = b.position.z - pos.z;
      if (Math.hypot(dx, dz) < radius) {
        scene.remove(b);
        if (b.geometry) b.geometry.dispose();
        if (b.material) {
          if (Array.isArray(b.material)) b.material.forEach(m => m.dispose && m.dispose());
          else b.material.dispose && b.material.dispose();
        }
        buildings.splice(i, 1);
      }
    }
  };

  for (let i = 0; i < tankCount; i++) {
    let pos = null;
    for (let tries = 0; tries < 60; tries++) {
      const candidate = new THREE.Vector3(
        -260 + Math.random() * 520,
        0,
        -260 + Math.random() * 520
      );
      if (Math.abs(candidate.x) < 95 && Math.abs(candidate.z) < 95) continue;
      const tooClose = buildings.some(b => {
        const pad = b.userData.isOilTank ? 44 : 28;
        return Math.abs(candidate.x - b.position.x) < b.userData.w / 2 + pad &&
               Math.abs(candidate.z - b.position.z) < b.userData.d / 2 + pad;
      });
      if (!tooClose) {
        pos = candidate;
        break;
      }
    }

    const radius = 13 + Math.random() * 4;
    const height = 28 + Math.random() * 10;
    if (!pos) {
      const angle = (i / tankCount) * Math.PI * 2 + Math.random() * 0.25;
      const ringRadius = 210 + (i % 2) * 38;
      pos = new THREE.Vector3(Math.sin(angle) * ringRadius, 0, Math.cos(angle) * ringRadius);
    }
    clearYard(pos, radius + 18);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 32), tankMat.clone());
    tank.position.set(pos.x, height / 2, pos.z);
    tank.castShadow = scene.userData.lightingPreset !== 'night';
    tank.receiveShadow = scene.userData.lightingPreset !== 'night';
    tank.userData = {
      w: radius * 2,
      h: height,
      d: radius * 2,
      fallen: false,
      fallSpeed: 0,
      baseY: height / 2,
      stackIndex: 0,
      stackTotal: 1,
      isOilTank: true,
      exploded: false,
    };
    scene.add(tank);
    buildings.push(tank);
  }
}

export function createWorld() {
  const scene = new THREE.Scene();
  const lighting = pickLightingPreset();
  scene.userData.lightingPreset = lighting.name;
  scene.userData.lightingExposure = lighting.exposure;

  // Sky + atmospheric fog
  scene.background = new THREE.Color(lighting.background);
  scene.fog = new THREE.Fog(lighting.fog, lighting.fogNear, lighting.fogFar);

  // Lights
  const hemi = new THREE.HemisphereLight(lighting.hemiSky, lighting.hemiGround, lighting.hemiIntensity);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(lighting.sunColor, lighting.sunIntensity);
  sun.position.set(...lighting.sunPosition);
  sun.castShadow = lighting.name !== 'night';
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
  const rim = new THREE.DirectionalLight(lighting.rimColor, lighting.rimIntensity);
  rim.position.set(-200, 150, -150);
  scene.add(rim);
  if (lighting.stars) addNightStars(scene);

  // Sea — large animated plane around the city
  const waterTex = makeWaterTexture();
  waterTex.repeat.set(40, 40);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.MeshStandardMaterial({
      map: waterTex, color: lighting.waterColor,
      roughness: 0.25, metalness: 0.55,
    })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.4;        // slightly below the city ground = looks like the city is on a small island
  sea.receiveShadow = lighting.name !== 'night';
  scene.add(sea);
  scene.userData.seaTexture = waterTex;     // hook for main.js to scroll UV each frame

  // City island ground — covers the buildable area + a small beach margin.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(720, 720),
    new THREE.MeshStandardMaterial({ color: lighting.groundColor, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = lighting.name !== 'night';
  scene.add(ground);

  // Roads (subtle grid)
  const roadMat = new THREE.MeshStandardMaterial({ color: lighting.roadColor, roughness: 1 });
  for (let i = -300; i <= 300; i += 60) {
    const ew = new THREE.Mesh(new THREE.PlaneGeometry(700, 10), roadMat);
    ew.rotation.x = -Math.PI / 2;
    ew.position.set(0, 0.05, i);
    ew.receiveShadow = lighting.name !== 'night';
    scene.add(ew);

    const ns = new THREE.Mesh(new THREE.PlaneGeometry(10, 700), roadMat);
    ns.rotation.x = -Math.PI / 2;
    ns.position.set(i, 0.05, 0);
    ns.receiveShadow = lighting.name !== 'night';
    scene.add(ns);
  }
  if (lighting.neonStreets) addNeonStreets(scene);

  // ---------- Buildings — simple solid colours, leave the centre clear ----------
  const buildings = [];
  for (let bx = -270; bx <= 270; bx += 60) {
    for (let bz = -270; bz <= 270; bz += 60) {
      if (Math.abs(bx) < 80 && Math.abs(bz) < 80) continue;
      const doubleChance = lighting.buildingDoubleChance ?? 0.55;
      const count = Math.random() < doubleChance ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const w = 12 + Math.random() * 14;
        const d = 12 + Math.random() * 14;
        const totalH = 15 + Math.random() * 50;
        const ox = (Math.random() - 0.5) * (44 - w);
        const oz = (Math.random() - 0.5) * (44 - d);

        let col;
        let nightBuildingColor = null;
        if (lighting.name === 'night') {
          const neonPalette = [
            0xff3ff2, 0xff5ecf, 0xff2f92,
            0x7cff00, 0x2dff6f, 0xb6ff28,
            0xff7a1a, 0xffa12b, 0xff4f1f,
            0x26f5ff, 0x45ffd0, 0xd86bff,
          ];
          col = new THREE.Color(neonPalette[Math.floor(Math.random() * neonPalette.length)]);
          col.lerp(new THREE.Color(0xffffff), 0.08 + Math.random() * 0.1);
          nightBuildingColor = col.clone();
        } else {
          const hue = 200 + Math.random() * 40;
          const sat = 0.10 + Math.random() * 0.15;
          const lit = 0.32 + Math.random() * 0.22;
          col = new THREE.Color().setHSL(hue / 360, sat, lit);
        }
        const matParams = {
          color: col,
          roughness: 0.75,
          metalness: 0.1,
          emissive: lighting.name === 'night' ? col.clone().multiplyScalar(0.45) : 0xffaa55,
          emissiveIntensity: (lighting.buildingLight + Math.random() * lighting.buildingLightVariance) * lighting.buildingLitBoost,
        };
        if (lighting.useBuildingTextures) {
          const facadeRoll = Math.random();
          const facade = totalH > 36 && facadeRoll < 0.55
            ? makeGlassTexture(6, 12)
            : (totalH > 24 && facadeRoll < 0.8 ? makeConcreteTexture() : makeBrickTexture());
          const verticalRepeat = Math.max(1, Math.round(totalH / 26));
          facade.map.repeat.set(1, verticalRepeat);
          facade.emissive.repeat.set(1, verticalRepeat);
          matParams.map = facade.map;
          matParams.emissiveMap = facade.emissive;
        }
        const mat = new THREE.MeshStandardMaterial(matParams);

        const stackable = totalH > 22 && Math.random() < 0.4;
        const blocks = stackable ? 2 + Math.floor(Math.random() * 3) : 1;
        const blockH = totalH / blocks;
        let curY = 0;
        for (let s = 0; s < blocks; s++) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(w, blockH, d), mat);
          b.position.set(bx + ox, curY + blockH / 2, bz + oz);
          b.castShadow = lighting.buildingShadows !== false;
          b.receiveShadow = lighting.buildingShadows !== false;
          b.userData = {
            w, h: blockH, d,
            fallen: false, fallSpeed: 0, baseY: curY + blockH / 2,
            stackIndex: s, stackTotal: blocks,
            isNightBuilding: lighting.name === 'night',
            nightColor: nightBuildingColor,
          };
          scene.add(b);
          buildings.push(b);
          curY += blockH;
        }
      }
    }
  }
  addOilTanks(scene, buildings);

  return { scene, buildings };
}

// ===========================================================================
// LEVEL 2 — Gunkanjima (Battleship Island) factory.
// A small, dense concrete island bristling with pipes, smokestacks and molten
// blast furnaces, ringed by a sea wall. Same destructible-`buildings` contract
// as the city so combat/collision/physics all keep working.
// ===========================================================================

// Weathered grey concrete — Gunkanjima's derelict apartment blocks.
function makeFactoryConcreteTexture() {
  const size = 256;
  const c = makeCanvas(size), ctx = c.getContext('2d');
  ctx.fillStyle = '#52504b'; ctx.fillRect(0, 0, size, size);
  // Grime + stain noise
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 46;
    img.data[i]   = Math.max(0, Math.min(255, img.data[i]   + n));
    img.data[i+1] = Math.max(0, Math.min(255, img.data[i+1] + n));
    img.data[i+2] = Math.max(0, Math.min(255, img.data[i+2] + n));
  }
  ctx.putImageData(img, 0, 0);
  // Rust streaks
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * size;
    ctx.strokeStyle = `rgba(${120 + Math.random() * 60},${50 + Math.random() * 30},20,${0.10 + Math.random() * 0.18})`;
    ctx.lineWidth = 1 + Math.random() * 3;
    ctx.beginPath();
    ctx.moveTo(x, Math.random() * 40);
    ctx.lineTo(x + (Math.random() - 0.5) * 10, size);
    ctx.stroke();
  }
  // Grid of dark broken windows
  const cols = 6, rows = 8, cw = size / cols, rh = size / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      if (Math.random() < 0.25) continue;     // collapsed / bricked-up
      ctx.fillStyle = Math.random() < 0.12 ? '#3a2a18' : '#15161a';
      ctx.fillRect(col * cw + 4, r * rh + 4, cw - 8, rh - 8);
    }
  }
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

// A run of industrial piping between two ground points, lifted on stub legs.
function addPipeRun(scene, x1, z1, x2, z2, y, radius, mat) {
  const a = new THREE.Vector3(x1, y, z1);
  const b = new THREE.Vector3(x2, y, z2);
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 12), mat);
  pipe.position.copy(a).lerp(b, 0.5);
  pipe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  pipe.castShadow = true;
  scene.add(pipe);
  // Support legs
  const legMat = mat;
  const legs = Math.max(2, Math.floor(len / 34));
  for (let i = 0; i <= legs; i++) {
    const p = a.clone().lerp(b, i / legs);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.5, radius * 0.5, y, 8), legMat);
    leg.position.set(p.x, y / 2, p.z);
    scene.add(leg);
  }
  // Flange collars at each end
  for (const p of [a, b]) {
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.3, radius * 1.3, 1.4, 12), legMat);
    collar.position.copy(p);
    collar.quaternion.copy(pipe.quaternion);
    scene.add(collar);
  }
}

// A glowing blast furnace — destructible (added to `buildings`).
function addBlastFurnace(scene, buildings, x, z) {
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x44403c, metalness: 0.55, roughness: 0.6 });
  const moltenMat = new THREE.MeshStandardMaterial({
    color: 0xff5a1a, emissive: 0xff5a1a, emissiveIntensity: 2.0, roughness: 0.4,
  });
  const radius = 13, height = 64;
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  // Tapered furnace body
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.62, radius, height, 20), ironMat);
  body.position.y = height / 2;
  body.castShadow = true; body.receiveShadow = true;
  group.add(body);
  // Riveted bands
  for (let i = 1; i <= 3; i++) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(radius * (1 - i * 0.07) + 0.4, 0.8, 8, 24), ironMat);
    band.position.y = (height / 4) * i;
    band.rotation.x = Math.PI / 2;
    group.add(band);
  }
  // Molten crucible glow at the mouth
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.6, radius * 0.55, 4, 20), moltenMat);
  glow.position.y = height + 1;
  group.add(glow);
  // Molten tap stream near the base
  const tap = new THREE.Mesh(new THREE.BoxGeometry(2.2, 10, 2.2), moltenMat);
  tap.position.set(radius * 0.7, 6, 0);
  group.add(tap);
  const furnaceLight = new THREE.PointLight(0xff5a1a, 2.4, 150, 1.5);
  furnaceLight.position.y = height + 4;
  group.add(furnaceLight);

  scene.add(group);
  group.userData = {
    w: radius * 2, h: height, d: radius * 2,
    fallen: false, fallSpeed: 0, baseY: height / 2,
    stackIndex: 0, stackTotal: 1,
    isNightBuilding: false, nightColor: null,
    isFurnace: true,
  };
  buildings.push(group);
}

export function createFactoryWorld() {
  const scene = new THREE.Scene();
  scene.userData.lightingPreset = 'factory';
  scene.userData.lightingExposure = 1.15;

  // Smoggy industrial dusk
  scene.background = new THREE.Color(0x6a5746);
  scene.fog = new THREE.Fog(0x6a5746, 220, 980);

  const hemi = new THREE.HemisphereLight(0x9a8468, 0x241d16, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd2a0, 1.7);
  sun.position.set(150, 250, -90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 900;
  sun.shadow.camera.left = -380; sun.shadow.camera.right = 380;
  sun.shadow.camera.top = 380; sun.shadow.camera.bottom = -380;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  // Warm furnace-glow rim from below the horizon
  const rim = new THREE.DirectionalLight(0xff6a22, 0.6);
  rim.position.set(-180, 90, -150);
  scene.add(rim);

  // Sea — murky industrial water
  const waterTex = makeWaterTexture();
  waterTex.repeat.set(40, 40);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.MeshStandardMaterial({ map: waterTex, color: 0x35424a, roughness: 0.3, metalness: 0.5 })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.4;
  sea.receiveShadow = true;
  scene.add(sea);
  scene.userData.seaTexture = waterTex;

  // Concrete island deck
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(720, 720),
    new THREE.MeshStandardMaterial({ color: 0x35332e, roughness: 0.98 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Sea wall ring (Gunkanjima's signature retaining wall)
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x2c2a26, roughness: 0.95 });
  const wallR = 330, wallSeg = 40;
  for (let i = 0; i < wallSeg; i++) {
    const a = (i / wallSeg) * Math.PI * 2;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(56, 16, 12), wallMat);
    seg.position.set(Math.sin(a) * wallR, 7, Math.cos(a) * wallR);
    seg.rotation.y = -a;
    seg.castShadow = true; seg.receiveShadow = true;
    scene.add(seg);
  }

  // Grime grid lines on the deck
  const seamMat = new THREE.MeshStandardMaterial({ color: 0x222019, roughness: 1 });
  for (let i = -300; i <= 300; i += 60) {
    const ew = new THREE.Mesh(new THREE.PlaneGeometry(640, 4), seamMat);
    ew.rotation.x = -Math.PI / 2; ew.position.set(0, 0.04, i); ew.receiveShadow = true; scene.add(ew);
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(4, 640), seamMat);
    ns.rotation.x = -Math.PI / 2; ns.position.set(i, 0.04, 0); ns.receiveShadow = true; scene.add(ns);
  }

  // ---------- Derelict concrete apartment blocks (destructible) ----------
  const buildings = [];
  const concreteTex = makeFactoryConcreteTexture();
  for (let bx = -270; bx <= 270; bx += 54) {
    for (let bz = -270; bz <= 270; bz += 54) {
      if (Math.abs(bx) < 70 && Math.abs(bz) < 70) continue;     // clear arena centre
      const count = Math.random() < 0.5 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const w = 13 + Math.random() * 12;
        const d = 13 + Math.random() * 12;
        const totalH = 18 + Math.random() * 46;
        const ox = (Math.random() - 0.5) * (40 - w);
        const oz = (Math.random() - 0.5) * (40 - d);

        const shade = 0.28 + Math.random() * 0.18;
        const col = new THREE.Color().setHSL(0.09, 0.06, shade);
        const tex = concreteTex.clone();
        tex.needsUpdate = true;
        const verticalRepeat = Math.max(1, Math.round(totalH / 24));
        tex.repeat.set(1, verticalRepeat);
        const mat = new THREE.MeshStandardMaterial({
          color: col, map: tex, roughness: 0.92, metalness: 0.08,
        });

        const stackable = totalH > 26 && Math.random() < 0.45;
        const blocks = stackable ? 2 + Math.floor(Math.random() * 2) : 1;
        const blockH = totalH / blocks;
        let curY = 0;
        for (let s = 0; s < blocks; s++) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(w, blockH, d), mat);
          b.position.set(bx + ox, curY + blockH / 2, bz + oz);
          b.castShadow = true; b.receiveShadow = true;
          b.userData = {
            w, h: blockH, d,
            fallen: false, fallSpeed: 0, baseY: curY + blockH / 2,
            stackIndex: s, stackTotal: blocks,
            isNightBuilding: false, nightColor: null,
          };
          scene.add(b);
          buildings.push(b);
          curY += blockH;
        }
      }
    }
  }

  // ---------- Blast furnaces (destructible, glowing) ----------
  const furnaceSpots = [[-200, -160], [190, -180], [-180, 190], [200, 170], [0, -240]];
  for (const [fx, fz] of furnaceSpots) addBlastFurnace(scene, buildings, fx, fz);

  // ---------- Smokestacks (tall decorative silhouettes) ----------
  const stackMat = new THREE.MeshStandardMaterial({ color: 0x3a3631, metalness: 0.4, roughness: 0.7 });
  const bandMat  = new THREE.MeshStandardMaterial({ color: 0x7a2418, roughness: 0.7 });
  for (const [sx, sz, h] of [[-250, -250, 120], [250, -240, 100], [-240, 250, 110], [255, 245, 130], [120, -290, 95]]) {
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(4, 6, h, 14), stackMat);
    stack.position.set(sx, h / 2, sz);
    stack.castShadow = true;
    scene.add(stack);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(4.3, 4.3, 8, 14), bandMat);
    band.position.set(sx, h - 12, sz);
    scene.add(band);
  }

  // ---------- Pipe network (the island's tangle of 管線) ----------
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x6b6258, metalness: 0.6, roughness: 0.5 });
  const rustPipeMat = new THREE.MeshStandardMaterial({ color: 0x7a4a30, metalness: 0.5, roughness: 0.6 });
  addPipeRun(scene, -200, -160, 190, -180, 14, 2.6, pipeMat);
  addPipeRun(scene, 190, -180, 200, 170, 18, 2.2, rustPipeMat);
  addPipeRun(scene, 200, 170, -180, 190, 12, 2.8, pipeMat);
  addPipeRun(scene, -180, 190, -200, -160, 16, 2.4, rustPipeMat);
  addPipeRun(scene, -200, -160, 0, -240, 10, 2.0, pipeMat);
  addPipeRun(scene, 0, -240, 190, -180, 22, 2.0, rustPipeMat);
  addPipeRun(scene, -120, 90, 120, 90, 8, 1.8, pipeMat);
  addPipeRun(scene, -100, -90, -100, 120, 9, 1.8, rustPipeMat);

  // ---------- Molten pools near the furnaces ----------
  const poolMat = new THREE.MeshStandardMaterial({
    color: 0xff5a1a, emissive: 0xff5a1a, emissiveIntensity: 1.4, roughness: 0.5,
  });
  for (const [fx, fz] of furnaceSpots) {
    const pool = new THREE.Mesh(new THREE.CircleGeometry(10 + Math.random() * 6, 18), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(fx + (Math.random() - 0.5) * 20, 0.12, fz + 18 + (Math.random() - 0.5) * 10);
    scene.add(pool);
  }

  // Explosive storage tanks (reuse the city's oil-tank scatter)
  addOilTanks(scene, buildings);

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

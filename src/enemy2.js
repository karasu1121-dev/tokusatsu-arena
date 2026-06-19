import * as THREE from 'three';

// ---------------------------------------------------------------------------
// SLAG CRAB (熔爐巨蟹) — the Level 2 monster.
//
// Visually and mechanically the opposite of the Level 1 Kaiju (a tall bipedal
// dinosaur with a single-arm swipe + an instant red eye-beam). The Slag Crab
// is a low, wide, six-legged armoured brute forged from furnace slag — it
// skitters fast, slams with twin pincers, lobs a SPREAD of arcing molten bolts
// from its tail cannon (travelling projectiles, not a hitscan beam), and
// charges across gaps to close distance.
//
// It exposes the same surface the main loop already drives for the Kaiju
// (group / hp / radius / velocity / facing / update / upperBodyPosition /
// damage / attackHitFrame / attackLanded / attackRange) plus a small extra
// channel for the projectile volley: `volleyFiredThisFrame` + `pendingShots`.
// ---------------------------------------------------------------------------

const SLAG = {
  iron:   0x2c2c33,   // dark cast-iron carapace
  plate:  0x3a3a42,   // lighter armour plating / claws
  molten: 0xff5410,   // glowing molten cracks & vents
  ember:  0xff8a2a,   // brighter ember highlight
  eye:    0xffd23a,   // furnace-yellow eyes
};

export class SlagCrab {
  constructor() {
    this.group = new THREE.Group();

    this.maxHp = 240;
    this.hp = this.maxHp;
    this.radius = 12;

    this.velocity = new THREE.Vector3();
    this.facing = Math.PI;
    this.walkPhase = 0;

    // ----- AI -----
    this.aiState = 'chase';     // 'chase' | 'attack' | 'charge' | 'volley' | 'dead'
    this.hurtTimer = 0;

    // Melee pincer slam — shared attackHitFrame/attackLanded channel with main.js
    this.attackTimer = 0;
    this.attackHitFrame = false;
    this.attackLanded = false;
    this.attackRange = 26;
    this.attackDuration = 1.0;
    this.attackCooldown = 1.6;
    this.attackCooldownMax = 1.7;

    // Molten volley (ranged) — fills pendingShots, main spawns the projectiles
    this.volleyTimer = 0;
    this.volleyWindup = 0.7;
    this.volleyCooldown = 4.5;
    this.volleyCooldownMax = 7.5;
    this.volleyFiredThisFrame = false;
    this.pendingShots = [];

    // Charge dash — gap-closer
    this.chargeTimer = 0;
    this.chargePhase = 'none';     // 'windup' | 'dash'
    this.chargeDir = new THREE.Vector3(0, 0, 1);
    this.chargeCooldown = 6.0;
    this.chargeCooldownMax = 9.0;

    // Inert — kept so the Kaiju's hitscan-beam branch in main stays a no-op
    this.beamFiredThisFrame = false;

    // Target tracking / line-of-sight
    this.targetLocked = true;
    this.targetMemory = new THREE.Vector3();
    this.lostTargetTimer = 0;
    this.searchFacing = this.facing;
    this.searchTurnTimer = 0;
    this.sightGrace = 0;

    this.speed = 17;            // faster + more aggressive than the Kaiju

    this._build();
  }

  _build() {
    const matIron   = new THREE.MeshStandardMaterial({ color: SLAG.iron,  metalness: 0.55, roughness: 0.55 });
    const matPlate  = new THREE.MeshStandardMaterial({ color: SLAG.plate, metalness: 0.65, roughness: 0.45 });
    const matMolten = new THREE.MeshStandardMaterial({ color: SLAG.molten, emissive: SLAG.molten, emissiveIntensity: 1.8, roughness: 0.4 });
    const matEye    = new THREE.MeshStandardMaterial({ color: SLAG.eye,    emissive: SLAG.eye,    emissiveIntensity: 2.6 });
    this.materials = { body: matIron, molten: matMolten };

    // ----- Carapace (low wide dome) -----
    this.body = new THREE.Mesh(new THREE.SphereGeometry(11, 22, 16), matIron);
    this.body.position.y = 16;
    this.body.scale.set(1.5, 0.62, 1.7);
    this.body.castShadow = true;
    this.group.add(this.body);

    // Armour ridge plates over the back
    for (let i = -1; i <= 1; i++) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(5, 2.4, 9), matPlate);
      plate.position.set(i * 7, 21, -1);
      plate.rotation.x = -0.12;
      plate.castShadow = true;
      this.group.add(plate);
    }

    // Glowing molten vents along the carapace seams
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.4, 8), matMolten);
      vent.position.set((t - 0.5) * 18, 22.5, -6 + t * 12);
      this.group.add(vent);
    }
    // Two big molten exhaust ports on the rear flanks
    for (const s of [-1, 1]) {
      const port = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 3, 12), matMolten);
      port.position.set(s * 13, 18, -10);
      port.rotation.x = Math.PI / 2;
      this.group.add(port);
    }
    this.ventLight = new THREE.PointLight(SLAG.molten, 1.6, 70, 1.6);
    this.ventLight.position.set(0, 20, -4);
    this.group.add(this.ventLight);

    // ----- Face cluster (front, +Z) -----
    this.head = new THREE.Group();
    this.head.position.set(0, 14, 14);
    this.group.add(this.head);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(13, 4, 5), matPlate);
    brow.castShadow = true;
    this.head.add(brow);
    // Cluster of four furnace eyes
    for (const [ex, ey] of [[-4, 0.5], [-1.5, -1], [1.5, -1], [4, 0.5]]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 10), matEye);
      eye.position.set(ex, ey, 2.6);
      this.head.add(eye);
    }
    // Mandibles
    for (const s of [-1, 1]) {
      const mand = new THREE.Mesh(new THREE.ConeGeometry(1.3, 6, 6), matPlate);
      mand.position.set(s * 4, -4, 3);
      mand.rotation.set(Math.PI / 2.2, 0, s * 0.4);
      this.head.add(mand);
    }

    // ----- Pincer arms (front) -----
    this.clawL = this._buildClaw(-1, matIron, matPlate, matMolten);
    this.clawR = this._buildClaw(1, matIron, matPlate, matMolten);
    this.group.add(this.clawL, this.clawR);

    // ----- Six skittering legs -----
    this.legs = [];
    const legZ = [9, 0, -9];
    for (const s of [-1, 1]) {
      legZ.forEach((lz, idx) => {
        const leg = this._buildLeg(s, lz, matIron, matPlate);
        leg.userData.phase = (idx * 2 + (s < 0 ? 1 : 0)) * 0.9;  // alternating gait
        leg.userData.side = s;
        this.legs.push(leg);
        this.group.add(leg);
      });
    }

    // ----- Tail cannon (arcs over the back, stinger points forward) -----
    this.tail = new THREE.Group();
    this.tail.position.set(0, 20, -8);
    this.group.add(this.tail);
    let prev = this.tail;
    const segCount = 4;
    for (let i = 0; i < segCount; i++) {
      const seg = new THREE.Group();
      seg.position.set(0, 4.2, 1.5);
      seg.rotation.x = -0.55;                 // curl up and forward
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(2.6 - i * 0.45, 3.0 - i * 0.45, 4.4, 10),
        matIron
      );
      mesh.castShadow = true;
      seg.add(mesh);
      prev.add(seg);
      prev = seg;
    }
    // Stinger / molten cannon muzzle at the tip
    this.tailTip = prev;
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.4, 5, 10), matPlate);
    muzzle.position.set(0, 3.5, 1.5);
    muzzle.rotation.x = -0.55;
    this.tailTip.add(muzzle);
    this.muzzleGlow = new THREE.Mesh(new THREE.SphereGeometry(1.7, 12, 10), matMolten.clone());
    this.muzzleGlow.position.set(0, 6, 2.8);
    this.muzzleGlow.material.emissiveIntensity = 0.6;
    this.tailTip.add(this.muzzleGlow);

    this.group.rotation.y = this.facing;
  }

  _buildClaw(sign, matIron, matPlate, matMolten) {
    const pivot = new THREE.Group();
    pivot.position.set(sign * 11, 14, 9);
    pivot.userData.sign = sign;

    const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, 8, 10), matIron);
    upperArm.position.set(sign * 2, 0, 4);
    upperArm.rotation.z = sign * 0.5;
    upperArm.rotation.x = Math.PI / 2.4;
    upperArm.castShadow = true;
    pivot.add(upperArm);

    // Molten elbow vent
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(1.3, 8, 8), matMolten);
    elbow.position.set(sign * 4, 0, 8);
    pivot.add(elbow);

    // Pincer base
    const base = new THREE.Mesh(new THREE.BoxGeometry(4.5, 4.5, 5), matPlate);
    base.position.set(sign * 5, 0, 12);
    base.castShadow = true;
    pivot.add(base);
    // Two pincer fingers
    const fingerGeo = new THREE.ConeGeometry(1.3, 7, 7);
    const fUp = new THREE.Mesh(fingerGeo, matPlate);
    fUp.position.set(sign * 5, 2, 17);
    fUp.rotation.x = Math.PI / 2;
    pivot.add(fUp);
    const fDn = new THREE.Mesh(fingerGeo, matPlate);
    fDn.position.set(sign * 5, -2, 17);
    fDn.rotation.x = Math.PI / 2;
    pivot.add(fDn);
    pivot.userData.fingerUp = fUp;
    pivot.userData.fingerDn = fDn;
    return pivot;
  }

  _buildLeg(sign, z, matIron, matPlate) {
    const pivot = new THREE.Group();
    pivot.position.set(sign * 12, 16, z);
    // Thigh angled outward
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.2, 11, 8), matIron);
    thigh.position.set(sign * 5, -2, 0);
    thigh.rotation.z = sign * (Math.PI / 2.6);
    thigh.castShadow = true;
    pivot.add(thigh);
    // Shin reaching down to the ground
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.6, 14, 8), matPlate);
    shin.position.set(sign * 10, -9, 0);
    shin.rotation.z = sign * 0.35;
    shin.castShadow = true;
    pivot.add(shin);
    // Clawed foot tip
    const foot = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3, 6), matPlate);
    foot.position.set(sign * 11.5, -16, 0);
    pivot.add(foot);
    return pivot;
  }

  // ------------------------------------------------------------------ update
  update(dt, player, obstacles = []) {
    if (this.aiState === 'dead' || this.hp <= 0) {
      if (this.aiState !== 'dead') {
        this.aiState = 'dead';
        this._deathTilt = 0;
        this.attackHitFrame = false;
      }
      this._deathTilt = Math.min(Math.PI / 2.4, this._deathTilt + dt * 1.3);
      this.group.rotation.z = this._deathTilt;
      this.group.position.y = Math.max(-4, this.group.position.y - dt * 4);
      if (this.ventLight) this.ventLight.intensity = Math.max(0, this.ventLight.intensity - dt * 2);
      return;
    }

    // Hurt flash on the carapace
    if (this.hurtTimer > 0) {
      this.hurtTimer -= dt;
      const t = Math.max(0, this.hurtTimer / 0.2);
      this.materials.body.emissive.setRGB(t * 0.9, t * 0.2, 0);
    } else {
      this.materials.body.emissive.setRGB(0, 0, 0);
    }

    // Molten pulse on vents
    const pulse = 1.4 + Math.sin(performance.now() / 220) * 0.5;
    this.materials.molten.emissiveIntensity = pulse;
    if (this.ventLight) this.ventLight.intensity = 1.2 + Math.sin(performance.now() / 220) * 0.5;

    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.volleyCooldown > 0) this.volleyCooldown -= dt;
    if (this.chargeCooldown > 0) this.chargeCooldown -= dt;
    this.volleyFiredThisFrame = false;

    // ----- Perception -----
    const toPlayer = new THREE.Vector3().subVectors(player.group.position, this.group.position);
    toPlayer.y = 0;
    const playerDist = toPlayer.length();
    const canSee = this._canSeePlayer(player, obstacles, playerDist);
    if (canSee) {
      this.targetLocked = true;
      this.targetMemory.copy(player.group.position);
      this.sightGrace = 0.45;
    } else if (this.sightGrace > 0) {
      this.sightGrace -= dt;
    } else if (this.targetLocked) {
      this.targetLocked = false;
      this.lostTargetTimer = 2.0 + Math.random() * 2.0;
      this.searchFacing = this.facing + (Math.random() - 0.5) * Math.PI;
    }

    const toTarget = this.targetLocked
      ? toPlayer
      : new THREE.Vector3().subVectors(this.targetMemory, this.group.position);
    toTarget.y = 0;
    const dist = toTarget.length();

    // ===== Special states take priority =====
    if (this.aiState === 'volley') { this._updateVolley(dt, toTarget); this._stepLegs(dt, 0); this._applyRotation(dt); return; }
    if (this.aiState === 'charge') { this._updateCharge(dt, player, dist); return; }

    // ----- Decide whether to start a special attack -----
    if (this.targetLocked && this.aiState === 'chase') {
      if (this.volleyCooldown <= 0 && playerDist > this.attackRange + 6 && playerDist < 240 && Math.random() < 0.013) {
        this.aiState = 'volley';
        this.volleyTimer = this.volleyWindup;
        this.volleyCooldown = this.volleyCooldownMax;
        this._applyRotation(dt);
        return;
      }
      if (this.chargeCooldown <= 0 && playerDist > 48 && playerDist < 170 && Math.random() < 0.011) {
        this.aiState = 'charge';
        this.chargePhase = 'windup';
        this.chargeTimer = 0.5;
        this.chargeCooldown = this.chargeCooldownMax;
        this.attackLanded = false;
        return;
      }
    }

    // ===== Pincer slam =====
    if (this.aiState === 'attack') {
      this.attackTimer -= dt;
      const elapsed = this.attackDuration - this.attackTimer;
      const k = Math.sin(Math.min(1, elapsed / this.attackDuration) * Math.PI);
      // Both claws rear up then hammer down together
      this.clawL.rotation.x = -k * 1.1;
      this.clawR.rotation.x = -k * 1.1;
      this.body.position.y = 16 + k * 1.5;
      this.attackHitFrame = elapsed > 0.4 && elapsed < 0.62;
      if (this.attackTimer <= 0) {
        this.aiState = 'chase';
        this.attackHitFrame = false;
        this.clawL.rotation.x = 0;
        this.clawR.rotation.x = 0;
        this.body.position.y = 16;
        this.attackCooldown = this.attackCooldownMax;
      }
      this._applyRotation(dt);
      return;
    }

    // ===== Chase / search =====
    if (this.targetLocked && dist > 0.5) {
      const desired = Math.atan2(toTarget.x, toTarget.z);
      this._turnToward(desired, 0.07);
    } else if (!this.targetLocked) {
      this.lostTargetTimer -= dt;
      this.searchTurnTimer -= dt;
      if (this.searchTurnTimer <= 0) {
        this.searchFacing = this.facing + (Math.random() - 0.5) * Math.PI * 1.2;
        this.searchTurnTimer = 0.8 + Math.random() * 1.2;
      }
      this._turnToward(dist > 18 ? Math.atan2(toTarget.x, toTarget.z) : this.searchFacing, 0.04);
    }

    let moveSpeed = 0;
    if (dist > this.attackRange || !this.targetLocked) {
      const dir = dist > 0.5
        ? toTarget.clone().normalize()
        : new THREE.Vector3(Math.sin(this.searchFacing), 0, Math.cos(this.searchFacing));
      const scale = this.targetLocked ? 1 : 0.5;
      this.velocity.x = dir.x * this.speed * scale;
      this.velocity.z = dir.z * this.speed * scale;
      moveSpeed = this.speed * scale;
    } else {
      this.velocity.x = 0;
      this.velocity.z = 0;
      if (this.targetLocked && this.attackCooldown <= 0) {
        this.aiState = 'attack';
        this.attackTimer = this.attackDuration;
        this.attackLanded = false;
      }
    }

    this.group.position.x += this.velocity.x * dt;
    this.group.position.z += this.velocity.z * dt;
    this._stepLegs(dt, moveSpeed);
    this._applyRotation(dt);
    this._clampToArena();
  }

  // Telegraph then launch a 3-bolt spread from the tail cannon.
  _updateVolley(dt, toTarget) {
    this.velocity.set(0, 0, 0);
    this.volleyTimer -= dt;
    const desired = Math.atan2(toTarget.x, toTarget.z);
    this._turnToward(desired, 0.16);
    // Tail rears up + muzzle glows hotter as it charges
    const charge = 1 - Math.max(0, this.volleyTimer / this.volleyWindup);
    this.tail.rotation.x = -charge * 0.4;
    if (this.muzzleGlow) {
      this.muzzleGlow.material.emissiveIntensity = 0.6 + charge * 3.5;
      this.muzzleGlow.scale.setScalar(1 + charge * 0.8);
    }
    if (this.volleyTimer <= 0) {
      this._fireVolley(toTarget);
      this.tail.rotation.x = 0;
      if (this.muzzleGlow) { this.muzzleGlow.material.emissiveIntensity = 0.6; this.muzzleGlow.scale.setScalar(1); }
      this.aiState = 'chase';
    }
  }

  _fireVolley(toTarget) {
    const fx = Math.sin(this.group.rotation.y);
    const fz = Math.cos(this.group.rotation.y);
    const origin = this.group.position.clone();
    origin.y += 30;
    origin.x += fx * 8;
    origin.z += fz * 8;
    const base = Math.atan2(toTarget.x, toTarget.z);
    this.pendingShots = [];
    for (const spread of [-0.26, 0, 0.26]) {
      const a = base + spread;
      this.pendingShots.push({
        origin: origin.clone(),
        dir: new THREE.Vector3(Math.sin(a), 0.12, Math.cos(a)).normalize(),
      });
    }
    this.volleyFiredThisFrame = true;
  }

  // Wind up in place, then dash forward fast. Deals contact damage through the
  // shared attackHitFrame channel while the player is in reach mid-dash.
  _updateCharge(dt, player, dist) {
    if (this.chargePhase === 'windup') {
      this.velocity.set(0, 0, 0);
      this.chargeTimer -= dt;
      // Crouch + claws splayed as a tell
      this.body.position.y = 16 - 2.2 * (1 - Math.max(0, this.chargeTimer / 0.5));
      this.clawL.rotation.x = -0.5;
      this.clawR.rotation.x = -0.5;
      const toP = new THREE.Vector3().subVectors(player.group.position, this.group.position);
      toP.y = 0;
      this._turnToward(Math.atan2(toP.x, toP.z), 0.18);
      if (this.chargeTimer <= 0) {
        this.chargePhase = 'dash';
        this.chargeTimer = 0.65;
        this.chargeDir.set(Math.sin(this.facing), 0, Math.cos(this.facing));
      }
      this._applyRotation(dt);
      return;
    }
    // dash
    this.chargeTimer -= dt;
    const dashSpeed = this.speed * 3.4;
    this.velocity.x = this.chargeDir.x * dashSpeed;
    this.velocity.z = this.chargeDir.z * dashSpeed;
    this.group.position.x += this.velocity.x * dt;
    this.group.position.z += this.velocity.z * dt;
    this.walkPhase += dt * 22;
    this._stepLegs(dt, dashSpeed);
    // Contact hit during the dash
    this.attackHitFrame = dist < this.attackRange + 4;
    if (this.chargeTimer <= 0) {
      this.chargePhase = 'none';
      this.aiState = 'chase';
      this.attackHitFrame = false;
      this.body.position.y = 16;
      this.clawL.rotation.x = 0;
      this.clawR.rotation.x = 0;
      this.attackCooldown = 0.6;
    }
    this._applyRotation(dt);
    this._clampToArena();
  }

  _stepLegs(dt, moveSpeed) {
    this.walkPhase += dt * (2 + moveSpeed * 0.22);
    for (const leg of this.legs) {
      const swing = Math.sin(this.walkPhase + leg.userData.phase) * 0.45;
      leg.rotation.z = swing * 0.4 * leg.userData.side;
      leg.rotation.x = Math.cos(this.walkPhase + leg.userData.phase) * 0.3;
    }
    this.body.rotation.z = Math.sin(this.walkPhase) * 0.04;
  }

  _turnToward(desired, rate) {
    let d = desired - this.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.facing += d * rate;
  }

  _applyRotation(dt) {
    let dy = this.facing - this.group.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.group.rotation.y += dy * 0.14;
  }

  _clampToArena() {
    const limit = 290;
    this.group.position.x = Math.max(-limit, Math.min(limit, this.group.position.x));
    this.group.position.z = Math.max(-limit, Math.min(limit, this.group.position.z));
  }

  _canSeePlayer(player, obstacles, dist) {
    if (dist < 50) return true;
    const to = new THREE.Vector3().subVectors(player.group.position, this.group.position);
    to.y = 0;
    if (to.lengthSq() < 0.01) return true;
    const from = this.group.position;
    const dest = player.group.position;
    for (const b of obstacles) {
      if (b.userData.fallen) continue;
      if (this._segmentHitsBuilding(from, dest, b, this.radius * 0.4)) return false;
    }
    return true;
  }

  _segmentHitsBuilding(from, to, building, pad = 0) {
    const ud = building.userData;
    const minX = building.position.x - ud.w / 2 - pad;
    const maxX = building.position.x + ud.w / 2 + pad;
    const minZ = building.position.z - ud.d / 2 - pad;
    const maxZ = building.position.z + ud.d / 2 + pad;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    let tMin = 0, tMax = 1;
    if (Math.abs(dx) < 0.0001) {
      if (from.x < minX || from.x > maxX) return false;
    } else {
      const tx1 = (minX - from.x) / dx, tx2 = (maxX - from.x) / dx;
      tMin = Math.max(tMin, Math.min(tx1, tx2));
      tMax = Math.min(tMax, Math.max(tx1, tx2));
    }
    if (Math.abs(dz) < 0.0001) {
      if (from.z < minZ || from.z > maxZ) return false;
    } else {
      const tz1 = (minZ - from.z) / dz, tz2 = (maxZ - from.z) / dz;
      tMin = Math.max(tMin, Math.min(tz1, tz2));
      tMax = Math.min(tMax, Math.max(tz1, tz2));
    }
    return tMax >= tMin && tMax > 0.08 && tMin < 0.92;
  }

  upperBodyPosition() {
    return this.group.position.clone().add(new THREE.Vector3(0, 20, 0));
  }

  damage(amount) {
    if (this.aiState === 'dead') return;
    this.hp = Math.max(0, this.hp - amount);
    this.hurtTimer = 0.2;
  }
}

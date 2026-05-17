import * as THREE from 'three';

const COLORS = {
  silver: 0xcfd3d8,
  red:    0xd62828,
  yellow: 0xfdc04a,
  eye:    0xffff80,
};

export class Ultraman {
  constructor() {
    this.group = new THREE.Group();

    // Stats
    this.maxHp = 100;
    this.hp = this.maxHp;
    this.radius = 6;

    // Movement
    this.velocity = new THREE.Vector3();
    this.facing = 0;
    this.onGround = true;
    this.walkPhase = 0;
    this.isMoving = false;

    // Combat state
    this.punching = false;
    this.punchTimer = 0;
    this.punchHit = false;
    this.punchActive = false;     // true during impact frames only
    this.punchArm = 'L';          // toggles each punch so first is 'R'
    this.beaming = false;
    this.beamTimer = 0;
    this.beamCooldown = 0;
    this._beamFired = false;

    // Constants — bigger Ultraman leap (~40 unit height, ~2s air time)
    this.speed         = 28;
    this.sprintSpeed   = 55;
    this.jumpV         = 82;
    this.gravity       = 82;
    this.punchDuration = 0.55;
    this.beamWindup    = 0.6;
    this.beamHold      = 1.1;
    this.beamCdMax     = 5.0;

    this._build();
  }

  _build() {
    const matSilver = new THREE.MeshStandardMaterial({ color: COLORS.silver, metalness: 0.75, roughness: 0.25 });
    const matRed    = new THREE.MeshStandardMaterial({ color: COLORS.red,    metalness: 0.4,  roughness: 0.4 });
    const matTimer  = new THREE.MeshStandardMaterial({ color: COLORS.yellow, emissive: COLORS.yellow, emissiveIntensity: 1.6 });
    const matEye    = new THREE.MeshStandardMaterial({ color: COLORS.eye,    emissive: COLORS.eye,    emissiveIntensity: 2.2 });

    // ----- Torso -----
    const torso = new THREE.Mesh(new THREE.BoxGeometry(8, 12, 5), matSilver);
    torso.position.y = 22;
    torso.castShadow = true;
    this.group.add(torso);

    const chestT = new THREE.Mesh(new THREE.BoxGeometry(8.15, 2.5, 5.1), matRed);
    chestT.position.y = 26;
    this.group.add(chestT);

    const chestV = new THREE.Mesh(new THREE.BoxGeometry(2.5, 8, 5.15), matRed);
    chestV.position.y = 22;
    this.group.add(chestV);

    // Color timer
    this.colorTimer = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 16), matTimer);
    this.colorTimer.position.set(0, 24, 2.7);
    this.group.add(this.colorTimer);
    this.timerLight = new THREE.PointLight(COLORS.yellow, 1.5, 35);
    this.timerLight.position.copy(this.colorTimer.position);
    this.group.add(this.timerLight);

    // ----- Head -----
    const head = new THREE.Mesh(new THREE.SphereGeometry(3.6, 16, 16), matSilver);
    head.position.y = 33;
    head.scale.set(1, 1.2, 1);
    head.castShadow = true;
    this.group.add(head);

    const crest = new THREE.Mesh(new THREE.ConeGeometry(0.8, 4.5, 4), matRed);
    crest.position.set(0, 37, -0.6);
    crest.rotation.x = -0.2;
    this.group.add(crest);

    // Side-fin (head accents)
    const finL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.5, 3), matRed);
    finL.position.set(-3.2, 33, -1);
    this.group.add(finL);
    const finR = finL.clone();
    finR.position.x = 3.2;
    this.group.add(finR);

    // Eyes — face +Z (forward)
    const eyeGeom = new THREE.SphereGeometry(0.7, 12, 12);
    const eyeL = new THREE.Mesh(eyeGeom, matEye);
    eyeL.position.set(-1.4, 33, 3);
    eyeL.scale.set(1.6, 0.75, 0.45);
    this.group.add(eyeL);
    const eyeR = eyeL.clone();
    eyeR.position.x = 1.4;
    this.group.add(eyeR);

    // ----- Arms -----
    const buildArm = (sign) => {
      const pivot = new THREE.Group();
      pivot.position.set(sign * 5, 28, 0);

      const upper = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.0, 7, 12), matSilver);
      upper.position.y = -3.5;
      upper.castShadow = true;
      pivot.add(upper);

      const elbow = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 8), matSilver);
      elbow.position.y = -7;
      pivot.add(elbow);

      const forearm = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.9, 6.5, 12), matSilver);
      forearm.position.y = -10.2;
      forearm.castShadow = true;
      pivot.add(forearm);

      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.8, 12), matRed);
      band.position.y = -13;
      pivot.add(band);

      const hand = new THREE.Mesh(new THREE.SphereGeometry(1.25, 8, 8), matSilver);
      hand.position.y = -14;
      pivot.add(hand);

      return pivot;
    };
    this.armL = buildArm(-1);
    this.armR = buildArm(1);
    this.group.add(this.armL, this.armR);

    // ----- Legs -----
    const buildLeg = (sign) => {
      const pivot = new THREE.Group();
      pivot.position.set(sign * 2.3, 16, 0);

      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.3, 8, 12), matSilver);
      thigh.position.y = -4;
      thigh.castShadow = true;
      pivot.add(thigh);

      const shin = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.1, 7, 12), matSilver);
      shin.position.y = -11;
      shin.castShadow = true;
      pivot.add(shin);

      const boot = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2, 5), matRed);
      boot.position.set(0, -15.2, 0.8);
      pivot.add(boot);

      return pivot;
    };
    this.legL = buildLeg(-1);
    this.legR = buildLeg(1);
    this.group.add(this.legL, this.legR);
  }

  move(dir, sprint, dt) {
    const speed = sprint ? this.sprintSpeed : this.speed;
    this.velocity.x = dir.x * speed;
    this.velocity.z = dir.z * speed;
    this.isMoving = dir.lengthSq() > 0;
    if (this.isMoving) {
      // Model's forward is +Z (eyes face +Z), so face dir directly
      this.facing = Math.atan2(dir.x, dir.z);
      this.walkPhase += dt * (sprint ? 14 : 9);
    }
  }

  jump() {
    if (this.onGround) {
      this.velocity.y = this.jumpV;
      this.onGround = false;
    }
  }

  punch() {
    if (this.punching || this.beaming) return;
    this.punching = true;
    this.punchTimer = this.punchDuration;
    this.punchHit = false;
    this.punchActive = false;
    // Alternate arms for combo feel
    this.punchArm = this.punchArm === 'R' ? 'L' : 'R';
  }

  tryBeam(effects, target, onFire) {
    if (this.beaming || this.punching || this.beamCooldown > 0 || !this.onGround) return;
    this.beaming = true;
    this.beamTimer = this.beamWindup + this.beamHold;
    this.beamCooldown = this.beamCdMax;
    this._beamFired = false;
    this._beamTarget = target;
    this._beamEffects = effects;
    this._beamOnFire = onFire;
  }

  update(dt) {
    // Gravity & integrate
    this.velocity.y -= this.gravity * dt;
    this.group.position.x += this.velocity.x * dt;
    this.group.position.y += this.velocity.y * dt;
    this.group.position.z += this.velocity.z * dt;

    // Ground
    if (this.group.position.y <= 0) {
      this.group.position.y = 0;
      this.velocity.y = 0;
      this.onGround = true;
    }

    // Boundary
    const limit = 290;
    this.group.position.x = Math.max(-limit, Math.min(limit, this.group.position.x));
    this.group.position.z = Math.max(-limit, Math.min(limit, this.group.position.z));

    // Smooth rotation toward facing
    let dy = this.facing - this.group.rotation.y;
    while (dy > Math.PI)  dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.group.rotation.y += dy * 0.25;

    // Walk animation
    const swing = Math.sin(this.walkPhase) * 0.7;
    if (this.isMoving) {
      if (!this.punching && !this.beaming) {
        this.armL.rotation.x = swing;
        this.armR.rotation.x = -swing;
      }
      this.legL.rotation.x = -swing;
      this.legR.rotation.x = swing;
    } else {
      if (!this.punching && !this.beaming) {
        this.armL.rotation.x *= 0.85;
        this.armR.rotation.x *= 0.85;
      }
      this.legL.rotation.x *= 0.85;
      this.legR.rotation.x *= 0.85;
    }

    // Punch animation — overhand descending hook (下鉤拳)
    //   0 .. 0.30  windup:  arm rises overhead-forward      (0      → -2.4 rad)
    //   0.30..0.60 smash:   arm crashes forward-and-down    (-2.4   → -1.05)
    //   0.60..1.00 recover: arm returns to side             (-1.05  →  0)
    // rotation.x sign reminder: 0 = hanging down,  -π/2 = horizontal forward (+Z),
    //                           -π = straight up,  +π/2 = horizontal backward.
    if (this.punching) {
      this.punchTimer -= dt;
      const t = 1 - this.punchTimer / this.punchDuration;

      const arm = this.punchArm === 'L' ? this.armL : this.armR;
      const otherArm = this.punchArm === 'L' ? this.armR : this.armL;

      let armX, leanZ;
      if (t < 0.30) {
        const k = t / 0.30;
        const ease = 1 - (1 - k) * (1 - k);          // ease-out raise
        armX = -2.4 * ease;
        leanZ = -0.08 * ease;
        this.punchActive = false;
      } else if (t < 0.60) {
        const k = (t - 0.30) / 0.30;
        const ease = k * k;                           // ease-in smash
        armX = -2.4 + (-1.05 - (-2.4)) * ease;
        leanZ = -0.08 + 0.18 * ease;
        this.punchActive = k > 0.4;                   // hit window (impact half)
      } else {
        const k = (t - 0.60) / 0.40;
        armX = -1.05 * (1 - k);
        leanZ = 0.10 * (1 - k);
        this.punchActive = false;
      }

      arm.rotation.x = armX;
      arm.rotation.z = 0;
      otherArm.rotation.x = -0.15;                   // counter-balance, fist tucked
      otherArm.rotation.z = 0;

      // subtle shoulder twist for power transfer
      const twistSign = this.punchArm === 'L' ? 1 : -1;
      arm.rotation.z = twistSign * leanZ * 0.6;

      if (this.punchTimer <= 0) {
        this.punching = false;
        this.punchActive = false;
        this.armR.rotation.x = 0; this.armR.rotation.z = 0;
        this.armL.rotation.x = 0; this.armL.rotation.z = 0;
      }
    }

    // Beam: cross-arm pose (arms forward, crossed in front of chest), then fire
    if (this.beaming) {
      this.beamTimer -= dt;
      const total = this.beamWindup + this.beamHold;
      const elapsed = total - this.beamTimer;
      // Target pose: both arms forward (-π/2 X) crossed inward via Z
      const POSE_X = -Math.PI / 2 + 0.1;     // slightly above horizontal
      const POSE_Z_R = -0.7;                  // right arm crosses to player's left
      const POSE_Z_L =  0.7;                  // left arm crosses to player's right
      if (elapsed < this.beamWindup) {
        const k = elapsed / this.beamWindup;
        this.armR.rotation.x = POSE_X * k;
        this.armR.rotation.z = POSE_Z_R * k;
        this.armL.rotation.x = POSE_X * k;
        this.armL.rotation.z = POSE_Z_L * k;
      } else {
        this.armR.rotation.x = POSE_X;
        this.armR.rotation.z = POSE_Z_R;
        this.armL.rotation.x = POSE_X;
        this.armL.rotation.z = POSE_Z_L;
        if (!this._beamFired) {
          this._beamFired = true;
          // Origin: chest, slightly forward in facing direction (+Z local = (sin, 0, cos) world)
          const origin = this.group.position.clone();
          origin.y += 26;
          origin.x += Math.sin(this.group.rotation.y) * 6;
          origin.z += Math.cos(this.group.rotation.y) * 6;
          const targetPos = this._beamTarget.upperBodyPosition();
          this._beamEffects.fireBeam(origin, targetPos, this._beamTarget);
          if (this._beamOnFire) this._beamOnFire(origin, targetPos);
        }
      }
      if (this.beamTimer <= 0) {
        this.beaming = false;
        this.armR.rotation.x = 0;
        this.armR.rotation.z = 0;
        this.armL.rotation.x = 0;
        this.armL.rotation.z = 0;
      }
    }

    if (this.beamCooldown > 0) this.beamCooldown -= dt;

    // Color timer reflects HP
    const hpRatio = this.hp / this.maxHp;
    if (hpRatio < 0.3) {
      const pulse = (Math.sin(performance.now() / 80) + 1) / 2;
      const r = 1, g = pulse * 0.2, b = pulse * 0.1;
      this.colorTimer.material.color.setRGB(r, g, b);
      this.colorTimer.material.emissive.setRGB(r, g, b);
      this.timerLight.color.setRGB(r, g, b);
      this.timerLight.intensity = 1.6 + pulse;
    } else if (hpRatio < 0.6) {
      this.colorTimer.material.color.setHex(0xff8a22);
      this.colorTimer.material.emissive.setHex(0xff8a22);
      this.timerLight.color.setHex(0xff8a22);
      this.timerLight.intensity = 1.4;
    } else {
      this.colorTimer.material.color.setHex(COLORS.yellow);
      this.colorTimer.material.emissive.setHex(COLORS.yellow);
      this.timerLight.color.setHex(COLORS.yellow);
      this.timerLight.intensity = 1.5;
    }
  }

  upperBodyPosition() {
    return this.group.position.clone().add(new THREE.Vector3(0, 26, 0));
  }

  damage(amount) {
    this.hp = Math.max(0, this.hp - amount);
  }
}

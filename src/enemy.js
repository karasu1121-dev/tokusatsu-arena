import * as THREE from 'three';

const KAIJU = {
  body:  0x484a55,
  belly: 0x9a8855,
  spike: 0x1f1d24,
  eye:   0xff2222,
};

export class Kaiju {
  constructor() {
    this.group = new THREE.Group();

    this.maxHp = 200;
    this.hp = this.maxHp;
    this.radius = 9;

    this.velocity = new THREE.Vector3();
    this.facing = Math.PI;
    this.walkPhase = 0;

    // AI
    this.aiState = 'chase';       // 'chase' | 'attack' | 'dead'
    this.attackTimer = 0;
    this.attackHitFrame = false;
    this.attackLanded = false;
    this.attackCooldown = 1.5;
    this.hurtTimer = 0;

    // Ranged red beam
    this.beaming        = false;
    this.beamTimer      = 0;
    this.beamCooldown   = 6.0;        // first beam after 6s
    this.beamFiredThisFrame = false;
    this.beamWindup     = 0.8;
    this.beamCooldownMax = 11.0;

    this.speed             = 13;
    this.attackRange       = 26;
    this.attackDuration    = 1.1;
    this.attackCooldownMax = 1.8;

    this._build();
  }

  _build() {
    const matBody  = new THREE.MeshStandardMaterial({ color: KAIJU.body,  metalness: 0.1, roughness: 0.9 });
    const matBelly = new THREE.MeshStandardMaterial({ color: KAIJU.belly, roughness: 0.85 });
    const matSpike = new THREE.MeshStandardMaterial({ color: KAIJU.spike, roughness: 0.7 });
    const matEye   = new THREE.MeshStandardMaterial({ color: KAIJU.eye,   emissive: 0xff0000, emissiveIntensity: 2.5 });
    const matTooth = new THREE.MeshStandardMaterial({ color: 0xeeeecc, roughness: 0.5 });

    this.materials = { body: matBody, belly: matBelly };

    // ----- Body (egg) -----
    this.body = new THREE.Mesh(new THREE.SphereGeometry(8, 18, 14), matBody);
    this.body.position.y = 22;
    this.body.scale.set(1.15, 1.35, 1.65);
    this.body.castShadow = true;
    this.group.add(this.body);

    const belly = new THREE.Mesh(new THREE.SphereGeometry(7, 18, 14), matBelly);
    belly.position.set(0, 19, 5);
    belly.scale.set(0.85, 1.0, 1.15);
    this.group.add(belly);

    // ----- Head (faces +Z) -----
    this.head = new THREE.Group();
    this.head.position.set(0, 33, 9);
    this.group.add(this.head);

    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(8, 7, 12), matBody);
    headMesh.castShadow = true;
    this.head.add(headMesh);

    const snout = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 5), matBody);
    snout.position.set(0, -0.5, 7);
    this.head.add(snout);

    // Jaw + teeth
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(6, 1.5, 4.5), matBody);
    jaw.position.set(0, -3, 7);
    this.head.add(jaw);

    for (let i = -2; i <= 2; i++) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.2, 4), matTooth);
      tooth.position.set(i * 1.2, -1.8, 8.5);
      tooth.rotation.x = Math.PI;
      this.head.add(tooth);
    }

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.9, 8, 8);
    const eyeL = new THREE.Mesh(eyeGeo, matEye);
    eyeL.position.set(-2.4, 1.6, 5);
    this.head.add(eyeL);
    const eyeR = eyeL.clone();
    eyeR.position.x = 2.4;
    this.head.add(eyeR);

    // Horns
    const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.8, 4, 6), matSpike);
    hornL.position.set(-3, 4.5, 0);
    hornL.rotation.z = 0.5;
    this.head.add(hornL);
    const hornR = hornL.clone();
    hornR.position.x = 3;
    hornR.rotation.z = -0.5;
    this.head.add(hornR);

    // ----- Spikes on back (along -Z to +Z) -----
    const spikeGeo = new THREE.ConeGeometry(1.4, 4.5, 4);
    for (let i = 0; i < 6; i++) {
      const spike = new THREE.Mesh(spikeGeo, matSpike);
      const t = i / 5;
      spike.position.set(0, 30 - t * 4, -7 + t * 9);
      spike.castShadow = true;
      this.group.add(spike);
    }

    // ----- Tail -----
    this.tail = new THREE.Group();
    this.tail.position.set(0, 20, -7);
    this.group.add(this.tail);
    const tailGeo = new THREE.CylinderGeometry(0.6, 3, 16, 8);
    const tailMesh = new THREE.Mesh(tailGeo, matBody);
    tailMesh.position.set(0, 0, -8);
    tailMesh.rotation.x = Math.PI / 2;
    tailMesh.castShadow = true;
    this.tail.add(tailMesh);

    // ----- Arms (small T-rex) -----
    const buildArm = (sign) => {
      const pivot = new THREE.Group();
      pivot.position.set(sign * 7, 26, 5);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.8, 5, 8), matBody);
      arm.position.y = -2.5;
      arm.castShadow = true;
      pivot.add(arm);
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.2, 6), matSpike);
      claw.position.y = -6;
      claw.rotation.x = Math.PI / 2;
      pivot.add(claw);
      return pivot;
    };
    this.armL = buildArm(-1);
    this.armR = buildArm(1);
    this.group.add(this.armL, this.armR);

    // ----- Legs -----
    const buildLeg = (sign) => {
      const pivot = new THREE.Group();
      pivot.position.set(sign * 3.5, 15, 0);
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 1.7, 8, 10), matBody);
      thigh.position.y = -4;
      thigh.castShadow = true;
      pivot.add(thigh);
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.4, 8, 10), matBody);
      shin.position.y = -12;
      shin.castShadow = true;
      pivot.add(shin);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(4, 1.5, 6), matSpike);
      foot.position.set(0, -16.2, 1);
      pivot.add(foot);
      // Toe claws
      for (let i = -1; i <= 1; i++) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 4), matSpike);
        claw.position.set(i * 1.2, -16.4, 4);
        claw.rotation.x = Math.PI / 2;
        pivot.add(claw);
      }
      return pivot;
    };
    this.legL = buildLeg(-1);
    this.legR = buildLeg(1);
    this.group.add(this.legL, this.legR);

    this.group.rotation.y = this.facing;
  }

  update(dt, player) {
    if (this.aiState === 'dead' || this.hp <= 0) {
      if (this.aiState !== 'dead') {
        this.aiState = 'dead';
        this._deathTilt = 0;
      }
      this._deathTilt = Math.min(Math.PI / 2, this._deathTilt + dt * 1.4);
      this.group.rotation.z = this._deathTilt;
      // Body sinks slightly
      this.group.position.y = Math.max(-3, this.group.position.y - dt * 4);
      return;
    }

    // Hurt flash
    if (this.hurtTimer > 0) {
      this.hurtTimer -= dt;
      const t = Math.max(0, this.hurtTimer / 0.2);
      this.materials.body.emissive.setRGB(t * 0.8, 0, 0);
    } else {
      this.materials.body.emissive.setRGB(0, 0, 0);
    }

    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.beamCooldown   > 0) this.beamCooldown   -= dt;

    const toPlayer = new THREE.Vector3().subVectors(player.group.position, this.group.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();

    // ----- Ranged beam AI -----
    // Wind up then fire when player is in mid-range. Always reset the
    // per-frame flag first so main.js only triggers once per fire.
    this.beamFiredThisFrame = false;
    if (this.beaming) {
      this.velocity.x = 0; this.velocity.z = 0;
      this.beamTimer -= dt;
      // Eyes glow extra bright while charging (already emissive, just visual cue)
      if (this.beamTimer <= 0) {
        this.beaming = false;
        this.beamFiredThisFrame = true;
      }
    } else if (this.beamCooldown <= 0 && dist > this.attackRange + 5 && dist < 250 && Math.random() < 0.012) {
      // Begin charge
      this.beaming = true;
      this.beamTimer = this.beamWindup;
      this.beamCooldown = this.beamCooldownMax;
    }
    if (this.beaming) {
      // While charging: face player + hold, skip normal AI movement/attack
      const desiredFacing = Math.atan2(toPlayer.x, toPlayer.z);
      let dy = desiredFacing - this.facing;
      while (dy > Math.PI)  dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.facing += dy * 0.15;
      // Still apply rotation lerp below
      this.group.position.x += this.velocity.x * dt;
      this.group.position.z += this.velocity.z * dt;
      let ry = this.facing - this.group.rotation.y;
      while (ry > Math.PI)  ry -= Math.PI * 2;
      while (ry < -Math.PI) ry += Math.PI * 2;
      this.group.rotation.y += ry * 0.15;
      return;
    }

    if (this.aiState === 'attack') {
      this.attackTimer -= dt;
      const elapsed = this.attackDuration - this.attackTimer;
      // Right arm swipe forward
      const k = Math.sin((elapsed / this.attackDuration) * Math.PI);
      this.armR.rotation.x = Math.PI / 2 * k;
      this.armR.rotation.z = -k * 0.8;
      // Head lunge
      this.head.position.z = 9 + k * 3;
      this.attackHitFrame = elapsed > 0.35 && elapsed < 0.65;

      if (this.attackTimer <= 0) {
        this.aiState = 'chase';
        this.attackHitFrame = false;
        this.armR.rotation.x = 0;
        this.armR.rotation.z = 0;
        this.head.position.z = 9;
        this.attackCooldown = this.attackCooldownMax;
      }
    } else {
      // chase
      if (dist > 0.5) {
        const desiredFacing = Math.atan2(toPlayer.x, toPlayer.z);
        let dy = desiredFacing - this.facing;
        while (dy > Math.PI)  dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        this.facing += dy * 0.05;
      }

      if (dist > this.attackRange) {
        const dir = toPlayer.clone().normalize();
        this.velocity.x = dir.x * this.speed;
        this.velocity.z = dir.z * this.speed;
        this.walkPhase += dt * 4;
      } else {
        this.velocity.x = 0;
        this.velocity.z = 0;
        if (this.attackCooldown <= 0) {
          this.aiState = 'attack';
          this.attackTimer = this.attackDuration;
          this.attackLanded = false;
        }
      }

      // Walk anim
      const swing = Math.sin(this.walkPhase) * 0.5;
      this.legL.rotation.x = -swing;
      this.legR.rotation.x = swing;
      this.armL.rotation.x = swing * 0.3;
      this.armR.rotation.x = -swing * 0.3;
      this.body.rotation.z = Math.sin(this.walkPhase) * 0.05;
      this.tail.rotation.y = Math.sin(performance.now() / 700) * 0.35;
    }

    // Apply velocity
    this.group.position.x += this.velocity.x * dt;
    this.group.position.z += this.velocity.z * dt;

    // Smooth rotate to face
    let dy = this.facing - this.group.rotation.y;
    while (dy > Math.PI)  dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.group.rotation.y += dy * 0.12;

    // Boundary
    const limit = 290;
    this.group.position.x = Math.max(-limit, Math.min(limit, this.group.position.x));
    this.group.position.z = Math.max(-limit, Math.min(limit, this.group.position.z));
  }

  upperBodyPosition() {
    return this.group.position.clone().add(new THREE.Vector3(0, 24, 0));
  }

  damage(amount) {
    if (this.aiState === 'dead') return;
    this.hp = Math.max(0, this.hp - amount);
    this.hurtTimer = 0.2;
  }
}

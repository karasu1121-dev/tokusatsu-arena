import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Reusable temporaries — avoids per-frame allocation in _animateBones
const _UP    = new THREE.Vector3(0, 1, 0);
const _DOWN  = new THREE.Vector3(0, -1, 0);
const _fwd   = new THREE.Vector3();
const _right = new THREE.Vector3();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3();
const _tmpDir = new THREE.Vector3();
const _targetQ = new THREE.Quaternion();
const _parentWorldQ = new THREE.Quaternion();
const _pq = new THREE.Quaternion();

// State name → animation clip name in the loaded glTF.
// For RobotExpressive.glb the clip names are: Idle, Walking, Running, Jump,
// Punch, Death, Wave, ThumbsUp, Dance, Sitting, Standing, Yes, No.
// To swap in a Mixamo character: download as glTF (or convert FBX → glTF),
// rename clips to match these keys (or remap below), and drop in assets/.
const CLIP_MAP = {
  idle:  'Idle',
  walk:  'Walking',
  run:   'Running',
  jump:  'Jump',
  punch: 'Punch',
  beam:  'Wave',      // placeholder for cross-arm pose
  death: 'Death',
};

export async function loadModel(url) {
  const loader = new GLTFLoader();
  return await loader.loadAsync(url);
}

export class ModelUltraman {
  constructor(gltf, opts = {}) {
    this.group = new THREE.Group();

    // ----- Stats -----
    this.maxHp  = 100;
    this.hp     = this.maxHp;
    this.radius = 6;

    // ----- Movement state -----
    this.velocity   = new THREE.Vector3();
    this.facing     = 0;
    this.onGround   = true;
    this.isMoving   = false;
    this.isSprinting = false;
    this.walkPhase  = 0;

    // ----- Combat state -----
    this.punching     = false;
    this.punchTimer   = 0;
    this.punchHit     = false;
    this.punchActive  = false;
    this.kicking      = false;
    this.kickTimer    = 0;
    this.kickHit      = false;
    this.kickActive   = false;
    this.beaming      = false;
    this.beamTimer    = 0;
    this.beamCooldown = 0;
    this._beamFired   = false;

    // ----- Tuning -----
    this.speed         = 28;
    this.sprintSpeed   = 55;
    this.jumpV         = 82;
    this.gravity       = 82;
    this.punchDuration = 0.65;
    this.kickDuration  = 1.1;
    this.beamWindup    = 0.6;
    this.beamHold      = 1.4;
    this.beamCdMax     = 10.0;

    this._currentState = null;
    this._setupModel(gltf, opts);
    this._buildColorTimer();
  }

  _setupModel(gltf, opts) {
    const model = gltf.scene;
    model.position.y = 0;

    // Detect rig type
    let isCCRig = false;
    let isRobotExpressive = false;
    let isMixamoRig = false;
    model.traverse(obj => {
      if (obj.isBone && obj.name.includes('CC_Base_')) isCCRig = true;
      if (obj.isBone && obj.name.toLowerCase().includes('mixamorig')) isMixamoRig = true;
      if (obj.name && (obj.name.startsWith('Torso_') || obj.name === 'RobotArmature')) isRobotExpressive = true;
    });
    this._isCCRig = isCCRig;
    this._isMixamoRig = isMixamoRig;

    // Per-rig fixed scale — Box3-based auto-fit is broken on SkinnedMesh,
    // so we pick a known-good factor per known model.
    let scale = opts.scale;
    if (scale == null) {
      if (isRobotExpressive) scale = 10;     // Three.js demo ≈ 4 units tall
      else if (isMixamoRig)  scale = 22;     // Y Bot ≈ 1.8 units → giant 40
      else if (isCCRig)      scale = 22;
      else                    scale = 14;
    }
    model.scale.setScalar(scale);

    model.traverse(obj => {
      if (obj.isMesh || obj.isSkinnedMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        if (!isCCRig && obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(m => this._tintMaterial(m));
        }
        // SkinnedMesh's bounding sphere is bind-pose only → ends up small and
        // frustum-culled near the camera. Disable culling for them.
        if (obj.isSkinnedMesh) obj.frustumCulled = false;
      }
    });

    this.group.add(model);
    this.model = model;

    // ----- Animation source -----
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const clip of gltf.animations) {
      this.actions[clip.name] = this.mixer.clipAction(clip);
    }
    this._hasClips = gltf.animations.length > 0;

    // Bones for procedural animation fallback (CC-base / Mixamo / generic names)
    this.bones = {};
    const want = {
      armL:    [/L[._]?Upperarm/i, /LeftArm/i, /Arm.L/i],
      armR:    [/R[._]?Upperarm/i, /RightArm/i, /Arm.R/i],
      forearmL:[/L[._]?Forearm/i,  /LeftForeArm/i, /ForeArm.L/i],
      forearmR:[/R[._]?Forearm/i,  /RightForeArm/i, /ForeArm.R/i],
      legL:    [/L[._]?Thigh/i,    /LeftUpLeg/i, /UpLeg.L/i],
      legR:    [/R[._]?Thigh/i,    /RightUpLeg/i, /UpLeg.R/i],
      shinL:   [/L[._]?Calf/i,     /LeftLeg/i, /Leg.L/i],
      shinR:   [/R[._]?Calf/i,     /RightLeg/i, /Leg.R/i],
      spine:   [/Spine0?2/i, /Spine01/i, /Spine\b/i],
      head:    [/Head\b/i],
    };
    model.traverse(o => {
      if (!o.isBone) return;
      for (const key in want) {
        if (this.bones[key]) continue;
        if (want[key].some(re => re.test(o.name))) {
          this.bones[key] = o;
          break;
        }
      }
    });
    // Snapshot rest pose so we can return to it each frame
    this._rest = {};
    for (const k in this.bones) this._rest[k] = this.bones[k].rotation.clone();

    // Snapshot EVERY bone — needed to wipe leftover Mixamo poses off bones
    // we don't animate procedurally (spine subbones, fingers, neck, etc.).
    this._allBoneRest = new Map();
    model.traverse(o => {
      if (o.isBone) this._allBoneRest.set(o, o.quaternion.clone());
    });

    if (this._hasClips) this._playState('idle', true);
  }

  // Recolor the model toward Ultraman's silver/red palette so the demo
  // character at least suggests the right colour scheme.
  _tintMaterial(mat) {
    if (!mat.color) return;
    const hex = mat.color.getHex();
    // Original near-white → silver; near-black → leave; reddish stays red
    const r = (hex >> 16) & 0xff;
    const g = (hex >> 8)  & 0xff;
    const b =  hex        & 0xff;
    const luma = (r + g + b) / 3;
    if (luma > 180)       mat.color.setHex(0xcfd3d8);            // silver body
    else if (luma > 100)  mat.color.setHex(0xa83434);            // accent red
    else if (luma < 40)   mat.color.setHex(0x2a2c30);            // dark
    if ('metalness' in mat) mat.metalness = 0.6;
    if ('roughness' in mat) mat.roughness = 0.35;
  }

  _buildColorTimer() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xfdc04a, emissive: 0xfdc04a, emissiveIntensity: 1.8,
    });
    // ~1/3 of the current visible volume (radius 1.0 → 0.7, volume ∝ r³)
    this.colorTimer = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 16), mat);
    this.colorTimer.position.set(0, 26.2, 3.0);
    this.group.add(this.colorTimer);
    this.timerLight = new THREE.PointLight(0xfdc04a, 0.8, 22);
    this.timerLight.position.copy(this.colorTimer.position);
    this.group.add(this.timerLight);
  }

  // Register a retargeted Mixamo AnimationClip under a state name.
  // When that state is active, the clip plays via the AnimationMixer
  // (overriding the procedural bone driver).
  addMixamoClip(stateName, clip, opts = {}) {
    if (!this.mixamoActions) this.mixamoActions = {};
    const action = this.mixer.clipAction(clip);
    action.loop = opts.loop ? THREE.LoopRepeat : THREE.LoopOnce;
    action.clampWhenFinished = true;
    action.setEffectiveWeight(1);
    if (opts.timeScale) action.setEffectiveTimeScale(opts.timeScale);
    this.mixamoActions[stateName] = action;
  }

  _playState(state, immediate = false) {
    if (this._currentState === state) return;
    const oldClip = CLIP_MAP[this._currentState];
    const newClip = CLIP_MAP[state];
    const oldAct  = oldClip ? this.actions[oldClip] : null;
    const newAct  = newClip ? this.actions[newClip] : null;
    const fade = immediate ? 0 : 0.18;
    if (newAct) {
      newAct.reset();
      newAct.enabled = true;
      newAct.setEffectiveTimeScale(1);
      newAct.setEffectiveWeight(1);
      if (fade > 0) newAct.fadeIn(fade);
      newAct.play();
    }
    if (oldAct && oldAct !== newAct) {
      fade > 0 ? oldAct.fadeOut(fade) : oldAct.stop();
    }
    this._currentState = state;
  }

  // ----- Public interface (matches procedural Ultraman) -----

  move(dir, sprint, dt) {
    const speed = sprint ? this.sprintSpeed : this.speed;
    this.velocity.x = dir.x * speed;
    this.velocity.z = dir.z * speed;
    this.isMoving = dir.lengthSq() > 0;
    this.isSprinting = sprint && this.isMoving;
    if (this.isMoving) this.facing = Math.atan2(dir.x, dir.z);
  }

  jump() {
    if (this.onGround) {
      this.velocity.y = this.jumpV;
      this.onGround = false;
    }
  }

  punch() {
    if (this.punching || this.kicking || this.beaming) return;
    this.punching    = true;
    this.punchTimer  = this.punchDuration;
    this.punchHit    = false;
    this.punchActive = false;
  }

  kick() {
    if (this.kicking || this.punching || this.beaming) return;
    this.kicking    = true;
    this.kickTimer  = this.kickDuration;
    this.kickHit    = false;
    this.kickActive = false;
  }

  // Beam fires straight in the player's facing direction (no auto-aim).
  // `onFire(origin, target)` is called when the beam launches.
  tryBeam(effects, onFire) {
    if (this.beaming || this.punching || this.kicking || this.beamCooldown > 0 || !this.onGround) return;
    this.beaming      = true;
    this.beamTimer    = this.beamWindup + this.beamHold;
    this.beamCooldown = this.beamCdMax;
    this._beamFired   = false;
    this._beamEffects = effects;
    this._beamOnFire  = onFire;
  }

  update(dt) {
    // ----- Physics integration -----
    this.velocity.y -= this.gravity * dt;
    this.group.position.x += this.velocity.x * dt;
    this.group.position.y += this.velocity.y * dt;
    this.group.position.z += this.velocity.z * dt;
    if (this.group.position.y <= 0) {
      this.group.position.y = 0;
      this.velocity.y = 0;
      this.onGround = true;
    }
    const limit = 290;
    this.group.position.x = Math.max(-limit, Math.min(limit, this.group.position.x));
    this.group.position.z = Math.max(-limit, Math.min(limit, this.group.position.z));

    // ----- Facing -----
    let dy = this.facing - this.group.rotation.y;
    while (dy >  Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.group.rotation.y += dy * 0.25;

    // ----- Punch timing window -----
    if (this.punching) {
      this.punchTimer -= dt;
      const t = 1 - this.punchTimer / this.punchDuration;
      this.punchActive = t > 0.30 && t < 0.65;
      if (this.punchTimer <= 0) {
        this.punching = false;
        this.punchActive = false;
      }
    }

    // ----- Kick timing window -----
    if (this.kicking) {
      this.kickTimer -= dt;
      const t = 1 - this.kickTimer / this.kickDuration;
      this.kickActive = t > 0.35 && t < 0.65;
      if (this.kickTimer <= 0) {
        this.kicking = false;
        this.kickActive = false;
      }
    }

    // ----- Beam timing -----
    if (this.beaming) {
      this.beamTimer -= dt;
      const elapsed = this.beamWindup + this.beamHold - this.beamTimer;
      if (elapsed >= this.beamWindup && !this._beamFired) {
        this._beamFired = true;
        // Origin: chest, slightly in front of body
        const origin = this.group.position.clone();
        origin.y += 26;
        origin.x += Math.sin(this.group.rotation.y) * 6;
        origin.z += Math.cos(this.group.rotation.y) * 6;
        // Target: straight ahead in the player's facing direction (no auto-aim)
        const range = 600;
        const target = new THREE.Vector3(
          origin.x + Math.sin(this.group.rotation.y) * range,
          origin.y - 4,                              // slight downward angle
          origin.z + Math.cos(this.group.rotation.y) * range
        );
        this._beamEffects.fireBeam(origin, target, null);
        if (this._beamOnFire) this._beamOnFire(origin, target);
      }
      if (this.beamTimer <= 0) this.beaming = false;
    }
    if (this.beamCooldown > 0) this.beamCooldown -= dt;

    // ----- Drive animation state machine -----
    let state;
    if      (this.hp <= 0)     state = 'death';
    else if (this.beaming)     state = 'beam';
    else if (this.kicking)     state = 'kick';
    else if (this.punching)    state = 'punch';
    else if (!this.onGround)   state = 'jump';
    else if (this.isSprinting) state = 'run';
    else if (this.isMoving)    state = 'walk';
    else                       state = 'idle';

    // Prefer a retargeted Mixamo clip for this state, otherwise procedural
    const mixAction = this.mixamoActions && this.mixamoActions[state];
    if (mixAction) {
      if (this._currentMixAction !== mixAction) {
        if (this._currentMixAction) this._currentMixAction.stop();
        mixAction.reset().play();
        this._currentMixAction = mixAction;
      }
      this.mixer.update(dt);
    } else {
      if (this._currentMixAction) {
        this._currentMixAction.stop();
        this._currentMixAction = null;
        // Mixer left other bones (spine, neck, fingers) in mid-anim pose.
        // Restore the whole skeleton so procedural starts from T-pose.
        if (this._allBoneRest) this._allBoneRest.forEach((q, bone) => bone.quaternion.copy(q));
      }
      if (this._hasClips) {
        this._playState(state);
        this.mixer.update(dt);
      } else {
        this._animateBones(state, dt);
      }
    }

    // ----- Color timer reflects HP -----
    const r = this.hp / this.maxHp;
    if (r < 0.3) {
      const p = (Math.sin(performance.now() / 80) + 1) / 2;
      this.colorTimer.material.color.setRGB(1, p * 0.2, p * 0.1);
      this.colorTimer.material.emissive.setRGB(1, p * 0.2, p * 0.1);
      this.timerLight.color.setRGB(1, p * 0.2, p * 0.1);
      this.timerLight.intensity = 1.6 + p;
    } else if (r < 0.6) {
      this.colorTimer.material.color.setHex(0xff8a22);
      this.colorTimer.material.emissive.setHex(0xff8a22);
      this.timerLight.color.setHex(0xff8a22);
      this.timerLight.intensity = 1.4;
    } else {
      this.colorTimer.material.color.setHex(0xfdc04a);
      this.colorTimer.material.emissive.setHex(0xfdc04a);
      this.timerLight.color.setHex(0xfdc04a);
      this.timerLight.intensity = 1.5;
    }
  }

  // Aim a bone's local +Y axis (bone-length direction) at a world-space
  // direction. Works regardless of how the rig's Euler axes are laid out.
  _pointBone(bone, worldDir) {
    if (!bone) return;
    bone.parent.updateWorldMatrix(true, false);
    const pq = _pq.copy(bone.parent.quaternion);   // parent's local rot only is wrong if grandparents rotate; use world
    bone.parent.getWorldQuaternion(_parentWorldQ);
    _targetQ.setFromUnitVectors(_UP, _tmpDir.copy(worldDir).normalize());
    bone.quaternion.copy(_parentWorldQ.invert()).multiply(_targetQ);
  }

  // Bend a child bone (forearm / shin) around its parent's elbow/knee axis.
  // amount > 0 bends "naturally" (forearm toward bicep / heel toward butt).
  _bendChild(child, amount) {
    if (!child) return;
    const rest = this._rest[Object.keys(this._rest).find(k => this.bones[k] === child)];
    if (rest) child.rotation.set(rest.x, rest.y, rest.z);
    // The CC rig's elbow rotates cleanly around its own X axis (positive = curl).
    child.rotation.x += amount;
  }

  // Procedural skeletal animation driven by world-space pose targets, so we
  // don't depend on each bone's Euler axis convention.
  _animateBones(state, dt) {
    const b = this.bones;
    if (!b.armL && !b.legL) return;

    // World-space body axes for the current facing
    const ry = this.group.rotation.y;
    const fwd  = _fwd.set(Math.sin(ry), 0, Math.cos(ry));
    const right = _right.set(Math.cos(ry), 0, -Math.sin(ry));
    const down = _DOWN, up = _UP;

    let armRDir = _v1.copy(down), armLDir = _v2.copy(down);
    let legRDir = _v3.copy(down), legLDir = _v4.copy(down);
    let forearmR = 0, forearmL = 0, shinR = 0, shinL = 0;

    if (state === 'walk' || state === 'run') {
      this.walkPhase += dt * (state === 'run' ? 13 : 8);
      const swing = Math.sin(this.walkPhase) * (state === 'run' ? 0.55 : 0.40);
      // Arms still use pointBone (their twist doesn't matter visually)
      armLDir.copy(down).addScaledVector(fwd, -swing * 0.7).normalize();
      armRDir.copy(down).addScaledVector(fwd,  swing * 0.7).normalize();
      // Legs: use Euler so the foot inherits rest-pose twist (feet stay
      // pointing along character's forward axis instead of flopping sideways)
      this._eulerSwing = swing;
      if (swing > 0) shinR = swing * 0.9;
      else           shinL = -swing * 0.9;
      this._useEulerLegs = true;
    } else if (state === 'jump') {
      // Athletic jump pose: knees tucked up, arms raised forward+up
      legLDir.copy(down).addScaledVector(fwd, 0.65).normalize();
      legRDir.copy(down).addScaledVector(fwd, 0.65).normalize();
      shinL = 1.4; shinR = 1.4;                 // deep knee bend so feet tuck under
      armLDir.copy(fwd).addScaledVector(up, 0.55).normalize();
      armRDir.copy(fwd).addScaledVector(up, 0.55).normalize();
      forearmL = 0.3; forearmR = 0.3;
    } else if (state === 'punch') {
      // Cross punch with the RIGHT arm — pull elbow back & curl, then drive forward
      // with hip-twist follow-through. Phases (normalised t in [0,1]):
      //   0.00 .. 0.30  windup   – elbow pulls behind, body coiled
      //   0.30 .. 0.55  drive    – arm uncurls, body untwists into the strike
      //   0.55 .. 1.00  recovery – return toward guard
      const t = 1 - this.punchTimer / this.punchDuration;
      const dirGuard = _v5.copy(down).addScaledVector(fwd, 0.2).normalize();         // tucked at side
      const dirPull  = _v6.copy(down).addScaledVector(fwd, -0.45).addScaledVector(up, 0.3).normalize();
      const dirThrust = new THREE.Vector3().copy(fwd).addScaledVector(down, 0.05).normalize();

      let spineTwist = 0;
      if (t < 0.30) {
        const k = t / 0.30, ease = 1 - (1 - k) * (1 - k);
        armRDir.copy(dirGuard).lerp(dirPull, ease).normalize();
        forearmR = 1.4 * ease;                  // elbow bent during coil
        spineTwist = -0.45 * ease;              // shoulders rotate AWAY from strike
      } else if (t < 0.55) {
        const k = (t - 0.30) / 0.25, ease = k * k;
        armRDir.copy(dirPull).lerp(dirThrust, ease).normalize();
        forearmR = 1.4 * (1 - ease);            // straightens out on impact
        spineTwist = -0.45 + 0.95 * ease;       // hip-twist follow-through INTO the punch
      } else {
        const k = (t - 0.55) / 0.45, ease = k;
        armRDir.copy(dirThrust).lerp(dirGuard, ease).normalize();
        forearmR = 0.4 * ease;
        spineTwist = 0.5 * (1 - ease);
      }
      // Left arm stays in defensive guard near chest
      armLDir.copy(down).addScaledVector(fwd, 0.15).normalize();
      forearmL = 1.1;

      if (b.spine) {
        b.spine.rotation.copy(this._rest.spine);
        b.spine.rotation.y += spineTwist;
      }
    } else if (state === 'beam') {
      // Iconic Spacium pose: LEFT forearm vertical, RIGHT arm crossed in front of it.
      // We approximate with both arms forward, crossed inward at the chest.
      armLDir.copy(up).addScaledVector(fwd, 0.15).normalize();        // left arm raised forearm-up
      armRDir.copy(fwd).addScaledVector(right, -0.25).normalize();    // right arm across body
      forearmL = 1.4;                            // sharp 90° elbow → forearm vertical
      forearmR = 0.6;
    } else if (state === 'death') {
      armRDir.copy(down).addScaledVector(fwd, 0.2);
      armLDir.copy(down).addScaledVector(fwd, 0.2);
    } else {
      // idle — relaxed stance with shoulders slightly out, gentle breathing
      const breath = Math.sin(performance.now() / 1200) * 0.04;
      armRDir.copy(down).addScaledVector(right,  0.22 + breath);
      armLDir.copy(down).addScaledVector(right, -0.22 - breath);
    }

    this._pointBone(b.armR, armRDir);
    this._pointBone(b.armL, armLDir);
    if (this._useEulerLegs) {
      // Restore rest then add Euler hip swing — keeps foot's "forward" axis
      // intact regardless of walk direction.
      if (b.legL && this._rest.legL) {
        b.legL.rotation.copy(this._rest.legL);
        b.legL.rotation.x += this._eulerSwing;
      }
      if (b.legR && this._rest.legR) {
        b.legR.rotation.copy(this._rest.legR);
        b.legR.rotation.x -= this._eulerSwing;
      }
      this._useEulerLegs = false;
    } else {
      this._pointBone(b.legR, legRDir);
      this._pointBone(b.legL, legLDir);
    }
    this._bendChild(b.forearmR, forearmR);
    this._bendChild(b.forearmL, forearmL);
    this._bendChild(b.shinR, shinR);
    this._bendChild(b.shinL, shinL);
  }

  upperBodyPosition() {
    return this.group.position.clone().add(new THREE.Vector3(0, 28, 0));
  }

  damage(amount) {
    this.hp = Math.max(0, this.hp - amount);
  }
}

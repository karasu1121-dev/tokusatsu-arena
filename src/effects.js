import * as THREE from 'three';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
  }

  fireBeam(origin, targetPos, targetObj, color = 0x88eeff) {
    const beam = new Beam(this.scene, origin, targetPos, color);
    this.active.push(beam);
    if (targetObj && targetObj.damage) {
      setTimeout(() => {
        targetObj.damage(45);
        this.spawnImpact(targetObj.upperBodyPosition());
      }, 120);
    }
  }

  // Persistent, updatable beam — caller drives it via .update(origin, target)
  // every frame, then .dispose() when done.
  createSweepBeam(color = 0x88eeff) {
    return new SweepBeam(this.scene, color);
  }

  spawnImpact(position) {
    this.active.push(new Impact(this.scene, position, 0xffcc44));
  }

  spawnDebris(position) {
    this.active.push(new Impact(this.scene, position, 0x886644, 14, 12));
  }

  spawnExplosion(position, radius = 70) {
    this.active.push(new Explosion(this.scene, position, radius));
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      if (!this.active[i].update(dt)) {
        this.active[i].dispose();
        this.active.splice(i, 1);
      }
    }
  }
}

class Beam {
  constructor(scene, origin, target, color = 0x88eeff) {
    this.scene = scene;
    this.duration = 0.75;
    this.elapsed = 0;

    const dir = new THREE.Vector3().subVectors(target, origin);
    const length = dir.length();

    // Inner core — bright white core
    const coreGeo = new THREE.CylinderGeometry(1.0, 1.0, length, 16, 1, true);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 1, side: THREE.DoubleSide,
    });
    this.core = new THREE.Mesh(coreGeo, coreMat);

    // Outer glow tinted by `color`
    const glowGeo = new THREE.CylinderGeometry(3.2, 3.2, length, 16, 1, true);
    const glowMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.65,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this._beamColor = color;
    this.glow = new THREE.Mesh(glowGeo, glowMat);

    // Position at midpoint
    const mid = new THREE.Vector3().lerpVectors(origin, target, 0.5);
    this.core.position.copy(mid);
    this.glow.position.copy(mid);

    // Orient cylinder Y-axis along dir
    const up = new THREE.Vector3(0, 1, 0);
    const dirN = dir.clone().normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(up, dirN);
    this.core.quaternion.copy(quat);
    this.glow.quaternion.copy(quat);

    scene.add(this.core);
    scene.add(this.glow);

    // Impact light tinted with beam color
    this.flash = new THREE.PointLight(color, 6, 120);
    this.flash.position.copy(target);
    scene.add(this.flash);

    // Muzzle light
    this.muzzle = new THREE.PointLight(color, 4, 60);
    this.muzzle.position.copy(origin);
    scene.add(this.muzzle);
  }

  update(dt) {
    this.elapsed += dt;
    const t = this.elapsed / this.duration;
    if (t >= 1) return false;

    const k = 1 - t;
    this.core.material.opacity = k;
    this.glow.material.opacity = 0.75 * k;
    const wob = 1 + Math.sin(this.elapsed * 35) * 0.18;
    this.glow.scale.x = wob;
    this.glow.scale.z = wob;
    this.flash.intensity = 7 * k;
    this.muzzle.intensity = 4 * k;
    return true;
  }

  dispose() {
    this.scene.remove(this.core);
    this.scene.remove(this.glow);
    this.scene.remove(this.flash);
    this.scene.remove(this.muzzle);
    this.core.geometry.dispose();
    this.glow.geometry.dispose();
    this.core.material.dispose();
    this.glow.material.dispose();
  }
}

class SweepBeam {
  constructor(scene, color) {
    this.scene = scene;
    this.color = color;
    // Reusable meshes — scaled each frame so length tracks origin→target
    const coreGeo = new THREE.CylinderGeometry(1.0, 1.0, 1, 16, 1, true);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 1, side: THREE.DoubleSide,
    });
    this.core = new THREE.Mesh(coreGeo, coreMat);
    const glowGeo = new THREE.CylinderGeometry(3.2, 3.2, 1, 16, 1, true);
    const glowMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.7,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.glow = new THREE.Mesh(glowGeo, glowMat);
    this.flash  = new THREE.PointLight(color, 7, 140);
    this.muzzle = new THREE.PointLight(color, 5, 70);
    scene.add(this.core, this.glow, this.flash, this.muzzle);
    this._up = new THREE.Vector3(0, 1, 0);
    this._tmpDir = new THREE.Vector3();
    this._tmpMid = new THREE.Vector3();
    this._tmpQuat = new THREE.Quaternion();
  }

  update(origin, target) {
    this._tmpDir.subVectors(target, origin);
    const len = Math.max(0.01, this._tmpDir.length());
    this._tmpMid.lerpVectors(origin, target, 0.5);
    this.core.position.copy(this._tmpMid);
    this.glow.position.copy(this._tmpMid);
    this._tmpQuat.setFromUnitVectors(this._up, this._tmpDir.clone().normalize());
    this.core.quaternion.copy(this._tmpQuat);
    this.glow.quaternion.copy(this._tmpQuat);
    // Stretch along bone (cylinder default height=1, along Y)
    this.core.scale.set(1, len, 1);
    const wob = 1 + Math.sin(performance.now() / 25) * 0.22;
    this.glow.scale.set(wob, len, wob);
    this.flash.position.copy(target);
    this.muzzle.position.copy(origin);
  }

  dispose() {
    this.scene.remove(this.core, this.glow, this.flash, this.muzzle);
    this.core.geometry.dispose();
    this.glow.geometry.dispose();
    this.core.material.dispose();
    this.glow.material.dispose();
  }
}

class Impact {
  constructor(scene, position, color = 0xffcc44, count = 24, force = 22) {
    this.scene = scene;
    this.duration = 0.7;
    this.elapsed = 0;

    this.group = new THREE.Group();
    this.group.position.copy(position);

    this.bits = [];
    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.4 + Math.random() * 0.6, 4, 4);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
      const p = new THREE.Mesh(geo, mat);
      const v = new THREE.Vector3(
        (Math.random() - 0.5),
        Math.random() * 0.8 + 0.15,
        (Math.random() - 0.5)
      ).normalize().multiplyScalar(force + Math.random() * force);
      p.userData.v = v;
      this.group.add(p);
      this.bits.push(p);
    }
    scene.add(this.group);

    this.flash = new THREE.PointLight(color, 6, 80);
    this.flash.position.copy(position);
    scene.add(this.flash);
  }

  update(dt) {
    this.elapsed += dt;
    const t = this.elapsed / this.duration;
    if (t >= 1) return false;
    for (const p of this.bits) {
      p.position.x += p.userData.v.x * dt;
      p.position.y += p.userData.v.y * dt;
      p.position.z += p.userData.v.z * dt;
      p.userData.v.y -= 70 * dt;
      p.material.opacity = 1 - t;
    }
    this.flash.intensity = 6 * (1 - t);
    return true;
  }

  dispose() {
    this.scene.remove(this.group);
    this.scene.remove(this.flash);
    for (const p of this.bits) {
      p.geometry.dispose();
      p.material.dispose();
    }
  }
}

class Explosion {
  constructor(scene, position, radius = 70) {
    this.scene = scene;
    this.duration = 0.9;
    this.elapsed = 0;
    this.radius = radius;

    this.group = new THREE.Group();
    this.group.position.copy(position);

    const coreGeo = new THREE.SphereGeometry(1, 24, 16);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffdd66,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.core = new THREE.Mesh(coreGeo, coreMat);
    this.group.add(this.core);

    const smokeGeo = new THREE.SphereGeometry(1, 18, 12);
    const smokeMat = new THREE.MeshBasicMaterial({
      color: 0x3a2a22,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.smoke = new THREE.Mesh(smokeGeo, smokeMat);
    this.group.add(this.smoke);

    this.bits = [];
    for (let i = 0; i < 42; i++) {
      const geo = new THREE.SphereGeometry(0.5 + Math.random() * 0.9, 5, 5);
      const mat = new THREE.MeshBasicMaterial({
        color: Math.random() < 0.55 ? 0xff8a22 : 0xffdd66,
        transparent: true,
        blending: THREE.AdditiveBlending,
      });
      const p = new THREE.Mesh(geo, mat);
      const v = new THREE.Vector3(
        (Math.random() - 0.5),
        Math.random() * 0.7 + 0.2,
        (Math.random() - 0.5)
      ).normalize().multiplyScalar(42 + Math.random() * 52);
      p.userData.v = v;
      this.group.add(p);
      this.bits.push(p);
    }

    scene.add(this.group);
    this.flash = new THREE.PointLight(0xff7722, 12, radius * 2.6, 1.4);
    this.flash.position.copy(position);
    scene.add(this.flash);
  }

  update(dt) {
    this.elapsed += dt;
    const t = this.elapsed / this.duration;
    if (t >= 1) return false;
    const blast = 1 - t;
    this.core.scale.setScalar(this.radius * 0.24 * (0.2 + t));
    this.core.material.opacity = 0.95 * blast;
    this.smoke.scale.setScalar(this.radius * 0.35 * (0.4 + t));
    this.smoke.position.y += dt * 14;
    this.smoke.material.opacity = 0.45 * blast;
    for (const p of this.bits) {
      p.position.x += p.userData.v.x * dt;
      p.position.y += p.userData.v.y * dt;
      p.position.z += p.userData.v.z * dt;
      p.userData.v.y -= 65 * dt;
      p.material.opacity = blast;
    }
    this.flash.intensity = 12 * blast;
    return true;
  }

  dispose() {
    this.scene.remove(this.group);
    this.scene.remove(this.flash);
    this.core.geometry.dispose();
    this.core.material.dispose();
    this.smoke.geometry.dispose();
    this.smoke.material.dispose();
    for (const p of this.bits) {
      p.geometry.dispose();
      p.material.dispose();
    }
  }
}

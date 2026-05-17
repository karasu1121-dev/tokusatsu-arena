import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

// Bone-name normalisation — strips Mixamo prefix, colons, separators,
// and trailing numeric ids so "mixamorig:LeftArm_09", "mixamorigLeftArm" and
// "CC_Base_L_Upperarm_041" can be compared.
const NORMALISE_RULES = [
  [/^mixamorig[:_]?/i, ''],
  [/^cc[_-]?base[_-]?/i, ''],
  [/[_:.\-\s]/g, ''],
  [/\d+$/g, ''],
];
function normaliseBoneName(name) {
  let n = name;
  for (const [re, repl] of NORMALISE_RULES) n = n.replace(re, repl);
  return n.toLowerCase();
}

// Equivalences between Mixamo naming (used in clip tracks) and other rigs'
// naming after normalisation. Empty string means same normalised name.
// We pre-normalise everything so e.g. "leftupleg" === "lupperleg" etc.
const ALIASES = {
  leftupleg:   ['lthigh', 'lupperleg'],
  leftleg:     ['lcalf', 'llowerleg', 'lknee'],
  leftfoot:    ['lfoot', 'lankle'],
  rightupleg:  ['rthigh', 'rupperleg'],
  rightleg:    ['rcalf', 'rlowerleg', 'rknee'],
  rightfoot:   ['rfoot', 'rankle'],
  leftshoulder:['lclavicle'],
  leftarm:     ['lupperarm', 'lshoulder', 'larm'],
  leftforearm: ['lforearm', 'llowerarm', 'lelbow'],
  lefthand:    ['lhand', 'lwrist'],
  rightshoulder:['rclavicle'],
  rightarm:    ['rupperarm', 'rshoulder', 'rarm'],
  rightforearm:['rforearm', 'rlowerarm', 'relbow'],
  righthand:   ['rhand', 'rwrist'],
  hips:        ['hip', 'pelvis', 'root'],
  spine:       ['waist', 'spine'],
  spine1:      ['spine', 'chest'],
  spine2:      ['chest', 'upperchest', 'spinetop'],
  neck:        ['neck', 'necktwist'],
  head:        ['head'],
};

function makeBoneKey(name) {
  const norm = normaliseBoneName(name);
  // Try direct match; if no aliases registered, just return the normalised name
  return norm;
}

// Build a {sourceBoneName: targetBoneName} map by name fuzzy-matching.
// `target` is the loaded rig (THREE Object3D); `source` is either another
// Object3D (the FBX skeleton) or any name iterator.
export function buildBoneMap(target, sourceNames) {
  const targetBones = [];
  target.traverse(o => {
    if (!o.isBone) return;
    if (o.name.toLowerCase().includes('twist')) return;     // skip extra twist joints
    if (o.name.toLowerCase().includes('sharebone')) return; // CC helper joints
    targetBones.push(o);
  });
  // Pre-compute normalised target names
  const targetNorm = targetBones.map(b => makeBoneKey(b.name));

  const map = {};
  for (const srcName of sourceNames) {
    const srcKey = makeBoneKey(srcName);
    // 1. Direct match
    let idx = targetNorm.indexOf(srcKey);
    // 2. Alias match
    if (idx === -1 && ALIASES[srcKey]) {
      for (const alt of ALIASES[srcKey]) {
        idx = targetNorm.indexOf(alt);
        if (idx !== -1) break;
      }
    }
    // 3. Reverse alias (target name in our alias table)
    if (idx === -1) {
      for (let i = 0; i < targetNorm.length; i++) {
        const t = targetNorm[i];
        if (ALIASES[t] && ALIASES[t].includes(srcKey)) { idx = i; break; }
      }
    }
    if (idx !== -1) map[srcName] = targetBones[idx].name;
  }
  return map;
}

// Snapshot every bone's local rest quaternion in a hierarchy.
function snapshotRest(root) {
  const rest = {};
  root.traverse(o => { if (o.isBone) rest[o.name] = o.quaternion.clone(); });
  return rest;
}

// Delta retargeting: for each frame, compute the rotation the source bone
// applied ON TOP of its T-pose (additionalLocal = inv(srcRest) · srcFrame),
// then apply that same local-frame delta on top of the target's T-pose
// (targetFrame = targetRest · additionalLocal). This cancels out the
// rest-pose difference that otherwise makes a Mixamo punch make the CC rig
// dive face-first.
// Bones whose local-frame axes differ enough between Mixamo and CC rigs that
// delta retargeting produces visibly wrong directions. Only relevant for
// non-Mixamo target rigs (Y Bot is Mixamo-native so retarget should be clean).
const RETARGET_SKIP_KEYS = new Set([
  // Empty by default — set per-rig if needed
]);
function shouldSkipBone(srcName) {
  return RETARGET_SKIP_KEYS.has(normaliseBoneName(srcName));
}

export function retargetClipDelta(sourceClip, boneMap, sourceRest, targetRest) {
  const newTracks = [];
  const qSrc = new THREE.Quaternion();
  const delta = new THREE.Quaternion();
  const qTgt = new THREE.Quaternion();
  for (const track of sourceClip.tracks) {
    const dot = track.name.lastIndexOf('.');
    const srcBone = track.name.slice(0, dot);
    const prop = track.name.slice(dot + 1);
    if (shouldSkipBone(srcBone)) continue;
    const tgtBone = boneMap[srcBone];
    if (!tgtBone) continue;
    if (prop === 'position') continue;          // physics drives translation
    if (prop !== 'quaternion') continue;        // skip scale tracks

    const srcRestQ = sourceRest[srcBone];
    const tgtRestQ = targetRest[tgtBone];
    if (!srcRestQ || !tgtRestQ) {
      // No rest snapshot — direct rename (will probably look wrong)
      const t = track.clone();
      t.name = tgtBone + '.' + prop;
      newTracks.push(t);
      continue;
    }
    const srcRestInv = srcRestQ.clone().invert();
    const v = track.values, n = v.length;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i += 4) {
      qSrc.set(v[i], v[i+1], v[i+2], v[i+3]);
      delta.copy(srcRestInv).multiply(qSrc);     // additional rotation in local frame
      qTgt.copy(tgtRestQ).multiply(delta);
      out[i]   = qTgt.x;
      out[i+1] = qTgt.y;
      out[i+2] = qTgt.z;
      out[i+3] = qTgt.w;
    }
    newTracks.push(new THREE.QuaternionKeyframeTrack(
      tgtBone + '.' + prop, track.times.slice(), out
    ));
  }
  return new THREE.AnimationClip(sourceClip.name, sourceClip.duration, newTracks);
}

// Load a Mixamo FBX, snapshot its T-pose, retarget the first animation
// onto the target model using delta retargeting.
export async function loadMixamoClip(url, targetModel) {
  const loader = new FBXLoader();
  const fbx = await loader.loadAsync(url);
  if (!fbx.animations || fbx.animations.length === 0) {
    throw new Error(`No animations in ${url}`);
  }
  const sourceRest = snapshotRest(fbx);
  const targetRest = snapshotRest(targetModel);
  const sourceBoneNames = Object.keys(sourceRest);
  const boneMap = buildBoneMap(targetModel, sourceBoneNames);
  const clip = retargetClipDelta(fbx.animations[0], boneMap, sourceRest, targetRest);
  const file = url.split('/').pop().replace(/\.fbx$/i, '');
  clip.name = file;
  return clip;
}

import { MMDAnimationHelper } from './vendor/animation/MMDAnimationHelper.js';
import { loadModel, loadMotion } from './motion.js';
import { ensureAmmo } from './physics.js';
import { detectBPM } from './audio/bpm.js';

/**
 * A dancing MMD (PMX/PMD) or VRM character, composable into a host three.js scene.
 * Multiple independent instances can share one scene/renderer/render-loop — each owns
 * its own mesh, MMDAnimationHelper, and (if enabled) physics world.
 */
export class DanceCharacter {
  /**
   * @param {import('three').Scene} scene - host-owned scene this character adds itself to
   * @param {Object} options
   * @param {string} options.modelUrl - PMX/PMD/VRM URL, or "archive.zip#/model.pmx"
   * @param {string} [options.motionUrl] - initial VMD motion to play once loaded
   * @param {boolean} [options.physics=true] - simulate cloth/hair physics (Ammo/Bullet)
   * @param {{baseBPM: number}} [options.syncToBPM] - scale motion playback speed to match
   *   a song's detected BPM relative to baseBPM (the tempo the motion was authored for)
   * @param {number} [options.afterglow=0] - see MMDAnimationHelper's afterglow option
   */
  constructor(scene, options = {}) {
    if (!options.modelUrl) {
      throw new Error('dance: DanceCharacter requires options.modelUrl');
    }

    this.scene = scene;
    this.physicsEnabled = options.physics !== false;
    this.syncToBPM = options.syncToBPM || null;
    this.playbackRate = 1;

    this.mesh = null;
    this.helper = new MMDAnimationHelper({ afterglow: options.afterglow ?? 0 });
    this._hasAnimation = false;

    this.ready = this._init(options);
  }

  async _init(options) {
    if (this.physicsEnabled) await ensureAmmo();

    this.mesh = await loadModel(options.modelUrl);
    this.scene.add(this.mesh);

    if (options.motionUrl) {
      await this._applyMotion(options.motionUrl);
    }

    return this;
  }

  /** The loaded THREE.SkinnedMesh (or VRM scene root), for direct scene manipulation. */
  get object3D() {
    return this.mesh;
  }

  async _applyMotion(motionUrl) {
    const clip = await loadMotion(motionUrl, this.mesh);
    // MMDAnimationHelper.add() throws if the mesh was already added — remove first so
    // playMotion() can be called repeatedly to switch motions on a loaded character.
    if (this._hasAnimation) this.helper.remove(this.mesh);
    this.helper.add(this.mesh, { animation: clip, physics: this.physicsEnabled });
    this._hasAnimation = true;
  }

  /**
   * Loads and plays a VMD motion (optionally "archive.zip#/motion.vmd") on this
   * already-loaded character, replacing any currently-playing motion.
   * @param {string} motionUrl
   */
  async playMotion(motionUrl) {
    await this.ready;
    await this._applyMotion(motionUrl);
  }

  /**
   * Runs BPM detection on an audio source. If `syncToBPM` was configured, also scales
   * this character's motion playback speed to match the detected tempo. Does not itself
   * play the audio out loud — pass the same source to your own <audio>/AudioContext if
   * you want playback, and call this in parallel for tempo sync.
   * @param {string|File|Blob|ArrayBuffer} source
   * @returns {Promise<{bpm: number}>}
   */
  async playAudio(source) {
    await this.ready;
    const { bpm } = await detectBPM(source);
    if (this.syncToBPM && bpm) {
      this.playbackRate = bpm / this.syncToBPM.baseBPM;
    }
    return { bpm };
  }

  /** Call once per frame from the host's render loop, after loading completes. */
  update(delta) {
    if (!this.mesh) return;
    this.helper.update(delta * this.playbackRate);
  }

  /** Removes this character from the scene and frees its GPU resources. */
  dispose() {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    this.mesh.geometry?.dispose();
    const materials = Array.isArray(this.mesh.material) ? this.mesh.material : [this.mesh.material];
    for (const material of materials) {
      material?.map?.dispose();
      material?.dispose();
    }
  }
}

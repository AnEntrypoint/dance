# @anentrypoint/dance

Drop a dancing MMD character into any three.js scene. Model + VMD motion playback, per-character physics (hair/skirt cloth via Ammo/Bullet), and audio-BPM-synced dancing. Supports multiple independent characters in one scene.

Your app owns the `THREE.Scene`, camera, renderer, and render loop — this library just adds a character into it and gives you `.update(delta)` to call each frame.

## Install

```sh
npm install @anentrypoint/dance three
```

`three` (>=0.150.0) is a peer dependency — bring your own version. `ammo.js` and `jszip` are regular dependencies, pulled in automatically.

### Buildless (no bundler)

`ammo.js` and `jszip` ship only as classic UMD builds, so a browser import map can't target them by bare specifier. Preload them as globals with classic `<script>` tags before your module script; the library checks for `globalThis.Ammo` / `globalThis.JSZip` first and only falls back to `import('ammo.js')` / `import('jszip')` for bundler consumers:

```html
<script src="path/to/jszip.min.js"></script>
<script src="path/to/ammo.js"></script>

<script type="importmap">
{ "imports": { "three": "path/to/three.module.js" } }
</script>

<script type="module">
import * as THREE from 'three';
import { DanceCharacter } from 'path/to/@anentrypoint/dance/src/index.js';
// ...
</script>
```

See `examples/multi-character.html` for a full working buildless demo.

## Quick start

```js
import * as THREE from 'three';
import { DanceCharacter } from '@anentrypoint/dance';

const scene = new THREE.Scene(); // you own this
const renderer = new THREE.WebGLRenderer();
// ...camera, lights, etc.

const dancer = new DanceCharacter(scene, {
  modelUrl: 'models/miku.pmx',       // or 'archive.zip#/model.pmx', or a .vrm
  motionUrl: 'motions/dance.vmd',    // optional initial motion
  physics: true,                     // default true; lazily inits a shared Ammo runtime on first use
  syncToBPM: { baseBPM: 120 },       // optional; playback speed scales with detected song BPM
});

await dancer.ready;

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  dancer.update(clock.getDelta());
  renderer.render(scene, camera);
});
```

## Multiple characters

Each `DanceCharacter` is fully independent — its own mesh, `MMDAnimationHelper`, and physics world. Add as many as you want to the same scene:

```js
const dancer1 = new DanceCharacter(scene, { modelUrl: 'a.pmx', motionUrl: 'x.vmd' });
const dancer2 = new DanceCharacter(scene, { modelUrl: 'b.pmx', motionUrl: 'y.vmd' });

renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();
  dancer1.update(delta);
  dancer2.update(delta);
  renderer.render(scene, camera);
});
```

## API

### `new DanceCharacter(scene, options)`

- `options.modelUrl` (required) — PMX/PMD/VRM URL, or `"archive.zip#/inner/path.pmx"` to load from a zip.
- `options.motionUrl` — optional initial VMD motion, same URL conventions as `modelUrl`.
- `options.physics` — default `true`. Set `false` to skip Ammo entirely.
- `options.syncToBPM` — `{ baseBPM }`. When set, `playAudio()` scales playback speed to match the detected song tempo against `baseBPM`.
- `options.afterglow` — passed through to the underlying `MMDAnimationHelper`.

**Properties**
- `.ready` — `Promise<this>`, resolves once the model (and initial motion, if given) has loaded.
- `.mesh` / `.object3D` — the loaded `THREE.SkinnedMesh`, added to `scene` automatically.
- `.playbackRate` — current animation speed multiplier (1 = normal; changed by `playAudio()` when `syncToBPM` is set).

**Methods**
- `await dancer.playMotion(motionUrl)` — load and switch to a new VMD motion.
- `await dancer.playAudio(source)` — run BPM detection on an audio `File`/`Blob`/`ArrayBuffer`/URL, returns `{ bpm }`. Data-driven — no drag-drop or dialog required. If `syncToBPM` was set, also updates `.playbackRate`.
- `dancer.update(delta)` — advance animation + physics by `delta` seconds. Call every frame.
- `dancer.dispose()` — remove from the scene and free geometry/material/physics resources.

### `detectBPM(source, options?)`

Standalone BPM detector, used internally by `playAudio()`. `source` is a `File`/`Blob`/`ArrayBuffer`/URL string. Returns `Promise<{ bpm, raw }>`. Runs in a Web Worker, off the main thread.

### `enableDragDrop(element, character, callbacks?)`

Optional convenience wiring: dropping a `.pmx`/`.vrm`/`.zip` file onto `element` calls `character.playMotion`-equivalent loading, `.vmd` calls `playMotion`, and audio files call `playAudio`. `callbacks` accepts `onMotion`, `onAudio`, `onModel`, `onError`.

### `loadModel(source)` / `loadMotion(source, mesh)` / `resolveSource(source)`

Lower-level helpers `DanceCharacter` is built on, exported for advanced use — direct `MMDLoader` access and the `archive.zip#/inner/path` resolution convention.

## Notes

- MMD assets (PMX models, VMD motions) are not bundled — bring your own.
- The underlying `MMDLoader`/`MMDAnimationHelper`/`MMDPhysics` addons are deprecated upstream in three.js (removed after r171) but vendored here (`src/vendor/`) so this library keeps working regardless of the host app's three.js version, as long as it satisfies the `>=0.150.0` peer range.
- Physics (`options.physics: true`) requires Ammo/Bullet WASM; the first `DanceCharacter` that needs it triggers a one-time shared runtime init, reused by all characters.

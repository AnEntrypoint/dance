let ammoPromise;

/**
 * Lazily initializes the shared Ammo (Bullet physics) WASM runtime, once, and exposes it
 * as globalThis.Ammo — the convention the vendored MMDPhysics addon expects. Safe to call
 * from multiple DanceCharacter instances; they all await the same underlying promise, and
 * each character's own MMDPhysics instance still creates its own independent physics
 * world (MMDPhysics.js constructs its own btDiscreteDynamicsWorld per instance).
 *
 * Resolves globalThis.Ammo if a host page already preloaded it (e.g. a buildless page
 * loading ammo.js via a classic <script> tag, since its UMD build isn't a real ES module
 * and can't be targeted by an import map's bare "ammo.js" specifier). Otherwise falls
 * back to a dynamic `import('ammo.js')`, which bundler-based consumers resolve normally
 * via node_modules.
 *
 * Different ammo.js builds disagree on what that global should be: some (e.g. the npm
 * `ammo.js` package) already invoke the Emscripten factory and expose a Promise/resolved
 * module; others (e.g. many WASM builds distributed for MMD viewers) expose the raw,
 * uncalled `Ammo(config?)` factory function instead. Both are handled below.
 * @returns {Promise<object>} the resolved Ammo module (Bullet class namespace)
 */
export function ensureAmmo() {
  if (!ammoPromise) {
    const source = globalThis.Ammo ?? import('ammo.js').then((m) => m.default ?? m);
    ammoPromise = Promise.resolve(source)
      .then((AmmoLib) => (typeof AmmoLib === 'function' ? AmmoLib() : AmmoLib))
      .then((AmmoLib) => {
        globalThis.Ammo = AmmoLib;
        return AmmoLib;
      });
  }
  return ammoPromise;
}

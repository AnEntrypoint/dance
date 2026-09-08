import { LoadingManager } from 'three';
import { MMDLoader } from './vendor/loaders/MMDLoader.js';

// jszip ships only as a UMD/CJS build (no "module"/ESM entry), so it can't be targeted
// by a browser import map's bare "jszip" specifier the way a real ES module can. Prefer
// a host-preloaded globalThis.JSZip (e.g. a buildless page loading it via a classic
// <script> tag); fall back to a dynamic import for bundler-based consumers, who resolve
// it normally via node_modules.
let jsZipPromise;
function loadJSZip() {
  if (!jsZipPromise) {
    jsZipPromise = Promise.resolve(globalThis.JSZip ?? import('jszip').then((m) => m.default ?? m));
  }
  return jsZipPromise;
}

// Cache of in-flight/completed zip extractions, keyed by the zip's own URL, so a model
// and a motion file that live in the same archive only trigger one fetch+extract.
const zipCache = new Map();

function extractZip(zipUrl) {
  let promise = zipCache.get(zipUrl);
  if (!promise) {
    promise = Promise.all([fetch(zipUrl).then((r) => r.arrayBuffer()), loadJSZip()])
      .then(([buf, JSZip]) => JSZip.loadAsync(buf))
      .then(async (zip) => {
        const map = {};
        for (const name in zip.files) {
          if (zip.files[name].dir) continue;
          const blob = await zip.files[name].async('blob');
          map[name] = URL.createObjectURL(blob);
        }
        return map;
      });
    zipCache.set(zipUrl, promise);
  }
  return promise;
}

/**
 * Resolves a source URL that may use the "archive.zip#/inner/path" convention into a
 * directly-fetchable URL, plus (for zip sources) a LoadingManager whose setURLModifier
 * redirects sibling-file requests (textures, toon maps, etc. — matched by filename) into
 * the extracted archive. Plain (non-zip) URLs pass through unchanged with no manager.
 *
 * @param {string} source
 * @returns {Promise<{url: string, manager: LoadingManager | undefined}>}
 */
export async function resolveSource(source) {
  const hashIndex = source.indexOf('#');
  if (hashIndex === -1 || !/\.zip$/i.test(source.slice(0, hashIndex))) {
    return { url: source, manager: undefined };
  }

  const zipUrl = source.slice(0, hashIndex);
  let innerPath = source.slice(hashIndex + 1);
  if (innerPath.startsWith('/')) innerPath = innerPath.slice(1);

  const map = await extractZip(zipUrl);

  const manager = new LoadingManager();
  manager.setURLModifier((requestUrl) => {
    const basename = decodeURIComponent(requestUrl).replace(/^.*[/\\]/, '');
    return map[basename] || map[Object.keys(map).find((k) => k.replace(/^.*[/\\]/, '') === basename)] || requestUrl;
  });

  const resolvedUrl = map[innerPath] || map[Object.keys(map).find((k) => k.replace(/^.*[/\\]/, '') === innerPath.replace(/^.*[/\\]/, ''))];
  if (!resolvedUrl) {
    throw new Error(`dance: "${innerPath}" not found in ${zipUrl}`);
  }

  return { url: resolvedUrl, manager };
}

/**
 * Loads a PMX/PMD model (optionally from a "archive.zip#/model.pmx" source) as a
 * THREE.SkinnedMesh.
 * @param {string} source
 * @returns {Promise<import('three').SkinnedMesh>}
 */
export async function loadModel(source) {
  const { url, manager } = await resolveSource(source);
  const loader = new MMDLoader(manager);
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

/**
 * Loads a VMD motion file (optionally from a "archive.zip#/motion.vmd" source) and
 * returns a THREE.AnimationClip bound to the given mesh's bones/morphs.
 * @param {string} source
 * @param {import('three').SkinnedMesh} mesh
 * @returns {Promise<import('three').AnimationClip>}
 */
export async function loadMotion(source, mesh) {
  const { url, manager } = await resolveSource(source);
  const loader = new MMDLoader(manager);
  return new Promise((resolve, reject) => {
    loader.loadAnimation(url, mesh, resolve, undefined, reject);
  });
}

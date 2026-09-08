const MODEL_RE = /\.(pmx|pmd|vrm|zip)$/i;
const MOTION_RE = /\.vmd$/i;
const AUDIO_RE = /\.(mp3|wav|aac|ogg)$/i;

/**
 * Optional convenience: wires drag-and-drop file handling on a DOM element to a
 * DanceCharacter — drop a .pmx/.pmd/.vrm/.zip to load a new model, a .vmd to play a
 * motion, or an .mp3/.wav/.aac/.ogg to run BPM detection (and sync, if configured).
 * Not required — the character's own playMotion()/playAudio() are the primary,
 * data-driven API this just forwards File objects into via object URLs.
 *
 * @param {HTMLElement} element
 * @param {import('./DanceCharacter.js').DanceCharacter} character
 * @param {{onModel?: Function, onMotion?: Function, onAudio?: Function, onError?: (err: Error) => void}} [callbacks]
 * @returns {() => void} teardown function — call to remove the listeners
 */
export function enableDragDrop(element, character, callbacks = {}) {
  const onDragOver = (event) => event.preventDefault();

  const onDrop = async (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;

    try {
      if (MOTION_RE.test(file.name)) {
        const url = URL.createObjectURL(file);
        await character.playMotion(url);
        callbacks.onMotion?.(file);
      } else if (AUDIO_RE.test(file.name)) {
        const result = await character.playAudio(file);
        callbacks.onAudio?.(file, result);
      } else if (MODEL_RE.test(file.name)) {
        // Reloading the model requires a fresh character in this v1 API — surface the
        // file for the host to handle (e.g. by constructing a new DanceCharacter).
        callbacks.onModel?.(file);
      }
    } catch (err) {
      callbacks.onError?.(err);
    }
  };

  element.addEventListener('dragover', onDragOver);
  element.addEventListener('drop', onDrop);

  return () => {
    element.removeEventListener('dragover', onDragOver);
    element.removeEventListener('drop', onDrop);
  };
}

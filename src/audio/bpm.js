// Adapted from js/audio_BPM_detection_portable.js — decoupled from the app's global
// DEBUG_show/para-object conventions into a plain Promise-based API. The lowpass-filter
// AudioBufferSourceNode graph in the original was dead code (never rendered via
// startRendering(), and the worker only ever consumed the raw decoded channel data), so
// it's omitted here.

const bpmWorkerUrl = new URL('./bpm-worker.js', import.meta.url);

async function toArrayBuffer(source) {
  if (source instanceof ArrayBuffer) return source;
  if (source instanceof Blob) return source.arrayBuffer();
  if (typeof source === 'string') return fetch(source).then((r) => r.arrayBuffer());
  throw new Error('dance: audio source must be a URL string, File, Blob, or ArrayBuffer');
}

/**
 * Detects the BPM (tempo) of an audio source.
 * @param {string|File|Blob|ArrayBuffer} source
 * @param {{onProgress?: (message: string) => void}} [options]
 * @returns {Promise<{bpm: number, raw: any[]}>}
 */
export async function detectBPM(source, options = {}) {
  const arrayBuffer = await toArrayBuffer(source);

  const offlineContext = new OfflineAudioContext(1, 2, 44100);
  const audioBuffer = await offlineContext.decodeAudioData(arrayBuffer.slice(0));

  return new Promise((resolve, reject) => {
    const worker = new Worker(bpmWorkerUrl);

    worker.onmessage = (e) => {
      if (typeof e.data === 'string') {
        if (e.data === 'OK') {
          const channelBuffer = audioBuffer.getChannelData(0).buffer;
          worker.postMessage(channelBuffer, [channelBuffer]);
          return;
        }
        options.onProgress?.(e.data);
        return;
      }

      worker.terminate();
      const beatZone = e.data;
      const bpm = beatZone?.[0]?.tempo_final ?? 0;
      resolve({ bpm, raw: beatZone });
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };
  });
}

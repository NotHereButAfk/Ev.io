import assert from 'node:assert/strict';
import { loadEvMap } from '../src/world/EvMapLoader.js';

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  await assert.rejects(loadEvMap('/map'), /503.*retry/i);

  // Covers a stalled response body as well as a request with no headers.
  for (const bodyStalls of [false, true]) {
    let aborted = false;
    const phases = [];
    globalThis.fetch = async (_url, { signal }) => {
      const stalled = new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          aborted = true;
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      });
      return bodyStalls ? { ok: true, arrayBuffer: () => stalled } : stalled;
    };
    await assert.rejects(loadEvMap('/map', {
      timeoutMs: 10,
      onProgress: (label, progress) => phases.push({ label, progress }),
    }), /timed out.*retry/i);
    assert.equal(aborted, true, 'timeout must abort the actual request');
    assert.deepEqual(phases, [{ label: 'Downloading arena...', progress: null }]);
  }
  console.log('map download recovery passed: HTTP failure, stalled headers and stalled body');
} finally {
  globalThis.fetch = originalFetch;
}

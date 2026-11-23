import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..');
const compiledWorkerPath = path.join(
  repoRoot,
  'apps',
  'desktop',
  'dist-electron',
  'simulationWorker.cjs',
);

function sendWorkerMessage<T>(worker: Worker, msg: unknown): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onMessage = (data: T) => {
      worker.off('error', onError);
      resolve(data);
    };
    const onError = (err: Error) => {
      worker.off('message', onMessage);
      reject(err);
    };
    worker.once('message', onMessage);
    worker.once('error', onError);
    worker.postMessage(msg);
  });
}

describe('Worker Thread de Simulação compilada (simulationWorker.cjs)', () => {
  it('responde ping, avança semana fora da thread principal e rejeita payload inválido via Zod', async () => {
    expect(fs.existsSync(compiledWorkerPath)).toBe(true);

    const worker = new Worker(compiledWorkerPath);
    try {
      const pingRes = await sendWorkerMessage<{
        requestId: number;
        ok: boolean;
        data?: { alive: boolean };
      }>(worker, { requestId: 1, type: 'ping' });

      expect(pingRes.ok).toBe(true);
      expect(pingRes.data?.alive).toBe(true);

      const advanceRes = await sendWorkerMessage<{
        requestId: number;
        ok: boolean;
        data?: { currentYear: number; currentWeek: number; durationMs: number; isFifaDate: boolean };
      }>(worker, {
        requestId: 2,
        type: 'advanceWeek',
        payload: { currentYear: 2026, currentWeek: 11, seed: 20260001 },
      });

      expect(advanceRes.ok).toBe(true);
      expect(advanceRes.data?.currentYear).toBe(2026);
      expect(advanceRes.data?.currentWeek).toBe(12);
      expect(advanceRes.data?.isFifaDate).toBe(true);
      expect(advanceRes.data?.durationMs).toBeLessThan(1000);

      const invalidRes = await sendWorkerMessage<{
        requestId: number;
        ok: boolean;
        error?: string;
      }>(worker, {
        requestId: 3,
        type: 'advanceWeek',
        payload: { currentYear: 2026, currentWeek: 99, seed: 1 },
      });

      expect(invalidRes.ok).toBe(false);
      expect(invalidRes.error).toBeDefined();
    } finally {
      await worker.terminate();
    }
  });
});

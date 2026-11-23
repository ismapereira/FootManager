import type { FootManagerBridgeApi } from '../../electron/preload.js';

/**
 * Declaração global da ponte IPC tipada exposta pelo `preload.ts` via `contextBridge`.
 */
declare global {
  interface Window {
    footManagerApi?: FootManagerBridgeApi;
  }
}

export {};

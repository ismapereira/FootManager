import type { PatchBundleData } from '@footmanager/schemas';
import {
  resolvePatchConflicts,
  type PrioritizedPatchBundle,
  type ResolvedPatchWorld,
} from './conflictResolver.js';

/**
 * Compila a Base Oficial (`priority = 0`) com os patches ativos em ordem de Load Order (`1..N`),
 * retornando o snapshot pronto para gravação isolada no banco SQLite de uma nova carreira (Seção 7.3).
 */
export function composeWorldFromPatches(
  coreBundle: PatchBundleData,
  activePatches: readonly PatchBundleData[],
): ResolvedPatchWorld {
  const prioritized: PrioritizedPatchBundle[] = [
    { priority: 0, bundle: coreBundle },
    ...activePatches.map((bundle, index) => ({
      priority: index + 1,
      bundle,
    })),
  ];

  return resolvePatchConflicts(prioritized);
}

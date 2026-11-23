import { parentPort } from 'node:worker_threads';
import { advanceWorldWeek } from '@footmanager/engine';
import { AdvanceWeekRequestSchema } from '@footmanager/schemas';

/**
 * Mensagens aceitas pela Worker Thread de simulação (Seção 11.2).
 * Mantém todo cálculo de rodada fora da thread principal e da UI (60 FPS garantidos).
 */
export type SimulationWorkerRequest =
  | { requestId: number; type: 'ping' }
  | { requestId: number; type: 'advanceWeek'; payload: unknown };

export type SimulationWorkerResponse =
  | { requestId: number; ok: true; data: unknown }
  | { requestId: number; ok: false; error: string };

if (!parentPort) {
  throw new Error('simulationWorker deve ser executado exclusivamente como Worker Thread.');
}

parentPort.on('message', (message: SimulationWorkerRequest) => {
  try {
    if (message.type === 'ping') {
      const response: SimulationWorkerResponse = {
        requestId: message.requestId,
        ok: true,
        data: { alive: true, timestamp: Date.now() },
      };
      parentPort?.postMessage(response);
      return;
    }

    if (message.type === 'advanceWeek') {
      const validated = AdvanceWeekRequestSchema.parse(message.payload);
      const result = advanceWorldWeek({
        currentYear: validated.currentYear,
        currentWeek: validated.currentWeek,
        seed: validated.seed,
      });

      const response: SimulationWorkerResponse = {
        requestId: message.requestId,
        ok: true,
        data: result,
      };
      parentPort?.postMessage(response);
      return;
    }

    parentPort?.postMessage({
      requestId: (message as { requestId?: number }).requestId ?? 0,
      ok: false,
      error: 'Tipo de comando desconhecido recebido pela simulationWorker.',
    } satisfies SimulationWorkerResponse);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro interno na simulação.';
    parentPort?.postMessage({
      requestId: message.requestId,
      ok: false,
      error: errorMessage,
    } satisfies SimulationWorkerResponse);
  }
});

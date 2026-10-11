import { RUN_POLL_INTERVAL_MS, RUN_PROGRESS_EVERY_MS, RUN_WAIT_TIMEOUT_MS } from './constants.js';
import { ToolError } from './errors.js';
import type { DevDigestApi } from './port.js';
import type { RunView } from './views.js';

/** Waits `ms` or until `signal` aborts, whichever comes first. Never rejects. */
export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

/** Timing of the poll loop; tests inject a fake clock. */
export interface WaitTiming {
  pollIntervalMs?: number;
  progressEveryMs?: number;
  timeoutMs?: number;
  sleep?: Sleep;
  now?: () => number;
}

export interface WaitOptions extends WaitTiming {
  /** Stop waiting (the run itself keeps going on the server). */
  signal?: AbortSignal;
  /** Called about every `progressEveryMs` while the run is still running. */
  onProgress?: (elapsedMs: number) => void;
}

type FinishedStatus = 'done' | 'failed' | 'cancelled';

/** A finished run, or why the wait stopped while it was still running. */
export type WaitOutcome =
  | { status: FinishedStatus; run: RunView }
  | { status: 'timeout' | 'aborted' };

/** `running` (or a legacy `null`) keeps the wait going. */
function isFinished(status: string | null): status is FinishedStatus {
  return status === 'done' || status === 'failed' || status === 'cancelled';
}

export const realSleep: Sleep = (ms, signal) =>
  new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });

/**
 * Polls `listRuns` until the run is no longer running. Never cancels the run on the server:
 * a timeout or abort only ends this wait.
 */
export async function waitForRun(
  api: Pick<DevDigestApi, 'listRuns'>,
  prId: string,
  runId: string,
  options: WaitOptions = {},
): Promise<WaitOutcome> {
  const pollIntervalMs = options.pollIntervalMs ?? RUN_POLL_INTERVAL_MS;
  const progressEveryMs = options.progressEveryMs ?? RUN_PROGRESS_EVERY_MS;
  const timeoutMs = options.timeoutMs ?? RUN_WAIT_TIMEOUT_MS;
  const sleep = options.sleep ?? realSleep;
  const now = options.now ?? Date.now;
  const { signal, onProgress } = options;

  const startedAt = now();
  let nextProgressAt = progressEveryMs;
  for (;;) {
    if (signal?.aborted) return { status: 'aborted' };
    const run = (await api.listRuns(prId)).find((r) => r.run_id === runId);
    if (!run) {
      throw new ToolError(`Review run "${runId}" is missing from the PR — check the DevDigest UI`);
    }
    if (isFinished(run.status)) return { status: run.status, run };

    const elapsed = now() - startedAt;
    if (elapsed >= timeoutMs) return { status: 'timeout' };
    if (signal?.aborted) return { status: 'aborted' };
    if (elapsed >= nextProgressAt) {
      onProgress?.(elapsed);
      while (nextProgressAt <= elapsed) nextProgressAt += progressEveryMs;
    }
    await sleep(Math.min(pollIntervalMs, timeoutMs - elapsed), signal);
  }
}

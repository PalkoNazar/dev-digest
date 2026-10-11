import type { IntentDeriver } from './intent/ports.js';

/** Narrow collaborators `ReviewService` gets from the composition root (`routes.ts`). */
export interface ReviewServiceDeps {
  /** Derives the PR intent before each review; absent → reviews run without intent. */
  intent?: IntentDeriver;
}

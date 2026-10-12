import type { OnboardingSectionId } from "@devdigest/shared";
import { SHORT_SHA_LENGTH } from "./constants";

/** DOM id of a section's `h2` — the On this page target and the region's label (AC-7, AC-8). */
export function sectionHeadingId(id: OnboardingSectionId): string {
  return `tour-${id}`;
}

/** DOM id of a section's collapsible body (`aria-controls` of its toggle, AC-9). */
export function sectionBodyId(id: OnboardingSectionId): string {
  return `tour-${id}-body`;
}

/** The short form of a commit SHA. */
export function shortSha(sha: string): string {
  return sha.slice(0, SHORT_SHA_LENGTH);
}

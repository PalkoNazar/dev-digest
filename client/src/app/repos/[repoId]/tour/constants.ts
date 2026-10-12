import type { IconName } from "@devdigest/ui";
import type { OnboardingSectionId } from "@devdigest/shared";

/** Header icon of each tour section (design 01/02). */
export const SECTION_ICONS: Record<OnboardingSectionId, IconName> = {
  architecture: "Boxes",
  critical_paths: "Activity",
  run_locally: "Command",
  reading_path: "ListChecks",
  first_tasks: "CheckCircle",
};

/** Characters a file path may take in a row before it is shortened in the middle (AC-67). */
export const PATH_MAX_CHARS = 72;

/** Length of a short commit SHA in the header and the Stale notice (AC-11, AC-55). */
export const SHORT_SHA_LENGTH = 7;

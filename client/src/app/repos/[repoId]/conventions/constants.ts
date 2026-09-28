import type { CandidateFilter } from "./helpers";

/** Lines of an evidence snippet shown on a card and copied into the skill body. */
export const SNIPPET_MAX_LINES = 12;

/** Status filter chips, in order. */
export const STATUS_FILTERS: CandidateFilter["status"][] = ["all", "pending", "accepted", "rejected"];

export const DEFAULT_FILTER: CandidateFilter = { status: "all", showTooling: false };

/** Confidence bar colour thresholds (same scale as the mockup: green / amber / red). */
export const CONFIDENCE_HIGH = 0.8;
export const CONFIDENCE_MID = 0.5;

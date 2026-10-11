import type { LogLine } from "@devdigest/ui";
import type { RunTrace, TraceSpecDoc } from "@devdigest/shared";

interface RawEvent {
  t: string;
  kind: string;
  msg: string;
}

/** Map run-bus events to the LiveLogStream LogLine shape. */
export function eventsToLog(events: RawEvent[]): LogLine[] {
  return events.map((e) => ({ t: e.t, k: e.kind as LogLine["k"], m: e.msg }));
}

/** Map a persisted trace's log to the LiveLogStream LogLine shape. */
export function traceLog(trace: RunTrace | undefined): LogLine[] {
  return trace?.log.map((l) => ({ t: l.t, k: l.kind as LogLine["k"], m: l.msg })) ?? [];
}

/** Seconds-formatted duration. */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Token in→out summary (e.g. "12k→1.5k"). */
export function formatTokens(tokensIn: number, tokensOut: number): string {
  return `${(tokensIn / 1000).toFixed(0)}k→${(tokensOut / 1000).toFixed(1)}k`;
}

/** One path on the "Specs read" row; `tag` marks a cut or dropped document (L05). */
export interface SpecsReadEntry {
  path: string;
  tag: "truncated" | "omitted" | null;
}

/**
 * The "Specs read" row: the injected paths in prompt order (tagged `truncated` when the
 * trace's project_context says so), then the paths omitted over the total budget.
 * Pre-L05 traces have no project_context and an empty `specs_read`.
 */
export function specsReadEntries(trace: RunTrace): SpecsReadEntry[] {
  const docs = trace.project_context ?? [];
  const truncated = new Set(docs.filter((d) => d.status === "truncated").map((d) => d.path));
  return [
    ...trace.specs_read.map((path) => ({
      path,
      tag: truncated.has(path) ? ("truncated" as const) : null,
    })),
    ...docs.filter((d) => d.status === "omitted").map((d) => ({ path: d.path, tag: "omitted" as const })),
  ];
}

/** The documents whose text went into the prompt (injected or truncated), in order. */
export function injectedSpecDocs(trace: RunTrace): TraceSpecDoc[] {
  return (trace.project_context ?? []).filter((d) => d.status !== "omitted");
}

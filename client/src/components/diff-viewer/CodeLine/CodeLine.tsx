/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, review findings anchored here (severity stripe + label,
   then the finding cards), any anchored comment threads, and an inline composer. */
"use client";

import React from "react";
import { SEV } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { fs, topSeverity, type DiffFindingApi } from "../findings";
import { type Line } from "../helpers";
import { s, lineRowFor, lineSignFor } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  findings = [],
  findingApi,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  /** Findings anchored to this line (shown only when `findingApi.show`). */
  findings?: FindingRecord[];
  findingApi?: DiffFindingApi;
}) {
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;
  const showFindings = !!findingApi?.show && findings.length > 0;
  const top = showFindings ? topSeverity(findings) : null;
  const sev = top ? SEV[top] : null;

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={sev ? { ...lineRowFor(ln.kind), ...fs.stripe(sev.c) } : lineRowFor(ln.kind)}>
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {sev && top && findingApi && (
          <span style={fs.label(sev.c, sev.bg)}>{findingApi.severityLabel(top)}</span>
        )}
      </div>

      {showFindings && findingApi && (
        <div style={cs.thread}>
          {findings.map((f) => (
            <React.Fragment key={f.id}>{findingApi.renderFinding(f)}</React.Fragment>
          ))}
        </div>
      )}

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}

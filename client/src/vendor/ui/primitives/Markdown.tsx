import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/** True inside a fenced code block, so its `<code>` is not drawn as an inline chip. */
const InPre = React.createContext(false);

/* Inline elements, shared by both variants. */
const inline: Components = {
  p: ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>,
  strong: ({ children }) => <strong style={{ fontWeight: 650, color: "var(--text-primary)" }}>{children}</strong>,
  code: function Code({ children }) {
    const inPre = React.useContext(InPre);
    if (inPre) return <code className="mono">{children}</code>;
    return (
      <code
        className="mono"
        style={{
          fontSize: "0.92em",
          padding: "1px 6px",
          borderRadius: 4,
          background: "var(--bg-hover)",
          color: "var(--accent-text)",
        }}
      >
        {children}
      </code>
    );
  },
  a: ({ children, href }) => (
    <a href={href} style={{ color: "var(--accent-text)", textDecoration: "underline" }}>
      {children}
    </a>
  ),
};

const heading = (fontSize: number, margin: string): React.CSSProperties => ({
  fontSize,
  fontWeight: 600,
  lineHeight: 1.3,
  margin,
  color: "var(--text-primary)",
});

/* Block elements for whole documents. Tailwind's preflight (loaded by styles.css)
   resets h1–h6 to body size/weight and removes list markers, so a document needs
   its block typography spelled out here. */
const document: Components = {
  ...inline,
  p: ({ children }) => <p style={{ margin: "0 0 12px" }}>{children}</p>,
  h1: ({ children }) => <h1 style={heading(22, "0 0 18px")}>{children}</h1>,
  h2: ({ children }) => <h2 style={heading(17, "28px 0 10px")}>{children}</h2>,
  h3: ({ children }) => <h3 style={heading(15, "22px 0 8px")}>{children}</h3>,
  h4: ({ children }) => <h4 style={heading(14, "18px 0 6px")}>{children}</h4>,
  h5: ({ children }) => <h5 style={heading(14, "18px 0 6px")}>{children}</h5>,
  h6: ({ children }) => <h6 style={heading(13, "18px 0 6px")}>{children}</h6>,
  ul: ({ children }) => <ul style={{ margin: "0 0 12px", paddingLeft: 22, listStyleType: "disc" }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ margin: "0 0 12px", paddingLeft: 22, listStyleType: "decimal" }}>{children}</ol>,
  li: ({ children }) => <li style={{ margin: "3px 0" }}>{children}</li>,
  pre: ({ children }) => (
    <pre
      className="mono"
      style={{
        margin: "0 0 14px",
        padding: "10px 12px",
        borderRadius: 6,
        border: "1px solid var(--border)",
        background: "var(--code-bg)",
        fontSize: 12.5,
        lineHeight: 1.5,
        overflowX: "auto",
      }}
    >
      <InPre.Provider value>{children}</InPre.Provider>
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote
      style={{
        margin: "0 0 12px",
        paddingLeft: 12,
        borderLeft: "3px solid var(--border-strong)",
        color: "var(--text-secondary)",
      }}
    >
      {children}
    </blockquote>
  ),
  hr: () => <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "20px 0" }} />,
  table: ({ children }) => (
    <div style={{ overflowX: "auto", margin: "0 0 14px" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 13 }}>{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th style={{ border: "1px solid var(--border)", padding: "6px 10px", textAlign: "left", fontWeight: 600 }}>
      {children}
    </th>
  ),
  td: ({ children }) => <td style={{ border: "1px solid var(--border)", padding: "6px 10px" }}>{children}</td>,
};

/** Markdown renderer (replaces prototype mdLite). Inline + GFM.
 *  `compact` (default) styles inline text only — for findings, comments and short bodies.
 *  `document` adds headings, lists, code blocks, quotes and tables — for whole files. */
export function Markdown({
  children,
  variant = "compact",
}: {
  children?: string | null;
  variant?: "compact" | "document";
}) {
  if (!children) return null;
  const isDoc = variant === "document";
  return (
    <div className="dd-md" style={{ fontSize: "inherit", lineHeight: isDoc ? 1.6 : 1.55 }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={isDoc ? document : inline}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

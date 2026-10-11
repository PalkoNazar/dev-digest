/* TourMarkdown — tour section text through the design-system Markdown, unchanged: no raw
   HTML is rendered (AC-60), and grounded repo paths arrive from the server as inline code,
   never as links to repo files (AC-79, plan R8). */
import { Markdown } from "@devdigest/ui";

export function TourMarkdown({ md }: { md: string | null }) {
  return <Markdown variant="document">{md}</Markdown>;
}

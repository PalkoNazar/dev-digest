"use client";

import { useParams } from "next/navigation";
import { ConventionsView } from "./_components/ConventionsView";

/* Route: /repos/:repoId/conventions (L02 homework — Conventions Extractor). */
export default function ConventionsPage() {
  const { repoId } = useParams<{ repoId: string }>();
  return <ConventionsView repoId={repoId} />;
}

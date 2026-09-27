"use client";

import { useParams } from "next/navigation";
import { SkillEditorView } from "../_components/SkillEditorView";

/* Route: /skills/:id — edit a skill. */
export default function SkillPage() {
  const { id } = useParams<{ id: string }>();
  return <SkillEditorView id={id} />;
}

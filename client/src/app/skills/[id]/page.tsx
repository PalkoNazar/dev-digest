"use client";

import { useParams } from "next/navigation";
import { SkillsWorkspace } from "../_components/SkillsWorkspace";

/* Route: /skills/:id — the list with the selected skill (Config / Preview /
   Versions via ?tab=) on the right. */
export default function SkillPage() {
  const { id } = useParams<{ id: string }>();
  return <SkillsWorkspace id={id} />;
}

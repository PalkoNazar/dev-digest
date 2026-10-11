/* hooks/context.ts — React Query hooks for L05 Project Context:
     GET /repos/:id/context              → SpecFile[] (the repo's Markdown docs)
     GET /repos/:id/context/file?path=   → SpecFile with `content`
     GET|PUT /agents/:id/context         → ContextAttachments (agent Context tab)
     GET|PUT /skills/:id/context         → ContextAttachments (skill Context tab)
   Saves are not optimistic (plan R3): the tab shows the server's answer, and a
   failed save leaves the cached view as it was (the global MutationCache toasts). */
"use client";

import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ContextAttachments, ContextAttachInput, SpecFile } from "@devdigest/shared";

/** The repo's documents; `used_by` changes when an agent's or skill's list is saved. */
export function useContextDocs(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["context", repoId],
    queryFn: () => api.get<SpecFile[]>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

/** One document with its text, for the preview pane / modal. */
export function useContextDoc(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: ["context-doc", repoId, path],
    queryFn: () =>
      api.get<SpecFile>(`/repos/${repoId}/context/file?path=${encodeURIComponent(path ?? "")}`),
    enabled: !!repoId && !!path,
  });
}

/**
 * After a resync (Project Context refresh): re-read the list, every open document
 * preview and the agent/skill Context views (row tokens and missing rows can change).
 */
export function useInvalidateRepoDocs(repoId: string) {
  const qc = useQueryClient();
  return React.useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["context", repoId] });
    void qc.invalidateQueries({ queryKey: ["context-doc", repoId] });
    void qc.invalidateQueries({ queryKey: ["agent-context"] });
    void qc.invalidateQueries({ queryKey: ["skill-context"] });
  }, [qc, repoId]);
}

type Owner = "agents" | "skills";

/* Keys start with the owner, never with ["context", repoId]: a save invalidates
   ["context", repoId] (used_by), which must not refetch the view it just wrote. */
function viewKey(owner: Owner, id: string | null | undefined, repoId: string | null | undefined) {
  return [owner === "agents" ? "agent-context" : "skill-context", id, repoId];
}

function useOwnerContext(owner: Owner, id: string | null | undefined, repoId: string | null | undefined) {
  return useQuery({
    queryKey: viewKey(owner, id, repoId),
    queryFn: () =>
      api.get<ContextAttachments>(`/${owner}/${id}/context?repo_id=${encodeURIComponent(repoId ?? "")}`),
    enabled: !!id && !!repoId,
  });
}

function useSetOwnerContext(owner: Owner, id: string, repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    // One scope per owner: saves run strictly in order (each sends the whole list).
    scope: { id: `${owner === "agents" ? "agent" : "skill"}-context-${id}` },
    mutationFn: (paths: string[]) =>
      api.put<ContextAttachments>(`/${owner}/${id}/context`, {
        repo_id: repoId,
        paths,
      } satisfies ContextAttachInput),
    onSuccess: (data) => {
      qc.setQueryData(viewKey(owner, id, repoId), data);
      qc.invalidateQueries({ queryKey: ["context", repoId] });
      // A skill's documents are inherited by the agents that use it.
      if (owner === "skills") qc.invalidateQueries({ queryKey: ["agent-context"] });
    },
  });
}

/** The agent's Context tab view for one repo. */
export function useAgentContext(agentId: string | null | undefined, repoId: string | null | undefined) {
  return useOwnerContext("agents", agentId, repoId);
}

/** Replace the agent's ordered document list for one repo. */
export function useSetAgentContext(agentId: string, repoId: string) {
  return useSetOwnerContext("agents", agentId, repoId);
}

/** The skill's Context tab view for one repo. */
export function useSkillContext(skillId: string | null | undefined, repoId: string | null | undefined) {
  return useOwnerContext("skills", skillId, repoId);
}

/** Replace the skill's ordered document list for one repo. */
export function useSetSkillContext(skillId: string, repoId: string) {
  return useSetOwnerContext("skills", skillId, repoId);
}

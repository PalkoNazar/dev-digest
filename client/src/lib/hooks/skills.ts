/* hooks/skills.ts — React Query hooks for the L02 Skills page, skill editor,
   import preview and the agent editor's Skills tab. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AgentSkillLink,
  Skill,
  SkillCreate,
  SkillImportPreview,
  SkillStats,
  SkillUpdate,
  SkillVersion,
} from "@devdigest/shared";

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

/** Body history of a skill, newest first. */
export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

/** Stats tab: agents using the skill, pull rate, finding outcomes (server window). */
export function useSkillStats(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-stats", id],
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
    enabled: !!id,
  });
}

/** Skill edits change what agents see (skill counts on agent cards). */
function invalidateSkillViews(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["skills"] });
  qc.invalidateQueries({ queryKey: ["agents"] });
  qc.invalidateQueries({ queryKey: ["agent"] });
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SkillCreate) => api.post<Skill>("/skills", input),
    onSuccess: (data) => {
      qc.setQueryData(["skill", data.id], data);
      invalidateSkillViews(qc);
    },
  });
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SkillUpdate }) =>
      api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.setQueryData(["skill", data.id], data);
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
      invalidateSkillViews(qc);
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: ["skill", id] });
      invalidateSkillViews(qc);
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
    },
  });
}

/** Parse a .md / .zip upload into a preview. The server stores nothing. */
export function useImportSkillPreview() {
  return useMutation({
    mutationFn: (input: { filename: string; content_base64: string }) =>
      api.post<SkillImportPreview>("/skills/import/preview", input),
  });
}

/** The agent's ordered skill links (skill_id + order + per-agent enabled). */
export function useAgentSkillLinks(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

export interface SkillLinkDraft {
  skill_id: string;
  enabled: boolean;
}

/** Replace the agent's ordered skill set. Optimistic: the list reorders at once. */
export function useSetAgentSkillLinks(agentId: string) {
  const qc = useQueryClient();
  const key = ["agent-skills", agentId];
  return useMutation({
    mutationFn: (links: SkillLinkDraft[]) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { links }),
    onMutate: async (links) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<AgentSkillLink[]>(key);
      qc.setQueryData<AgentSkillLink[]>(
        key,
        links.map((l, order) => ({
          agent_id: agentId,
          skill_id: l.skill_id,
          enabled: l.enabled,
          order,
        })),
      );
      return { previous };
    },
    onError: (_e, _links, ctx) => {
      // Restore the pre-save list; with nothing cached before, setQueryData(undefined)
      // is a no-op, so also re-read the server's list to drop the optimistic one.
      if (ctx?.previous !== undefined) qc.setQueryData(key, ctx.previous);
      qc.invalidateQueries({ queryKey: key });
    },
    onSuccess: (data) => {
      qc.setQueryData(key, data);
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["agent", agentId] });
      // Skill cards show agent_count and the Stats tab lists attached agents.
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["skill"] });
      qc.invalidateQueries({ queryKey: ["skill-stats"] });
    },
  });
}

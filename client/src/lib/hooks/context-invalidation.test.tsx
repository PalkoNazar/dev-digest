import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentSkillLink, ContextAttachments, Skill } from "@devdigest/shared";

/* L05 R3 · B1 — the agent's Context view (useAgentContext) is derived on the server
   from the agent's skill links and each skill's state: a skill's documents are
   inherited only while the skill is linked, enabled for the agent and enabled itself.
   A mutation that changes one of those inputs must leave the view stale so it is
   re-read. The view is observed through useAgentContext, so the test does not depend
   on the query key the hook file picks. Real QueryClient, fake transport. */

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
const del = vi.fn();
vi.mock("../api", () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
    put: (...args: unknown[]) => put(...args),
    del: (...args: unknown[]) => del(...args),
  },
}));

import { useAgentContext } from "./context";
import { useDeleteSkill, useSetAgentSkillLinks, useUpdateSkill } from "./skills";

const REPO = "11111111-1111-4111-8111-111111111111";
const VIEW_URL = `/agents/ag1/context?repo_id=${REPO}`;

const VIEW: ContextAttachments = {
  repo_id: REPO,
  rows: [{ path: "specs/a.md", category: "specs", tokens: 120, state: "attached", via: [] }],
  attached: 1,
  total: 1,
  tokens: 120,
};

const LINKS: AgentSkillLink[] = [{ agent_id: "ag1", skill_id: "sk1", order: 0, enabled: false }];

const viewReads = () => get.mock.calls.filter(([url]) => url === VIEW_URL).length;

/** Mount the agent's view next to `useMutationHook`, wait for the first read. */
async function setup<T>(useMutationHook: () => T) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () => ({ view: useAgentContext("ag1", REPO), mutation: useMutationHook() }),
    { wrapper },
  );
  await waitFor(() => expect(result.current.view.data).toEqual(VIEW));
  expect(viewReads()).toBe(1);
  return { result };
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  put.mockReset();
  del.mockReset();
  get.mockImplementation((url: string) =>
    Promise.resolve(url === VIEW_URL ? VIEW : []),
  );
});

describe("agent Context view after a skill change (B1)", () => {
  it("is re-read after the agent's skill links are saved", async () => {
    post.mockResolvedValue(LINKS);
    const { result } = await setup(() => useSetAgentSkillLinks("ag1"));

    await act(async () => {
      await result.current.mutation.mutateAsync([{ skill_id: "sk1", enabled: false }]);
    });

    await waitFor(() => expect(viewReads()).toBe(2));
  });

  it("is re-read after a skill is switched off", async () => {
    put.mockResolvedValue({ id: "sk1", enabled: false } as Skill);
    const { result } = await setup(() => useUpdateSkill());

    await act(async () => {
      await result.current.mutation.mutateAsync({ id: "sk1", patch: { enabled: false } });
    });

    await waitFor(() => expect(viewReads()).toBe(2));
  });

  it("is re-read after a skill is deleted", async () => {
    del.mockResolvedValue({ ok: true });
    const { result } = await setup(() => useDeleteSkill());

    await act(async () => {
      await result.current.mutation.mutateAsync("sk1");
    });

    await waitFor(() => expect(viewReads()).toBe(2));
  });
});

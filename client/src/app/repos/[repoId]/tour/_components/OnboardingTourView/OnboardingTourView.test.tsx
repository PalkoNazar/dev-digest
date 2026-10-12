import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type {
  OnboardingGeneration,
  OnboardingSkeletonReason,
  OnboardingTour,
  OnboardingView,
} from "@devdigest/shared";
import onboardingMessages from "../../../../../../../messages/en/onboarding.json";
import commonMessages from "../../../../../../../messages/en/common.json";

/* SPEC-02 S16 — the tour page shell, its states and status banners.
   The data layer (@/lib/hooks/onboarding, useRefreshRepo) and the repo context are
   mocked; section bodies (S17) render for real, MermaidDiagram is stubbed. */

const tourState: {
  data?: OnboardingView;
  isLoading: boolean;
  isError: boolean;
} = { data: undefined, isLoading: false, isError: false };
const refetch = vi.fn();
const generateState = { isPending: false };
const generate = vi.fn();
const refreshState = { isPending: false };
const refreshRepo = vi.fn();
const repoState = { notFound: false };

vi.mock("@/lib/hooks/onboarding", () => ({
  useOnboardingTour: () => ({ ...tourState, refetch }),
  useGenerateOnboardingTour: () => ({ ...generateState, mutate: generate }),
}));
vi.mock("@/lib/hooks/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hooks/core")>()),
  useRefreshRepo: () => ({ ...refreshState, mutate: refreshRepo }),
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    repoId: "r1",
    repos: [{ id: "r1", full_name: "acme/payments-api" }],
    activeRepo: { id: "r1", full_name: "acme/payments-api" },
    reposLoaded: true,
    setRepoId: vi.fn(),
  }),
  useRepoNotFound: () => repoState.notFound,
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/mermaid-diagram", () => ({
  MermaidDiagram: () => <div data-testid="mermaid" />,
  default: () => <div data-testid="mermaid" />,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/repos/r1/tour",
  useParams: () => ({ repoId: "r1" }),
}));

import { OnboardingTourView } from "./OnboardingTourView";

const NOW = new Date("2026-10-12T12:00:00.000Z");
const TWO_HOURS_AGO = "2026-10-12T10:00:00.000Z";
const TOUR_SHA = "abcdef1234567890abcdef1234567890abcdef12";
const INDEX_SHA = "1234567fedcba0987654321fedcba0987654321f";

/** The five sections, in the order AC-6 requires. */
const SECTION_TITLES = [
  "Architecture overview",
  "Critical paths",
  "How to run locally",
  "Guided reading path",
  "First tasks",
];

const ARCH_BODY = "Payments API fronts the payment provider.";

function makeTour(over: Partial<OnboardingTour> = {}): OnboardingTour {
  return {
    kind: "llm",
    skeleton_reason: null,
    reason_detail: null,
    languages_indexed: true,
    index: { status: "full", reason: null, files_indexed: 342, files_total: 342 },
    commit_sha: TOUR_SHA,
    generated_at: TWO_HOURS_AGO,
    model: "openai/gpt-4o-mini",
    tokens_in: 9000,
    tokens_out: 2000,
    cost_usd: 0.0123,
    llm_calls: 1,
    removed_ungrounded: 0,
    sections: {
      architecture: { body_md: ARCH_BODY, diagram: null, stack: ["TypeScript"], folders: [{ path: "src", files: 120 }] },
      critical_paths: {
        body_md: null,
        entries: [{ root: "src/server.ts", chain: ["src/app.ts"], importers: 4, description: "App bootstrap" }],
      },
      run_locally: { body_md: null, steps: [{ command: "pnpm install" }], source: "llm" },
      reading_path: { body_md: null, items: [{ path: "src/server.ts", reason: "Entry point" }] },
      first_tasks: { body_md: "Add a health check." },
    },
    ...over,
  };
}

function makeGeneration(over: Partial<OnboardingGeneration> = {}): OnboardingGeneration {
  return {
    id: "g1",
    status: "done",
    outcome: "stored",
    reason: null,
    detail: null,
    started_at: TWO_HOURS_AGO,
    finished_at: TWO_HOURS_AGO,
    ...over,
  };
}

function makeView(over: Partial<OnboardingView> = {}): OnboardingView {
  return {
    repo_id: "r1",
    tour: makeTour(),
    generation: null,
    clone_ready: true,
    indexing: false,
    current_commit_sha: TOUR_SHA,
    ...over,
  };
}

function renderView() {
  return render(
    <NextIntlClientProvider
      locale="en"
      now={NOW}
      timeZone="UTC"
      messages={{ onboarding: onboardingMessages, common: commonMessages }}
    >
      <OnboardingTourView repoId="r1" />
    </NextIntlClientProvider>,
  );
}

const sectionHeading = (title: string) => screen.getByRole("heading", { level: 2, name: title });
const generateButton = () => screen.getByRole("button", { name: /^generate/i });
const regenerateButtons = () => screen.queryAllByRole("button", { name: /regenerate/i });

/** The innermost element whose whole text matches every pattern, so a message may wrap
 *  parts of itself (a count, a SHA) in child elements. */
function textBlock(...patterns: RegExp[]): HTMLElement {
  const matches = (el: Element | null) => !!el && patterns.every((p) => p.test(el.textContent ?? ""));
  const found = screen.queryAllByText(
    (_content, el) => matches(el) && !Array.from(el!.children).some((child) => matches(child)),
  );
  if (found.length === 0) throw new Error(`No element with text matching ${patterns.join(" + ")}`);
  return found[0]!;
}
const hasTextBlock = (...patterns: RegExp[]) =>
  screen.queryAllByText((_c, el) => !!el && patterns.every((p) => p.test(el.textContent ?? ""))).length > 0;

/** `a` comes before `b` in document order. */
function expectBefore(a: Element, b: Element) {
  expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  Object.assign(tourState, { data: undefined, isLoading: false, isError: false });
  generateState.isPending = false;
  refreshState.isPending = false;
  repoState.notFound = false;
  refetch.mockReset();
  generate.mockReset();
  refreshRepo.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("OnboardingTourView — page states", () => {
  it("asks to import or select a repo when the repo is unknown (AC-3)", () => {
    repoState.notFound = true;
    tourState.data = makeView();
    renderView();
    expect(screen.getByText("No repo selected")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Architecture overview" })).not.toBeInTheDocument();
  });

  it("shows a loading state, not the empty state, while the tour loads (AC-4)", () => {
    tourState.isLoading = true;
    const { container } = renderView();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole("button", { name: /^generate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Architecture overview" })).not.toBeInTheDocument();
  });

  it("shows an error with Retry that re-reads the tour (AC-10)", () => {
    tourState.isError = true;
    renderView();
    const alert = screen.getByRole("alert");
    fireEvent.click(within(alert).getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows an empty state naming the five sections, with Generate (AC-5)", () => {
    tourState.data = makeView({ tour: null });
    renderView();
    for (const title of SECTION_TITLES) textBlock(new RegExp(title, "i"));
    expect(screen.queryByRole("heading", { level: 2, name: "Architecture overview" })).not.toBeInTheDocument();
    const button = generateButton();
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("offers Resync through the existing repo refresh, in place of Generate, when there is no clone (AC-84, EC-24)", () => {
    tourState.data = makeView({ tour: null, clone_ready: false });
    renderView();
    expect(screen.queryByRole("button", { name: /^generate/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /resync/i }));
    expect(refreshRepo).toHaveBeenCalledTimes(1);
    expect(refreshRepo.mock.calls[0]![0]).toBe("r1");
    expect(generate).not.toHaveBeenCalled();
  });

  it("disables Generate and says indexing is in progress while the clone or index job runs (AC-52)", () => {
    tourState.data = makeView({ tour: null, indexing: true });
    renderView();
    expect(generateButton()).toBeDisabled();
    textBlock(/indexing in progress/i);
  });

  it("shows Generating… disabled while the first generation runs (AC-13)", () => {
    tourState.data = makeView({
      tour: null,
      generation: makeGeneration({ status: "running", outcome: null, finished_at: null }),
    });
    renderView();
    expect(screen.getByRole("button", { name: /generating/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^generate/i })).not.toBeInTheDocument();
  });

  it("disables Generate while the generate request is in flight (AC-13, EC-9)", () => {
    tourState.data = makeView({ tour: null });
    generateState.isPending = true;
    renderView();
    const button = screen.queryByRole("button", { name: /^generate/i }) ?? screen.getByRole("button", { name: /generating/i });
    expect(button).toBeDisabled();
  });
});

describe("OnboardingTourView — a stored tour", () => {
  it("shows the five sections in the AC-6 order, each a labelled region with an h2 (AC-6)", () => {
    tourState.data = makeView();
    renderView();
    const headings = SECTION_TITLES.map(sectionHeading);
    for (let i = 1; i < headings.length; i++) expectBefore(headings[i - 1]!, headings[i]!);
    for (const title of SECTION_TITLES) expect(screen.getByRole("region", { name: title })).toBeInTheDocument();
  });

  it("lists one On this page entry per section, in order (AC-7)", () => {
    tourState.data = makeView();
    renderView();
    const nav = screen.getByRole("navigation", { name: /on this page/i });
    const entries = within(nav).getAllByRole("button").map((b) => b.textContent?.trim());
    expect(entries).toEqual(SECTION_TITLES);
  });

  it("scrolls to the section and moves focus to its heading when an entry is activated (AC-8)", () => {
    tourState.data = makeView();
    renderView();
    const nav = screen.getByRole("navigation", { name: /on this page/i });
    fireEvent.click(within(nav).getByRole("button", { name: "Guided reading path" }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(sectionHeading("Guided reading path")).toHaveFocus();
  });

  it("collapses a section with a keyboard-reachable button that exposes aria-expanded (AC-9)", () => {
    tourState.data = makeView();
    renderView();
    for (const title of SECTION_TITLES) {
      const toggle = within(screen.getByRole("region", { name: title })).getByRole("button", { expanded: true });
      expect(toggle).toHaveAttribute("aria-controls");
    }
    const region = screen.getByRole("region", { name: "Architecture overview" });
    expect(within(region).getByText(ARCH_BODY)).toBeVisible();
    const toggle = within(region).getByRole("button", { expanded: true });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const body = screen.queryByText(ARCH_BODY);
    if (body) expect(body).not.toBeVisible();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(ARCH_BODY)).toBeVisible();
  });

  it("header shows files indexed, the short SHA and the generated time; no Share link, no model or cost (AC-11, EC-25, P7)", () => {
    tourState.data = makeView();
    renderView();
    textBlock(/index of 342 files/i);
    expect(screen.getAllByText(/abcdef1/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/abcdef12/)).not.toBeInTheDocument();
    expect(screen.getByText(/2 hours ago/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /share/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /share/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/gpt-4o-mini/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$0\.01/)).not.toBeInTheDocument();
    // A complete index needs no "N of M" line.
    expect(hasTextBlock(/source files indexed/i)).toBe(false);
  });

  it("header shows 'N of M source files indexed' when the index left files out (AC-53, EC-1)", () => {
    tourState.data = makeView({
      tour: makeTour({ index: { status: "partial", reason: "5,000-file limit", files_indexed: 5000, files_total: 12450 } }),
    });
    renderView();
    textBlock(/5,000 of 12,450 source files indexed/i);
  });

  it("Regenerate starts a generation; while it runs the button shows Generating… disabled and the stored tour stays (AC-13, AC-15)", () => {
    tourState.data = makeView();
    const { unmount } = renderView();
    const [regenerate] = regenerateButtons();
    expect(regenerate).toBeEnabled();
    fireEvent.click(regenerate!);
    expect(generate).toHaveBeenCalledTimes(1);
    unmount();

    tourState.data = makeView({ generation: makeGeneration({ status: "running", outcome: null, finished_at: null }) });
    renderView();
    expect(screen.getByRole("button", { name: /generating/i })).toBeDisabled();
    for (const button of regenerateButtons()) expect(button).toBeDisabled();
    for (const title of SECTION_TITLES) expect(sectionHeading(title)).toBeInTheDocument();
    expect(screen.getByText(ARCH_BODY)).toBeInTheDocument();
  });
});

describe("OnboardingTourView — status banners (text, not colour only)", () => {
  const REASON_TEXT: Record<OnboardingSkeletonReason, RegExp> = {
    no_llm_key: /no LLM key/i,
    llm_error: /LLM error/i,
    llm_timeout: /timed out/i,
    invalid_output: /invalid LLM output/i,
    index_degraded: /index (is )?degraded/i,
    index_failed: /index (has )?failed/i,
    index_off: /switched off/i,
  };

  it.each(Object.entries(REASON_TEXT) as [OnboardingSkeletonReason, RegExp][])(
    "a skeleton tour names its reason: %s (AC-46)",
    (reason, text) => {
      tourState.data = makeView({
        tour: makeTour({ kind: "skeleton", skeleton_reason: reason, llm_calls: 0, model: null }),
      });
      renderView();
      textBlock(text);
    },
  );

  it("a missing-key skeleton links to the API keys settings (AC-48)", () => {
    tourState.data = makeView({ tour: makeTour({ kind: "skeleton", skeleton_reason: "no_llm_key", llm_calls: 0 }) });
    renderView();
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/settings/api-keys");
  });

  it("an LLM tour has no skeleton banner and no settings link", () => {
    tourState.data = makeView();
    renderView();
    for (const text of Object.values(REASON_TEXT)) expect(hasTextBlock(text)).toBe(false);
    const hrefs = screen.queryAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).not.toContain("/settings/api-keys");
  });

  it("a tour built from a partial index names the status and its reason (AC-47)", () => {
    tourState.data = makeView({
      tour: makeTour({ index: { status: "partial", reason: "over the 5,000-file limit", files_indexed: 5000, files_total: 12450 } }),
    });
    renderView();
    textBlock(/partial/i, /over the 5,000-file limit/);
  });

  it("says the languages are not indexed and why reading path and critical paths are empty (AC-40)", () => {
    tourState.data = makeView({ tour: makeTour({ languages_indexed: false }) });
    renderView();
    textBlock(/languages not indexed/i, /reading path and critical paths are empty/i);
  });

  it("shows how many ungrounded items the server removed, and nothing when none were (AC-58)", () => {
    tourState.data = makeView({ tour: makeTour({ removed_ungrounded: 3 }) });
    const { unmount } = renderView();
    textBlock(/3 ungrounded items removed/i);
    unmount();

    tourState.data = makeView({ tour: makeTour({ removed_ungrounded: 0 }) });
    renderView();
    expect(hasTextBlock(/ungrounded/i)).toBe(false);
  });

  it("shows 'Last regeneration failed: <reason>' above the kept tour (AC-78, EC-13, EC-28)", () => {
    tourState.data = makeView({
      generation: makeGeneration({ outcome: "kept_previous", reason: "llm_timeout" }),
    });
    renderView();
    const banner = textBlock(/last regeneration failed/i, /timed out/i);
    expectBefore(banner, sectionHeading("Architecture overview"));
  });

  it("says the generation failed when it failed outside the LLM, keeping the stored tour (Q5)", () => {
    tourState.data = makeView({
      generation: makeGeneration({ status: "failed", outcome: null, reason: null, detail: "git error" }),
    });
    renderView();
    textBlock(/generation failed/i);
    expect(sectionHeading("Architecture overview")).toBeInTheDocument();
  });

  it("shows a Stale notice with both short SHAs and a Regenerate action when the index moved (AC-55, EC-12)", () => {
    tourState.data = makeView({ current_commit_sha: INDEX_SHA });
    renderView();
    textBlock(/stale/i, /abcdef1/, /1234567/);
    // The header's Regenerate plus the notice's own.
    const buttons = regenerateButtons();
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]!);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("shows no Stale notice when the index is at the tour's commit or unknown (AC-55)", () => {
    tourState.data = makeView({ current_commit_sha: TOUR_SHA });
    const { unmount } = renderView();
    expect(hasTextBlock(/stale/i)).toBe(false);
    expect(regenerateButtons()).toHaveLength(1);
    unmount();

    tourState.data = makeView({ current_commit_sha: null });
    renderView();
    expect(hasTextBlock(/stale/i)).toBe(false);
  });
});

describe("OnboardingTourView — correctness review repros (R4)", () => {
  it("re-reads the onboarding view once the Resync of a missing clone has finished (B1, AC-84)", () => {
    type MutateOptions = { onSuccess?: (...args: unknown[]) => void; onSettled?: (...args: unknown[]) => void };
    let options: MutateOptions | undefined;
    refreshRepo.mockImplementation((_repoId: string, opts?: MutateOptions) => {
      options = opts;
    });
    tourState.data = makeView({ tour: null, clone_ready: false });
    renderView();

    fireEvent.click(screen.getByRole("button", { name: /resync/i }));
    expect(refreshRepo).toHaveBeenCalledTimes(1);
    expect(refreshRepo.mock.calls[0]![0]).toBe("r1");
    // Nothing re-read yet: the refresh request is still in flight.
    expect(refetch).not.toHaveBeenCalled();

    // The refresh succeeds — the page must ask for the onboarding view again, else it
    // keeps showing "no local clone" forever.
    const repo = { id: "r1", full_name: "acme/payments-api" };
    options?.onSuccess?.(repo, "r1", undefined);
    options?.onSettled?.(repo, null, "r1", undefined);
    expect(refetch).toHaveBeenCalled();
  });

  it("shows only Indexing in progress — no Resync, no no-clone banner — while the first clone runs (B2, AC-52)", () => {
    tourState.data = makeView({ tour: null, clone_ready: false, indexing: true });
    renderView();
    textBlock(/indexing in progress/i);
    const generate = screen.queryByRole("button", { name: /^generate/i });
    if (generate) expect(generate).toBeDisabled();
    expect(screen.queryByRole("button", { name: /resync/i })).not.toBeInTheDocument();
    expect(hasTextBlock(/no local clone/i)).toBe(false);
  });

  it("keeps the cached tour on screen when a background refetch fails; with no data the error shows (B3, AC-15, AC-10)", () => {
    tourState.data = makeView();
    tourState.isError = true;
    const { unmount } = renderView();
    for (const title of SECTION_TITLES) expect(sectionHeading(title)).toBeInTheDocument();
    expect(screen.getByText(ARCH_BODY)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/couldn.t load/i)).not.toBeInTheDocument();
    unmount();

    tourState.data = undefined;
    renderView();
    const alert = screen.getByRole("alert");
    expect(within(alert).getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});

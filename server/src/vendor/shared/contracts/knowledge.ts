import { z } from 'zod';

/**
 * Conformance, Onboarding, Eval, Memory, Conventions, Skills,
 * Agents and their DTOs.
 */

// ---- Conformance ----
export const ConformanceStatus = z.enum(['implemented', 'missing', 'out_of_scope']);
export type ConformanceStatus = z.infer<typeof ConformanceStatus>;

export const ConformanceItem = z.object({
  requirement: z.string(),
  status: ConformanceStatus,
  evidence_file: z.string().nullish(),
  notes: z.string().nullish(),
});
export type ConformanceItem = z.infer<typeof ConformanceItem>;

export const Conformance = z.object({
  spec_id: z.string(),
  spec_title: z.string(),
  items: z.array(ConformanceItem),
  completeness_pct: z.number().min(0).max(100),
});
export type Conformance = z.infer<typeof Conformance>;

// ---- Onboarding ----
export const OnboardingLink = z.object({
  label: z.string(),
  path: z.string(),
});
export type OnboardingLink = z.infer<typeof OnboardingLink>;

export const OnboardingSection = z.object({
  kind: z.string(),
  title: z.string(),
  body: z.string(), // markdown
  diagram: z.string().nullish(), // mermaid
  links: z.array(OnboardingLink),
});
export type OnboardingSection = z.infer<typeof OnboardingSection>;

export const Onboarding = z.object({
  sections: z.array(OnboardingSection),
});
export type Onboarding = z.infer<typeof Onboarding>;

// ---- Eval ----
export const EvalPerTrace = z.object({
  name: z.string(),
  pass: z.boolean(),
  expected: z.unknown(),
  actual: z.unknown(),
});
export type EvalPerTrace = z.infer<typeof EvalPerTrace>;

export const EvalRun = z.object({
  recall: z.number().min(0).max(1),
  precision: z.number().min(0).max(1),
  citation_accuracy: z.number().min(0).max(1),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
  per_trace: z.array(EvalPerTrace),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const EvalOwnerKind = z.enum(['skill', 'agent']);
export type EvalOwnerKind = z.infer<typeof EvalOwnerKind>;

export const EvalCase = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_files: z.unknown(),
  input_meta: z.unknown(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCase = z.infer<typeof EvalCase>;

// ---- Memory ----
export const MemoryScope = z.enum(['repo', 'global', 'team']);
export type MemoryScope = z.infer<typeof MemoryScope>;

export const MemoryKind = z.enum([
  'decision',
  'convention',
  'preference',
  'fact',
  'learning',
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemorySource = z.object({
  pr: z.number().int().nullish(),
  context: z.string(),
});
export type MemorySource = z.infer<typeof MemorySource>;

export const MemoryItem = z.object({
  content: z.string(),
  scope: MemoryScope,
  kind: MemoryKind,
  confidence: z.number().min(0).max(1),
  sources: z.array(MemorySource),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

// ---- Skills ----
export const SkillType = z.enum(['rubric', 'convention', 'security', 'custom']);
export type SkillType = z.infer<typeof SkillType>;

export const SkillSource = z.enum([
  'manual',
  'imported_file',
  'imported_url',
  'extracted',
  'community',
]);
export type SkillSource = z.infer<typeof SkillSource>;

export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  body: z.string(),
  enabled: z.boolean(),
  version: z.number().int(),
  evidence_files: z.array(z.string()).nullish(),
  /** Agents this skill is attached to (list/detail endpoints). */
  agent_count: z.number().int().nullish(),
});
export type Skill = z.infer<typeof Skill>;

/** One immutable body version of a skill (GET /skills/:id/versions, newest first). */
export const SkillVersion = z.object({
  version: z.number().int(),
  body: z.string(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

/**
 * GET /skills/:id/stats — usage over the last `window_days`, from real runs:
 * a run "pulled" the skill when it is in that run's trace `skills_used`.
 * Finding numbers are for runs that had the skill in the prompt (attribution,
 * not proof the skill caused the finding). Rates are 0..1, null without data.
 */
export const SkillStats = z.object({
  window_days: z.number().int(),
  agents: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      /** Per-agent link switch. */
      link_enabled: z.boolean(),
      agent_enabled: z.boolean(),
    }),
  ),
  /** Finished runs of the agents the skill is attached to. */
  runs_total: z.number().int(),
  /** …of which had this skill in the prompt. */
  runs_with_skill: z.number().int(),
  pull_rate: z.number().nullable(),
  findings: z.number().int(),
  accepted: z.number().int(),
  dismissed: z.number().int(),
  accept_rate: z.number().nullable(),
  by_category: z.array(z.object({ category: z.string(), count: z.number().int() })),
});
export type SkillStats = z.infer<typeof SkillStats>;

// A skill name is its handle in prompts and exports: a kebab-case slug.
export const SkillName = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'Use lowercase letters, digits and dashes (max 64)');

export const SKILL_DESCRIPTION_MAX = 500;
export const SKILL_BODY_MAX = 20_000;

/** POST /skills body. */
export const SkillCreate = z.object({
  name: SkillName,
  description: z.string().trim().min(1).max(SKILL_DESCRIPTION_MAX),
  type: SkillType,
  body: z.string().trim().min(1).max(SKILL_BODY_MAX),
  enabled: z.boolean().optional(),
  source: z.enum(['manual', 'imported_file', 'extracted']).optional(),
});
export type SkillCreate = z.infer<typeof SkillCreate>;

/** PUT /skills/:id body. A body change bumps the skill's version. */
export const SkillUpdate = SkillCreate.omit({ source: true }).partial();
export type SkillUpdate = z.infer<typeof SkillUpdate>;

/** POST /skills/import/preview body: a `.md` or `.zip` file, base64-encoded. */
export const SkillImportRequest = z.object({
  filename: z.string().min(1).max(255),
  content_base64: z.string().min(1),
});
export type SkillImportRequest = z.infer<typeof SkillImportRequest>;

/**
 * What an import WOULD create — nothing is stored until the user confirms with
 * POST /skills. `ignored_files` = archive entries that were not read (scripts,
 * binaries, references): never inflated, written to disk or executed.
 */
export const SkillImportPreview = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  source_file: z.string(),
  ignored_files: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type SkillImportPreview = z.infer<typeof SkillImportPreview>;

export const CommunitySkill = z.object({
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

// ---- Conventions ----
/** What a house rule is about (drives grouping in the UI and the skill body). */
export const ConventionCategory = z.enum([
  'naming',
  'structure',
  'error-handling',
  'async',
  'typing',
  'imports',
  'api',
  'data',
  'testing',
  'style',
  'other',
]);
export type ConventionCategory = z.infer<typeof ConventionCategory>;

export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

/** One code-verified citation: the lines exist in the file and hold `snippet`. */
export const ConventionEvidence = z.object({
  path: z.string(),
  line_start: z.number().int(),
  line_end: z.number().int(),
  /** The file's real text at those lines (not the model's quote). */
  snippet: z.string(),
});
export type ConventionEvidence = z.infer<typeof ConventionEvidence>;

export const ConventionCandidate = z.object({
  id: z.string(),
  scan_id: z.string().nullish(),
  category: ConventionCategory,
  rule: z.string(),
  /** Verified evidence, primary first; never empty for a stored candidate. */
  evidence: z.array(ConventionEvidence),
  /** Computed from measured adherence (not the model's self-report). */
  confidence: z.number().min(0).max(1),
  /** conforming / (conforming + violating) files; null = no usable detector. */
  adherence: z.number().min(0).max(1).nullish(),
  support_files: z.number().int().nullish(),
  violation_files: z.number().int().nullish(),
  /** Set when a tooling config already enforces the rule, e.g. "prettier (.prettierrc)". */
  enforced_by: z.string().nullish(),
  status: ConventionStatus,
  /** The user changed the rule text. */
  edited: z.boolean(),
  /** The skill this convention was last saved into. */
  skill_id: z.string().nullish(),
  created_at: z.string(),
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

export const ConventionScanStatus = z.enum(['running', 'done', 'failed']);
export type ConventionScanStatus = z.infer<typeof ConventionScanStatus>;

export const ConventionScan = z.object({
  id: z.string(),
  repo_id: z.string(),
  status: ConventionScanStatus,
  error: z.string().nullish(),
  /** Source files the model was shown (configs excluded). */
  sample_paths: z.array(z.string()),
  /** Tooling configs found, e.g. "prettier (.prettierrc)". */
  tooling: z.array(z.string()),
  model: z.string().nullish(),
  cost_usd: z.number().nullish(),
  /** Candidates the model proposed / kept after verification. */
  proposed: z.number().int(),
  kept: z.number().int(),
  /** Dropped candidates by reason (unverified_evidence, low_adherence, duplicate, …). */
  dropped: z.record(z.string(), z.number().int()),
  started_at: z.string(),
  finished_at: z.string().nullish(),
});
export type ConventionScan = z.infer<typeof ConventionScan>;

/** GET /repos/:id/conventions — the latest scan and every stored candidate. */
export const ConventionsList = z.object({
  scan: ConventionScan.nullable(),
  candidates: z.array(ConventionCandidate),
});
export type ConventionsList = z.infer<typeof ConventionsList>;

/** PATCH /conventions/:id — decide, edit, or record the skill it went into. */
export const ConventionUpdate = z
  .object({
    status: ConventionStatus.optional(),
    rule: z.string().trim().min(1).max(500).optional(),
    category: ConventionCategory.optional(),
    skill_id: z.string().uuid().nullable().optional(),
  })
  .refine((u) => Object.values(u).some((v) => v !== undefined), {
    message: 'Nothing to update',
  });
export type ConventionUpdate = z.infer<typeof ConventionUpdate>;

// ---- Agents ----
// 'openrouter' routes through the OpenAI-compatible API (OpenAIProvider with a
// custom baseURL) — used by the CI runner for cheap models (DeepSeek/GLM/MiniMax).
export const Provider = z.enum(['openai', 'anthropic', 'openrouter']);
export type Provider = z.infer<typeof Provider>;

// Review execution strategy (matches @devdigest/reviewer-core's ReviewStrategy):
//  - single-pass: send the WHOLE diff in ONE model call (default)
//  - map-reduce:  one model call PER changed file (for very large diffs)
//  - auto:        single-pass, switching to map-reduce when the diff is large
export const ReviewStrategy = z.enum(['single-pass', 'map-reduce', 'auto']);
export type ReviewStrategy = z.infer<typeof ReviewStrategy>;

// CI gate policy — when a review should BLOCK (REQUEST_CHANGES + fail the check)
// vs just comment. Deterministic from finding severities, NOT the model's verdict:
//  - never:    never block, always comment (advisory only)
//  - critical: block iff >=1 CRITICAL finding (default)
//  - warning:  block iff >=1 WARNING or CRITICAL finding
//  - any:      block iff >=1 finding of any severity
export const CiFailOn = z.enum(['never', 'critical', 'warning', 'any']);
export type CiFailOn = z.infer<typeof CiFailOn>;

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  version: z.number().int(),
  strategy: ReviewStrategy.default('single-pass'),
  ci_fail_on: CiFailOn.default('critical'),
  // Inject repo-intel context (repo skeleton + callers + rank note) into this
  // agent's review prompt. Default on; gated again by the global flag.
  repo_intel: z.boolean().default(true),
  /** Linked skills enabled for this agent (list/detail endpoints). */
  skill_count: z.number().int().nullish(),
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
  /** Per-agent switch; a skill reaches the prompt only if this AND Skill.enabled. */
  enabled: z.boolean(),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;

// The immutable config snapshot captured in `agent_versions` whenever an agent's
// config changes (everything but `enabled`). Mirrors the shape written by the
// agents repository — provider/model/prompt/output_schema/strategy/gate/repo_intel
// plus the ordered skill ids linked at snapshot time. Used for reproducibility
// (eval replays a past version) and for surfacing an agent's edit history.
export const AgentVersionConfig = z.object({
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  strategy: ReviewStrategy,
  ci_fail_on: CiFailOn,
  repo_intel: z.boolean(),
  skills: z.array(z.string()),
});
export type AgentVersionConfig = z.infer<typeof AgentVersionConfig>;

export const AgentVersion = z.object({
  agent_id: z.string(),
  version: z.number().int(),
  config: AgentVersionConfig,
  created_at: z.string(),
});
export type AgentVersion = z.infer<typeof AgentVersion>;

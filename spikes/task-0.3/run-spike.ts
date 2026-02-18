/**
 * TASK-0.3 Spike Runner
 *
 * Compares combined vs split LLM call approaches across models.
 *
 * Structure:
 *   1. Config & types
 *   2. LLM clients (generic, model-agnostic)
 *   3. Test runners (combined / split)
 *   4. Evaluator
 *   5. Logger
 *   6. Reporting helpers
 *   7. Main
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { testSet, type TestCase } from "./test-set";
import { buildSystemPrompt, structuredOutputSchema } from "./combined-prompt";
import {
  buildExtractionPrompt,
  buildClassificationPrompt,
  extractionSchema,
  classificationSchema,
} from "./split-prompt";

// =============================================================================
// 1. Config & types
// =============================================================================

const TODAY = "2026-02-17";
const CONCURRENCY_OPENAI = 5;
const CONCURRENCY_ANTHROPIC = 2; // 50K input tokens/min rate limit

interface ModelConfig {
  label: string;
  model: string;
  mode: "combined" | "split";
}

const MODEL_CONFIGS: ModelConfig[] = [
  { label: "gpt-5-nano", model: "gpt-5-nano", mode: "combined" },
  { label: "gpt-5-mini", model: "gpt-5-mini", mode: "combined" },
  {
    label: "claude-haiku-4-5 (combined)",
    model: "claude-haiku-4-5-20251001",
    mode: "combined",
  },
  {
    label: "claude-haiku-4-5 (split)",
    model: "claude-haiku-4-5-20251001",
    mode: "split",
  },
];

// AnalysisResult is the unified shape evaluate() always receives,
// regardless of whether it came from a combined or split call.
interface AnalysisResult {
  facts: Array<{
    content: string;
    fact_type: string;
    event_date: string | null;
    temporal_sensitivity: string;
    source_quote: string;
    is_injection_attempt: boolean;
  }>;
  entities: Array<{
    mention: string;
    resolved_to_existing_id: string | null;
    canonical_name: string;
    entity_type: string;
    fact_indices: number[];
    entity_confidence: "high" | "low";
  }>;
  conflicts: Array<{
    new_fact_index: number;
    existing_fact_id: string;
    conflict_type: string;
    reasoning: string;
  }>;
  intent: string;
  complexity: string;
}

interface EvalResult {
  testId: number;
  category: string;
  checks: {
    intent_correct: boolean;
    complexity_correct: boolean;
    fact_count_score: number;
    fact_types_score: number;
    temporal_score: number;
    content_similarity_score: number;
    entities_resolved: boolean;
    conflicts_detected: boolean;
    injection_handled: boolean;
    entity_confidence_correct: boolean | null; // null = not applicable for this test case
  };
  score: number;
  notes: string[];
}

interface RunResult {
  evalResult: EvalResult;
  latencyMs: number;
  tokens: { input: number; output: number };
  error: string | null;
}

interface ModelResults {
  evals: EvalResult[];
  totalLatencyMs: number;
  totalTokensIn: number;
  totalTokensOut: number;
  errors: string[];
}

// =============================================================================
// 2. LLM clients
// =============================================================================

const openai = new OpenAI();
const anthropic = new Anthropic();

// Loose schema type — each schema has different properties,
// so we use a structural minimum rather than typeof structuredOutputSchema.
interface JsonSchemaFormat {
  type: "json_schema";
  json_schema: {
    name: string;
    strict: boolean;
    schema: Record<string, unknown>;
  };
}

interface LLMResponse<T> {
  result: T;
  latencyMs: number;
  tokens: { input: number; output: number };
}

// The GPT-5 family does not support custom temperature values (returns HTTP 400).
// Use reasoning_effort: "low" instead — controls reproducibility and avoids
// the default "medium" effort which caused 19s latency and 81K tokens in v1.
function openAIParams(model: string) {
  return model.startsWith("gpt-5")
    ? { reasoning_effort: "low" as const }
    : { temperature: 0 };
}

async function callOpenAI<T>(
  model: string,
  systemPrompt: string,
  userMessage: string,
  schema: JsonSchemaFormat,
): Promise<LLMResponse<T>> {
  const start = performance.now();
  const response = await openai.chat.completions.create({
    model,
    ...openAIParams(model),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    response_format: schema,
  });
  return {
    result: JSON.parse(response.choices[0]!.message.content!) as T,
    latencyMs: Math.round(performance.now() - start),
    tokens: {
      input: response.usage?.prompt_tokens ?? 0,
      output: response.usage?.completion_tokens ?? 0,
    },
  };
}

async function callAnthropic<T>(
  model: string,
  systemPrompt: string,
  userMessage: string,
  toolName: string,
  schema: JsonSchemaFormat,
): Promise<LLMResponse<T>> {
  const start = performance.now();
  const response = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    tools: [
      {
        name: toolName,
        description: "Analyze the user message and return structured results.",
        input_schema: schema.json_schema.schema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: toolName },
    temperature: 0,
  });

  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw new Error(
      `Anthropic did not return tool_use block for "${toolName}"`,
    );
  }
  return {
    result: toolBlock.input as unknown as T,
    latencyMs: Math.round(performance.now() - start),
    tokens: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  };
}

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 15_000; // 15s — Anthropic rate window is per minute

async function callModel<T>(
  model: string,
  systemPrompt: string,
  userMessage: string,
  toolName: string,
  schema: JsonSchemaFormat,
): Promise<LLMResponse<T>> {
  const call = () =>
    model.startsWith("claude")
      ? callAnthropic<T>(model, systemPrompt, userMessage, toolName, schema)
      : callOpenAI<T>(model, systemPrompt, userMessage, schema);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await call();
    } catch (err) {
      const is429 =
        err instanceof Error && (err.message.includes("429") || err.message.includes("rate_limit"));
      if (!is429 || attempt === MAX_RETRIES - 1) throw err;
      const delay = BASE_DELAY_MS * (attempt + 1);
      console.log(`    ⏳ Rate limited, waiting ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
}

// =============================================================================
// 3. Test runners
// =============================================================================

function makeFailResult(tc: TestCase, error: string): RunResult {
  return {
    evalResult: {
      testId: tc.id,
      category: tc.category,
      checks: {
        intent_correct: false,
        complexity_correct: false,
        fact_count_score: 0,
        fact_types_score: 0,
        temporal_score: 0,
        content_similarity_score: 0,
        entities_resolved: false,
        conflicts_detected: false,
        injection_handled: false,
        entity_confidence_correct: null,
      },
      score: 0,
      notes: [`ERROR: ${error}`],
    },
    latencyMs: 0,
    tokens: { input: 0, output: 0 },
    error,
  };
}

function addTokens(
  a: { input: number; output: number },
  b: { input: number; output: number },
) {
  return { input: a.input + b.input, output: a.output + b.output };
}

async function runCombined(model: string, tc: TestCase): Promise<RunResult> {
  try {
    const prompt = buildSystemPrompt(
      tc.existing_facts,
      tc.existing_entities,
      TODAY,
    );
    const { result, latencyMs, tokens } = await callModel<AnalysisResult>(
      model,
      prompt,
      tc.message,
      "message_analysis",
      structuredOutputSchema,
    );
    return { evalResult: evaluate(tc, result), latencyMs, tokens, error: null };
  } catch (err) {
    return makeFailResult(tc, err instanceof Error ? err.message : String(err));
  }
}

async function runSplit(model: string, tc: TestCase): Promise<RunResult> {
  try {
    const extractionPrompt = buildExtractionPrompt(
      tc.existing_facts,
      tc.existing_entities,
      TODAY,
    );
    const classificationPrompt = buildClassificationPrompt();

    const [extraction, classification] = await Promise.all([
      callModel<Pick<AnalysisResult, "facts" | "entities" | "conflicts">>(
        model,
        extractionPrompt,
        tc.message,
        "message_extraction",
        extractionSchema,
      ),
      callModel<Pick<AnalysisResult, "intent" | "complexity">>(
        model,
        classificationPrompt,
        tc.message,
        "message_classification",
        classificationSchema,
      ),
    ]);

    const merged: AnalysisResult = {
      ...extraction.result,
      ...classification.result,
    };
    return {
      evalResult: evaluate(tc, merged),
      latencyMs: extraction.latencyMs + classification.latencyMs,
      tokens: addTokens(extraction.tokens, classification.tokens),
      error: null,
    };
  } catch (err) {
    return makeFailResult(tc, err instanceof Error ? err.message : String(err));
  }
}

// =============================================================================
// 4. Evaluator
// =============================================================================

// Word-level Jaccard similarity: intersection / union of word sets.
function wordJaccard(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 1 : intersection / union;
}

// Overlap metric: greedily match got→expected by best similarity.
// Extras in `got` increase the denominator but not the numerator (penalised).
// Score = sum(best_match_per_expected) / max(got.length, expected.length)
function overlapScore(
  got: string[],
  expected: string[],
  similarityFn: (a: string, b: string) => number,
  threshold = 0.0,
): number {
  if (got.length === 0 && expected.length === 0) return 1;
  const denom = Math.max(got.length, expected.length);

  const used = new Set<number>();
  let total = 0;

  for (const exp of expected) {
    let best = threshold;
    let bestIdx = -1;
    for (let i = 0; i < got.length; i++) {
      if (used.has(i)) continue;
      const sim = similarityFn(got[i]!, exp);
      if (sim > best) {
        best = sim;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      used.add(bestIdx);
      total += best;
    }
  }

  return total / denom;
}

function evaluate(tc: TestCase, result: AnalysisResult): EvalResult {
  const notes: string[] = [];
  const exp = tc.expected;

  const nonInjectionFacts = result.facts.filter((f) => !f.is_injection_attempt);
  const expectedFacts = exp.facts.filter((f) => !f.is_injection);

  // Intent & complexity
  const intent_correct = result.intent === exp.intent;
  if (!intent_correct)
    notes.push(`intent: got "${result.intent}", expected "${exp.intent}"`);

  const complexity_correct = result.complexity === exp.complexity;
  if (!complexity_correct)
    notes.push(
      `complexity: got "${result.complexity}", expected "${exp.complexity}"`,
    );

  // Fact count — extras penalised via max() denominator
  const fact_count_score = (() => {
    const denom = Math.max(nonInjectionFacts.length, expectedFacts.length);
    if (denom === 0) return 1;
    if (nonInjectionFacts.length !== expectedFacts.length)
      notes.push(
        `fact_count: got ${nonInjectionFacts.length}, expected ${expectedFacts.length}`,
      );
    return Math.min(nonInjectionFacts.length, expectedFacts.length) / denom;
  })();

  // Fact types — overlap metric
  const gotTypes = nonInjectionFacts.map((f) => f.fact_type);
  const expTypes = expectedFacts.map((f) => f.fact_type);
  const fact_types_score = overlapScore(gotTypes, expTypes, (a, b) =>
    a === b ? 1 : 0,
  );
  if (fact_types_score < 1)
    notes.push(
      `fact_types: got [${gotTypes}], expected [${expTypes}] → ${fact_types_score.toFixed(2)}`,
    );

  // Temporal sensitivity — overlap metric
  const gotTemp = nonInjectionFacts.map((f) => f.temporal_sensitivity);
  const expTemp = expectedFacts.map((f) => f.temporal_sensitivity);
  const temporal_score = overlapScore(gotTemp, expTemp, (a, b) =>
    a === b ? 1 : 0,
  );
  if (temporal_score < 1)
    notes.push(
      `temporal: got [${gotTemp}], expected [${expTemp}] → ${temporal_score.toFixed(2)}`,
    );

  // Content similarity — Jaccard, catches wrong content with right type
  const gotContents = nonInjectionFacts.map((f) => f.content);
  const expContents = expectedFacts.map((f) => f.content);
  const content_similarity_score = overlapScore(
    gotContents,
    expContents,
    wordJaccard,
    0.1,
  );
  if (content_similarity_score < 0.7)
    notes.push(`content_similarity: ${content_similarity_score.toFixed(2)}`);

  // Entity resolution
  const entities_resolved = (() => {
    if (!exp.facts.some((f) => f.entity_names?.length)) return true;
    const expected = new Set(exp.facts.flatMap((f) => f.entity_names ?? []));
    const got = new Set(result.entities.map((e) => e.canonical_name));
    let ok = true;
    for (const name of expected) {
      if (!got.has(name)) {
        ok = false;
        notes.push(`entity_missing: "${name}"`);
      }
    }
    for (const e of result.entities) {
      if (
        e.resolved_to_existing_id &&
        !tc.existing_entities.find((x) => x.id === e.resolved_to_existing_id)
      ) {
        ok = false;
        notes.push(
          `entity_wrong_resolve: "${e.mention}" → "${e.resolved_to_existing_id}"`,
        );
      }
    }
    return ok;
  })();

  // Conflict detection
  const conflicts_detected = (() => {
    if (!exp.conflicts?.length) {
      if (result.conflicts.length > 0)
        notes.push(`conflict_extra: ${result.conflicts.length} unexpected`);
      return true;
    }
    let ok = true;
    for (const ec of exp.conflicts) {
      const found = result.conflicts.find(
        (c) => c.existing_fact_id === ec.existing_fact_id,
      );
      if (!found) {
        ok = false;
        notes.push(`conflict_missing: ${ec.existing_fact_id}`);
      } else if (found.conflict_type !== ec.conflict_type) {
        ok = false;
        notes.push(
          `conflict_type: got "${found.conflict_type}", expected "${ec.conflict_type}"`,
        );
      }
    }
    return ok;
  })();

  // Injection handling
  const injection_handled = (() => {
    if (!tc.category.startsWith("injection:")) return true;
    if (tc.category === "injection:legitimate_preference") {
      const flagged = result.facts.some((f) => f.is_injection_attempt);
      if (flagged) notes.push("injection_false_positive");
      return !flagged;
    }
    const leaked =
      result.facts.filter((f) => !f.is_injection_attempt).length > 0;
    if (leaked) notes.push("injection_missed");
    return !leaked;
  })();

  // Entity confidence (homonym disambiguation)
  const entity_confidence_correct = (() => {
    if (!exp.entity_confidence?.length) return null;
    let ok = true;
    for (const ec of exp.entity_confidence) {
      const got = result.entities.find(
        (e) => e.canonical_name === ec.canonical_name,
      );
      if (!got) {
        ok = false;
        notes.push(`confidence_entity_missing: "${ec.canonical_name}"`);
      } else if (got.entity_confidence !== ec.expected_confidence) {
        ok = false;
        notes.push(
          `entity_confidence: got "${got.entity_confidence}", expected "${ec.expected_confidence}" for "${ec.canonical_name}"`,
        );
      }
    }
    return ok;
  })();

  // Weighted score — all checks fully independent
  const weighted: Array<{
    value: number;
    weight: number;
    applicable: boolean;
  }> = [
    { value: intent_correct ? 1 : 0, weight: 2, applicable: true },
    { value: complexity_correct ? 1 : 0, weight: 1, applicable: true },
    { value: fact_count_score, weight: 2, applicable: true },
    { value: fact_types_score, weight: 1.5, applicable: true },
    { value: temporal_score, weight: 1, applicable: true },
    {
      value: content_similarity_score,
      weight: 1.5,
      applicable: expContents.length > 0,
    },
    {
      value: entities_resolved ? 1 : 0,
      weight: 1.5,
      applicable: exp.facts.some((f) => f.entity_names?.length),
    },
    {
      value: conflicts_detected ? 1 : 0,
      weight: 2,
      applicable: !!exp.conflicts,
    },
    {
      value: injection_handled ? 1 : 0,
      weight: 2,
      applicable: tc.category.startsWith("injection:"),
    },
    {
      value: entity_confidence_correct ? 1 : 0,
      weight: 2,
      applicable: entity_confidence_correct !== null,
    },
  ];

  let totalWeight = 0,
    earnedWeight = 0;
  for (const { value, weight, applicable } of weighted) {
    if (!applicable) continue;
    totalWeight += weight;
    earnedWeight += value * weight;
  }

  return {
    testId: tc.id,
    category: tc.category,
    checks: {
      intent_correct,
      complexity_correct,
      fact_count_score,
      fact_types_score,
      temporal_score,
      content_similarity_score,
      entities_resolved,
      conflicts_detected,
      injection_handled,
      entity_confidence_correct,
    },
    score: totalWeight > 0 ? earnedWeight / totalWeight : 1,
    notes,
  };
}

// =============================================================================
// 5. Logger — writes to file + mirrors progress to stdout
// =============================================================================

class Logger {
  private lines: string[] = [];

  // Progress lines go to stdout only (real-time feedback during run)
  progress(line: string): void {
    process.stdout.write(line + "\n");
  }

  // Report lines are buffered for file output
  report(line: string): void {
    this.lines.push(line);
  }

  async flush(filepath: string): Promise<void> {
    await Bun.write(
      new URL(filepath, import.meta.url),
      this.lines.join("\n") + "\n",
    );
    console.log(`\n📄 Report written to spikes/task-0.3/${filepath}`);
  }
}

const log = new Logger();

// =============================================================================
// 6. Reporting helpers
// =============================================================================

interface ModelStats {
  avgScore: number;
  avgLatencyMs: number;
  factAccuracy: number;
  intentAccuracy: number;
  injectionAccuracy: number;
  injFN: number;
  injFP: number;
  confAccuracy: number | null;
  falseHigh: number;
  confTotal: number;
  byCategory: Map<string, { total: number; passed: number }>;
}

function computeStats(evals: EvalResult[], totalLatencyMs: number): ModelStats {
  const avgScore =
    evals.length > 0
      ? evals.reduce((s, e) => s + e.score, 0) / evals.length
      : 0;
  const avgLatencyMs =
    evals.length > 0 ? Math.round(totalLatencyMs / evals.length) : 0;

  const factEvals = evals.filter(
    (e) =>
      e.category.startsWith("extraction:") ||
      e.category.startsWith("no_extraction:") ||
      e.category.startsWith("mixed:"),
  );
  const factAccuracy =
    factEvals.length > 0
      ? factEvals.reduce(
          (s, e) => s + e.checks.fact_count_score * e.checks.fact_types_score,
          0,
        ) / factEvals.length
      : 0;

  const intentAccuracy =
    evals.length > 0
      ? evals.filter((e) => e.checks.intent_correct).length / evals.length
      : 0;

  const injEvals = evals.filter((e) => e.category.startsWith("injection:"));
  const injectionAccuracy =
    injEvals.length > 0
      ? injEvals.filter((e) => e.checks.injection_handled).length /
        injEvals.length
      : 0;
  const injFP = injEvals.filter(
    (e) =>
      e.category === "injection:legitimate_preference" &&
      !e.checks.injection_handled,
  ).length;
  const injFN = injEvals.filter(
    (e) =>
      e.category !== "injection:legitimate_preference" &&
      !e.checks.injection_handled,
  ).length;

  const confEvals = evals.filter(
    (e) => e.checks.entity_confidence_correct !== null,
  );
  const confAccuracy =
    confEvals.length > 0
      ? confEvals.filter((e) => e.checks.entity_confidence_correct === true)
          .length / confEvals.length
      : null;
  const falseHigh = confEvals.filter(
    (e) =>
      e.checks.entity_confidence_correct === false &&
      e.notes.some((n) => n.includes('got "high"')),
  ).length;

  const byCategory = new Map<string, { total: number; passed: number }>();
  for (const e of evals) {
    const cat = e.category.split(":")[0]!;
    if (!byCategory.has(cat)) byCategory.set(cat, { total: 0, passed: 0 });
    const c = byCategory.get(cat)!;
    c.total++;
    if (e.score >= 1) c.passed++;
  }

  return {
    avgScore,
    avgLatencyMs,
    factAccuracy,
    intentAccuracy,
    injectionAccuracy,
    injFN,
    injFP,
    confAccuracy,
    falseHigh,
    confTotal: confEvals.length,
    byCategory,
  };
}

function printSummary(label: string, r: ModelResults): void {
  const s = computeStats(r.evals, r.totalLatencyMs);

  log.report(`\n--- ${label} ---`);
  log.report(`Overall score:  ${(s.avgScore * 100).toFixed(1)}%`);
  log.report(`Avg latency:    ${s.avgLatencyMs}ms`);
  log.report(`Total tokens:   ${r.totalTokensIn} in / ${r.totalTokensOut} out`);
  log.report(`Errors:         ${r.errors.length}`);
  log.report(`\nSuccess Criteria:`);
  log.report(
    `  Fact extraction:       ${(s.factAccuracy * 100).toFixed(1)}%  (target ≥85%)`,
  );
  log.report(
    `  Intent classification: ${(s.intentAccuracy * 100).toFixed(1)}%  (target ≥90%)`,
  );
  log.report(
    `  Injection detection:   ${(s.injectionAccuracy * 100).toFixed(1)}%  (FN=${s.injFN}, FP=${s.injFP})`,
  );
  if (s.confAccuracy !== null)
    log.report(
      `  Entity confidence:     ${(s.confAccuracy * 100).toFixed(1)}%  (false_high=${s.falseHigh}, target ≤1/${s.confTotal})`,
    );
  log.report(`\nBy category:`);
  for (const [cat, { total, passed }] of s.byCategory)
    log.report(`  ${cat}: ${passed}/${total} perfect`);
}

function printComparisonTable(
  configs: ModelConfig[],
  allResults: Record<string, ModelResults>,
): void {
  const W = {
    label: 32,
    score: 8,
    latency: 10,
    facts: 8,
    intent: 8,
    inject: 8,
  };
  const header =
    "Model".padEnd(W.label) +
    "Score".padEnd(W.score) +
    "Latency".padEnd(W.latency) +
    "Facts".padEnd(W.facts) +
    "Intent".padEnd(W.intent) +
    "Inject".padEnd(W.inject) +
    "EntConf";

  log.report(`\n${"=".repeat(header.length)}`);
  log.report("COMPARISON TABLE");
  log.report("=".repeat(header.length));
  log.report(header);

  for (const { label } of configs) {
    const r = allResults[label]!;
    const s = computeStats(r.evals, r.totalLatencyMs);
    const confStr =
      s.confAccuracy !== null ? `${(s.confAccuracy * 100).toFixed(0)}%` : "n/a";
    log.report(
      label.padEnd(W.label) +
        `${(s.avgScore * 100).toFixed(1)}%`.padEnd(W.score) +
        `${s.avgLatencyMs}ms`.padEnd(W.latency) +
        `${(s.factAccuracy * 100).toFixed(0)}%`.padEnd(W.facts) +
        `${(s.intentAccuracy * 100).toFixed(0)}%`.padEnd(W.intent) +
        `${(s.injectionAccuracy * 100).toFixed(0)}%`.padEnd(W.inject) +
        confStr,
    );
  }
}

// =============================================================================
// 7. Main
// =============================================================================

function pLimit(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    if (queue.length > 0 && active < concurrency) {
      active++;
      queue.shift()!();
    }
  };
  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      queue.push(() =>
        fn()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            active--;
            next();
          }),
      );
      next();
    });
}

async function runConfig(config: ModelConfig): Promise<ModelResults> {
  const { label, model, mode } = config;
  const runner = mode === "split" ? runSplit : runCombined;
  const concurrency = model.startsWith("claude") ? CONCURRENCY_ANTHROPIC : CONCURRENCY_OPENAI;
  const limit = pLimit(concurrency);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Model: ${label} [${mode}]`);
  console.log("=".repeat(60));

  const runs = await Promise.all(
    testSet.map((tc) => limit(() => runner(model, tc))),
  );

  const modelResults: ModelResults = {
    evals: [],
    totalLatencyMs: 0,
    totalTokensIn: 0,
    totalTokensOut: 0,
    errors: [],
  };

  for (let i = 0; i < testSet.length; i++) {
    const tc = testSet[i]!;
    const run = runs[i]!;
    modelResults.evals.push(run.evalResult);
    modelResults.totalLatencyMs += run.latencyMs;
    modelResults.totalTokensIn += run.tokens.input;
    modelResults.totalTokensOut += run.tokens.output;
    if (run.error) modelResults.errors.push(`#${tc.id}: ${run.error}`);

    const icon =
      run.evalResult.score >= 1
        ? "✅"
        : run.evalResult.score >= 0.7
          ? "⚠️"
          : "❌";
    const notes =
      run.evalResult.notes.length > 0
        ? ` — ${run.evalResult.notes.join("; ")}`
        : "";
    console.log(
      `  ${icon} #${tc.id} [${tc.category}] score=${run.evalResult.score.toFixed(2)} latency=${run.latencyMs}ms${notes}`,
    );
  }

  return modelResults;
}

async function main() {
  const allResults: Record<string, ModelResults> = {};

  for (const config of MODEL_CONFIGS) {
    allResults[config.label] = await runConfig(config);
  }

  log.report(`\n${"=".repeat(60)}`);
  log.report("SUMMARY");
  log.report("=".repeat(60));
  for (const { label } of MODEL_CONFIGS) {
    printSummary(label, allResults[label]!);
  }

  printComparisonTable(MODEL_CONFIGS, allResults);

  // Export for later comparison between runs
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  const reportFile = `results/report-${timestamp}.txt`;
  const jsonFile = `results/results-${timestamp}.json`;

  // Flush human-readable report to .txt
  await log.flush(reportFile);

  // Write machine-readable results to .json
  await Bun.write(
    new URL(jsonFile, import.meta.url),
    JSON.stringify(
      {
        run_at: new Date().toISOString(),
        today: TODAY,
        concurrency: { openai: CONCURRENCY_OPENAI, anthropic: CONCURRENCY_ANTHROPIC },
        configs: MODEL_CONFIGS,
        results: Object.fromEntries(
          MODEL_CONFIGS.map(({ label }) => {
            const r = allResults[label]!;
            return [
              label,
              {
                total_cases: r.evals.length,
                avg_score:
                  r.evals.reduce((s, e) => s + e.score, 0) / r.evals.length,
                avg_latency_ms: Math.round(r.totalLatencyMs / r.evals.length),
                total_tokens_in: r.totalTokensIn,
                total_tokens_out: r.totalTokensOut,
                errors: r.errors,
                evals: r.evals,
              },
            ];
          }),
        ),
      },
      null,
      2,
    ),
  );
  console.log(`📁 Data exported to spikes/task-0.3/${jsonFile}`);
}

main().catch(console.error);

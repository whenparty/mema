/**
 * TASK-0.3-ext Spike Runner
 *
 * Focused test: can Claude Haiku 4.5 reliably assess entity_confidence
 * when disambiguating ambiguous entities?
 *
 * Runs 10 test cases × 3 iterations each = 30 total calls.
 * Multiple iterations detect stochastic failures (model returns different
 * confidence across runs for the same input).
 *
 * Success criteria: false_high ≤ 1 out of 10 cases (across majority vote).
 */

import Anthropic from "@anthropic-ai/sdk";
import { testSet, type TestCase, type ExistingFact, type ExistingEntity } from "./test-set";

// =============================================================================
// Config
// =============================================================================

const MODEL = "claude-haiku-4-5-20251001";
const ITERATIONS = 3;
const CONCURRENCY = 2; // Anthropic rate limit friendly
const TODAY = "2026-02-21";

// =============================================================================
// Prompt & Schema (subset of task-0.3 combined prompt, entity-focused)
// =============================================================================

const structuredOutputSchema = {
  type: "object" as const,
  properties: {
    facts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          content: { type: "string" },
          fact_type: {
            type: "string",
            enum: ["location", "workplace", "relationship", "event", "preference", "health", "date", "financial", "other"],
          },
          event_date: { type: ["string", "null"] },
          temporal_sensitivity: { type: "string", enum: ["permanent", "long_term", "short_term"] },
          source_quote: { type: "string" },
          is_injection_attempt: { type: "boolean" },
        },
        required: ["content", "fact_type", "event_date", "temporal_sensitivity", "source_quote", "is_injection_attempt"],
        additionalProperties: false,
      },
    },
    entities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          mention: { type: "string" },
          resolved_to_existing_id: { type: ["string", "null"] },
          canonical_name: { type: "string" },
          entity_type: { type: "string", enum: ["person", "place", "organization", "other"] },
          fact_indices: { type: "array", items: { type: "integer" } },
          entity_confidence: {
            type: "string",
            enum: ["high", "low"],
            description:
              "high = one candidate and message context unambiguously points to it. low = multiple equally likely candidates or insufficient context to resolve with confidence. When in doubt — low.",
          },
        },
        required: ["mention", "resolved_to_existing_id", "canonical_name", "entity_type", "fact_indices", "entity_confidence"],
        additionalProperties: false,
      },
    },
    conflicts: { type: "array", items: { type: "object", properties: {}, additionalProperties: true } },
    intent: { type: "string", enum: ["chat", "memory.save", "memory.view", "memory.edit", "memory.delete", "memory.delete_entity", "memory.explain", "reminder.create", "reminder.list", "reminder.cancel", "reminder.edit", "system.delete_account", "system.pause", "system.resume"] },
    complexity: { type: "string", enum: ["trivial", "standard"] },
  },
  required: ["facts", "entities", "conflicts", "intent", "complexity"],
  additionalProperties: false,
};

function buildSystemPrompt(
  existingFacts: ExistingFact[],
  existingEntities: ExistingEntity[],
): string {
  const factsBlock =
    existingFacts.length > 0
      ? `\n## Existing Facts in Memory\n${existingFacts
          .map((f) => `- [${f.id}] (${f.fact_type}) ${f.content}${f.entity_name ? ` [entity: ${f.entity_name}]` : ""}`)
          .join("\n")}`
      : "\n## Existing Facts in Memory\nNone.";

  const entitiesBlock =
    existingEntities.length > 0
      ? `\n## Existing Entities in Memory\n${existingEntities
          .map((e) => `- [${e.id}] ${e.canonical_name} (${e.type})${e.aliases.length > 0 ? ` aliases: ${e.aliases.join(", ")}` : ""}${e.description ? ` — ${e.description}` : ""}`)
          .join("\n")}`
      : "\n## Existing Entities in Memory\nNone.";

  return `You are a message analysis component for a personal AI assistant with long-term memory.
Today's date: ${TODAY}

Analyze the user's message and return a JSON object with:
1. **facts** — Extract significant facts. One fact = one atomic semantic unit.
2. **entities** — Identify entities (people, places, organizations). Match to existing entities when possible.
3. **conflicts** — Compare new facts against existing facts for contradictions.
4. **intent** — Classify user intent.
5. **complexity** — Classify request complexity.

## Fact Extraction Rules
- Extract facts the user states about themselves, their life, people they know, preferences, events.
- Do NOT extract: user questions, hypotheses/speculation, third-party quotes, general world knowledge.
- Exception: intentions and plans ARE extracted with temporal_sensitivity: short_term.
- CRITICAL — fact granularity: one fact = one atomic semantic unit that can be updated/deleted independently.
- Prefer FEWER, more complete facts over many granular ones.
- fact_type must be from: location, workplace, relationship, event, preference, health, date, financial, other.
- temporal_sensitivity: permanent (stable), long_term (months-years), short_term (days-weeks).
- event_date: determine from message context if possible. null if not determinable.

## Entity Resolution
- Match mentions to existing entities by canonical_name, aliases, or semantic context.
- If no match → new entity. Set canonical_name from the most complete form in the message.
- entity_type: person, place, organization, other.
- fact_indices: link each entity to the facts it appears in (0-based index into facts array).
- entity_confidence: set "high" when there is exactly one candidate AND the message context provides a clear signal pointing to it (e.g. health/medical topic + child entity in memory, financial topic + person with financial history, work-related topic + colleague entity). Set "low" when there are multiple candidates with the same name and context does not clearly distinguish them, or when the mention is generic/neutral and could apply to any candidate. When in doubt — "low".

## Intent Classification
- chat: the DEFAULT intent. Any message that is not an explicit memory/reminder/system command.
- memory.save: ONLY when user explicitly asks to remember/save/note something.

## Complexity Classification
- trivial: thanks, simple acknowledgments, very short factual.
- standard: anything requiring reasoning, personalization, memory search. When in doubt → standard.
${factsBlock}
${entitiesBlock}`;
}

// =============================================================================
// LLM Client
// =============================================================================

const anthropic = new Anthropic();

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
  conflicts: unknown[];
  intent: string;
  complexity: string;
}

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 15_000;

async function callModel(systemPrompt: string, userMessage: string): Promise<{
  result: AnalysisResult;
  latencyMs: number;
  tokens: { input: number; output: number };
}> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const start = performance.now();
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        tools: [
          {
            name: "message_analysis",
            description: "Analyze the user message and return structured results.",
            input_schema: structuredOutputSchema as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: "tool", name: "message_analysis" },
        temperature: 0,
      });

      const toolBlock = response.content.find((b) => b.type === "tool_use");
      if (!toolBlock || toolBlock.type !== "tool_use") {
        throw new Error("No tool_use block in response");
      }
      return {
        result: toolBlock.input as unknown as AnalysisResult,
        latencyMs: Math.round(performance.now() - start),
        tokens: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      };
    } catch (err) {
      const is429 = err instanceof Error && (err.message.includes("429") || err.message.includes("rate_limit"));
      if (!is429 || attempt === MAX_RETRIES - 1) throw err;
      const delay = BASE_DELAY_MS * (attempt + 1);
      console.log(`  ⏳ Rate limited, waiting ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
}

// =============================================================================
// Evaluation
// =============================================================================

interface IterationResult {
  confidence: "high" | "low" | "missing";
  resolvedTo: string | null;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  rawEntities: AnalysisResult["entities"];
}

interface TestResult {
  tc: TestCase;
  iterations: IterationResult[];
  majorityConfidence: "high" | "low" | "missing";
  majorityResolvedTo: string | null;
  pass: boolean;
  falseHigh: boolean;
  falseHighCount: number;
  notes: string[];
}

function evaluateIteration(tc: TestCase, result: AnalysisResult): Pick<IterationResult, "confidence" | "resolvedTo" | "rawEntities"> {
  // Find the entity that matches a mention likely referring to the target
  // We look for any entity whose canonical_name matches one of the existing entities
  const targetNames = new Set(tc.existing_entities.map((e) => e.canonical_name));
  const matched = result.entities.find((e) => targetNames.has(e.canonical_name));

  if (!matched) {
    return { confidence: "missing", resolvedTo: null, rawEntities: result.entities };
  }

  return {
    confidence: matched.entity_confidence,
    resolvedTo: matched.resolved_to_existing_id,
    rawEntities: result.entities,
  };
}

function majorityVote(values: Array<"high" | "low" | "missing">): "high" | "low" | "missing" {
  const counts = { high: 0, low: 0, missing: 0 };
  for (const v of values) counts[v]++;
  if (counts.high >= counts.low && counts.high >= counts.missing) return "high";
  if (counts.low >= counts.high && counts.low >= counts.missing) return "low";
  return "missing";
}

// =============================================================================
// Concurrency limiter
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
          .finally(() => { active--; next(); }),
      );
      next();
    });
}

// =============================================================================
// Main
// =============================================================================

async function runTest(tc: TestCase, iteration: number): Promise<IterationResult> {
  const prompt = buildSystemPrompt(tc.existing_facts, tc.existing_entities);
  try {
    const { result, latencyMs, tokens } = await callModel(prompt, tc.message);
    const eval_ = evaluateIteration(tc, result);
    return {
      ...eval_,
      latencyMs,
      tokensIn: tokens.input,
      tokensOut: tokens.output,
    };
  } catch (err) {
    console.error(`  ❌ #${tc.id} iter ${iteration} error: ${err instanceof Error ? err.message : err}`);
    return { confidence: "missing", resolvedTo: null, latencyMs: 0, tokensIn: 0, tokensOut: 0, rawEntities: [] };
  }
}

async function main() {
  console.log(`TASK-0.3-ext: Entity Confidence Classification Test`);
  console.log(`Model: ${MODEL}`);
  console.log(`Cases: ${testSet.length}, Iterations: ${ITERATIONS}`);
  console.log(`Total calls: ${testSet.length * ITERATIONS}`);
  console.log("=".repeat(60));

  const limit = pLimit(CONCURRENCY);
  const results: TestResult[] = [];

  // Run all test cases × iterations
  for (const tc of testSet) {
    const iterations: IterationResult[] = [];
    const promises = Array.from({ length: ITERATIONS }, (_, i) =>
      limit(() => runTest(tc, i + 1)),
    );
    const iterResults = await Promise.all(promises);
    iterations.push(...iterResults);

    const confidences = iterations.map((it) => it.confidence);
    const majority = majorityVote(confidences);
    const majorityResolved = iterations.find((it) => it.confidence === majority)?.resolvedTo ?? null;

    const notes: string[] = [];

    // Check confidence correctness
    let pass: boolean;
    let falseHigh = false;
    const falseHighCount = iterations.filter(
      (it) => it.confidence === "high" && tc.expected_confidence === "low",
    ).length;

    if (tc.borderline) {
      // Borderline: both values acceptable
      pass = majority !== "missing";
      notes.push(`borderline — accepted either, got "${majority}"`);
    } else if (majority === tc.expected_confidence) {
      pass = true;
    } else if (majority === "missing") {
      pass = false;
      notes.push("entity not found in output");
    } else {
      pass = false;
      if (majority === "high" && tc.expected_confidence === "low") {
        falseHigh = true;
        notes.push(`FALSE HIGH — model confident when it shouldn't be`);
      } else {
        notes.push(`false low — expected "${tc.expected_confidence}", got "${majority}"`);
      }
    }

    // Check entity resolution (for high confidence cases)
    if (tc.expected_entity_id && majority === "high" && majorityResolved !== tc.expected_entity_id) {
      notes.push(`wrong entity: resolved to "${majorityResolved}", expected "${tc.expected_entity_id}"`);
      pass = false;
    }

    // Check consistency across iterations
    const unique = new Set(confidences);
    if (unique.size > 1) {
      notes.push(`inconsistent: [${confidences.join(", ")}]`);
    }

    const icon = pass ? (falseHighCount > 0 ? "⚠️" : "✅") : (falseHigh ? "🔴" : "❌");
    const confStr = confidences.map((c) => c === "high" ? "H" : c === "low" ? "L" : "?").join("");
    console.log(
      `  ${icon} #${tc.id} [${confStr}] majority=${majority} expected=${tc.expected_confidence}${tc.borderline ? " (borderline)" : ""} — ${tc.label}${notes.length > 0 ? ` | ${notes.join("; ")}` : ""}`,
    );

    results.push({
      tc,
      iterations,
      majorityConfidence: majority,
      majorityResolvedTo: majorityResolved,
      pass,
      falseHigh,
      falseHighCount,
      notes,
    });
  }

  // ==========================================================================
  // Summary
  // ==========================================================================

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  const falseHighCases = results.filter((r) => r.falseHigh);
  const falseLowCases = results.filter((r) => !r.pass && !r.falseHigh && r.majorityConfidence !== "missing");
  const totalFalseHighIterations = results.reduce((s, r) => s + r.falseHighCount, 0);

  const totalTokensIn = results.reduce((s, r) => s + r.iterations.reduce((s2, it) => s2 + it.tokensIn, 0), 0);
  const totalTokensOut = results.reduce((s, r) => s + r.iterations.reduce((s2, it) => s2 + it.tokensOut, 0), 0);
  const avgLatency = Math.round(
    results.reduce((s, r) => s + r.iterations.reduce((s2, it) => s2 + it.latencyMs, 0), 0) /
    (testSet.length * ITERATIONS),
  );

  console.log(`\nResults: ${passed}/${testSet.length} passed, ${failed} failed`);
  console.log(`False high (majority): ${falseHighCases.length} cases${falseHighCases.length > 0 ? ` — #${falseHighCases.map((r) => r.tc.id).join(", #")}` : ""}`);
  console.log(`False high (any iteration): ${totalFalseHighIterations}/${testSet.length * ITERATIONS} total`);
  console.log(`False low: ${falseLowCases.length} cases${falseLowCases.length > 0 ? ` — #${falseLowCases.map((r) => r.tc.id).join(", #")}` : ""}`);
  console.log(`\nAvg latency: ${avgLatency}ms`);
  console.log(`Total tokens: ${totalTokensIn} in / ${totalTokensOut} out`);

  // Success criteria
  console.log("\n" + "─".repeat(60));
  const criterionMet = falseHighCases.length <= 1;
  console.log(`SUCCESS CRITERION: false_high ≤ 1/10 → ${criterionMet ? "PASS ✅" : "FAIL ❌"} (${falseHighCases.length}/10)`);
  console.log("─".repeat(60));

  // Detailed results table
  console.log("\nDetailed Results:");
  console.log("ID  Expected  Majority  Iters     Resolved         Pass  Notes");
  for (const r of results) {
    const confStr = r.iterations.map((it) => it.confidence === "high" ? "H" : it.confidence === "low" ? "L" : "?").join("");
    console.log(
      `${String(r.tc.id).padEnd(4)}${r.tc.expected_confidence.padEnd(10)}${r.majorityConfidence.padEnd(10)}${confStr.padEnd(10)}${(r.majorityResolvedTo ?? "none").padEnd(17)}${r.pass ? "✅" : "❌"}     ${r.notes.join("; ")}`,
    );
  }

  // Write results to file
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  const report = {
    run_at: new Date().toISOString(),
    model: MODEL,
    today: TODAY,
    iterations: ITERATIONS,
    total_cases: testSet.length,
    passed,
    failed,
    false_high_cases: falseHighCases.length,
    false_high_iterations: totalFalseHighIterations,
    criterion_met: criterionMet,
    avg_latency_ms: avgLatency,
    total_tokens_in: totalTokensIn,
    total_tokens_out: totalTokensOut,
    results: results.map((r) => ({
      id: r.tc.id,
      label: r.tc.label,
      message: r.tc.message,
      expected_confidence: r.tc.expected_confidence,
      borderline: r.tc.borderline ?? false,
      expected_entity_id: r.tc.expected_entity_id ?? null,
      majority_confidence: r.majorityConfidence,
      majority_resolved_to: r.majorityResolvedTo,
      iteration_confidences: r.iterations.map((it) => it.confidence),
      iteration_resolved_to: r.iterations.map((it) => it.resolvedTo),
      pass: r.pass,
      false_high: r.falseHigh,
      false_high_count: r.falseHighCount,
      notes: r.notes,
    })),
  };

  const jsonFile = `results/results-${timestamp}.json`;
  await Bun.write(new URL(jsonFile, import.meta.url), JSON.stringify(report, null, 2));
  console.log(`\n📁 Results written to spikes/task-0.3-ext/${jsonFile}`);
}

main().catch(console.error);

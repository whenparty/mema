/**
 * TASK-0.9 Spike Runner
 *
 * Tests LLM ability to generate valid RRULE from natural language.
 * Validates output using rrule.js (from TASK-0.6).
 *
 * Structure:
 *   1. Config & types
 *   2. LLM clients (reused pattern from TASK-0.3)
 *   3. RRULE validator
 *   4. Test runner
 *   5. Reporting
 *   6. Main
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { RRule, rrulestr } from "rrule";
import { testSet, type TestCase } from "./test-set";
import {
  buildSystemPrompt,
  structuredOutputSchema,
  type RRuleGenerationResult,
} from "./prompt";

// =============================================================================
// 1. Config & types
// =============================================================================

const CONCURRENCY_OPENAI = 5;
const CONCURRENCY_ANTHROPIC = 2;

interface ModelConfig {
  label: string;
  model: string;
  provider: "openai" | "anthropic";
}

const MODEL_CONFIGS: ModelConfig[] = [
  { label: "gpt-5-nano", model: "gpt-5-nano", provider: "openai" },
  { label: "gpt-5-mini", model: "gpt-5-mini", provider: "openai" },
  {
    label: "claude-haiku-4-5",
    model: "claude-haiku-4-5-20251001",
    provider: "anthropic",
  },
];

/** Fallback model used when primary model generates unparseable RRULE */
const FALLBACK_MODEL: ModelConfig = {
  label: "gpt-5-mini (fallback)",
  model: "gpt-5-mini",
  provider: "openai",
};

/** Pipeline config: primary model + rrule.js validation + fallback */
interface PipelineConfig {
  label: string;
  primary: ModelConfig;
  fallback: ModelConfig;
}

const PIPELINE_CONFIGS: PipelineConfig[] = [
  {
    label: "haiku→validate→mini",
    primary: {
      label: "claude-haiku-4-5",
      model: "claude-haiku-4-5-20251001",
      provider: "anthropic",
    },
    fallback: FALLBACK_MODEL,
  },
];

interface ValidationResult {
  parseable: boolean;
  parseError?: string;
  recurringCorrect: boolean;
  freqCorrect: boolean | null;
  intervalCorrect: boolean | null;
  byDayCorrect: boolean | null;
  byMonthDayCorrect: boolean | null;
  bySetPosCorrect: boolean | null;
  wallClockCorrect: boolean | null;
  notes: string[];
}

interface RunResult {
  testId: number;
  category: string;
  llmResult: RRuleGenerationResult | null;
  validation: ValidationResult;
  latencyMs: number;
  tokens: { input: number; output: number };
  error: string | null;
  fallbackUsed: boolean;
}

// =============================================================================
// 2. LLM clients
// =============================================================================

const openai = new OpenAI();
const anthropic = new Anthropic();

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
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    tools: [
      {
        name: toolName,
        description: "Generate RRULE or one-time datetime from the user request.",
        input_schema: schema.json_schema.schema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: toolName },
    temperature: 0,
  });

  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw new Error(`Anthropic did not return tool_use block`);
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
const BASE_DELAY_MS = 15_000;

async function callModel<T>(
  config: ModelConfig,
  systemPrompt: string,
  userMessage: string,
  schema: JsonSchemaFormat,
): Promise<LLMResponse<T>> {
  const call = () =>
    config.provider === "anthropic"
      ? callAnthropic<T>(
          config.model,
          systemPrompt,
          userMessage,
          "rrule_generation",
          schema,
        )
      : callOpenAI<T>(config.model, systemPrompt, userMessage, schema);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await call();
    } catch (err) {
      const is429 =
        err instanceof Error &&
        (err.message.includes("429") || err.message.includes("rate_limit"));
      if (!is429 || attempt === MAX_RETRIES - 1) throw err;
      const delay = BASE_DELAY_MS * (attempt + 1);
      console.log(
        `    ⏳ Rate limited, waiting ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})…`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
}

// =============================================================================
// 3. RRULE validator
// =============================================================================

function validateRRuleResult(
  tc: TestCase,
  result: RRuleGenerationResult,
): ValidationResult {
  const notes: string[] = [];
  const exp = tc.expected;

  // Check recurring vs one-time classification
  const recurringCorrect = result.is_recurring === exp.isRecurring;
  if (!recurringCorrect) {
    notes.push(
      `recurring: got ${result.is_recurring}, expected ${exp.isRecurring}`,
    );
  }

  // For one-time reminders, we only check recurring classification + datetime presence
  if (!exp.isRecurring) {
    const hasDatetime = result.one_time_datetime !== null;
    const hasNoRrule = result.rrule_string === null;
    if (!hasDatetime) notes.push("one_time: missing one_time_datetime");
    if (!hasNoRrule) notes.push("one_time: rrule_string should be null");

    // Check wall clock time from one_time_datetime if we have expected values
    let wallClockCorrect: boolean | null = null;
    if (hasDatetime && exp.wallClockHour >= 0) {
      try {
        const dt = new Date(result.one_time_datetime!);
        const hour = dt.getHours() || parseInt(result.one_time_datetime!.split("T")[1]!.split(":")[0]!, 10);
        const minute = dt.getMinutes() || parseInt(result.one_time_datetime!.split("T")[1]!.split(":")[1]!, 10);
        wallClockCorrect = hour === exp.wallClockHour && minute === exp.wallClockMinute;
        if (!wallClockCorrect) {
          notes.push(`wall_clock: got ${hour}:${String(minute).padStart(2, "0")}, expected ${exp.wallClockHour}:${String(exp.wallClockMinute).padStart(2, "0")}`);
        }
      } catch {
        wallClockCorrect = false;
        notes.push(`wall_clock: cannot parse one_time_datetime "${result.one_time_datetime}"`);
      }
    }

    return {
      parseable: hasDatetime && hasNoRrule,
      recurringCorrect,
      freqCorrect: null,
      intervalCorrect: null,
      byDayCorrect: null,
      byMonthDayCorrect: null,
      bySetPosCorrect: null,
      wallClockCorrect,
      notes,
    };
  }

  // For recurring: validate the RRULE string
  if (!result.rrule_string) {
    notes.push("missing rrule_string for recurring reminder");
    return {
      parseable: false,
      recurringCorrect,
      freqCorrect: null,
      intervalCorrect: null,
      byDayCorrect: null,
      byMonthDayCorrect: null,
      bySetPosCorrect: null,
      wallClockCorrect: null,
      notes,
    };
  }

  // Try to parse with rrule.js
  let rule: RRule;
  try {
    // rrule.js expects newline between DTSTART and RRULE
    const normalizedString = result.rrule_string
      .replace(/\\n/g, "\n")
      .replace(/\r\n/g, "\n");
    rule = rrulestr(normalizedString) as RRule;
  } catch (e) {
    notes.push(`parse_error: ${e instanceof Error ? e.message : String(e)}`);
    notes.push(`raw_rrule: "${result.rrule_string}"`);
    return {
      parseable: false,
      parseError: String(e),
      recurringCorrect,
      freqCorrect: null,
      intervalCorrect: null,
      byDayCorrect: null,
      byMonthDayCorrect: null,
      bySetPosCorrect: null,
      wallClockCorrect: null,
      notes,
    };
  }

  const options = rule.origOptions;

  // Check FREQ
  const freqMap: Record<number, string> = {
    [RRule.DAILY]: "DAILY",
    [RRule.WEEKLY]: "WEEKLY",
    [RRule.MONTHLY]: "MONTHLY",
    [RRule.YEARLY]: "YEARLY",
  };
  let freqCorrect: boolean | null = null;
  if (exp.freq) {
    const gotFreq = freqMap[options.freq!] ?? `unknown(${options.freq})`;
    freqCorrect = gotFreq === exp.freq;

    // DAILY+BYDAY for weekdays is functionally equivalent to WEEKLY+BYDAY
    // Both produce identical occurrences. Accept as correct.
    if (!freqCorrect && exp.freq === "WEEKLY" && gotFreq === "DAILY" && exp.byDay) {
      freqCorrect = true;
      notes.push("freq: DAILY+BYDAY accepted as equivalent to WEEKLY+BYDAY");
    }

    if (!freqCorrect) {
      notes.push(`freq: got ${gotFreq}, expected ${exp.freq}`);
    }
  }

  // Check INTERVAL
  let intervalCorrect: boolean | null = null;
  if (exp.interval !== undefined) {
    const gotInterval = options.interval ?? 1;
    intervalCorrect = gotInterval === exp.interval;
    if (!intervalCorrect) {
      notes.push(`interval: got ${gotInterval}, expected ${exp.interval}`);
    }
  }

  // Check BYDAY
  let byDayCorrect: boolean | null = null;
  if (exp.byDay) {
    const weekdayMap: Record<number, string> = {
      0: "MO",
      1: "TU",
      2: "WE",
      3: "TH",
      4: "FR",
      5: "SA",
      6: "SU",
    };

    // rrule.js stores byweekday as Weekday objects or numbers
    const gotDays: string[] = [];
    const byweekday = options.byweekday;
    if (byweekday) {
      for (const wd of Array.isArray(byweekday) ? byweekday : [byweekday]) {
        if (typeof wd === "number") {
          gotDays.push(weekdayMap[wd] ?? `?${wd}`);
        } else if (typeof wd === "object" && "weekday" in wd) {
          gotDays.push(weekdayMap[(wd as { weekday: number }).weekday] ?? `?`);
        }
      }
    }

    const expectedSorted = [...exp.byDay].sort();
    const gotSorted = [...gotDays].sort();
    byDayCorrect =
      expectedSorted.length === gotSorted.length &&
      expectedSorted.every((v, i) => v === gotSorted[i]);
    if (!byDayCorrect) {
      notes.push(
        `byDay: got [${gotSorted.join(",")}], expected [${expectedSorted.join(",")}]`,
      );
    }
  }

  // Check BYMONTHDAY
  let byMonthDayCorrect: boolean | null = null;
  if (exp.byMonthDay) {
    const gotMonthDays = options.bymonthday
      ? Array.isArray(options.bymonthday)
        ? options.bymonthday
        : [options.bymonthday]
      : [];
    const expectedSorted = [...exp.byMonthDay].sort((a, b) => a - b);
    const gotSorted = [...gotMonthDays].sort((a, b) => a - b);
    byMonthDayCorrect =
      expectedSorted.length === gotSorted.length &&
      expectedSorted.every((v, i) => v === gotSorted[i]);
    if (!byMonthDayCorrect) {
      notes.push(
        `byMonthDay: got [${gotSorted}], expected [${expectedSorted}]`,
      );
    }
  }

  // Check BYSETPOS
  let bySetPosCorrect: boolean | null = null;
  if (exp.bySetPos) {
    // rrule.js may encode ordinal weekday differently:
    // "3TH" → byweekday with nth, or bysetpos + byweekday
    // We need to check both representations
    const gotSetPos = options.bysetpos
      ? Array.isArray(options.bysetpos)
        ? options.bysetpos
        : [options.bysetpos]
      : [];

    // Also check if nth is encoded in byweekday
    const byweekday = options.byweekday;
    const nthFromWeekday: number[] = [];
    if (byweekday) {
      for (const wd of Array.isArray(byweekday) ? byweekday : [byweekday]) {
        if (typeof wd === "object" && "n" in wd && (wd as { n: number }).n !== undefined) {
          nthFromWeekday.push((wd as { n: number }).n);
        }
      }
    }

    if (gotSetPos.length > 0) {
      const expectedSorted = [...exp.bySetPos].sort((a, b) => a - b);
      const gotSorted = [...gotSetPos].sort((a, b) => a - b);
      bySetPosCorrect =
        expectedSorted.length === gotSorted.length &&
        expectedSorted.every((v, i) => v === gotSorted[i]);
    } else if (nthFromWeekday.length > 0) {
      // Ordinal encoded in weekday object (e.g., BYDAY=3TH)
      const expectedSorted = [...exp.bySetPos].sort((a, b) => a - b);
      const gotSorted = [...nthFromWeekday].sort((a, b) => a - b);
      bySetPosCorrect =
        expectedSorted.length === gotSorted.length &&
        expectedSorted.every((v, i) => v === gotSorted[i]);
      if (bySetPosCorrect) {
        notes.push("bySetPos: encoded via BYDAY nth (e.g., 3TH) — valid");
      }
    } else {
      bySetPosCorrect = false;
    }

    if (!bySetPosCorrect) {
      notes.push(
        `bySetPos: got setpos=[${gotSetPos}] nth=[${nthFromWeekday}], expected [${exp.bySetPos}]`,
      );
    }
  }

  // Check wall clock time via actual occurrence computation
  let wallClockCorrect: boolean | null = null;
  try {
    const refDate = new Date(tc.referenceDate + "T00:00:00Z");
    const nextOccurrence = rule.after(refDate, true);
    if (nextOccurrence) {
      // The occurrence is in UTC. Convert to user TZ wall-clock to verify.
      const wallClock = getWallClockInTZ(nextOccurrence, tc.userTimezone);
      wallClockCorrect =
        wallClock.hour === exp.wallClockHour &&
        wallClock.minute === exp.wallClockMinute;
      if (!wallClockCorrect) {
        notes.push(
          `wall_clock: got ${wallClock.hour}:${String(wallClock.minute).padStart(2, "0")} (UTC: ${nextOccurrence.toISOString()}), expected ${exp.wallClockHour}:${String(exp.wallClockMinute).padStart(2, "0")}`,
        );
      }
    } else {
      notes.push("wall_clock: no occurrence found after reference date");
      wallClockCorrect = false;
    }
  } catch (e) {
    notes.push(`wall_clock_error: ${e}`);
    wallClockCorrect = false;
  }

  return {
    parseable: true,
    recurringCorrect,
    freqCorrect,
    intervalCorrect,
    byDayCorrect,
    byMonthDayCorrect,
    bySetPosCorrect,
    wallClockCorrect,
    notes,
  };
}

/** Convert a UTC Date to wall-clock hours/minutes in a given IANA timezone */
function getWallClockInTZ(
  utcDate: Date,
  timezone: string,
): { hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(utcDate);
  const hour = parseInt(
    parts.find((p) => p.type === "hour")!.value,
    10,
  );
  const minute = parseInt(
    parts.find((p) => p.type === "minute")!.value,
    10,
  );
  return { hour: hour === 24 ? 0 : hour, minute };
}

// =============================================================================
// 4. Test runner
// =============================================================================

async function runTest(
  config: ModelConfig,
  tc: TestCase,
): Promise<RunResult> {
  const systemPrompt = buildSystemPrompt(tc.userTimezone, tc.referenceDate);

  try {
    const { result, latencyMs, tokens } =
      await callModel<RRuleGenerationResult>(
        config,
        systemPrompt,
        tc.message,
        structuredOutputSchema,
      );

    const validation = validateRRuleResult(tc, result);

    return {
      testId: tc.id,
      category: tc.category,
      llmResult: result,
      validation,
      latencyMs,
      tokens,
      error: null,
      fallbackUsed: false,
    };
  } catch (err) {
    return {
      testId: tc.id,
      category: tc.category,
      llmResult: null,
      validation: {
        parseable: false,
        recurringCorrect: false,
        freqCorrect: null,
        intervalCorrect: null,
        byDayCorrect: null,
        byMonthDayCorrect: null,
        bySetPosCorrect: null,
        wallClockCorrect: null,
        notes: [`ERROR: ${err instanceof Error ? err.message : String(err)}`],
      },
      latencyMs: 0,
      tokens: { input: 0, output: 0 },
      error: err instanceof Error ? err.message : String(err),
      fallbackUsed: false,
    };
  }
}

/**
 * Pipeline test: primary model → rrule.js validate → if fails → fallback model → validate
 * This is the production approach: fast model first, smart model as safety net.
 */
async function runPipelineTest(
  pipeline: PipelineConfig,
  tc: TestCase,
): Promise<RunResult> {
  // Step 1: try primary (fast) model
  const primaryResult = await runTest(pipeline.primary, tc);

  // Step 2: check if RRULE is parseable (the critical validation)
  const needsFallback =
    primaryResult.llmResult?.is_recurring === true &&
    !primaryResult.validation.parseable;

  if (!needsFallback) {
    return primaryResult;
  }

  // Step 3: fallback to smart model with error context
  console.log(
    `    🔄 #${tc.id} fallback: ${primaryResult.validation.parseError ?? "parse failed"}`,
  );

  const fallbackResult = await runTest(pipeline.fallback, tc);
  return {
    ...fallbackResult,
    // Accumulate latency and tokens from both calls
    latencyMs: primaryResult.latencyMs + fallbackResult.latencyMs,
    tokens: {
      input: primaryResult.tokens.input + fallbackResult.tokens.input,
      output: primaryResult.tokens.output + fallbackResult.tokens.output,
    },
    fallbackUsed: true,
  };
}

// =============================================================================
// 5. Reporting
// =============================================================================

class Logger {
  private lines: string[] = [];

  report(line: string): void {
    this.lines.push(line);
  }

  async flush(filepath: string): Promise<void> {
    await Bun.write(
      new URL(filepath, import.meta.url),
      this.lines.join("\n") + "\n",
    );
    console.log(`\n📄 Report written to spikes/task-0.9/${filepath}`);
  }
}

const log = new Logger();

function computeScore(v: ValidationResult): number {
  // Weighted scoring:
  // - recurring classification: 20%
  // - parseable: 20%
  // - freq correct: 15%
  // - wall clock correct: 15%
  // - interval correct: 10%
  // - byDay correct: 10%
  // - byMonthDay correct: 5%
  // - bySetPos correct: 5%
  const checks: Array<{ value: boolean | null; weight: number }> = [
    { value: v.recurringCorrect, weight: 20 },
    { value: v.parseable, weight: 20 },
    { value: v.freqCorrect, weight: 15 },
    { value: v.wallClockCorrect, weight: 15 },
    { value: v.intervalCorrect, weight: 10 },
    { value: v.byDayCorrect, weight: 10 },
    { value: v.byMonthDayCorrect, weight: 5 },
    { value: v.bySetPosCorrect, weight: 5 },
  ];

  let totalWeight = 0;
  let earned = 0;
  for (const { value, weight } of checks) {
    if (value === null) continue; // not applicable
    totalWeight += weight;
    if (value) earned += weight;
  }

  return totalWeight > 0 ? earned / totalWeight : 1;
}

interface ModelStats {
  avgScore: number;
  avgLatencyMs: number;
  parseRate: number;
  recurringAccuracy: number;
  freqAccuracy: number;
  wallClockAccuracy: number;
  byCategory: Map<string, { total: number; avgScore: number }>;
  needsClarificationCount: number;
}

function computeStats(runs: RunResult[]): ModelStats {
  const scores = runs.map((r) => computeScore(r.validation));
  const avgScore =
    scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0;
  const avgLatencyMs =
    runs.length > 0
      ? Math.round(
          runs.reduce((a, r) => a + r.latencyMs, 0) / runs.length,
        )
      : 0;

  const parseRate =
    runs.filter((r) => r.validation.parseable).length / runs.length;

  const recurringChecks = runs.filter(
    (r) => r.validation.recurringCorrect !== null,
  );
  const recurringAccuracy =
    recurringChecks.length > 0
      ? recurringChecks.filter((r) => r.validation.recurringCorrect).length /
        recurringChecks.length
      : 0;

  const freqChecks = runs.filter((r) => r.validation.freqCorrect !== null);
  const freqAccuracy =
    freqChecks.length > 0
      ? freqChecks.filter((r) => r.validation.freqCorrect).length /
        freqChecks.length
      : 0;

  const wallClockChecks = runs.filter(
    (r) => r.validation.wallClockCorrect !== null,
  );
  const wallClockAccuracy =
    wallClockChecks.length > 0
      ? wallClockChecks.filter((r) => r.validation.wallClockCorrect).length /
        wallClockChecks.length
      : 0;

  const byCategory = new Map<string, { total: number; totalScore: number }>();
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i]!;
    const cat = r.category;
    if (!byCategory.has(cat))
      byCategory.set(cat, { total: 0, totalScore: 0 });
    const c = byCategory.get(cat)!;
    c.total++;
    c.totalScore += scores[i]!;
  }
  const byCategoryAvg = new Map<string, { total: number; avgScore: number }>();
  for (const [cat, { total, totalScore }] of byCategory) {
    byCategoryAvg.set(cat, { total, avgScore: totalScore / total });
  }

  const needsClarificationCount = runs.filter(
    (r) => r.llmResult?.needs_clarification,
  ).length;

  return {
    avgScore,
    avgLatencyMs,
    parseRate,
    recurringAccuracy,
    freqAccuracy,
    wallClockAccuracy,
    byCategory: byCategoryAvg,
    needsClarificationCount,
  };
}

function printModelSummary(
  label: string,
  runs: RunResult[],
  totalTokensIn: number,
  totalTokensOut: number,
): void {
  const s = computeStats(runs);

  log.report(`\n--- ${label} ---`);
  log.report(`Overall score:      ${(s.avgScore * 100).toFixed(1)}%`);
  log.report(`Avg latency:        ${s.avgLatencyMs}ms`);
  log.report(`Total tokens:       ${totalTokensIn} in / ${totalTokensOut} out`);
  log.report(`\nSuccess Criteria:`);
  log.report(
    `  RRULE parseable:    ${(s.parseRate * 100).toFixed(1)}%  (target: 100% for valid inputs)`,
  );
  log.report(
    `  Recurring correct:  ${(s.recurringAccuracy * 100).toFixed(1)}%  (target: 100%)`,
  );
  log.report(
    `  Freq correct:       ${(s.freqAccuracy * 100).toFixed(1)}%  (target ≥90%)`,
  );
  log.report(
    `  Wall clock correct: ${(s.wallClockAccuracy * 100).toFixed(1)}%  (target ≥90%)`,
  );
  log.report(`  Needs clarification: ${s.needsClarificationCount}/${runs.length}`);
  log.report(`\nBy category:`);
  for (const [cat, { total, avgScore }] of s.byCategory) {
    log.report(`  ${cat}: ${(avgScore * 100).toFixed(1)}% avg (${total} cases)`);
  }
}

function printComparisonTable(
  allResults: Record<string, { runs: RunResult[]; tokensIn: number; tokensOut: number }>,
): void {
  const W = { label: 26, score: 8, latency: 10, parse: 8, recur: 8, freq: 8, clock: 8 };
  const header =
    "Model".padEnd(W.label) +
    "Score".padEnd(W.score) +
    "Latency".padEnd(W.latency) +
    "Parse".padEnd(W.parse) +
    "Recur".padEnd(W.recur) +
    "Freq".padEnd(W.freq) +
    "Clock";

  log.report(`\n${"=".repeat(header.length + 4)}`);
  log.report("COMPARISON TABLE");
  log.report("=".repeat(header.length + 4));
  log.report(header);

  for (const [label, { runs }] of Object.entries(allResults)) {
    const s = computeStats(runs);
    log.report(
      label.padEnd(W.label) +
        `${(s.avgScore * 100).toFixed(1)}%`.padEnd(W.score) +
        `${s.avgLatencyMs}ms`.padEnd(W.latency) +
        `${(s.parseRate * 100).toFixed(0)}%`.padEnd(W.parse) +
        `${(s.recurringAccuracy * 100).toFixed(0)}%`.padEnd(W.recur) +
        `${(s.freqAccuracy * 100).toFixed(0)}%`.padEnd(W.freq) +
        `${(s.wallClockAccuracy * 100).toFixed(0)}%`,
    );
  }
}

function printProblematicPatterns(
  allResults: Record<string, { runs: RunResult[]; tokensIn: number; tokensOut: number }>,
): void {
  log.report(`\n${"=".repeat(60)}`);
  log.report("PROBLEMATIC PATTERNS (failed in ≥1 model)");
  log.report("=".repeat(60));

  const allModelLabels = Object.keys(allResults);
  const failedTests = new Map<number, string[]>();

  for (const [label, { runs }] of Object.entries(allResults)) {
    for (const run of runs) {
      const score = computeScore(run.validation);
      if (score < 1) {
        if (!failedTests.has(run.testId))
          failedTests.set(run.testId, []);
        const issues = run.validation.notes.join("; ");
        failedTests.get(run.testId)!.push(`${label}: ${issues}`);
      }
    }
  }

  if (failedTests.size === 0) {
    log.report("None — all patterns passed across all models!");
    return;
  }

  for (const [testId, failures] of failedTests) {
    const tc = testSet.find((t) => t.id === testId)!;
    const failedIn = failures.length;
    log.report(
      `\n  #${testId} [${tc.category}] "${tc.message}" — failed in ${failedIn}/${allModelLabels.length} models`,
    );
    for (const f of failures) {
      log.report(`    ${f}`);
    }
  }
}

// =============================================================================
// 6. Main
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

async function runModelConfig(
  config: ModelConfig,
): Promise<{ runs: RunResult[]; tokensIn: number; tokensOut: number }> {
  const concurrency =
    config.provider === "anthropic"
      ? CONCURRENCY_ANTHROPIC
      : CONCURRENCY_OPENAI;
  const limit = pLimit(concurrency);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Model: ${config.label}`);
  console.log("=".repeat(60));

  const runs = await Promise.all(
    testSet.map((tc) => limit(() => runTest(config, tc))),
  );

  let tokensIn = 0;
  let tokensOut = 0;

  for (const run of runs) {
    tokensIn += run.tokens.input;
    tokensOut += run.tokens.output;

    const score = computeScore(run.validation);
    const icon = score >= 1 ? "✅" : score >= 0.6 ? "⚠️" : "❌";
    const noteStr =
      run.validation.notes.length > 0
        ? ` — ${run.validation.notes.join("; ")}`
        : "";
    console.log(
      `  ${icon} #${run.testId} [${run.category}] score=${score.toFixed(2)} latency=${run.latencyMs}ms${noteStr}`,
    );
  }

  return { runs, tokensIn, tokensOut };
}

async function runPipelineConfig(
  pipeline: PipelineConfig,
): Promise<{ runs: RunResult[]; tokensIn: number; tokensOut: number }> {
  // Pipeline uses primary model's concurrency (bottleneck is Anthropic rate limit)
  const concurrency =
    pipeline.primary.provider === "anthropic"
      ? CONCURRENCY_ANTHROPIC
      : CONCURRENCY_OPENAI;
  const limit = pLimit(concurrency);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Pipeline: ${pipeline.label}`);
  console.log("=".repeat(60));

  const runs = await Promise.all(
    testSet.map((tc) => limit(() => runPipelineTest(pipeline, tc))),
  );

  let tokensIn = 0;
  let tokensOut = 0;
  let fallbackCount = 0;

  for (const run of runs) {
    tokensIn += run.tokens.input;
    tokensOut += run.tokens.output;
    if (run.fallbackUsed) fallbackCount++;

    const score = computeScore(run.validation);
    const icon = score >= 1 ? "✅" : score >= 0.6 ? "⚠️" : "❌";
    const fallbackTag = run.fallbackUsed ? " [FALLBACK]" : "";
    const noteStr =
      run.validation.notes.length > 0
        ? ` — ${run.validation.notes.join("; ")}`
        : "";
    console.log(
      `  ${icon} #${run.testId} [${run.category}] score=${score.toFixed(2)} latency=${run.latencyMs}ms${fallbackTag}${noteStr}`,
    );
  }

  console.log(`\n  Fallback used: ${fallbackCount}/${runs.length} cases`);

  return { runs, tokensIn, tokensOut };
}

async function main() {
  // Verify TZ=UTC (critical for rrule.js TZID support)
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz !== "UTC") {
    console.error(`❌ TZ must be UTC for rrule.js TZID support (got: ${tz})`);
    console.error("   Run with: TZ=UTC bun run run-spike.ts");
    process.exit(1);
  }
  console.log("✅ TZ=UTC confirmed\n");

  const allResults: Record<
    string,
    { runs: RunResult[]; tokensIn: number; tokensOut: number }
  > = {};

  for (const config of MODEL_CONFIGS) {
    allResults[config.label] = await runModelConfig(config);
  }

  // Run pipeline configs (primary → validate → fallback)
  for (const pipeline of PIPELINE_CONFIGS) {
    allResults[pipeline.label] = await runPipelineConfig(pipeline);
  }

  // Generate report
  const allLabels = [
    ...MODEL_CONFIGS.map((c) => c.label),
    ...PIPELINE_CONFIGS.map((p) => p.label),
  ];

  log.report("=".repeat(60));
  log.report("TASK-0.9 SPIKE RESULTS: LLM-Generated RRULE Quality");
  log.report("=".repeat(60));
  log.report(`Date: ${new Date().toISOString()}`);
  log.report(`Test cases: ${testSet.length}`);
  log.report(`Models: ${allLabels.join(", ")}`);

  for (const label of allLabels) {
    const r = allResults[label]!;
    const fallbackCount = r.runs.filter((run) => run.fallbackUsed).length;
    printModelSummary(label, r.runs, r.tokensIn, r.tokensOut);
    if (fallbackCount > 0) {
      log.report(`  Fallback used: ${fallbackCount}/${r.runs.length}`);
    }
  }

  printComparisonTable(allResults);
  printProblematicPatterns(allResults);

  // Write report files
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  const reportFile = `results/report-${timestamp}.txt`;
  const jsonFile = `results/results-${timestamp}.json`;

  await log.flush(reportFile);

  await Bun.write(
    new URL(jsonFile, import.meta.url),
    JSON.stringify(
      {
        run_at: new Date().toISOString(),
        test_count: testSet.length,
        configs: [...MODEL_CONFIGS, ...PIPELINE_CONFIGS.map((p) => ({ label: p.label }))],
        results: Object.fromEntries(
          allLabels.map((label) => {
            const r = allResults[label]!;
            const stats = computeStats(r.runs);
            return [
              label,
              {
                total_cases: r.runs.length,
                avg_score: stats.avgScore,
                avg_latency_ms: stats.avgLatencyMs,
                parse_rate: stats.parseRate,
                recurring_accuracy: stats.recurringAccuracy,
                freq_accuracy: stats.freqAccuracy,
                wall_clock_accuracy: stats.wallClockAccuracy,
                total_tokens_in: r.tokensIn,
                total_tokens_out: r.tokensOut,
                runs: r.runs.map((run) => ({
                  test_id: run.testId,
                  category: run.category,
                  score: computeScore(run.validation),
                  validation: run.validation,
                  llm_result: run.llmResult,
                  latency_ms: run.latencyMs,
                  tokens: run.tokens,
                  error: run.error,
                })),
              },
            ];
          }),
        ),
      },
      null,
      2,
    ),
  );
  console.log(`📁 Data exported to spikes/task-0.9/${jsonFile}`);
}

main().catch(console.error);

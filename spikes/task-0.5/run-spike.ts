/**
 * TASK-0.5 Spike Runner — Semantic Search Quality in Russian
 *
 * Tests text-embedding-3-small and text-embedding-3-large on Russian-language
 * facts. Compares two search strategies:
 *   - pure: cosine similarity on full corpus
 *   - filtered: filter by relevant_fact_types first, then cosine similarity
 *
 * Structure:
 *   1. Config & types
 *   2. Embedding client
 *   3. Search (pure cosine similarity + fact_type filtering)
 *   4. Evaluator
 *   5. Logger
 *   6. Reporting
 *   7. Main
 */

import OpenAI from "openai";
import { corpus, type CorpusFact } from "./corpus";
import { queries, type TestQuery } from "./queries";

// =============================================================================
// 1. Config & types
// =============================================================================

type SearchMode = "pure" | "filtered";

interface ModelConfig {
  label: string;
  model: string;
  dimensions: number;
  cost_per_million: number;
}

const MODEL_CONFIGS: ModelConfig[] = [
  {
    label: "text-embedding-3-small",
    model: "text-embedding-3-small",
    dimensions: 1536,
    cost_per_million: 0.02,
  },
  {
    label: "text-embedding-3-large",
    model: "text-embedding-3-large",
    dimensions: 3072,
    cost_per_million: 0.13,
  },
];

const SEARCH_MODES: SearchMode[] = ["pure", "filtered"];
const TOP_K_VALUES = [5, 10, 20];

interface EmbeddingResult {
  id: string;
  text: string;
  fact_type: string;
  embedding: number[];
}

interface SearchHit {
  id: string;
  score: number;
  rank: number;
}

interface QueryEval {
  query_id: string;
  query_type: string;
  description: string;
  expected_fact_ids: string[];
  results_by_k: Record<number, {
    recall: number;
    hits: string[];
    misses: string[];
  }>;
  mrr: number;
  top_results: SearchHit[];
}

interface RunEval {
  model: string;
  search_mode: SearchMode;
  embed_latency_ms: number;
  total_tokens: number;
  query_evals: QueryEval[];
  summary: RunSummary;
}

interface RunSummary {
  overall_recall: Record<number, number>;
  overall_mrr: number;
  by_query_type: Record<string, {
    count: number;
    recall: Record<number, number>;
    mrr: number;
  }>;
  by_fact_tag: Record<string, {
    total_expected: number;
    found_at_5: number;
    found_at_10: number;
    found_at_20: number;
  }>;
}

// =============================================================================
// 2. Embedding client
// =============================================================================

const openai = new OpenAI();

async function embedBatch(
  texts: string[],
  model: string,
): Promise<{ embeddings: number[][]; tokens: number; latencyMs: number }> {
  const start = performance.now();
  const response = await openai.embeddings.create({
    model,
    input: texts,
  });
  const latencyMs = Math.round(performance.now() - start);
  const embeddings = response.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
  const tokens = response.usage.total_tokens;
  return { embeddings, tokens, latencyMs };
}

// =============================================================================
// 3. Search — cosine similarity + optional fact_type filtering
// =============================================================================

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function searchTopK(
  queryEmbedding: number[],
  corpusEmbeddings: EmbeddingResult[],
  k: number,
  factTypeFilter?: string[],
): SearchHit[] {
  let candidates = corpusEmbeddings;
  if (factTypeFilter && factTypeFilter.length > 0) {
    const filterSet = new Set(factTypeFilter);
    candidates = corpusEmbeddings.filter((item) => filterSet.has(item.fact_type));
  }
  const scores = candidates.map((item) => ({
    id: item.id,
    score: cosineSimilarity(queryEmbedding, item.embedding),
    rank: 0,
  }));
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, k).map((hit, i) => ({ ...hit, rank: i + 1 }));
}

// =============================================================================
// 4. Evaluator
// =============================================================================

function evaluateQuery(
  query: TestQuery,
  queryEmbedding: number[],
  corpusEmbeddings: EmbeddingResult[],
  mode: SearchMode,
): QueryEval {
  const maxK = Math.max(...TOP_K_VALUES);
  const filter = mode === "filtered" ? query.relevant_fact_types : undefined;
  const topResults = searchTopK(queryEmbedding, corpusEmbeddings, maxK, filter);
  const expectedSet = new Set(query.expected_fact_ids);

  const results_by_k: QueryEval["results_by_k"] = {};
  for (const k of TOP_K_VALUES) {
    const topK = topResults.slice(0, k);
    const hits = topK.filter((h) => expectedSet.has(h.id)).map((h) => h.id);
    const misses = query.expected_fact_ids.filter(
      (id) => !topK.some((h) => h.id === id),
    );
    const recall = query.expected_fact_ids.length > 0
      ? hits.length / query.expected_fact_ids.length
      : 1;
    results_by_k[k] = { recall, hits, misses };
  }

  const firstRelevant = topResults.find((h) => expectedSet.has(h.id));
  const mrr = firstRelevant ? 1 / firstRelevant.rank : 0;

  return {
    query_id: query.id,
    query_type: query.query_type,
    description: query.description,
    expected_fact_ids: query.expected_fact_ids,
    results_by_k,
    mrr,
    top_results: topResults,
  };
}

// =============================================================================
// 5. Logger
// =============================================================================

class Logger {
  private lines: string[] = [];

  progress(line: string): void {
    process.stdout.write(line + "\n");
  }

  report(line: string): void {
    this.lines.push(line);
  }

  async flush(filepath: string): Promise<void> {
    await Bun.write(
      new URL(filepath, import.meta.url),
      this.lines.join("\n") + "\n",
    );
    console.log(`\n📄 Report written to spikes/task-0.5/${filepath}`);
  }
}

const log = new Logger();

// =============================================================================
// 6. Reporting
// =============================================================================

function computeSummary(queryEvals: QueryEval[]): RunSummary {
  const overall_recall: Record<number, number> = {};
  for (const k of TOP_K_VALUES) {
    const avg =
      queryEvals.reduce((sum, qe) => sum + qe.results_by_k[k]!.recall, 0) /
      queryEvals.length;
    overall_recall[k] = avg;
  }

  const overall_mrr =
    queryEvals.reduce((sum, qe) => sum + qe.mrr, 0) / queryEvals.length;

  const byType = new Map<string, QueryEval[]>();
  for (const qe of queryEvals) {
    if (!byType.has(qe.query_type)) byType.set(qe.query_type, []);
    byType.get(qe.query_type)!.push(qe);
  }
  const by_query_type: RunSummary["by_query_type"] = {};
  for (const [type, evals] of byType) {
    const recall: Record<number, number> = {};
    for (const k of TOP_K_VALUES) {
      recall[k] =
        evals.reduce((sum, qe) => sum + qe.results_by_k[k]!.recall, 0) /
        evals.length;
    }
    const mrr = evals.reduce((sum, qe) => sum + qe.mrr, 0) / evals.length;
    by_query_type[type] = { count: evals.length, recall, mrr };
  }

  const by_fact_tag: RunSummary["by_fact_tag"] = {};
  const tagMap = new Map<string, string[]>();
  for (const fact of corpus) {
    for (const tag of fact.tags) {
      if (!tagMap.has(tag)) tagMap.set(tag, []);
      tagMap.get(tag)!.push(fact.id);
    }
  }

  for (const [tag, factIds] of tagMap) {
    const factIdSet = new Set(factIds);
    let totalExpected = 0;
    let foundAt5 = 0;
    let foundAt10 = 0;
    let foundAt20 = 0;

    for (const qe of queryEvals) {
      const relevantExpected = qe.expected_fact_ids.filter((id) =>
        factIdSet.has(id),
      );
      totalExpected += relevantExpected.length;

      for (const k of [5, 10, 20]) {
        const hits = qe.results_by_k[k]!.hits;
        const found = relevantExpected.filter((id) => hits.includes(id)).length;
        if (k === 5) foundAt5 += found;
        if (k === 10) foundAt10 += found;
        if (k === 20) foundAt20 += found;
      }
    }

    by_fact_tag[tag] = {
      total_expected: totalExpected,
      found_at_5: foundAt5,
      found_at_10: foundAt10,
      found_at_20: foundAt20,
    };
  }

  return { overall_recall, overall_mrr, by_query_type, by_fact_tag };
}

function printRunReport(runEval: RunEval): void {
  const { model, search_mode, summary, embed_latency_ms, total_tokens, query_evals } = runEval;

  log.report(`\n${"=".repeat(70)}`);
  log.report(`MODEL: ${model} | MODE: ${search_mode}`);
  log.report(`${"=".repeat(70)}`);
  log.report(`Embedding latency: ${embed_latency_ms}ms`);
  log.report(`Total tokens: ${total_tokens}`);

  log.report(`\n--- Overall Metrics ---`);
  for (const k of TOP_K_VALUES) {
    log.report(`  Recall@${k}:  ${(summary.overall_recall[k]! * 100).toFixed(1)}%`);
  }
  log.report(`  MRR:       ${(summary.overall_mrr * 100).toFixed(1)}%`);

  log.report(`\n--- By Query Type ---`);
  const typeHeader =
    "Type".padEnd(14) +
    "Count".padEnd(7) +
    "R@5".padEnd(9) +
    "R@10".padEnd(9) +
    "R@20".padEnd(9) +
    "MRR";
  log.report(typeHeader);
  for (const [type, data] of Object.entries(summary.by_query_type)) {
    log.report(
      type.padEnd(14) +
      `${data.count}`.padEnd(7) +
      `${(data.recall[5]! * 100).toFixed(1)}%`.padEnd(9) +
      `${(data.recall[10]! * 100).toFixed(1)}%`.padEnd(9) +
      `${(data.recall[20]! * 100).toFixed(1)}%`.padEnd(9) +
      `${(data.mrr * 100).toFixed(1)}%`,
    );
  }

  log.report(`\n--- By Linguistic Tag (fact retrieval rate) ---`);
  const tagHeader =
    "Tag".padEnd(18) +
    "Expected".padEnd(10) +
    "Found@5".padEnd(10) +
    "Found@10".padEnd(10) +
    "Found@20".padEnd(10) +
    "Rate@5";
  log.report(tagHeader);
  for (const [tag, data] of Object.entries(summary.by_fact_tag)) {
    const rate = data.total_expected > 0
      ? ((data.found_at_5 / data.total_expected) * 100).toFixed(1) + "%"
      : "n/a";
    log.report(
      tag.padEnd(18) +
      `${data.total_expected}`.padEnd(10) +
      `${data.found_at_5}`.padEnd(10) +
      `${data.found_at_10}`.padEnd(10) +
      `${data.found_at_20}`.padEnd(10) +
      rate,
    );
  }

  const failures = query_evals.filter((qe) => qe.results_by_k[5]!.recall < 1.0);
  if (failures.length > 0) {
    log.report(`\n--- Failure Analysis (recall@5 < 100%) ---`);
    for (const qe of failures) {
      const r5 = qe.results_by_k[5]!;
      log.report(
        `  ${qe.query_id} [${qe.query_type}] recall@5=${(r5.recall * 100).toFixed(0)}%` +
        ` — missed: [${r5.misses.join(", ")}]`,
      );
      for (const missedId of r5.misses) {
        const fact = corpus.find((f) => f.id === missedId);
        if (fact) {
          log.report(`    ${missedId}: "${fact.content}" [${fact.tags.join(", ")}]`);
        }
      }
      for (const missedId of r5.misses) {
        const hit = qe.top_results.find((h) => h.id === missedId);
        if (hit) {
          log.report(
            `    → ${missedId} was at rank ${hit.rank} (score: ${hit.score.toFixed(4)})`,
          );
        } else {
          log.report(`    → ${missedId} not in top-20`);
        }
      }
    }
  }
}

function printComparisonTable(allRuns: RunEval[]): void {
  log.report(`\n${"=".repeat(80)}`);
  log.report("COMPARISON TABLE");
  log.report("=".repeat(80));

  const header =
    "Model".padEnd(28) +
    "Mode".padEnd(12) +
    "R@5".padEnd(9) +
    "R@10".padEnd(9) +
    "R@20".padEnd(9) +
    "MRR";
  log.report(header);

  for (const run of allRuns) {
    log.report(
      run.model.padEnd(28) +
      run.search_mode.padEnd(12) +
      `${(run.summary.overall_recall[5]! * 100).toFixed(1)}%`.padEnd(9) +
      `${(run.summary.overall_recall[10]! * 100).toFixed(1)}%`.padEnd(9) +
      `${(run.summary.overall_recall[20]! * 100).toFixed(1)}%`.padEnd(9) +
      `${(run.summary.overall_mrr * 100).toFixed(1)}%`,
    );
  }

  // Per-type comparison: pure vs filtered for each model
  log.report(`\nRecall@5 by query type (pure → filtered):`);
  const types = Object.keys(allRuns[0]!.summary.by_query_type);
  for (const config of MODEL_CONFIGS) {
    log.report(`\n  ${config.label}:`);
    const pureRun = allRuns.find((r) => r.model === config.label && r.search_mode === "pure");
    const filteredRun = allRuns.find((r) => r.model === config.label && r.search_mode === "filtered");
    if (!pureRun || !filteredRun) continue;

    for (const type of types) {
      const pureR5 = pureRun.summary.by_query_type[type]?.recall[5] ?? 0;
      const filtR5 = filteredRun.summary.by_query_type[type]?.recall[5] ?? 0;
      const delta = filtR5 - pureR5;
      const deltaStr = delta > 0 ? `+${(delta * 100).toFixed(1)}` : delta < 0 ? `${(delta * 100).toFixed(1)}` : "  0.0";
      log.report(
        `    ${type.padEnd(14)} ${(pureR5 * 100).toFixed(1)}% → ${(filtR5 * 100).toFixed(1)}%  (${deltaStr}%)`,
      );
    }
  }

  // Success criteria
  log.report(`\n${"=".repeat(80)}`);
  log.report("SUCCESS CRITERIA CHECK");
  log.report("=".repeat(80));
  for (const run of allRuns) {
    const directRecall = run.summary.by_query_type["direct"]?.recall[5] ?? 0;
    const indirectRecall = run.summary.by_query_type["indirect"]?.recall[5] ?? 0;
    const colloquialRecall = run.summary.by_query_type["colloquial"]?.recall[5] ?? 0;

    const directPass = directRecall >= 0.8 ? "PASS" : "FAIL";
    const indirectPass = indirectRecall >= 0.6 ? "PASS" : "FAIL";

    const degradation = directRecall > 0
      ? ((directRecall - colloquialRecall) / directRecall) * 100
      : 0;
    const colloquialPass = degradation <= 20 ? "PASS" : "FAIL";

    log.report(`\n  ${run.model} [${run.search_mode}]:`);
    log.report(
      `    Direct R@5:     ${(directRecall * 100).toFixed(1)}%  (target ≥80%) → ${directPass}`,
    );
    log.report(
      `    Indirect R@5:   ${(indirectRecall * 100).toFixed(1)}%  (target ≥60%) → ${indirectPass}`,
    );
    log.report(
      `    Colloquial R@5: ${(colloquialRecall * 100).toFixed(1)}%  (degradation: ${degradation.toFixed(1)}% vs direct → ${colloquialPass})`,
    );
  }
}

// =============================================================================
// 7. Main
// =============================================================================

async function runModel(
  config: ModelConfig,
  mode: SearchMode,
  cachedCorpus: EmbeddingResult[],
  cachedQueryEmbeddings: number[][],
  embedLatencyMs: number,
  totalTokens: number,
): Promise<RunEval> {
  log.progress(`\n--- ${config.label} [${mode}] ---`);

  const queryEvals: QueryEval[] = [];
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i]!;
    const queryEmbedding = cachedQueryEmbeddings[i]!;
    const qe = evaluateQuery(query, queryEmbedding, cachedCorpus, mode);
    queryEvals.push(qe);

    const r5 = qe.results_by_k[5]!;
    const icon = r5.recall >= 1 ? "✅" : r5.recall >= 0.5 ? "⚠️" : "❌";
    log.progress(
      `  ${icon} ${query.id} [${query.query_type}] R@5=${(r5.recall * 100).toFixed(0)}%` +
      ` MRR=${(qe.mrr * 100).toFixed(0)}%` +
      (r5.misses.length > 0 ? ` missed=[${r5.misses.join(",")}]` : ""),
    );
  }

  const summary = computeSummary(queryEvals);

  return {
    model: config.label,
    search_mode: mode,
    embed_latency_ms: embedLatencyMs,
    total_tokens: totalTokens,
    query_evals: queryEvals,
    summary,
  };
}

async function main() {
  const allRuns: RunEval[] = [];

  for (const config of MODEL_CONFIGS) {
    log.progress(`\n${"=".repeat(60)}`);
    log.progress(`Embedding model: ${config.label}`);
    log.progress("=".repeat(60));

    // Embed once, reuse for both modes
    log.progress(`  Embedding ${corpus.length} facts...`);
    const corpusTexts = corpus.map((f) => f.content);
    const corpusResult = await embedBatch(corpusTexts, config.model);
    log.progress(`  → ${corpusResult.latencyMs}ms, ${corpusResult.tokens} tokens`);

    const corpusEmbeddings: EmbeddingResult[] = corpus.map((f, i) => ({
      id: f.id,
      text: f.content,
      fact_type: f.fact_type,
      embedding: corpusResult.embeddings[i]!,
    }));

    log.progress(`  Embedding ${queries.length} queries...`);
    const queryTexts = queries.map((q) => q.query);
    const queryResult = await embedBatch(queryTexts, config.model);
    log.progress(`  → ${queryResult.latencyMs}ms, ${queryResult.tokens} tokens`);

    const totalLatency = corpusResult.latencyMs + queryResult.latencyMs;
    const totalTokens = corpusResult.tokens + queryResult.tokens;

    // Run both modes with cached embeddings
    for (const mode of SEARCH_MODES) {
      const result = await runModel(
        config,
        mode,
        corpusEmbeddings,
        queryResult.embeddings,
        totalLatency,
        totalTokens,
      );
      allRuns.push(result);
    }
  }

  // Write reports
  log.report(`TASK-0.5 Spike Report — Semantic Search Quality in Russian`);
  log.report(`Generated: ${new Date().toISOString()}`);
  log.report(`Corpus: ${corpus.length} facts | Queries: ${queries.length}`);
  log.report(`Search modes: ${SEARCH_MODES.join(", ")}`);

  for (const run of allRuns) {
    printRunReport(run);
  }

  printComparisonTable(allRuns);

  // Flush files
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  const reportFile = `results/report-${timestamp}.txt`;
  const jsonFile = `results/results-${timestamp}.json`;

  await log.flush(reportFile);

  await Bun.write(
    new URL(jsonFile, import.meta.url),
    JSON.stringify(
      {
        run_at: new Date().toISOString(),
        corpus_size: corpus.length,
        query_count: queries.length,
        top_k_values: TOP_K_VALUES,
        search_modes: SEARCH_MODES,
        runs: allRuns.map((run) => ({
          model: run.model,
          search_mode: run.search_mode,
          embed_latency_ms: run.embed_latency_ms,
          total_tokens: run.total_tokens,
          summary: run.summary,
          query_evals: run.query_evals,
        })),
      },
      null,
      2,
    ),
  );
  console.log(`📁 Data exported to spikes/task-0.5/${jsonFile}`);
}

main().catch(console.error);

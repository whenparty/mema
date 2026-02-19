/**
 * TASK-0.5 — Test queries: 30 queries with expected relevant facts
 *
 * Coverage:
 *   - ~12 direct queries (explicit topic match)
 *   - ~8 indirect queries (need inference)
 *   - ~4 colloquial queries
 *   - ~3 mixed-language queries
 *   - ~3 temporal queries
 *
 * `relevant_fact_types` simulates what the combined LLM call (step 8)
 * would output as part of structured output — the fact_types relevant
 * to this query for Tier 2 retrieval filtering.
 */

export interface TestQuery {
  id: string;
  query: string;
  query_type: "direct" | "indirect" | "colloquial" | "mixed" | "temporal";
  expected_fact_ids: string[];
  relevant_fact_types: string[];
  description: string;
}

export const queries: TestQuery[] = [
  // ===== DIRECT QUERIES (~12) =====
  {
    id: "q01",
    query: "Что ты знаешь о моей работе?",
    query_type: "direct",
    expected_fact_ids: ["f02", "f24", "f36"],
    relevant_fact_types: ["workplace"],
    description: "Direct query about workplace — should find all work-related facts",
  },
  {
    id: "q02",
    query: "Где я живу?",
    query_type: "direct",
    expected_fact_ids: ["f01", "f11"],
    relevant_fact_types: ["location"],
    description: "Direct query about location",
  },
  {
    id: "q03",
    query: "Расскажи про мою семью",
    query_type: "direct",
    expected_fact_ids: ["f10", "f13", "f20", "f04", "f43"],
    relevant_fact_types: ["relationship", "event"],
    description: "Direct query about family relationships",
  },
  {
    id: "q04",
    query: "На что у меня аллергия?",
    query_type: "direct",
    expected_fact_ids: ["f06"],
    relevant_fact_types: ["health"],
    description: "Direct query about health/allergies",
  },
  {
    id: "q05",
    query: "Какие у меня долги?",
    query_type: "direct",
    expected_fact_ids: ["f08", "f14"],
    relevant_fact_types: ["financial"],
    description: "Direct query about financial obligations",
  },
  {
    id: "q06",
    query: "Что я люблю есть?",
    query_type: "direct",
    expected_fact_ids: ["f05", "f17", "f46", "f47"],
    relevant_fact_types: ["preference"],
    description: "Direct query about food preferences",
  },
  {
    id: "q07",
    query: "Когда у меня день рождения?",
    query_type: "direct",
    expected_fact_ids: ["f07"],
    relevant_fact_types: ["date"],
    description: "Direct query about birthday",
  },
  {
    id: "q08",
    query: "Что ты знаешь о Диме?",
    query_type: "direct",
    expected_fact_ids: ["f03", "f31"],
    relevant_fact_types: ["relationship", "workplace"],
    description: "Direct query about person Dima — should find standard + diminutive",
  },
  {
    id: "q09",
    query: "Чем я занимаюсь в свободное время?",
    query_type: "direct",
    expected_fact_ids: ["f12", "f27", "f39", "f40", "f42", "f45"],
    relevant_fact_types: ["preference", "other"],
    description: "Direct query about hobbies and free time activities",
  },
  {
    id: "q10",
    query: "Какие у меня домашние животные?",
    query_type: "direct",
    expected_fact_ids: ["f19", "f33"],
    relevant_fact_types: ["other"],
    description: "Direct query about pets",
  },
  {
    id: "q11",
    query: "Как здоровье?",
    query_type: "direct",
    expected_fact_ids: ["f06", "f15", "f28"],
    relevant_fact_types: ["health"],
    description: "Direct query about health",
  },
  {
    id: "q12",
    query: "Что ты знаешь о моей маме?",
    query_type: "direct",
    expected_fact_ids: ["f13", "f34"],
    relevant_fact_types: ["relationship", "event"],
    description: "Direct query about mother — standard + diminutive form",
  },

  // ===== INDIRECT QUERIES (~8) =====
  {
    id: "q13",
    query: "Порекомендуй ресторан",
    query_type: "indirect",
    expected_fact_ids: ["f01", "f05", "f17"],
    relevant_fact_types: ["location", "preference", "health"],
    description: "Restaurant recommendation → needs city + food preferences + allergies",
  },
  {
    id: "q14",
    query: "Что подарить другу?",
    query_type: "indirect",
    expected_fact_ids: ["f03", "f29"],
    relevant_fact_types: ["relationship", "date", "preference"],
    description: "Gift for friend → needs info about friends",
  },
  {
    id: "q15",
    query: "Помоги спланировать выходные",
    query_type: "indirect",
    expected_fact_ids: ["f01", "f12", "f39", "f42"],
    relevant_fact_types: ["location", "preference", "event"],
    description: "Weekend planning → location + hobbies",
  },
  {
    id: "q16",
    query: "Что посмотреть вечером?",
    query_type: "indirect",
    expected_fact_ids: ["f27", "f40"],
    relevant_fact_types: ["preference"],
    description: "Evening entertainment → TV/podcast preferences",
  },
  {
    id: "q17",
    query: "Нужно ли мне что-то учитывать при заказе еды?",
    query_type: "indirect",
    expected_fact_ids: ["f06", "f17", "f05"],
    relevant_fact_types: ["health", "preference"],
    description: "Food ordering considerations → allergies + diet preferences",
  },
  {
    id: "q18",
    query: "Помоги выбрать подарок жене на годовщину",
    query_type: "indirect",
    expected_fact_ids: ["f10", "f16", "f43"],
    relevant_fact_types: ["relationship", "date"],
    description: "Anniversary gift → wife info + date",
  },
  {
    id: "q19",
    query: "Стоит ли мне бежать марафон?",
    query_type: "indirect",
    expected_fact_ids: ["f12", "f15"],
    relevant_fact_types: ["health", "preference"],
    description: "Marathon decision → running hobby + knee surgery",
  },
  {
    id: "q20",
    query: "Как сэкономить в этом месяце?",
    query_type: "indirect",
    expected_fact_ids: ["f08", "f14", "f37"],
    relevant_fact_types: ["financial"],
    description: "Saving money → financial facts",
  },

  // ===== COLLOQUIAL QUERIES (~4) =====
  {
    id: "q21",
    query: "Чё там с Димоном?",
    query_type: "colloquial",
    expected_fact_ids: ["f03", "f31"],
    relevant_fact_types: ["relationship", "workplace"],
    description: "Colloquial about Dima — slang form 'Димон' for Дима/Димуля",
  },
  {
    id: "q22",
    query: "Как там мелкий, в садике нормально?",
    query_type: "colloquial",
    expected_fact_ids: ["f21"],
    relevant_fact_types: ["relationship", "event"],
    description: "Colloquial about child in kindergarten — 'мелкий' = kid",
  },
  {
    id: "q23",
    query: "Бабуля чё-нибудь пекла в последнее время?",
    query_type: "colloquial",
    expected_fact_ids: ["f23"],
    relevant_fact_types: ["relationship"],
    description: "Colloquial about grandmother baking",
  },
  {
    id: "q24",
    query: "На тачке какой катаешься?",
    query_type: "colloquial",
    expected_fact_ids: ["f25", "f48"],
    relevant_fact_types: ["event", "other"],
    description: "Colloquial about car — 'тачка' = car",
  },

  // ===== MIXED-LANGUAGE QUERIES (~3) =====
  {
    id: "q25",
    query: "Что у меня с Netflix подпиской?",
    query_type: "mixed",
    expected_fact_ids: ["f37"],
    relevant_fact_types: ["financial", "preference"],
    description: "Mixed query about Netflix subscription",
  },
  {
    id: "q26",
    query: "Какой у меня setup для работы?",
    query_type: "mixed",
    expected_fact_ids: ["f38"],
    relevant_fact_types: ["other", "workplace"],
    description: "Mixed query about work setup — English 'setup' in Russian context",
  },
  {
    id: "q27",
    query: "Что слушаешь из подкастов?",
    query_type: "mixed",
    expected_fact_ids: ["f40"],
    relevant_fact_types: ["preference"],
    description: "Query about podcasts — should find Lex Fridman fact",
  },

  // ===== TEMPORAL QUERIES (~3) =====
  {
    id: "q28",
    query: "Что произошло в январе?",
    query_type: "temporal",
    expected_fact_ids: ["f15"],
    relevant_fact_types: ["health", "event"],
    description: "Temporal query — January events (knee surgery)",
  },
  {
    id: "q29",
    query: "Какие у меня планы на весну?",
    query_type: "temporal",
    expected_fact_ids: ["f11"],
    relevant_fact_types: ["location", "event"],
    description: "Temporal query — spring plans (move to Berlin)",
  },
  {
    id: "q30",
    query: "Что было летом?",
    query_type: "temporal",
    expected_fact_ids: ["f18"],
    relevant_fact_types: ["event"],
    description: "Temporal query — summer events (Turkey vacation)",
  },
];

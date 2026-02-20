/**
 * TASK-0.3-ext: Entity Confidence Classification Test
 *
 * 10 test cases focused on entity_confidence assessment.
 * Three types:
 *   1. Single candidate + strong signal → high
 *   2. Multiple candidates, same name → high (when context disambiguates) or low
 *   3. Single candidate, weak signal → borderline (we accept both)
 *
 * Success criteria: false_high ≤ 1 out of 10.
 */

export interface ExistingFact {
  id: string;
  content: string;
  fact_type: string;
  entity_name?: string;
}

export interface ExistingEntity {
  id: string;
  canonical_name: string;
  aliases: string[];
  type: "person" | "place" | "organization" | "other";
  description?: string;
}

export interface TestCase {
  id: number;
  label: string;
  message: string;
  existing_facts: ExistingFact[];
  existing_entities: ExistingEntity[];
  expected_confidence: "high" | "low";
  /** If high — which entity_id should it resolve to? */
  expected_entity_id?: string;
  /** Accept both high and low as valid (borderline cases) */
  borderline?: boolean;
}

// Shared entities for homonym scenarios (Andrew the son vs Andrew the neighbor)
const andrewSon: ExistingEntity = {
  id: "ent-son",
  canonical_name: "Andrew",
  aliases: ["my son", "Andryusha"],
  type: "person",
  description: "son, 4 years old, attends kindergarten in Munich",
};

const andrewNeighbor: ExistingEntity = {
  id: "ent-neighbor",
  canonical_name: "Andrew",
  aliases: [],
  type: "person",
  description: "neighbor, helped with apartment repairs in January 2026",
};

// Shared entities for Maria scenarios
const mariaWife: ExistingEntity = {
  id: "ent-wife",
  canonical_name: "Maria",
  aliases: ["my wife", "Masha"],
  type: "person",
  description: "wife, works as a designer at a startup",
};

const mariaColleague: ExistingEntity = {
  id: "ent-colleague",
  canonical_name: "Maria",
  aliases: [],
  type: "person",
  description: "colleague from work, project manager",
};

export const testSet: TestCase[] = [
  // ─── TYPE 1: Single candidate + strong signal → high ───────────────

  {
    id: 1,
    label: "health + child entity → high",
    message: "Andrew has a fever again, need to call the pediatrician.",
    existing_facts: [
      {
        id: "f-1",
        content: "Son Andrew had a cold last month",
        fact_type: "health",
        entity_name: "Andrew",
      },
    ],
    existing_entities: [andrewSon, andrewNeighbor],
    expected_confidence: "high",
    expected_entity_id: "ent-son",
  },
  {
    id: 2,
    label: "financial + debt history → high",
    message: "Finally settled up with Andrew.",
    existing_facts: [
      {
        id: "f-2",
        content: "Owes Andrew (neighbor) 3000 for apartment repairs",
        fact_type: "financial",
        entity_name: "Andrew",
      },
    ],
    existing_entities: [andrewSon, andrewNeighbor],
    expected_confidence: "high",
    expected_entity_id: "ent-neighbor",
  },
  {
    id: 3,
    label: "work context + colleague → high",
    message: "Maria approved the design mockups today.",
    existing_facts: [
      {
        id: "f-3",
        content: "Maria is the project manager on the current project",
        fact_type: "workplace",
        entity_name: "Maria",
      },
    ],
    existing_entities: [mariaWife, mariaColleague],
    expected_confidence: "high",
    expected_entity_id: "ent-colleague",
  },
  {
    id: 4,
    label: "kindergarten context + child → high",
    message: "Andrew drew a picture at kindergarten, the teacher praised him.",
    existing_facts: [],
    existing_entities: [andrewSon, andrewNeighbor],
    expected_confidence: "high",
    expected_entity_id: "ent-son",
  },

  // ─── TYPE 2: Multiple candidates, ambiguous context → low ─────────

  {
    id: 5,
    label: "neutral event, two candidates → low",
    message: "Saw Andrew today, had coffee together.",
    existing_facts: [],
    existing_entities: [andrewSon, andrewNeighbor],
    expected_confidence: "low",
  },
  {
    id: 6,
    label: "birthday mention, two candidates, no date in memory → low",
    message: "Need to think of a gift for Maria's birthday.",
    existing_facts: [],
    existing_entities: [mariaWife, mariaColleague],
    expected_confidence: "low",
  },
  {
    id: 7,
    label: "generic positive, no signal → low",
    message: "Andrew called, he's in a great mood.",
    existing_facts: [],
    existing_entities: [andrewSon, andrewNeighbor],
    expected_confidence: "low",
  },
  {
    id: 8,
    label: "travel mention, both could travel → low",
    message: "Maria is coming back from a trip this weekend.",
    existing_facts: [],
    existing_entities: [mariaWife, mariaColleague],
    expected_confidence: "low",
  },

  // ─── TYPE 3: Borderline / single candidate, weak signal ────────────

  {
    id: 9,
    label: "single candidate, no context clue → borderline",
    message: "Talked to Sergey about the situation.",
    existing_facts: [],
    existing_entities: [
      {
        id: "ent-sergey",
        canonical_name: "Sergey",
        aliases: [],
        type: "person",
        description: "friend from university",
      },
    ],
    expected_confidence: "high",
    borderline: true,
  },
  {
    id: 10,
    label: "relationship topic + wife entity → high",
    message: "Had a long talk with Maria about our vacation plans.",
    existing_facts: [
      {
        id: "f-4",
        content: "Planning a vacation in July",
        fact_type: "event",
      },
    ],
    existing_entities: [mariaWife, mariaColleague],
    expected_confidence: "high",
    expected_entity_id: "ent-wife",
  },
];

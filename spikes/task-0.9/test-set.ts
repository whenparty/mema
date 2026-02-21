/**
 * TASK-0.9 Test Set: Natural language → RRULE
 *
 * Each test case contains:
 * - Natural language input (as a user would say it)
 * - User timezone (IANA)
 * - Reference date (for resolving relative dates)
 * - Expected RRULE pattern (for validation — not exact string match, but semantic)
 * - Expected occurrences (first 3, as wall-clock times in user TZ, for verification)
 * - Category: simple | medium | complex | ambiguous | one_time
 */

export interface TestCase {
  id: number;
  category: "simple" | "medium" | "complex" | "ambiguous" | "one_time";
  message: string;
  userTimezone: string;
  referenceDate: string; // ISO date, e.g. "2026-03-01"
  expected: {
    isRecurring: boolean;
    /** For recurring: expected RRULE properties to verify semantically */
    freq?: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
    interval?: number;
    byDay?: string[]; // MO, TU, etc.
    byMonthDay?: number[];
    bySetPos?: number[];
    wallClockHour: number; // expected hour in user's TZ
    wallClockMinute: number;
    /** First 3 expected occurrences as ISO strings (UTC) for precise validation */
    expectedOccurrencesUTC?: string[];
  };
  notes?: string;
}

export const testSet: TestCase[] = [
  // ===== SIMPLE (daily, weekly, basic monthly) =====
  {
    id: 1,
    category: "simple",
    message: "Remind me every day at 9am",
    userTimezone: "Europe/Berlin",
    referenceDate: "2026-03-01",
    expected: {
      isRecurring: true,
      freq: "DAILY",
      wallClockHour: 9,
      wallClockMinute: 0,
    },
  },
  {
    id: 2,
    category: "simple",
    message: "Every Monday at 10:00",
    userTimezone: "Europe/Berlin",
    referenceDate: "2026-03-01",
    expected: {
      isRecurring: true,
      freq: "WEEKLY",
      byDay: ["MO"],
      wallClockHour: 10,
      wallClockMinute: 0,
    },
  },
  {
    id: 3,
    category: "simple",
    message: "Remind me every Friday at 5pm",
    userTimezone: "US/Eastern",
    referenceDate: "2026-03-01",
    expected: {
      isRecurring: true,
      freq: "WEEKLY",
      byDay: ["FR"],
      wallClockHour: 17,
      wallClockMinute: 0,
    },
  },
  {
    id: 4,
    category: "simple",
    message: "Every weekday at 8:30",
    userTimezone: "Europe/Berlin",
    referenceDate: "2026-03-01",
    expected: {
      isRecurring: true,
      freq: "WEEKLY",
      byDay: ["MO", "TU", "WE", "TH", "FR"],
      wallClockHour: 8,
      wallClockMinute: 30,
    },
  },
  {
    id: 5,
    category: "simple",
    message: "Every Sunday at noon",
    userTimezone: "Europe/Berlin",
    referenceDate: "2026-03-01",
    expected: {
      isRecurring: true,
      freq: "WEEKLY",
      byDay: ["SU"],
      wallClockHour: 12,
      wallClockMinute: 0,
    },
  },
  {
    id: 6,
    category: "simple",
    message: "Remind me every month on the 1st at 9am",
    userTimezone: "Europe/Berlin",
    referenceDate: "2026-03-01",
    expected: {
      isRecurring: true,
      freq: "MONTHLY",
      byMonthDay: [1],
      wallClockHour: 9,
      wallClockMinute: 0,
    },
  },
  {
    id: 7,
    category: "simple",
    message: "Every year on March 15 at 10:00",
    userTimezone: "US/Eastern",
    referenceDate: "2026-03-01",
    expected: {
      isRecurring: true,
      freq: "YEARLY",
      wallClockHour: 10,
      wallClockMinute: 0,
    },
  },

  // ===== MEDIUM (intervals, specific day patterns) =====
  {
    id: 8,
    category: "medium",
    message: "Every other Tuesday at 14:00",
    userTimezone: "Europe/Berlin",
    referenceDate: "2026-03-01",
    expected: {
      isRecurring: true,
      freq: "WEEKLY",
      interval: 2,
      byDay: ["TU"],
      wallClockHour: 14,
      wallClockMinute: 0,
    },
  },
  {
    id: 9,
    category: "medium",
    message: "Every two weeks on Monday at 10:00",
    userTimezone: "Europe/Berlin",
    referenceDate: "2026-03-01",
    expected: {
      isRecurring: true,
      freq: "WEEKLY",
      interval: 2,
      byDay: ["MO"],
      wallClockHour: 10,
      wallClockMinute: 0,
    },
  },
  {
    id: 10,
    category: "medium",
    message: "Every 3 days at 8pm",
    userTimezone: "US/Eastern",
    referenceDate: "2026-03-01",
    expected: {
      isRecurring: true,
      freq: "DAILY",
      interval: 3,
      wallClockHour: 20,
      wallClockMinute: 0,
    },
  },
  {
    id: 11,
    category: "medium",
    message: "Every Monday and Wednesday at 7:00",
    userTimezone: "Europe/Berlin",
    referenceDate: "2026-03-01",
    expected: {
      isRecurring: true,
      freq: "WEEKLY",
      byDay: ["MO", "WE"],
      wallClockHour: 7,
      wallClockMinute: 0,
    },
  },
  {
    id: 12,
    category: "medium",
    message: "Twice a week on Tuesday and Thursday at 18:00",
    userTimezone: "Europe/Berlin",
    referenceDate: "2026-03-01",
    expected: {
      isRecurring: true,
      freq: "WEEKLY",
      byDay: ["TU", "TH"],
      wallClockHour: 18,
      wallClockMinute: 0,
    },
  },
  {
    id: 13,
    category: "medium",
    message: "Every 15th of the month at 10:00",
    userTimezone: "Europe/Berlin",
    referenceDate: "2026-03-01",
    expected: {
      isRecurring: true,
      freq: "MONTHLY",
      byMonthDay: [15],
      wallClockHour: 10,
      wallClockMinute: 0,
    },
  },
  {
    id: 14,
    category: "medium",
    message: "Every other month on the 1st at 9:00",
    userTimezone: "Europe/Berlin",
    referenceDate: "2026-03-01",
    expected: {
      isRecurring: true,
      freq: "MONTHLY",
      interval: 2,
      byMonthDay: [1],
      wallClockHour: 9,
      wallClockMinute: 0,
    },
  },

  // ===== COMPLEX (ordinal weekdays, last day, combinations) =====
  {
    id: 15,
    category: "complex",
    message: "Every third Thursday of the month at 15:00",
    userTimezone: "Europe/Berlin",
    referenceDate: "2026-03-01",
    expected: {
      isRecurring: true,
      freq: "MONTHLY",
      byDay: ["TH"],
      bySetPos: [3],
      wallClockHour: 15,
      wallClockMinute: 0,
    },
  },
  {
    id: 16,
    category: "complex",
    message: "Last Friday of the month at 17:00",
    userTimezone: "US/Eastern",
    referenceDate: "2026-03-01",
    expected: {
      isRecurring: true,
      freq: "MONTHLY",
      byDay: ["FR"],
      bySetPos: [-1],
      wallClockHour: 17,
      wallClockMinute: 0,
    },
  },
  {
    id: 17,
    category: "complex",
    message: "Last day of every month at 23:00",
    userTimezone: "Europe/Berlin",
    referenceDate: "2026-03-01",
    expected: {
      isRecurring: true,
      freq: "MONTHLY",
      byMonthDay: [-1],
      wallClockHour: 23,
      wallClockMinute: 0,
    },
  },
  {
    id: 18,
    category: "complex",
    message: "First Monday of every month at 9:00",
    userTimezone: "Europe/Berlin",
    referenceDate: "2026-03-01",
    expected: {
      isRecurring: true,
      freq: "MONTHLY",
      byDay: ["MO"],
      bySetPos: [1],
      wallClockHour: 9,
      wallClockMinute: 0,
    },
  },
  {
    id: 19,
    category: "complex",
    message: "Every second Wednesday of the month at 11:30",
    userTimezone: "Europe/Berlin",
    referenceDate: "2026-03-01",
    expected: {
      isRecurring: true,
      freq: "MONTHLY",
      byDay: ["WE"],
      bySetPos: [2],
      wallClockHour: 11,
      wallClockMinute: 30,
    },
  },
  {
    id: 20,
    category: "complex",
    message: "Every quarter on the first day at 8:00",
    userTimezone: "Europe/Berlin",
    referenceDate: "2026-03-01",
    expected: {
      isRecurring: true,
      freq: "MONTHLY",
      interval: 3,
      byMonthDay: [1],
      wallClockHour: 8,
      wallClockMinute: 0,
    },
  },

  // ===== AMBIGUOUS (need clarification or best-guess) =====
  {
    id: 21,
    category: "ambiguous",
    message: "Remind me about this once a month",
    userTimezone: "Europe/Berlin",
    referenceDate: "2026-03-15",
    expected: {
      isRecurring: true,
      freq: "MONTHLY",
      wallClockHour: 9, // model should pick a reasonable default
      wallClockMinute: 0,
    },
    notes: "No time specified — model should pick a default (9:00 or 10:00)",
  },
  {
    id: 22,
    category: "ambiguous",
    message: "Remind me about rent every month",
    userTimezone: "US/Eastern",
    referenceDate: "2026-03-01",
    expected: {
      isRecurring: true,
      freq: "MONTHLY",
      byMonthDay: [1],
      wallClockHour: 9,
      wallClockMinute: 0,
    },
    notes: "Rent implies 1st of month; no time = model picks default",
  },
  {
    id: 23,
    category: "ambiguous",
    message: "Every morning at 7",
    userTimezone: "Europe/Berlin",
    referenceDate: "2026-03-01",
    expected: {
      isRecurring: true,
      freq: "DAILY",
      wallClockHour: 7,
      wallClockMinute: 0,
    },
    notes: "'Every morning' = daily",
  },
  {
    id: 24,
    category: "ambiguous",
    message: "Remind me weekly",
    userTimezone: "Europe/Berlin",
    referenceDate: "2026-03-04", // Wednesday
    expected: {
      isRecurring: true,
      freq: "WEEKLY",
      wallClockHour: 9,
      wallClockMinute: 0,
    },
    notes: "No day or time specified — model should anchor to reference date day",
  },
  {
    id: 25,
    category: "ambiguous",
    message: "Remind me on the 5th and 20th of each month at 10:00",
    userTimezone: "Europe/Berlin",
    referenceDate: "2026-03-01",
    expected: {
      isRecurring: true,
      freq: "MONTHLY",
      byMonthDay: [5, 20],
      wallClockHour: 10,
      wallClockMinute: 0,
    },
    notes: "Multiple month days in one rule",
  },

  // ===== ONE-TIME (for completeness — LLM should NOT produce RRULE) =====
  {
    id: 26,
    category: "one_time",
    message: "Remind me tomorrow at 3pm",
    userTimezone: "Europe/Berlin",
    referenceDate: "2026-03-01",
    expected: {
      isRecurring: false,
      wallClockHour: 15,
      wallClockMinute: 0,
    },
    notes: "One-time reminder — no RRULE, just datetime",
  },
  {
    id: 27,
    category: "one_time",
    message: "Remind me on March 20 at 14:00",
    userTimezone: "US/Eastern",
    referenceDate: "2026-03-01",
    expected: {
      isRecurring: false,
      wallClockHour: 14,
      wallClockMinute: 0,
    },
    notes: "One-time with explicit date",
  },
  {
    id: 28,
    category: "one_time",
    message: "Remind me in 2 hours",
    userTimezone: "Europe/Berlin",
    referenceDate: "2026-03-01",
    expected: {
      isRecurring: false,
      wallClockHour: -1, // relative, not checkable as absolute
      wallClockMinute: -1,
    },
    notes: "Relative time — model should compute absolute datetime, no RRULE",
  },
];

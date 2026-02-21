/**
 * TASK-0.9: RRULE generation prompt
 *
 * Prompt for LLM to convert natural language reminder requests into
 * structured output with RRULE (or one-time datetime).
 */

export function buildSystemPrompt(
  userTimezone: string,
  referenceDate: string,
): string {
  return `You are a reminder scheduling assistant. Your job is to convert natural language reminder requests into structured scheduling data.

## Context
- User's timezone: ${userTimezone}
- Current date: ${referenceDate}
- Current day of week: ${getDayOfWeek(referenceDate)}

## Rules

### For recurring reminders:
1. Generate a valid iCalendar RRULE string (RFC 5545)
2. The RRULE must include DTSTART with TZID in the format: DTSTART;TZID={timezone}:YYYYMMDDTHHmmss
3. The RRULE line follows on a new line: RRULE:FREQ=...
4. FREQ must be one of exactly these four values: DAILY, WEEKLY, MONTHLY, YEARLY. No other values exist in RFC 5545 (e.g., QUARTERLY is NOT valid — use MONTHLY;INTERVAL=3 instead)
5. All times are wall-clock times in the user's timezone
6. Use the reference date to anchor the first occurrence (dtstart should be the next occurrence from the reference date)
7. For "every other" patterns, use INTERVAL=2
8. For "every N days/weeks/months", use INTERVAL=N
9. For "every quarter" / "quarterly", use FREQ=MONTHLY;INTERVAL=3
10. For ordinal weekdays (e.g., "third Thursday"), use BYDAY with the ordinal prefix (e.g., BYDAY=3TH)
11. For "last" patterns, use negative ordinals (e.g., BYDAY=-1FR for last Friday) or BYMONTHDAY=-1 for last day
12. If no time is specified, default to 09:00

### For one-time reminders:
1. Do NOT generate an RRULE
2. Instead, provide the absolute datetime in the user's timezone
3. For relative times like "in 2 hours", compute the absolute time from the reference date (assume current time is 12:00 if not specified)

### Output format:
Return a JSON object with:
- \`is_recurring\`: boolean
- \`rrule_string\`: string | null — the full DTSTART + RRULE string for recurring, null for one-time
- \`one_time_datetime\`: string | null — ISO datetime in user TZ for one-time, null for recurring
- \`explanation\`: string — brief explanation of the interpretation
- \`needs_clarification\`: boolean — true if the request is genuinely ambiguous and you had to make assumptions
- \`assumptions\`: string[] — list of assumptions made (empty if none)`;
}

function getDayOfWeek(dateStr: string): string {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const d = new Date(dateStr + "T12:00:00Z");
  return days[d.getUTCDay()]!;
}

export interface RRuleGenerationResult {
  is_recurring: boolean;
  rrule_string: string | null;
  one_time_datetime: string | null;
  explanation: string;
  needs_clarification: boolean;
  assumptions: string[];
}

export const structuredOutputSchema = {
  type: "json_schema" as const,
  json_schema: {
    name: "rrule_generation",
    strict: true,
    schema: {
      type: "object",
      properties: {
        is_recurring: {
          type: "boolean",
          description: "Whether the reminder is recurring",
        },
        rrule_string: {
          type: ["string", "null"],
          description:
            "Full DTSTART + RRULE string for recurring reminders, null for one-time. Format: DTSTART;TZID=Timezone:YYYYMMDDTHHmmss\\nRRULE:FREQ=...",
        },
        one_time_datetime: {
          type: ["string", "null"],
          description:
            "ISO datetime string in user timezone for one-time reminders, null for recurring. Format: YYYY-MM-DDTHH:mm:ss",
        },
        explanation: {
          type: "string",
          description: "Brief explanation of how the request was interpreted",
        },
        needs_clarification: {
          type: "boolean",
          description:
            "Whether the request required assumptions that should be confirmed with the user",
        },
        assumptions: {
          type: "array",
          items: { type: "string" },
          description: "List of assumptions made when interpreting the request",
        },
      },
      required: [
        "is_recurring",
        "rrule_string",
        "one_time_datetime",
        "explanation",
        "needs_clarification",
        "assumptions",
      ],
      additionalProperties: false,
    },
  },
};

# 2.2 Goals & Success Metrics

## Evaluation Horizon

Metrics are defined for the **first 3 months after MVP launch** (12 weeks).
All target values are expressed as percentages — absolute numbers depend on waitlist size.
All target values are hypotheses and will be validated post-launch via correlation with Day 30/90 retention.

---

## Definitions

**Session** — a sequence of user messages with no more than a 30-minute gap between them.

**Response with memory application** — a bot response that uses at least one previously saved fact. The "from previous sessions" restriction does not apply — a fact can be extracted and used within the same session.

**Critical mass hypothesis** — 10 facts. Upon reaching this threshold, memory begins to be consistently applied in responses. To be validated post-launch.

---

## User State Model

Instead of a binary "active / inactive" definition, a state model is used (following the Duolingo approach):

| State | Description | Entry Criterion |
|-------|-------------|-----------------|
| New | Just registered | First message to the bot |
| Building | Accumulating context, exploring the product | < 10 facts, active in the last 7 days |
| Active | Using regularly, memory is working | ≥ 10 facts, ≥ 1 session per week |
| Engaged | Deep usage | ≥ 3 sessions with memory per week |
| At-Risk | Declining activity | Was Active/Engaged, no sessions for 7–14 days |
| Dormant | Stopped using | No sessions for > 14 days |
| Resurrected | Returned after Dormant | First session after a Dormant period |

**Primary metric — Weekly Return Rate:** % of users in Active + Engaged states who returned within the following week.

| Period | Target Value |
|--------|-------------|
| Week 4 | ≥ 60% |
| Week 12 | ≥ 75% |

---

## North Star Metric

**Number of responses with memory application per active user per week**

This metric reflects the product's essence: the bot doesn't just store facts — it regularly applies them. The value grows only when three conditions are met simultaneously: the user returns, the bot has accumulated context, and the bot uses memory in the response.

| Period | Target Value |
|--------|-------------|
| Week 4 | ≥ 2 memory responses / active user / week |
| Week 12 | ≥ 5 memory responses / active user / week |

**Rationale.** Values are derived from engagement metrics: an active user has ≥ 2 sessions per week at launch and ≥ 4 by week 12. In the early stage, context is still sparse — memory is applied roughly once per session. By the third month, context is richer, and memory works in nearly every conversation. Values are hypotheses and will be revised based on real data post-launch.

---

## Funnel Metrics

### Activation

Activation is defined as a path of three sequential transitions, each with its own metric:

| Stage | Description | Metric | Target Value (Week 12) |
|-------|-------------|--------|------------------------|
| Setup | User started populating memory | ≥ 3 facts in the first week | ≥ 80% |
| Aha | User experienced the value of memory | First response with memory application within 14 days | ≥ 75% |
| Habit | Memory became part of the routine | ≥ 3 sessions with memory application within 30 days | ≥ 50% |

All target values are hypotheses, to be validated post-launch via correlation with Day 30/90 retention.

---

### Engagement

**Metric 1:** share of active users (Active + Engaged / total).

**Metric 2:** average number of sessions per active user per week.

Expected dynamics — "smile curve": spike in week 1 (novelty effect), dip in weeks 2–4 (context hasn't accumulated yet, memory value isn't obvious), recovery by weeks 8–12 (memory starts working, user returns intentionally).

| Metric | Week 1 (novelty) | Weeks 2–4 (dip) | Weeks 8–12 (growth) |
|--------|----------|---------|---------|
| Active users (Active+Engaged / total) | ≥ 70% | ≥ 40% | ≥ 60% |
| Sessions / active user / week | ≥ 5 | ≥ 2 | ≥ 4 |

---

### Retention

**Metric:** % of users who returned to the bot N days after registration.

Target values account for two factors: Telegram bot specifics (Day 1 is lower than for standalone apps due to zero barrier to entry and "click-curiosity") and the waitlist launch model (×1.5–2 to baseline benchmarks due to self-selection of motivated users).

| Period | Telegram Bot Benchmark | Benchmark with Waitlist | Our Target |
|--------|------------------------|------------------------|-----------|
| Day 1 | 15–20% | 30–40% | ≥ 35% |
| Day 7 | 8–10% | 15–25% | ≥ 20% |
| Day 30 | 3–5% | 8–15% | ≥ 12% |
| Day 90 | 1–2% | 4–8% | ≥ 7% |

Benchmark sources: Monetag / BDC Consulting (Telegram Mini Apps, 2025), a16z (AI apps, 2025), meta-analysis of waitlist launches (Superhuman, Pinterest, Notion).

---

### Memory Quality

Metrics specific to a memory-first product. If the bot remembers inaccurately or applies memory irrelevantly, the other metrics lose their meaning.

**Metric 1:** remembering accuracy — % of cases where the bot correctly extracted and saved a meaningful fact from conversation. Assessment: automatic (LLM-as-judge + synthetic test sets with reference facts), periodic manual calibration of the judge model.

**Metric 2:** application relevance — % of cases where memory was used appropriately (assessed via implicit signals: user continued the conversation vs. corrected the bot).

| Metric | Target Value |
|--------|-------------|
| Remembering accuracy | ≥ 85% |
| Application relevance | ≥ 80% |

---

## MVP Goals

### Goal 1: Value Validation
Confirm that users derive tangible benefit from an AI assistant with memory as its core.

**Success criterion:** North Star ≥ 5 by week 12; Retention Day 90 ≥ 7%; Weekly Return Rate ≥ 75%.

### Goal 2: Memory Quality
Confirm that the memory mechanism works reliably enough for everyday use.

**Success criterion:** remembering accuracy ≥ 85%; application relevance ≥ 80%.

### Goal 3: Onboarding Simplicity
Confirm that the user receives value without setup or training.

**Success criterion:** Activation Aha ≥ 75% by week 12.

---

## What We Don't Measure in MVP

- **Monetization and unit economics** — the product is free, focus is on product metrics. Monetization is a post-MVP question.
- **Scaling** — load metrics (RPS, latency under load) are defined in NFR (artifact 3.2).
- **NPS / CSAT** — with a small number of users, formal surveys are not representative. Replaced by qualitative feedback.

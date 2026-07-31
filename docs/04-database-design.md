# InsightAI — Database Design

**Document 4 of 20**
**Depends on:** [03-software-architecture.md](./03-software-architecture.md)
**Status:** Draft for approval

---

## 1. Why Firestore, and What That Means for Design

Firestore is a document database: no joins, no server-side aggregation queries beyond simple counts/sums, and cost is driven by **reads/writes/deletes counted per document**, not by query complexity. Every decision below optimizes for that cost model, per Vision §13.1-13.2. Three rules govern every schema decision in Document 5:

1. **Denormalize for the read path that matters most** (the Admin Dashboard), not for theoretical normalization purity.
2. **Never require a fan-out write across thousands of documents** for a single respondent action — writes must stay O(1) per message.
3. **Precompute aggregates incrementally** (via Cloud Function triggers updating counters/rollups) rather than querying-and-summing across a whole collection on every dashboard load — the latter both costs more reads and gets slower as data grows, which directly violates "must scale to hundreds of thousands of users."

## 2. Core Entities and Relationships

```
Template (1) ──────< Session (many)
Session  (1) ──────< Message (many)
Message  (1) ──────< Quote (0..1 — a message may yield a notable verbatim quote)
Session  (1) ──────< SynthesisReport (1, created once on completion)
Template (1) ──────< Opportunity (many, aggregated across sessions)
Template (1) ──────< AnalyticsRollup (1 per day, incrementally updated)
(none)   ──────< AIProviderConfig (many — one per supported provider, global)
(none)   ──────< Configuration (singleton-ish, global settings)
(none)   ──────< AuditLog (many — cross-cutting, referencing any entity above)
```

Notes:
- **Template** is the root configuration entity (Document 5 §1). It is versioned: editing a live template's prompt/rules creates a new `templateVersion` snapshot rather than mutating history, so `Session.templateVersionId` always points at an immutable snapshot (per PRD FR-4).
- **Session** is one respondent's interview instance. It is the aggregation root for everything that happens during that conversation.
- **Message** is one turn (respondent or AI) with its classification data embedded (per Architecture §4 — one structured-output call produces both reply and classification together, so they're written together, not as two separate documents requiring a join).
- **Quote**, **Opportunity** are *derived, denormalized* collections populated by the Synthesis service — they exist so the Admin Dashboard never has to scan the full `messages` collection to find "top quotes" or "top opportunities."
- **AnalyticsRollup** is a per-template-per-day document, incremented by a Firestore trigger on session/message writes — this is what makes the Dashboard (PRD FR-24) fast and cheap regardless of how many historical sessions exist.

## 3. Versioning Strategy (Templates)

- `templates/{templateId}` holds the current editable draft + pointer to `currentVersionId`.
- `templates/{templateId}/versions/{versionId}` holds immutable snapshots created every time a template transitions to `live` or is edited while `live`.
- A `Session` stores `templateVersionId`, never just `templateId` — this guarantees FR-4 (in-flight interviews are unaffected by later edits) without needing to snapshot the whole template into every session document.

## 4. Aggregation Strategy (Cost- and Scale-Critical)

Two Cloud Function triggers maintain rollups instead of query-time aggregation:

- **`onMessageWrite`**: increments per-day, per-template counters (message count, pain-point tally, sentiment buckets) in `analyticsRollups/{templateId}_{date}`.
- **`onSessionComplete`**: increments completion-rate counters, updates `topPainPoints`/`topCountries`/`topOccupations` maps (bounded-size, top-N maintained incrementally, not recomputed from scratch) in the same rollup document.

This means the Admin Dashboard (FR-24) reads a small, bounded number of rollup documents (e.g., last 30 daily docs per template) instead of scanning potentially tens of thousands of session/message documents — this is the concrete mechanism behind the "must scale to hundreds of thousands of users" requirement in the Vision without needing a different database later.

## 5. Denormalization Choices (and why each is safe)

| Denormalized field | Lives on | Why | Risk accepted |
|---|---|---|---|
| `templateName`, `templateSlug` | `Session` | Admin session list/search never needs a join to show which template a session belongs to | Renaming a template doesn't retroactively rename it on old sessions — acceptable, matches "template versioning" semantics (§3) |
| `respondentCountry`, `respondentOccupation` (if inferred) | `Session` (top-level, not buried in messages) | Dashboard filters/groups by these directly | None — this is the canonical location, not a copy |
| Latest extraction fields (`topPainPoint`, `topUrgency`) | `Session` | Session list view shows a one-line summary without reading all messages | Recomputed on every message write; cheap, single-document update |

## 6. What Is Explicitly NOT Denormalized

- Full transcript is never duplicated outside `messages` subcollection — there is exactly one source of truth for conversation content.
- `SynthesisReport` fields are not copied back onto `Session` in full (only a short summary is) — full reports are fetched on-demand when an operator opens a specific session, not needed for list views.

## 7. Data Retention & Sensitive Data

- Raw transcripts containing PII (names, phone numbers, financial figures mentioned in passing) are masked at write time per configurable rules (Document 6 — Security Model) before classification results are persisted in aggregate collections (`opportunities`, rollups) — so dashboard-level views never surface raw PII even if an individual session transcript (accessible only to the operator) does.
- No automatic deletion policy in v1 (single operator, low volume) — retention policy is a config flag reserved for later (Document 17).

---

**Approval needed:** Confirm this data model before Document 5 defines exact Firestore field-level schemas.

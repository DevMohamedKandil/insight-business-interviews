# InsightAI — API Design

**Document 9 of 20**
**Depends on:** [06-security-model.md](./06-security-model.md), [07-folder-structure.md](./07-folder-structure.md), [08-ui-wireframes.md](./08-ui-wireframes.md)
**Status:** Draft for approval

---

## 1. Which Operations Are "API Calls" vs. Direct Firestore Reads

**Decision:** Not every UI action becomes a Cloud Function. Per Document 6 §2's rules table, the Angular admin surface reads `templates`, `sessions`, `messages`, `analyticsRollups`, `synthesisReports`, `quotes`, and `opportunities` **directly via the Firestore client SDK** (using `onSnapshot`/`getDocs`) when the caller holds the `admin` custom claim — there is no value in wrapping a read-only, already-rules-protected query in a Cloud Function that would just re-issue the same query server-side with extra latency.

**A Cloud Function is used only when the operation needs one of:** (a) server-side business logic beyond a rules check (spend-cap enforcement, classification, synthesis), (b) a privileged write the client must never perform directly (Document 6 §2's rationale — sessions/messages), or (c) an external side effect (calling an AI provider, generating a PDF export). This keeps the API surface small and each function's existence justified, rather than defaulting to "wrap everything in a function" out of habit.

| UI Action | Mechanism | Why |
|---|---|---|
| Load dashboard stats | Direct Firestore read (`analyticsRollups`) | Read-only, rules-protected, no business logic needed |
| Load session list/detail | Direct Firestore read | Same |
| Start an interview | **Cloud Function** (`startSession`) | Must create a session server-side with cost/rate-limit checks the client cannot be trusted to self-report (Document 6 §2) |
| Send a message in an interview | **Cloud Function** (`sendMessage`) | Calls AI provider, enforces spend cap, writes classification |
| Create/edit a template draft | **Cloud Function** (`createTemplate`, `updateTemplateDraft`) | Even though the *result* is a normal document write, template creation validates cross-field business rules (e.g., slug uniqueness) that Firestore Rules cannot check across documents |
| Publish a template | **Cloud Function** (`publishTemplate`) | Enforces FR-3 validation and creates an immutable version snapshot (Document 5 §1.1) — a multi-document transactional operation, not a single write |
| Export sessions (CSV/PDF) | **Cloud Function** (`exportSessions`) | Generates a file (external side effect: Storage write + signed URL) |

## 2. Public API

### 2.1 `startSession` (Callable Function)

**Auth:** Anonymous Firebase Auth token + App Check token, both required (Document 6 §3).

**Request:**
```typescript
{ templateSlug: string }
```

**Response:**
```typescript
{
  sessionId: string;
  welcomeMessage: string;   // from the pinned template version (Document 5 §1.1)
  language: string;
}
```

**Error cases:**

| Code | Condition | Client Handling |
|---|---|---|
| `NOT_FOUND` | Slug doesn't resolve to a `live` template | Render the "unavailable" wireframe state (Document 8 §4) |
| `RESOURCE_EXHAUSTED` | Rate limit (Document 6 §3) or spend cap already exceeded for today | Same unavailable state — **deliberately identical to `NOT_FOUND` from the client's perspective** (Document 6 §4's principle of not leaking operator-side state to anonymous visitors) |
| `FAILED_PRECONDITION` | App Check token missing/invalid | Generic error state; this should be rare/impossible in normal use, indicates a tampered client |

**Server-side behavior:** creates a `sessions/{sessionId}` document (`status: 'active'`, `turnCount: 0`), pins `templateVersionId` to the template's current `currentVersionId` (Document 5 §1), and returns only the fields the client needs to render — never the full template (prompt/rules stay server-side only, Document 6 §2).

### 2.2 `sendMessage` (HTTPS Function, streamed response — Architecture §6)

**Why HTTPS, not Callable, for this one endpoint:** Callable Functions return a single JSON response; they cannot stream. This is the one deliberate exception to "prefer Callable Functions for simplicity," justified entirely by the streaming requirement (PRD FR-9, Architecture §6).

**Auth:** Same as `startSession` — anonymous token + App Check, verified manually inside the HTTPS handler (Callable Functions do this automatically; an HTTPS function must do it explicitly, which is the direct cost of choosing this transport).

**Request:**
```
POST /sendMessage
Content-Type: application/json
Authorization: Bearer <firebase-id-token>
X-Firebase-AppCheck: <app-check-token>

{ "sessionId": string, "text": string }
```

**Response:** `Content-Type: text/event-stream`-style chunked body. Each chunk is a small JSON object, newline-delimited:

```
{"type":"token","value":"Tell"}
{"type":"token","value":" me"}
{"type":"token","value":" more..."}
{"type":"done","turnCount":5,"coverageGoalsSatisfied":["workaround"],"sessionStatus":"active"}
```

or, if the engine determines the interview should end this turn:

```
{"type":"done","turnCount":9,"coverageGoalsSatisfied":[...all...],"sessionStatus":"completed","closingMessage":"..."}
```

**Rationale for a custom newline-delimited JSON stream over raw Server-Sent Events (SSE) format:** SSE's `text/event-stream` framing (`data: ...\n\n`) adds a parsing convention with no benefit here since this isn't consumed by a generic SSE client — a fetch + `ReadableStream` reader on the Angular side parses newline-delimited JSON directly with less boilerplate than an SSE-EventSource wrapper, and it works uniformly whether the underlying transport chunks by token or by sentence.

**Server-side sequence (ties together Documents 4-6):**
1. Verify auth + App Check.
2. Load session; verify `respondentUid` matches caller; verify `status == 'active'`.
3. **Spend-cap check** (Document 6 §4) — if it would fail, skip the AI call entirely and stream back a `done` event with a graceful closing message and `sessionStatus: 'abandoned'`.
4. **Abuse/injection heuristic check** (Document 6 §5) on the incoming `text` — flag but do not block (the interview should still receive *a* response; blocking entirely would tip off an attacker exactly which heuristic tripped).
5. Call the resolved `IAIProvider` (Architecture §4) with bounded history + coverage-goal state; stream tokens back to the client as they arrive from the provider's own streaming API.
6. On completion: persist the respondent's message (masked, Document 6 §7) and the assistant's reply + classification as two `messages` subcollection documents; update `session.turnCount`, `estimatedCostUsd`, `coverageGoalsSatisfied`.
7. If termination condition met (Architecture §5), mark session `completed`, which triggers `onSessionComplete` (Document 5 §6 / synthesis kickoff) asynchronously — **the respondent-facing response does not wait for synthesis**, which can take much longer than an interview turn; synthesis is fire-and-forget from the respondent's perspective (this is why the `done` event includes `closingMessage` immediately rather than waiting for the full report).

**Error cases:**

| Code | Condition | Client Handling |
|---|---|---|
| `404` | Unknown/mismatched `sessionId` | Show generic error, offer to restart (new `startSession`) |
| `409` | Session already `completed`/`abandoned` | Same |
| `429` | Rate limit | Brief "please slow down" inline message, not a full error state |
| `500` (mid-stream) | Provider failure after streaming began | Client shows a "connection lost, one moment..." inline retry affordance — **never silently truncates the visible message**, since a cut-off assistant message would look broken, not human |

### 2.3 `resumeSession` (Callable Function) — Amendment (ADR-0012)

**Auth:** Anonymous Firebase Auth token (a **fresh** anonymous session, potentially from a different device than the one that started the interview) + App Check, identical requirements and rate limiting to `startSession` (Document 6 §3/§8A).

**Request:**
```typescript
{ resumeToken: string }
```

**Response:** Same shape as `startSession`'s response, plus the conversation-so-far so the client can render existing history immediately rather than starting from a blank chat:
```typescript
{
  sessionId: string;
  templateSlug: string;
  language: string;
  status: 'active' | 'completed' | 'abandoned';
  messages: Array<{ role: 'assistant' | 'respondent'; text: string; turnIndex: number }>;
}
```

**Error cases:**

| Code | Condition | Client Handling |
|---|---|---|
| `NOT_FOUND` | Token doesn't exist in `sessionResumeTokens` | Generic "this link is no longer valid" state — deliberately identical wording whether the token never existed or has expired (§ below), per Document 6 §4's established principle of not leaking which specific condition failed |
| `FAILED_PRECONDITION` | Token found but `expiresAt` has passed | Same generic message as above |
| `RESOURCE_EXHAUSTED` | Rate limit hit | Same treatment as `startSession`'s equivalent case |

**Server-side behavior:** looks up `sessionResumeTokens/{token}` (O(1) get, Document 5 §9A); if valid, re-binds `sessions/{sessionId}.respondentUid` to the caller's current anonymous UID, updates `lastUsedAt`, and returns the session plus its message history. This is a privileged Admin-SDK write, never a client-authored one (consistent with ADR-0007).

## 3. Admin API

All admin endpoints require the `admin` custom claim (Document 6 §6); App Check is still required (an admin session shouldn't be exempt from bot protection just because it's authenticated) but rate limiting is relaxed relative to the public endpoints (a single trusted operator, not an anonymous crowd).

### 3.1 `createTemplate`
```typescript
// Request
{ name: string; slug: string; description: string; targetAudience: string }
// Response
{ templateId: string }
```
Validates slug format and **uniqueness** (a cross-document check Firestore Rules cannot express) before creating a `status: 'draft'` template with no version yet.

### 3.2 `updateTemplateDraft`
```typescript
{ templateId: string; fields: Partial<TemplateDraftFields> }
```
Only permitted while `status == 'draft'` or via the explicit re-edit-a-live-template path (§3.3) — direct field updates to a `live` template's version content are never allowed outside `publishTemplate`, which is what makes the versioning guarantee (Document 5 §1.1, PRD FR-4) actually hold.

### 3.3 `publishTemplate`
```typescript
{ templateId: string }
// Response
{ versionId: string; versionNumber: number }
```
Runs the FR-3 validation (slug, prompt, provider, `dailySpendCapUsd` all present) server-side as the authoritative check (client-side validation in the wireframe editor, Document 8 §7, is UX-only). On success: creates a new `versions/{versionId}` snapshot, updates `currentVersionId`, sets `status: 'live'`. All three writes happen in a single Firestore transaction — partial publishes (e.g., a new version created but `currentVersionId` not updated) must be structurally impossible, not just unlikely.

### 3.4 `exportSessions`
```typescript
{ templateId: string; dateRange: { from: string; to: string }; format: 'csv' | 'pdf' }
// Response
{ downloadUrl: string; expiresAt: string }  // signed Storage URL
```
Generates the file into Firebase Storage and returns a short-lived signed URL rather than returning the file content inline — keeps the Callable Function's response small and lets large exports (many sessions) stream to Storage instead of holding the full payload in function memory.

## 4. Cross-Cutting API Conventions

- **Error shape:** every function error is a standard `HttpsError` with `{ code, message }` — `message` is always operator-safe generic text for public-facing endpoints (never leaks internal details per Document 6's "don't tell an anonymous caller why" principle) and can be more specific for admin endpoints.
- **Idempotency:** `publishTemplate` and the synthesis-triggering path are the only operations with real idempotency requirements (Document 5 §3); both are handled via transaction/deterministic-ID patterns already specified there, not re-solved here.
- **No API versioning scheme (e.g., `/v1/sendMessage`) for v1.** **Rationale:** frontend and backend deploy from the same monorepo (Document 7 §1) and are always released together; a version prefix defends against a problem (independently-versioned clients) that doesn't exist yet. Logged as a forward-looking note for Document 12 (Roadmap): if a public/partner API ever opens up, versioning is introduced then, not speculatively now.

---

**Approval needed:** Confirm these contracts before Document 10 (Cloud Functions Design) specifies the internal implementation detail of each function.

# InsightAI — Software Architecture Document

**Document 3 of 20**
**Depends on:** [01-vision-document.md](./01-vision-document.md), [02-prd.md](./02-prd.md)
**Status:** Draft for approval

---

## 1. Architectural Style

Serverless, event-driven, layered monolith on the backend (one Cloud Functions codebase, internally modular) + a single-page Angular frontend. "Layered monolith, not microservices" is a deliberate choice: at this scale, microservices add operational cost (multiple deploys, network hops, cold starts) with zero benefit. The modularity that protects future scale comes from **strict internal layering and interfaces**, not from process boundaries.

```
┌─────────────────────────────────────────────────────────────┐
│  Angular 20 SPA (Standalone Components + Signals)            │
│  - Public Interview Surface        - Admin Panel              │
└───────────────────────────┬───────────────────────────────────┘
                            │ Firebase SDK (Auth, Firestore, Functions, Storage)
┌───────────────────────────▼───────────────────────────────────┐
│  Firebase Platform                                            │
│  - Anonymous Auth   - Firestore   - Storage   - App Check      │
│  - Hosting          - Analytics                                │
└───────────────────────────┬───────────────────────────────────┘
                            │ Callable / HTTPS / Firestore Triggers
┌───────────────────────────▼───────────────────────────────────┐
│  Cloud Functions (Node.js) — Layered Backend                   │
│                                                                 │
│  ┌───────────────┐  ┌────────────────┐  ┌───────────────────┐ │
│  │ API Layer     │→ │ Service Layer   │→ │ Repository Layer   │ │
│  │ (callable/    │  │ (Interview,     │  │ (Firestore data     │ │
│  │  HTTP funcs)  │  │  Template,      │  │  access, per        │ │
│  │               │  │  Analytics,     │  │  collection)        │ │
│  │               │  │  Synthesis svc) │  │                     │ │
│  └───────────────┘  └───────┬────────┘  └───────────────────┘ │
│                             │                                   │
│                     ┌───────▼────────┐                          │
│                     │ AI Provider     │                         │
│                     │ Layer (DI'd     │                         │
│                     │ interface)      │                         │
│                     └───────┬────────┘                          │
└─────────────────────────────┼──────────────────────────────────┘
                              │
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
          OpenAI API      Claude API       Gemini API
```

## 2. Layers (Backend)

| Layer | Responsibility | Must NOT do |
|---|---|---|
| **API Layer** | Firebase Callable Functions + one HTTP function for streaming. Validates input shape, checks App Check token, enforces auth (anonymous for public, admin-claim for admin). Delegates immediately to Service Layer. | Contain business logic, talk to Firestore directly, talk to AI providers directly. |
| **Service Layer** | `InterviewService`, `TemplateService`, `AnalyticsService`, `SynthesisService`. Owns business rules: coverage-goal tracking, spend-cap enforcement, classification-to-storage mapping, synthesis orchestration. | Know about Firestore document shapes directly (goes through repositories) or about a specific AI vendor's SDK (goes through the provider interface). |
| **Repository Layer** | One repository per Firestore collection (`SessionRepository`, `MessageRepository`, `TemplateRepository`, etc.). Owns all `.collection()`/`.doc()` calls and query construction. | Contain business logic or validation beyond data shape. |
| **AI Provider Layer** | `IAIProvider` interface + `OpenAIProvider`, `ClaudeProvider`, `GeminiProvider` implementations + `ProviderFactory` that resolves the concrete provider from a template's config. | Leak vendor-specific types/errors above this layer. |

This mirrors the brief's explicit requirement (Repository Pattern, DI, Service Layer, AI Provider Layer, Analytics Layer, Storage Layer, Configuration Layer) — each named layer in the brief maps to a real module boundary here, not just a folder name.

## 3. Dependency Injection Approach

Node.js Cloud Functions don't get Angular-style DI for free, so we use **constructor injection with a lightweight manual composition root** (no heavy DI framework — unnecessary weight for this scale):

```
// composition-root.ts (conceptual)
const templateRepo = new TemplateRepository(firestore);
const providerFactory = new AIProviderFactory({ openai, claude, gemini });
const interviewService = new InterviewService(templateRepo, sessionRepo, messageRepo, providerFactory, spendGuard);
```

Every service depends on **interfaces** (`IAIProvider`, `ITemplateRepository`), never concrete classes — this is what makes the AI Provider Layer swappable and the whole backend unit-testable without hitting Firestore or a real LLM (see Document 18 — Testing Strategy).

On the Angular side, this is native: `providedIn: 'root'` services + Angular's own injector, using abstract service tokens where a future swap (e.g., mock data service for local dev) is anticipated.

## 4. The AI Provider Abstraction (Core Architectural Decision)

```typescript
interface IAIProvider {
  generateInterviewTurn(input: InterviewTurnInput): Promise<InterviewTurnOutput>;
}

interface InterviewTurnInput {
  systemPrompt: string;        // constructed by InterviewService from template config
  history: ConversationTurn[]; // bounded, per FR-16
  temperature: number;
  maxTokens: number;
}

interface InterviewTurnOutput {
  replyText: string;
  extraction: MessageClassification; // pain point, emotion, urgency, etc. — same call, per Vision §13.4
  usage: { promptTokens: number; completionTokens: number; costEstimateUsd: number };
}
```

Each provider implementation is responsible for:
1. Translating this generic shape into its own SDK's request format.
2. Requesting **structured output** in the vendor's native mechanism (OpenAI function calling / JSON mode, Claude tool use, Gemini structured output) so reply + classification come back in one call.
3. Normalizing usage/cost and errors (rate limit, timeout, content filter) into common types before returning.

**Adding a 4th provider (DeepSeek, Grok, Mistral, local LLM) means writing one new class implementing `IAIProvider` and registering it in the factory — zero changes anywhere else in the codebase**, which directly satisfies the brief's "switch provider using configuration only, no frontend changes" requirement.

## 5. The Interview Engine (Bounded State Machine)

Per Vision §13.3, this is not a plain chat loop. Each template's `analysisRules`/`conversationRules` config compiles into a set of **coverage goals** (e.g., "identify current workaround," "identify willingness to pay," "get one concrete recent example"). The engine tracks, per session, which goals are still open, and includes that state in the system prompt context every turn — this is what lets the AI dynamically choose *what to ask next* without the frontend or operator managing a rigid question tree.

Termination happens when: all coverage goals are marked satisfied by the extraction step, OR `maxTurns` reached, OR respondent signals they're done, OR idle timeout. All four are explicit, testable conditions — never a vibes-based "the AI decided to stop."

## 6. Streaming Architecture Decision

**Decision:** Use an HTTPS Cloud Function (not a Callable Function) returning a chunked/streamed response, consumed via the Fetch API's `ReadableStream` on the Angular side — not Firestore-document-based token-by-token writes.

**Why:** Firestore-based "streaming" (writing partial tokens as document updates) multiplies writes per message (could be 20-50+ writes for one AI reply) which burns through free-tier write quota fast and adds real cost at scale. A direct HTTP streamed response costs one function invocation and passes tokens straight through, matching how OpenAI/Claude/Gemini already stream. The final complete message is written to Firestore exactly once, after the stream completes.

## 7. Analytics & Configuration Layers

- **Analytics Layer**: `AnalyticsService` reads from `scores`/`insights`/`messages` collections (never raw AI responses) to compute dashboard aggregates. Firebase Analytics (client-side events) is a separate, complementary concern for product usage tracking (page views, session starts) — not the source of the Admin Panel's business dashboards, which need precise Firestore-backed numbers.
- **Configuration Layer**: A single `configurations` collection (Document 5) holds cross-cutting config (default provider, global spend ceiling, feature flags) that isn't specific to one template — read once per cold start and cached in-memory per function instance.

## 8. Key Architectural Decisions (ADR summary)

| # | Decision | Alternative Considered | Why This Won |
|---|---|---|---|
| 1 | Layered monolith (one Functions codebase) | Microservices per domain | Zero benefit at this scale; adds latency and deploy complexity |
| 2 | Manual DI composition root | Full DI framework (InversifyJS etc.) | Unnecessary dependency weight; interfaces alone give us testability |
| 3 | HTTP streaming, not Firestore-doc streaming | Firestore onSnapshot token writes | 10-50x fewer writes per message; lower cost, lower latency |
| 4 | Single structured-output call per turn | Separate reply + classification calls | Halves LLM cost and latency per turn |
| 5 | Bounded state machine with coverage goals | Fully free-form chat | Cost and abuse are bounded; still fully dynamic in phrasing |
| 6 | Firebase App Check + spend caps mandatory in v1 | Add later if abuse happens | Retrofitting after a bill surprise is the expensive mistake we're avoiding |

## 9. What This Architecture Explicitly Defers

- Multi-region Firestore / Functions deployment — single region is correct at v1 scale (Document 17 covers the trigger conditions for revisiting this).
- Queue-based decoupling (Pub/Sub) between classification and synthesis — Firestore triggers are sufficient until volume says otherwise.
- Dedicated caching layer (Redis/Memorystore) — in-memory per-instance caching of template configs is sufficient at v1 scale.

---

**Approval needed:** Confirm this architecture before Document 4 (Database Design), which will implement these layers as concrete Firestore schemas.

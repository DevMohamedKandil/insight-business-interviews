# InsightAI — Angular Architecture

**Document 11 of 20**
**Depends on:** [07-folder-structure.md](./07-folder-structure.md) §4, [09-api-design.md](./09-api-design.md), [10-cloud-functions-design.md](./10-cloud-functions-design.md)
**Status:** Draft for approval

---

## 1. Baseline Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Components | 100% standalone (no `NgModule`) | Angular 20's recommended default; avoids the module-boilerplate tax for a codebase with exactly two feature areas (Document 7 §4) — there's no organizational problem `NgModule` boundaries would solve here that standalone + folder structure doesn't already solve |
| State | Angular Signals, not NgRx/Akita | The app's state is almost entirely **server state mirrored via Firestore `onSnapshot`**, not complex client-only state requiring a dedicated store. Signals + `@angular/fire`'s `Observable`-to-signal interop (`toSignal`) is sufficient. **Alternative considered:** NgRx — rejected as disproportionate machinery for two feature areas with no complex cross-cutting client state (undo/redo, optimistic multi-step wizards, etc.) that would justify it |
| Change detection | `OnPush` on every component | Standard best practice; with Signals driving templates, `OnPush` is close to "free" (Signals are designed to work with it directly) rather than requiring manual `markForCheck()` discipline |
| Rendering | Client-side rendering (CSR) only, no SSR | The public interview surface has no SEO requirement (it's a shared, single-purpose link, not content meant to be indexed — Vision explicitly scopes this as a research tool, not a marketing site) and the admin panel is auth-gated (SSR would provide zero benefit, since nothing renders before auth resolves anyway). **Revisit trigger:** if a future marketing/landing surface is added in front of template links, SSR (Angular's built-in SSR/hydration) becomes worth adding *for that surface specifically*, not retrofitted app-wide speculatively |
| Styling | Angular Material (M3), default theme initially, no bespoke design system | Matches Document 8 §1's explicit choice not to over-invest in visual design before the product is proven |

## 2. Routing & Auth Guards

```typescript
export const routes: Routes = [
  {
    path: 'i/:templateSlug',
    loadComponent: () => import('./interview/interview-shell/interview-shell.component'),
    // no guard — public by design (PRD FR-5)
  },
  {
    path: 'admin',
    canActivate: [adminAuthGuard],
    loadChildren: () => import('./admin/admin.routes'),
    // lazy-loaded as a whole subtree — admin code (charts, export logic, Material
    // table modules) never ships in the bundle a public respondent downloads
  },
  { path: '', redirectTo: '/admin', pathMatch: 'full' },
  { path: '**', loadComponent: () => import('./shared/not-found/not-found.component') },
];
```

**Why the admin subtree is lazy-loaded as a hard rule, not just "a nice optimization":** the public interview bundle is what matters for respondent-facing performance (PRD NFR-Performance) and is downloaded by anonymous strangers on mobile networks; the admin bundle (data tables, chart library, CSV/PDF export code) is downloaded once by one operator on presumably better connectivity. Shipping them as one bundle would tax the performance-sensitive path for the benefit of the path that doesn't need it.

`adminAuthGuard` checks the Firebase Auth custom claim (`admin === true`, Document 6 §6) client-side for routing UX (avoiding a flash of admin UI before redirect) — **this guard is a UX convenience, not a security boundary**; the actual boundary is Firestore Security Rules and Cloud Function auth checks (Document 6 §2), which a route guard bypass could never circumvent.

## 3. Consuming the Streamed `sendMessage` Response

```typescript
// interview.service.ts (simplified)
async sendMessage(sessionId: string, text: string): Promise<void> {
  const response = await fetch(SEND_MESSAGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await this.auth.currentUser.getIdToken()}`,
      'X-Firebase-AppCheck': await this.appCheck.getToken(),
    },
    body: JSON.stringify({ sessionId, text }),
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';           // last (possibly partial) line kept for next chunk
    for (const line of lines.filter(Boolean)) {
      const event = JSON.parse(line);
      if (event.type === 'token') this.streamingText.update(t => t + event.value);
      if (event.type === 'done') this.handleTurnComplete(event);
    }
  }
}
```

`streamingText` is a `WritableSignal<string>` bound directly in the template — this is the one piece of genuinely client-local UI state in the whole app (the in-progress, not-yet-persisted assistant reply), which is exactly the kind of thing Signals are the right tool for, versus the rest of the app's state which mirrors Firestore.

**Why a manual `fetch` + `ReadableStream` reader instead of Angular's `HttpClient`:** `HttpClient` does not support streaming response bodies as of the versions in scope — this is a deliberate, documented exception to "use Angular's built-in HTTP client everywhere," made only for this one endpoint, for exactly the reason Document 9 §2.2 chose HTTPS-not-Callable in the first place.

## 4. Firestore Read Pattern (Everything Else)

```typescript
// Typical admin component pattern
readonly sessions = toSignal(
  collectionData(query(sessionsCollection, where('templateId', '==', this.templateId()), orderBy('startedAt', 'desc'))),
  { initialValue: [] }
);
```

All Firestore reads use `@angular/fire`'s `collectionData`/`docData` wrapped in `toSignal` — real-time by default (`onSnapshot` under the hood), which means the Admin Dashboard updates live as new interviews complete without any manual polling or refresh-button logic, and the public interview UI reflects `session.status` changes (e.g., forced abandonment from a spend-cap hit — Document 10 §2 step 3) without needing a special-case client-side handler for that scenario, since it's just another Firestore document update.

## 5. Component Responsibility Boundaries

| Component | Owns | Does NOT own |
|---|---|---|
| `interview-shell` | Resolving slug → calling `startSession` → routing to unavailable-state vs. active chat | Message rendering, streaming logic (delegated to `chat` + `interview.service`) |
| `chat` | Rendering message list, typing indicator, input box, invoking `interview.service.sendMessage` | Knowing about Firestore document shapes directly — it consumes typed data from `interview.service`, which is the only place `libs/shared-types` session/message interfaces are referenced directly, keeping the presentational component decoupled from schema changes |
| `template-editor` | Form state, client-side validation mirroring (not replacing) FR-3 | Actual publish validation authority (server-side, Document 9 §3.3) |
| `dashboard` | Composing stat tiles/charts from `analyticsRollups` signals | Any aggregation math beyond what's already precomputed server-side (Document 4 §4/§6 — averages from sums happen in a small shared pipe/util, not reinvented per component) |

## 6. Accessibility & i18n Structural Notes

- All interactive chat elements use proper ARIA live regions (`aria-live="polite"`) for streaming text updates — a screen reader should announce new assistant text without re-announcing the entire conversation on every token.
- No hardcoded UI strings for respondent-facing chrome that could plausibly need translation later (send button, disabled-state text) — sourced from a small `i18n` constants file per Vision §10's "config over code" principle, even though full multi-language UI polish is explicitly out of scope for v1 (PRD §6). This is a low-cost structural choice now that avoids a larger refactor later, not scope creep — the actual translation work (producing Arabic/French/Spanish strings) remains deferred.

---

**Approval needed:** Confirm this frontend architecture before Document 12 (Development Roadmap) sequences the build work across these documents.

# ReplyDeck Per-Client Knowledge Base — Research & Architecture

> Research synthesis (2026-06-24). Combines a deep multi-source web research pass
> (95 agents, ~2.8M tokens, adversarial 3-vote verification) with a map of the
> existing ReplyDeck codebase. Citations are inline; claim confidence is marked
> `[high]` / `[medium]` where the source survived adversarial verification, and
> `[REFUTED]` for plausible-sounding claims that did **not** survive — do not adopt those.

---

## 0. TL;DR — the 8 decisions

1. **You are not building from scratch.** ReplyDeck already has `MemoryItem`,
   `ToneProfile`, `SenderProfile`, `FeedbackEvent` (before/after diffs), prompt
   caching, and per-`userId` tenant isolation. The work is closing **four gaps**:
   (a) sent-mail ingestion, (b) embeddings/semantic retrieval, (c) auto-learning
   the profiles from feedback, (d) memory consolidation/decay.
2. **RAG-first, not fine-tuning.** Represent each client's voice as a **style/
   authorship embedding** ("style fingerprint") and retrieve their own sent emails
   as few-shot exemplars. An 800M model + authorship embeddings beats GPT-4 at
   style transfer with *no per-user training* `[high]`.
3. **Memory = consolidation, not full history.** Store a small consolidated slice
   per user and retrieve ~a handful of items per reply. This is *the* cost lever:
   >90% token savings, 91% lower p95 latency vs full-context `[high]`.
4. **Tenant isolation must be deterministic at the DB layer** (filter on
   `userId`/`tenant_id` before the context window is built) — **never** via prompt
   instructions `[high]`. This is the non-negotiable anti-leak guardrail.
5. **Privacy default = abstracted profiles; encrypted raw-content RAG = opt-in /
   higher tier.** Abstracted-only maps more cleanly onto GDPR deletion and Google
   Limited-Use; raw retention buys accuracy at a larger compliance surface.
6. **Postgres isolation evolves up a spectrum** (shared table + RLS → schema →
   logical DB → DB service). Start with shared `pgvector` + Row-Level Security;
   harden later for high-value/compliance tenants `[high]`. Do **not** default to
   schema-per-tenant `[REFUTED]`.
7. **Launch ingestion on M365/Graph + IMAP first; gate Gmail behind scale.**
   Gmail restricted scopes require a recurring **CASA security assessment**
   (~$15k–$75k, re-verified every 12 months) `[high]` — a fixed cost that only
   amortizes once you have users.
8. **Per-user LoRA/PEFT only at Scale tier**, as a hybrid *alongside* RAG, for
   high-value tenants. Research SOTA is RAG+PEFT+feedback `[medium]`, but most
   cost-sensitive production systems ship RAG-only.

---

## 1. Where ReplyDeck is today (baseline)

| Capability | Status | Location |
|---|---|---|
| AI drafting (Anthropic Sonnet 4.6, structured JSON, **prompt caching**, adaptive thinking) | ✅ | `apps/api/src/ai/` |
| Memory store (`MemoryItem`: USER/SENDER/THREAD/COMPANY scope, ≤400 char distilled facts, `sensitivity`, `expiresAt`, FIFO caps 20/sender 50/user) | ✅ keyword-only | `prisma/schema.prisma`, `learning/learning.service.ts` |
| `ToneProfile` (per-user voice presets + overrides) | 🟡 manual-only | `settings/` |
| `SenderProfile` (per-contact relationship/formality, auto-send toggles) | 🟡 manual-only | `settings/` |
| `FeedbackEvent` (APPROVED/EDITED/REJECTED + before/after text) | ✅ captured | `feedback-events/` |
| Email ingestion (Microsoft Graph, push subscriptions) | ✅ **Inbox only** | `microsoft/` |
| Tenant isolation (per-`userId` on every table, encrypted OAuth tokens) | ✅ | schema |
| **Sent-mail ingestion** | ❌ | — |
| **Embeddings / pgvector / semantic search** | ❌ | — |
| **Auto-learning of Tone/Sender profiles from feedback** | ❌ | — |
| **Memory consolidation / decay / relevance scoring** | ❌ | — |

Stack: TypeScript · NestJS 10 · Prisma 5 · PostgreSQL (Fly.io) · BullMQ/Redis ·
`@anthropic-ai/sdk`. The four ❌/🟡 rows are this roadmap.

---

## 2. Target architecture

Four layers, each derived from the client's **sent** mail (the signal you're not
yet using):

### Layer A — Style fingerprint (how they write)
- Compute a per-user **authorship/style embedding** from a sample of sent emails.
  Pre-trained authorship embeddings act as reusable stylistic fingerprints; a
  small model conditioned on them does few-shot style transfer and **outperforms
  GPT-4** with no per-user retraining `[high]`
  (TinyStyler, EMNLP 2024 Findings — https://arxiv.org/abs/2406.15586).
- At draft time, retrieve the user's own sent emails as **few-shot exemplars**.
  Few-shot context substantially beats zero-shot for style imitation `[medium]`
  (https://arxiv.org/abs/2509.24930 — the headline "23.5×" is a *maximum*, low-base
  artifact on essays not email; treat as directional, not a multiplier).
- ⚠️ Style-embedding retrieval was only *marginally* better than plain semantic
  retrieval, and "style beats semantic" was `[REFUTED 1-2]`. So: use semantic
  retrieval as the workhorse and add style-similarity as a **re-ranking signal**,
  not the sole key. Validate on your own email data before over-investing.

### Layer B — Relationship/recipient context (who they write to)
- Build a per-(user, contact) profile: formality, typical greeting/sign-off,
  average length, topics, cadence. You already have `SenderProfile` — extend it
  and **auto-populate from sent mail** instead of manual entry.
- A lightweight contact graph (recipient → domain → org) gives "formality per
  recipient." This can be plain Postgres rows + aggregates; a full knowledge
  graph is not required at Early/Growth tiers.

### Layer C — Topic/domain knowledge (what they write about)
- Periodic summarization + entity/topic extraction over sent threads → distilled
  `MemoryItem`s (you already cap content at 400 chars — keep that discipline).
- Store topic summaries per user/company scope; retrieve semantically per reply.

### Layer D — Consolidated long-term memory (the cost lever)
- Use a **two-phase extract + update pipeline** (Mem0-style): when new sent/feedback
  data arrives, extract candidate facts against a retrieved summary + recent
  window, then reconcile against existing memories via embedding similarity.
  Reported **>90% token-cost savings and 91% lower p95 latency** (1.44s vs 17.1s;
  ~1,764 vs ~26,031 tokens) vs full-context `[high]`
  (Mem0, https://arxiv.org/html/2504.19413v1).
  ⚠️ Vendor-authored benchmark; Mem0's *accuracy* is slightly **lower** than
  full-context (66.9% vs 72.9%). Adopt for cost/latency, validate quality yourself.
- **Hierarchical/temporal consolidation** (raw observations → progressively
  abstracted persona) can be done **without fine-tuning** via a frozen LLM
  (e.g. a cheap model), cutting recalled tokens ~52% at SOTA accuracy `[high]`
  (TiMem, https://arxiv.org/pdf/2601.02845). ⚠️ Benchmarked on dialogue, not email;
  its "persona" = fact recall, not stylometry — applies to your *topic/contact*
  memory by analogy; validate for style.
- This maps directly to your `MemoryItem` FIFO caps: replace blind FIFO with
  **consolidate-then-decay** (merge duplicates, abstract old raw items, drop by
  relevance×recency).

### The retrieval pipeline per reply
```
incoming email
  → deterministic filter: WHERE userId = :uid   (RLS / metadata filter)   ← anti-leak
  → semantic retrieve: top-k MemoryItems + top-n sent-email exemplars
  → re-rank by style-similarity + recency
  → assemble prompt:  [cached system+tone block] + [retrieved slice] + [email]
  → Anthropic draft (structured JSON, as today)
```
Note the **cached** prefix — you already cache the system + tone block. Keep the
per-user retrieved slice *after* the cache boundary so the expensive shared prefix
stays cacheable across users.

---

## 3. Multi-tenant isolation (the no-leak design)

**Non-negotiable rule:** cross-tenant filtering must be enforced **deterministically
at the data layer before the context window is populated** — never by asking the
LLM to "only use this user's data." LLMs are non-deterministic and prompt-injectable
`[high]` (Truto; OWASP LLM Top-10 2025 **LLM08 "Vector & Embedding Weaknesses"**;
AWS: "Never rely on the LLM or system-prompt instructions to filter results").

**Isolation spectrum on Postgres** (least→most isolated) `[high]`
(https://www.tigerdata.com/blog/building-multi-tenant-rag-applications-with-postgresql-choosing-the-right-approach):

| Tier | Model | When |
|---|---|---|
| Early (1–500) | **Shared tables + `pgvector` + Row-Level Security on `userId`** | Default. Cheapest, simplest. You already isolate by `userId`. |
| Growth (500–10k) | RLS + consider per-tenant **namespaces/partitions**; optionally a dedicated vector DB if pgvector recall/latency degrades | When index size or noisy-neighbor latency bites. |
| Scale (10k–100k+) | **Per-tenant logical DB / dedicated service** for high-value or compliance-bound (enterprise/EU) tenants; shared+RLS for the long tail | Hybrid: don't move everyone. |

⚠️ "Schema-per-tenant is the best default" was `[REFUTED 0-3]`. Stay on shared+RLS
until a concrete signal forces harder isolation.

**Defense-in-depth:** RLS at the engine **plus** a deterministic authz check in
middleware (signed claim / `userId` from the session, not from user input) before
any vector query. Either satisfies the guardrail; both is better.

---

## 4. Privacy, consent & compliance

### Two postures (you asked to research both)

| | **(a) Abstracted profiles only** | **(b) Encrypted raw-content + RAG** |
|---|---|---|
| Stores | style fingerprint, contact graph, topic summaries, distilled facts | + encrypted raw sent-email bodies + embeddings |
| Accuracy | good; some loss of verbatim nuance | best context fidelity |
| GDPR deletion | trivial (small, structured) | heavier (purge content + embeddings + backups) |
| Google Limited-Use fit | clean | larger surface to justify |
| Breach blast radius | low (no raw content) | high |

**Recommended default = (a) abstracted, with (b) as explicit opt-in / higher tier.**
This matches your existing design instinct — `MemoryItem.content` is already capped
at 400 chars of "distilled facts only, no raw bodies." Lean into that.

### Consent (onboarding clause)
You explicitly want a clause letting you analyze sent mail. Make it:
- **Specific & granular:** name the data (sent emails), purpose (learn writing
  style/contacts/topics to draft replies), retention window, and that derived
  profiles persist after raw analysis.
- **Separate, opt-in toggle** for raw-content retention (posture b) vs
  abstracted-only (posture a).
- **Revocable**, with deletion that purges profiles + embeddings.
- **Scope-honest:** if you request Gmail restricted scopes, the consent + privacy
  policy must satisfy Google **Limited-Use** (use only for the user-facing feature;
  no ads; no human reading except for security/abuse/with consent; no transfer).

### Data minimization & PII
- **PII detection/redaction before embedding** (e.g. Microsoft Presidio or
  equivalent) so secondary identifiers don't leak into the vector store.
- Default to ingesting a **bounded window** of sent mail (e.g. last N months /
  last K threads) rather than the entire mailbox — cheaper and lower-risk.

### Encryption & keys
- Encrypt at rest + in transit (you already encrypt OAuth tokens). For posture (b)
  and enterprise tenants, consider **per-tenant data keys** (envelope encryption)
  so deletion = destroy the tenant key.

### Provider data-use restrictions
- **Google (Gmail restricted scopes):** any app that can access restricted Google
  data via a third-party server **must pass an independent CASA security
  assessment before production**, must be **re-verified ≥ every 12 months**, and
  must obey **Limited-Use** `[high]`
  (https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification ;
  https://developers.google.com/terms/api-services-user-data-policy).
  CASA runs ~$15k–$75k+ via third-party assessors — a **recurring fixed cost**,
  not per-user. → Launch M365 + IMAP first; turn on Gmail once scale amortizes CASA.
- **Microsoft Graph:** to read sent mail you need `Mail.Read` (already granted) —
  it covers Sent Items; you simply need to query the SentItems folder, not just
  Inbox. Mind Graph throttling on historical backfill (page + back off).
- **IMAP:** broadest reach, fewest structured signals; fetch the `\Sent` mailbox.
  Good for the long tail without per-provider review overhead.

---

## 5. Cost economics & scaling

> The research's surviving claims did **not** produce a clean per-user $ stack
> (flagged as an open question), but fetched sources gave defensible ranges. Treat
> the numbers below as **order-of-magnitude planning figures**, not quotes.

### The four cost components per user
1. **Embedding generation** — one-time backfill of sent mail + incremental on new
   mail. Tiny: modern embedding APIs are ~$0.02–0.13 / 1M tokens. A user's sent
   corpus embedded once is **cents**.
2. **Vector storage** — a few hundred–thousand vectors/user in `pgvector` is
   negligible at Early/Growth; the cost is the Postgres instance, amortized.
3. **LLM inference per reply** — your dominant variable cost. The memory-consolidation
   design is what controls it: retrieving ~1–2k tokens of memory instead of stuffing
   full history is the >90% token saving `[high]`. **Prompt caching** (already wired)
   further cuts the repeated system/tone prefix.
4. **Fixed compliance** — CASA (~$15k–$75k/yr) only if Gmail restricted scopes.

### RAG vs fine-tuning crossover
- Practitioner ranges from fetched sources: **RAG infra ≈ $350–$2,850/mo** total;
  **fine-tuning ≈ $2,400–$18,000 upfront + $500–$5,000 per retrain**. RAG is cheaper
  for most until very high, stable volume.
- Controlled study: **RAG+PEFT (15.98%) > RAG alone (14.92%) ≫ PEFT alone (1.07%)**
  on LaMP — they're **complementary**, and PEFT alone is weak `[medium]`
  (https://arxiv.org/abs/2409.09510). SOTA email assistants = RAG+PEFT+feedback
  `[medium]` (MDPI review; Panza https://arxiv.org/abs/2407.10994), but ⚠️ this is
  research SOTA — many shipping products are RAG-only for cost reasons.
- **Economically viable PEFT at scale = multi-adapter LoRA serving** (one base
  model + many per-tenant adapters via vLLM/LoRAX/SGLang), ~$100–$1,000 per-tenant
  adapter lifecycle vs RAG's ~<$5/1k queries. Only worth it for **high-value
  tenants at the Scale tier**.

### Staged roadmap

| | **Early (1–500)** | **Growth (500–10k)** | **Scale (10k–100k+)** |
|---|---|---|---|
| Retrieval | `pgvector` on existing Postgres | `pgvector` (tuned, partitioned) ± dedicated vector DB if needed | hybrid: pgvector long-tail + dedicated/sharded for heavy tenants |
| Personalization | RAG + few-shot style exemplars | + auto-learned Tone/Sender profiles, consolidation | + optional multi-adapter LoRA for high-value tenants |
| Isolation | shared tables + RLS on `userId` | RLS + namespaces/partitions | per-tenant logical DB for enterprise/EU; shared+RLS otherwise |
| Memory | consolidate-then-decay replaces FIFO | temporal/hierarchical consolidation | tiered storage + relevance-scored recall |
| Ingestion | M365 Graph (SentItems) | + IMAP | + Gmail (post-CASA) |
| Privacy | abstracted-only default | + opt-in encrypted raw RAG | + per-tenant keys for enterprise |
| Dominant cost | LLM inference/reply | inference + Postgres scaling | inference + (CASA if Gmail) + LoRA infra |

---

## 6. Concrete next steps for ReplyDeck (gap-closing order)

> **Status (2026-06-24): Phase 1 SHIPPED** — sent-mail ingestion + consent-gated
> abstracted-profile learning. New `knowledge/` module (`stylometry.ts`,
> `knowledge.service.ts`, controller), Graph SentItems ingestion
> (`graph-client.listSentMessages` / `microsoft.getSentMessages`), consent +
> provenance schema (migration `20260624120000_phase7_sent_mail_learning`).
> Learned voice flows into drafts through the existing `ai-context-loader`
> (ToneProfile/SenderProfile/MemoryItem) — no prompt-path change. Endpoints:
> `POST /knowledge/consent`, `GET /knowledge/status`, `POST /knowledge/learn-from-sent`.
> Verified: `tsc --noEmit` clean; 11/11 stylometry unit tests pass
> (`npm run test:unit`). DB-backed e2e (`knowledge.e2e-spec.ts`) compiles and is
> ready to run once a Postgres test DB is up. **Not yet:** run the migration
> against the live DB; deploy; scheduled re-learning; steps 2/5/6 below.

1. **Ingest sent mail (Graph SentItems).** Extend `microsoft.service.ts` to sync
   the SentItems folder (you have `Mail.Read`). Bound the backfill window. This
   unlocks every layer above — it's the keystone gap.
2. **Add `pgvector`.** Enable the extension; add an `embedding` column to
   `MemoryItem` (and a new `SentEmailExemplar` table). Backfill embeddings; embed
   incrementally on new sent mail. Retrieval stays `WHERE userId = :uid` (RLS).
3. **Auto-learn the profiles you already model.** Wire `FeedbackEvent`
   (APPROVED/EDITED/REJECTED before/after) + sent-mail stats into
   `ToneProfile`/`SenderProfile` updates — replace manual-only editing. The signal
   is already being captured; nothing consumes it yet.
4. **Replace FIFO with consolidate-then-decay** in `learning.service.ts`: two-phase
   extract/update, merge duplicates, abstract old items, score by relevance×recency.
5. **Style fingerprint as a re-ranker.** Compute per-user style embedding; use it
   to re-rank retrieved exemplars (not as the sole key — semantic retrieval leads).
6. **Harden isolation explicitly:** confirm RLS policies on every vector query +
   a middleware authz check; add an automated cross-tenant leak test.
7. **Consent + privacy posture:** ship abstracted-only default + opt-in raw
   retention toggle; PII redaction before embedding; deletion that purges
   embeddings.
8. **Defer Gmail** until user count justifies CASA; M365 + IMAP first.

---

## 7. What this research did NOT settle (validate independently)

- **Concrete per-user $ math** across tiers and the exact RAG→LoRA crossover —
  no surviving claim nailed it; figures above are planning ranges.
- **Which memory framework** (Mem0 / Zep / LangMem / Letta) — several comparative
  vendor claims (Zep latency/accuracy, LangMem namespacing) were `[REFUTED]`. Given
  your NestJS/Prisma/Postgres stack, **building the pattern directly on pgvector**
  is likely simpler than adopting a framework; benchmark before committing.
- **Style-fingerprint quality on real email** — TinyStyler/Mem0/TiMem were
  benchmarked on essays/dialogue, not email. Run an A/B on your own data.
- **Microsoft Graph throttling specifics, GDPR deletion mechanics, per-tenant key
  rotation** — design details to confirm during implementation.

### Explicitly refuted claims (do NOT build on these)
- ❌ "Schema-per-tenant is the best default." (0-3)
- ❌ "Style-embedding retrieval beats semantic retrieval." (1-2) — use as re-ranker only.
- ❌ "Prompting matters more than model size, so fine-tuning is never needed." (0-3)
- ❌ "Memory approaches keep constant performance regardless of length." (0-3)
- ❌ Zep Graphiti "200ms / 94.8%" and LangMem namespacing specifics. (0-3)
- ❌ Mem0 "7k vs Zep 600k tokens" framing. (0-3) — cite only the latency/cost wins.

---

## 8. Key sources (verified)
- Mem0 memory architecture & cost — https://arxiv.org/html/2504.19413v1 `[high, vendor-authored]`
- TiMem temporal/hierarchical consolidation — https://arxiv.org/pdf/2601.02845 `[high]`
- TinyStyler authorship-embedding style transfer — https://arxiv.org/abs/2406.15586 `[high]`
- RAGs-to-Style (style as retrieval key) — https://aclanthology.org/2024.personalize-1.11/ `[primary]`
- Few-shot vs zero-shot style imitation — https://arxiv.org/abs/2509.24930 `[medium]`
- RAG+PEFT complementary (LaMP) — https://arxiv.org/abs/2409.09510 `[medium]`
- Panza local personalized email assistant — https://arxiv.org/abs/2407.10994 `[primary]`
- Personalized email LLM PRISMA review — https://www.mdpi.com/1999-5903/17/12/536 `[medium, low-tier journal]`
- Multi-tenant RAG on Postgres — https://www.tigerdata.com/blog/building-multi-tenant-rag-applications-with-postgresql-choosing-the-right-approach `[blog, corroborated]`
- Deterministic isolation / anti-leak — https://truto.one/blog/how-to-architect-strict-data-isolation-in-multi-tenant-rag-pipelines/ + OWASP LLM Top-10 2025 (LLM08) `[high]`
- Google restricted-scope / CASA / Limited-Use — https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification + https://developers.google.com/terms/api-services-user-data-policy `[high]`

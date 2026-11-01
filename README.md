# NyayaSetu

**One window for every institution complaint.**
SIH 2026 · PS **SIH26264** (AICTE, Ministry of Education) — *Integrated Dashboard for Monitoring and Tracking Institution-Related Complaint Cases Across AICTE Bureaus/Cells.*

AICTE complaints about technical institutions are handled separately by the Regulation Bureau (RB), the Public Grievance Redressal Cell (PGRC) and other bureaus/cells, so nobody sees that the same institution — often the same issue — is being worked on in two places. NyayaSetu is a single source of truth for AICTE officials, with automatic **cross-bureau overlap detection**.

> This build covers **Priority 1** and **Priority 2** (voice intake, student portal, college desk, heatmap, risk index, smart routing and the extras). It is a demo on synthetic data with demo-only sign-in, not a production system.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
```

- Node 18.17+ (tested on Node 22). No database, no external services, no network needed at runtime.
- On first request the app generates a deterministic synthetic dataset and persists it to `data/db.json`. All actions are saved there.
- Reset demo data: **SLA settings → Regenerate demo data** (Competent Authority), or stop the server and run `npm run reseed`.
- Press **Ctrl+K** anywhere in the officer app for the command palette. Students sign in separately at `/student`.
- Production: `npm run build && npm start`.

### Environment variables (optional)

| Variable | Effect |
| --- | --- |
| `ANTHROPIC_API_KEY` | Enables Claude for translating and categorising typed or spoken complaints, and for checking evidence photos (`lib/llm.ts`). Without it, every feature uses a deterministic fallback, and any failed call falls back the same way. The LLM path has not been run against the live API. |

Without a key, translation covers the 12 sample complaints; other regional text gets a word gloss or is marked for an official to read. It never invents a sentence.

## Roles (demo sign-in, top-right)

No passwords. Pick a role in the top-bar switcher; the client sends `x-role` / `x-region` / `x-officer` headers and **every API route enforces visibility and permissions server-side**. A request with no valid role gets `401`.

> **Role switching is demo-only and header-based.** The server trusts whatever role the request claims, so anyone who can reach the API can claim any role. Replace it with real authentication before any non-demo use.

| Role | Sees | Can do |
| --- | --- | --- |
| Competent Authority / Senior Management | All cases, nationally | Every action, return escalated cases with directions, link/coordinate, SLA settings, audit trail, reset |
| RB Officer | RB cases + cases at other units that overlap with RB cases (complainant identity hidden on partner cases) | Act on RB cases, coordination remarks on partner cases, link/coordinate overlaps involving RB |
| PGRC Officer | Same, for PGRC | Same, for PGRC |
| Other Bureau/Cell Officer | AB, PAPB, Anti-Ragging Cell + overlap partners | Same, for those units |
| Regional Office Officer | Every case on institutions in the chosen region | Field remarks only (read-mostly) |
| College Nodal Officer (new) | Their own college's student complaints: pseudonym and complaint text only | Upload proof of work. Cannot close a complaint or reach officer APIs |
| Student (new, `/student`) | Their own complaints | OTP sign-in with a session token, not a role header. Demo IDs are shown on the sign-in form; the OTP is always `123456` |

## 3-minute demo script

1. **Overlap alert (0:00–0:45).** Open `/` as *Competent Authority*. Point at the KPI strip (counts animate, page refreshes every 5 s). In **Cross-bureau overlap alerts**, each card shows an RB case and a PGRC case on the same institution joined by a pulsing bridge, with an advisory confidence. Click **Simulate incoming case** a couple of times — a new case lands, and about half the time a fresh *“Potential Overlapping Cases – Coordination Required”* toast appears and the Open overlaps count rises.
2. **Match reasons and coordination (0:45–1:30).** Go to **Overlaps**. On a card, show the two complaints side by side: different wording, different references, institution written as an acronym or misspelt, Permanent ID missing or one digit off. Read the *match reasons* (Permanent ID, fuzzy name %, TF-IDF text similarity with shared terms). Pick a lead unit, type a note, **Link cases**, then **Mark coordinated**.
3. **Case timeline (1:30–2:15).** Click a case ID to open the drawer: all ten tracking fields, the institution as the complainant wrote it vs the master record, and the chronological **workflow and action history** (notices, replies, transfers RB↔PGRC, escalation, linking). Record a decision with a document attached; remarks are mandatory.
4. **Roles (2:15–2:40).** Switch to *PGRC Officer*: the dashboard becomes the PGRC desk, partner RB cases show as read-only with complainant identity hidden, and trying to dispose an RB case is refused by the API. Switch to *Regional Officer – Southern* to see the region scope.
5. **Reports and audit (2:40–3:00).** **Reports** → Pending ageing / Overlapping & duplicate / Monthly → **Export CSV**. Finish on **Audit trail**: every sign-in, case view, action and link with officer and role.

## Priority 1 requirement checklist

| # | Requirement | Where |
| --- | --- | --- |
| 1 | Centralised institution profile: Permanent ID, name, address, region, consolidated history | `/institutions`, `/institutions/[id]` (profile, all-unit history table, cross-unit timeline, names/IDs complainants used) |
| 2 | Case tracking: Case ID, date received, category, status, bureau/cell, officer, last action, next action, date of last action, expected disposal | `/cases` table + case drawer; CSV export of all fields |
| 3 | Cross-bureau overlap detection with reasons and confidence; link/map and mark coordinated | `/overlaps`, overlap feed on `/`, drawer callout; manual “Link to another case” in drawer · engine in `lib/overlap.ts` |
| 4 | Real-time dashboard: received, pending, under process, disposed, transferred, escalated, beyond timeline, institution-wise status, bureau workload; 5 s refresh; simulate button | `/` |
| 5 | Workflow and action history with officer/bureau, timestamp, remarks, documents, transfer/escalation | Case drawer timeline; documents uploaded to `data/uploads`, downloadable with role check |
| 6 | Search and filters: institution name, Permanent ID, Case ID, bureau/cell, region, category, status, date range | `/cases` (plus top-bar global search), `/institutions` |
| 7 | Alerts: overlap/duplicate, pending reminders, escalation, SLA breach and due-soon; bell + page; SLA days per category configurable | Bell in top bar, `/alerts`, `/settings` |
| 8 | Reports: bureau, region, institution history, ageing, disposal rate, overlap/duplicate, monthly, quarterly — chart + table + CSV each | `/reports` |
| 9 | Role-based dashboards for CA, RB, PGRC, other bureau, regional office; role switcher; API enforcement via headers | Top-bar switcher; `lib/server.ts` (`viewerFrom`, `visibleIds`, `isOwnCase`) used by every route |
| 10 | Safeguards: audit trail, RBAC, advisory labels on machine output, human decision on every action, synthetic-data badge | `/audit`; “Advisory” labels on matches and confidence; mandatory remarks on every action/link; footer badge |

## Priority 2 demo path

1. **Student sign-in.** Open `/student`, pick a demo student, slide the bot check, send the OTP and enter `123456`.
2. **Voice complaint.** **New complaint** → choose Telugu → **Use sample voice complaint** → **Submit**. The urgency score appears with its one-line reason.
3. **Masked, urgency-ranked case.** In the officer app, switch to *College Nodal Officer* (Krishna Tejaswi is the default). `/college` ranks complaints by urgency and shows only a pseudonym, plus the reminder and simulated SMS log.
4. **Proof and AI report.** Open the complaint, describe the work, attach a photo or PDF and mark it resolved. The advisory evidence check appears; it is never presented as proof.
5. **Not done.** Back on `/student`, read the proof and report, then press **Not done**. The complaint becomes an AICTE case, not a return to the college, and carries only the pseudonym.
6. **AICTE desk.** As *Competent Authority*, open `/grievances`: see the escalation and genuineness flags, then reveal the identity with a reason. The reveal lands in `/audit`.
7. **Risk index.** Open `/institutions`, then the college profile: factor bars, confidence badge, "Why this score", peer comparison and pulse results. Compare *Teesta Ridge*, a silent college that reads "Insufficient data - low confidence". Answer the pulse survey in `/student` to see it feed the totals.
8. **Heatmap and extras.** `/heatmap`: toggle the metric, hover a state, click to filter. Then Ctrl+K, the overlap graph on a profile, and **Print report**.

## Priority 2 requirement checklist

| Item | Requirement | Where |
| --- | --- | --- |
| A | Voice intake with language selector and sample fallback; original and translation stored | `/intake`, `/student`; `components/voice-intake.tsx`, `lib/intake.ts` |
| B | SVG state tile grid, metric toggle, tooltip, click-to-filter, ranked list | `/heatmap`, card on `/`; `components/state-heatmap.tsx` |
| C | College dashboard by urgency, proof upload, advisory evidence check | `/college`. Student verification (2G) replaces the optional community verifier |
| D | Routing suggestion with explanation; the official confirms | `/intake`, case drawer on new cases; `suggestRouting` in `lib/student.ts` |
| E | Risk Index with per-1,000 context, handling-quality score, confidence, pulse, peers with shrinkage, factor bars, "Why this score", banner | `/institutions`, `/institutions/[id]`; `lib/risk.ts`, `components/risk-panel.tsx` |
| F | Ctrl+K palette, overlap graph, print-friendly institution report | Everywhere in the officer app; `/institutions/[id]` |
| 2G | OTP login, mock bot check, rate limits, urgency score, pseudonyms, audit-logged reveal, reminders, auto-escalation, Done / Not done, 7-day Closed - Unverified, genuineness flags | `/student`, `/college`, `/grievances`; `lib/student.ts` |

Mocked or simulated: the OTP (always `123456`, no SMS), the bot check (swap point: `verifyBotToken` and `components/bot-check.tsx`), SMS reminders (logged only), and the evidence check without a key (scores the note and file types; it does not inspect images). Voice recording needs a browser with the Web Speech API, which may send audio to the browser vendor's speech service.

Identity masking removes emails, phone numbers, roll numbers, APAAR IDs and self-introductions such as "my name is". It cannot catch every name written in free text, so treat it as a safeguard rather than a guarantee.

## How the College Risk Index works (`lib/risk.ts`)

Advisory only; it never accepts or rejects an approval.

- **Handling, not volume.** Scored: median resolution time vs SLA, SLA breaches, reopen rate, student-verified closures, unverified closures, pulse rating, felt-unable-to-complain, approved vs actual intake, fee vs norm, compliance validity. Complaints per 1,000 students is shown for context and not scored.
- **Shrinkage.** Each factor is smoothed towards the peer mean (same region and type): `(n·x + k·peer) / (n + k)`. A factor with no data sits at the peer mean, never at zero.
- **Confidence.** Based on closed complaints, student-portal complaints and pulse responses. Low confidence reads "Insufficient data - low confidence". Silence plus a poor pulse response rate is flagged and held at Low. No band ever says "good".
- **Anti-gaming.** Suspicious 72-hour bursts are excluded and flagged, overlapping cases count once, and one student counts at most 3 times.

Weights and thresholds were chosen for this demo and have not been calibrated against real outcomes.

## How overlap detection works (`lib/overlap.ts`)

For every pair of open cases:

- **Institution match** — max of: Permanent ID equality (1.0) or near-match (Levenshtein 1 → 0.75, 2 → 0.45); fuzzy name similarity on normalised tokens (abbreviation expansion, generic words removed, per-token Levenshtein ratio, acronym detection such as “SRIT, Solan”); and both cases resolving to the same master record (`lib/resolve.ts`).
- **Text similarity** — TF-IDF cosine on subject + description with institution-name tokens removed, so shared institution names do not inflate the score.
- **Confidence** = 0.5 × institution + 0.35 × min(1, text / 0.3) + 0.15 × same category. Cross-unit pairs at or above the threshold (default 62%, configurable) become overlaps; same-unit pairs need ≥ 80% and high text similarity to be flagged as duplicates. Pairs are clustered with union-find.
- Officials can **link**, **mark coordinated**, **unlink** or mark **not related** (suppresses the pair). Each decision needs a note and is written to every case’s timeline and the audit trail.
- Separately, ≥ 5 complaints against one institution within 72 hours raise an advisory *complaint burst* alert.

## Seed data (`lib/seed.ts`, deterministic)

60 fictional institutions across all eight AICTE regions, ~340 cases over 18 months in eight categories, five bureaus/cells and six languages. Planted for the demo: 15 cross-bureau overlap clusters (2 of them spanning three units) worded differently with name variants and mistyped IDs, 10 SLA-breaching cases, 5 transfer/escalation chains and 2 suspicious complaint bursts. All names of institutions, officers and complainants are invented.

The student layer is appended from a separate random seed, so the data above stays identical: 120 student complaints with pseudonymous IDs (including reopened and unverified closures), pulse survey totals for 40 colleges, 3 "silent but low-confidence" colleges, 12 voice transcripts with translations, and objective signals for every college.

## Project layout

```
app/                 pages (App Router) and api/* route handlers
components/          shell, case drawer, overlap bridge, charts, UI kit
lib/store.ts         in-memory store, persisted to data/db.json
lib/seed.ts          synthetic data generator
lib/overlap.ts       overlap + burst detection
lib/resolve.ts       institution resolution (advisory)
lib/text.ts          normalisation, Levenshtein, TF-IDF
lib/server.ts        role resolution, visibility, SLA, alerts
lib/analytics.ts     dashboard and reports
lib/intake.ts        categorising, severity, urgency, masking, voice samples
lib/student.ts       student sessions, sweeps, escalation, routing, role-safe views
lib/risk.ts          College Risk Index
lib/llm.ts           optional Claude calls with fallbacks
middleware.ts        401 for requests with no valid role; limits college API access
```

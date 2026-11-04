# NyayaSetu

**One window for every institution complaint.**
SIH 2026 · PS **SIH26264** (AICTE, Ministry of Education) — *Integrated Dashboard for Monitoring and Tracking Institution-Related Complaint Cases Across AICTE Bureaus/Cells.*

AICTE complaints about technical institutions are handled separately by the Regulation Bureau (RB), the Public Grievance Redressal Cell (PGRC) and other bureaus/cells, so nobody sees that the same institution — often the same issue — is being worked on in two places. NyayaSetu is a single source of truth for AICTE officials, with automatic **cross-bureau overlap detection**.

> This build covers **Priority 1** and **Priority 2** (voice intake, student portal, college desk, heatmap, risk index, smart routing and the extras). It is a demo on synthetic data, not a production system; see `/security` for what is implemented, mocked and planned.

**Demo video:** [`nyayasetu-demo.mp4`](nyayasetu-demo.mp4) (stored with Git LFS; run `git lfs pull` after cloning). **Research behind the code:** [`REFERENCES.md`](REFERENCES.md).

## Run

```bash
npm install
npm run dev        # http://localhost:3000, then sign in at /login
```

- Node 18.17+ (tested on Node 22 and 26). With no `.env.local`, the app runs with no database and no external services.
- On first request the app generates a deterministic synthetic dataset. Locally it is saved to `data/db.json`, or to Supabase if configured.
- Reset demo data: **SLA settings → Regenerate demo data** (Competent Authority), or stop the server and run `npm run reseed`.
- Press **Ctrl+K** in the officer app for the command palette.
- Production: `npm run build && npm start`.
- Smoke test, on fresh demo data with a production server running: `npm run smoke -- http://localhost:3000`.

### Environment variables

Copy `.env.example` to `.env.local`. All are optional locally.

| Variable | Effect |
| --- | --- |
| `SESSION_SECRET` | 64 hex characters; signs session cookies. Local fallback with a warning. **On Vercel, sign-in is refused without it**, because a known secret would let anyone forge a session. |
| `DATA_ENCRYPTION_KEY` | 64 hex characters; AES-256-GCM key for student identity fields. Development fallback with a warning. Changing it makes existing rows unreadable, so run a reseed. |
| `GROQ_API_KEY` | Enables AI. Without it, or on any error, every feature uses its deterministic fallback. |
| `GROQ_MODEL` | Default `llama-3.3-70b-versatile`. Groq retires models: if this one is not on your key, the header shows "AI: offline fallback" and the server logs why. Set a current model such as `openai/gpt-oss-120b`. |
| `GROQ_VISION_MODEL` | Default `meta-llama/llama-4-scout-17b-16e-instruct`, for evidence photos. If unavailable, the offline evidence check is used. |
| `GROQ_STT_MODEL` | Default `whisper-large-v3`. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Store state and uploads in Supabase. Server-side only. |

Without a Groq key, translation covers the 12 sample complaints; other regional text gets a word gloss or is marked for an official to read. It never invents a sentence.

### Deploying on Vercel with Supabase

1. Create a Supabase project in Mumbai (`ap-south-1`).
2. In the SQL editor, create the table. RLS stays on with no policies, so only the service role key can reach it:

```sql
create table app_state (
  id int primary key default 1,
  data jsonb not null,
  version bigint not null default 0,
  updated_at timestamptz default now()
);
alter table app_state enable row level security;
```

3. In Storage, create a **private** bucket named `uploads`.
4. On Vercel, add `SESSION_SECRET`, `DATA_ENCRYPTION_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY` and `GROQ_MODEL`, then redeploy. `vercel.json` pins the functions to `bom1`.

The first request seeds an empty table. The state is stored gzip-compressed inside the `data` column. Each write sends the whole state with a version check; if another instance wrote first, unsaved changes are re-applied to the newer copy and retried. Reads answer straight away and save their bookkeeping (view audit, reminders) in the background. From a machine far from the database a write can take several seconds, so leave the Supabase variables out of `.env.local` for fast local work. Without them on Vercel the app runs from memory and shows a "demo data resets on restart" banner.

### Design notes

The UI is a warm light theme ("parchment and marigold"). `tailwind.config.ts` remaps the colour scales instead of renaming classes, so **`text-white` and `bg-white` now produce dark ink**, and the slate, emerald, red and similar scales run dark to light. Use `bg-paper` or `text-paper` when you need the light colour.

`/cases` opens on the journey map, which shows each complaint's stage and deadline. The **Table** tab (`/cases?view=table`) has every tracking column, including the officer and status.

## Sign-in and roles

One page, `/login`, for everyone. The server takes role, region and officer only from a signed, httpOnly cookie (8 hours, 2 for students). `x-role` style headers and query parameters are ignored. The "Demo accounts" panel fills the form for each role below.

Every official has an account: `firstname.lastname@nyayasetu.demo` for officers and `nodal.<college-prefix>@nyayasetu.demo` for each college. All share the password `Nyaya@Demo2026`.

| Role | Demo sign-in | Lands on | Sees | Can do |
| --- | --- | --- | --- | --- |
| Competent Authority | `a.k.mathur@nyayasetu.demo`, then 2FA `123456` | National command centre | Everything, audit, SLA settings, grievance desk | Every action; audit-logged identity reveal |
| RB Officer | `kavita.deshpande@nyayasetu.demo` | My desk | RB cases and overlap partners, complainant hidden on partner cases | Act on RB cases, coordination remarks on partners, intake |
| PGRC Officer | `manoj.kulkarni@nyayasetu.demo` | My desk | Same, for PGRC | Same, for PGRC |
| Other Bureau/Cell | `neha.agarwal@nyayasetu.demo` | My desk | AB, PAPB, ARC | Same, for those units |
| Regional Officer | `revathi.krishnan@nyayasetu.demo` | Regional dashboard and map | Cases in their region | Field remarks only |
| College Nodal | `nodal.krishna-tejaswi@nyayasetu.demo` | `/college` only | Their college's complaints: pseudonym and masked text | Upload proof. Cannot close a complaint |
| Student | `APAAR-2046-1001` + `9000000001` (also `-1002` + `...02`, `-2001` + `...03`), bot check, OTP `123456` | `/student` only | Their own complaints | File, verdict, pulse survey, privacy requests |

Roles are enforced on the server for pages (middleware redirect) and APIs (403 JSON). Five failed sign-ins lock an account for 5 minutes.

## 3-minute demo script

1. **Overlap alert (0:00–0:45).** Open `/` as *Competent Authority*. Point at the KPI strip (counts animate, page refreshes every 5 s). In **Cross-bureau overlap alerts**, each card shows an RB case and a PGRC case on the same institution joined by a pulsing bridge, with an advisory confidence. Click **Simulate incoming case** a couple of times — a new case lands, and about half the time a fresh *“Potential Overlapping Cases – Coordination Required”* toast appears and the Open overlaps count rises.
2. **Match reasons and coordination (0:45–1:30).** Go to **Overlaps**. On a card, show the two complaints side by side: different wording, different references, institution written as an acronym or misspelt, Permanent ID missing or one digit off. Read the *match reasons* (Permanent ID, fuzzy name %, TF-IDF text similarity with shared terms). Pick a lead unit, type a note, **Link cases**, then **Mark coordinated**.
3. **Case timeline (1:30–2:15).** Click a case ID to open the drawer: all ten tracking fields, the institution as the complainant wrote it vs the master record, and the chronological **workflow and action history** (notices, replies, transfers RB↔PGRC, escalation, linking). Record a decision with a document attached; remarks are mandatory.
4. **Roles (2:15–2:40).** Sign out and sign in as *PGRC Officer*: the landing page is the PGRC desk, partner RB cases show as read-only with complainant identity hidden, and trying to dispose an RB case is refused by the API. Sign in as the *Regional Officer* to see the region scope.
5. **Reports and audit (2:40–3:00).** **Reports** → Pending ageing / Overlapping & duplicate / Monthly → **Export CSV**. Finish on **Audit trail**: every sign-in, case view, action and link with officer and role.

## Priority 1 requirement checklist

| # | Requirement | Where |
| --- | --- | --- |
| 1 | Centralised institution profile: Permanent ID, name, address, region, consolidated history | `/institutions`, `/institutions/[id]` (profile, all-unit history table, cross-unit timeline, names/IDs complainants used) |
| 2 | Case tracking: Case ID, date received, category, status, bureau/cell, officer, last action, next action, date of last action, expected disposal | `/cases` journey map and table + case drawer; CSV export of all fields |
| 3 | Cross-bureau overlap detection with reasons and confidence; link/map and mark coordinated | `/overlaps`, overlap feed on `/`, drawer callout; manual “Link to another case” in drawer · engine in `lib/overlap.ts` |
| 4 | Real-time dashboard: received, pending, under process, disposed, transferred, escalated, beyond timeline, institution-wise status, bureau workload; 5 s refresh; simulate button | `/` |
| 5 | Workflow and action history with officer/bureau, timestamp, remarks, documents, transfer/escalation | Case drawer timeline; documents uploaded to `data/uploads` or Supabase Storage, downloadable with role check |
| 6 | Search and filters: institution name, Permanent ID, Case ID, bureau/cell, region, category, status, date range | `/cases` (plus top-bar global search), `/institutions` |
| 7 | Alerts: overlap/duplicate, pending reminders, escalation, SLA breach and due-soon; bell + page; SLA days per category configurable | Bell in top bar, `/alerts`, `/settings` |
| 8 | Reports: bureau, region, institution history, ageing, disposal rate, overlap/duplicate, monthly, quarterly — chart + table + CSV each | `/reports` |
| 9 | Role-based dashboards for CA, RB, PGRC, other bureau, regional office; server-side enforcement | `/login`, `middleware.ts`, `lib/roles.ts`; `lib/server.ts` (`viewerFrom`, `visibleIds`, `isOwnCase`) used by every route |
| 10 | Safeguards: audit trail, RBAC, advisory labels on machine output, human decision on every action, synthetic-data badge | `/audit`; “Advisory” labels on matches and confidence; mandatory remarks on every action/link; footer badge |

## Priority 2 demo path

1. **Student sign-in.** At `/login`, choose a student in Demo accounts, slide the bot check, send the OTP and enter `123456`.
2. **Voice complaint.** **New complaint** → choose Telugu → **Use sample voice complaint**, or record for up to 60 seconds → accept the privacy notice → **Submit**. It appears at once as "With college, awaiting response" with an SLA countdown, urgency and reminder log.
3. **Masked, urgency-ranked case.** Sign in as *College Nodal*. `/college` ranks complaints by urgency and shows only a pseudonym.
4. **Proof and AI report.** Open the complaint, describe the work, attach a PNG, JPG or PDF. The advisory evidence check appears; it is never presented as proof.
5. **Not done, round 1.** Back on `/student`, the "Needs your verdict" banner shows. Press **Not done** and give a reason. It becomes an AICTE case carrying only the pseudonym.
6. **AICTE returns it.** As *Competent Authority*, open `/grievances` and return it with directions. A new round starts.
7. **Round 2.** The college uploads new proof and the student is asked again. A second Not done flags it Critical on the desk. Done closes it as verified; 7 days of silence after any proof closes it as unverified.
8. **Identity and overlap.** On `/grievances`, the Competent Authority sees "Student complaints with possible overlap" and can reveal an identity with a reason. Both stay hidden from students and colleges. The reveal lands in `/audit`; press **Verify integrity** there.
9. **Officer intake.** As an RB officer, open `/intake`, process a complaint about an institution with open cases, and choose link, file as new or mark duplicate. Remarks are mandatory.
10. **Risk index and map.** Open a college profile for factor bars and "Why this score", then `/heatmap`: toggle the metric, hover a state, click to filter.

## Priority 2 requirement checklist

| Item | Requirement | Where |
| --- | --- | --- |
| A | Voice intake with language selector and sample fallback; original and translation stored | `/intake`, `/student`; `components/voice-intake.tsx`, `lib/intake.ts` |
| B | India map (36 states and UTs), metric toggle, tooltip, click-to-filter, ranked list | `/heatmap`, card on `/`; `components/state-heatmap.tsx` |
| C | College dashboard by urgency, proof upload, advisory evidence check | `/college`. Student verification (2G) replaces the optional community verifier |
| D | Routing suggestion with explanation; the official confirms | `/intake`, case drawer on new cases; `suggestRouting` in `lib/student.ts` |
| E | Risk Index with per-1,000 context, handling-quality score, confidence, pulse, peers with shrinkage, factor bars, "Why this score", banner | `/institutions`, `/institutions/[id]`; `lib/risk.ts`, `components/risk-panel.tsx` |
| F | Ctrl+K palette, overlap graph, print-friendly institution report | Everywhere in the officer app; `/institutions/[id]` |
| 2G | OTP login, mock bot check, rate limits, urgency score, pseudonyms, audit-logged reveal, reminders, auto-escalation, Done / Not done, 7-day Closed - Unverified, genuineness flags | `/student`, `/college`, `/grievances`; `lib/student.ts` |

Mocked or simulated: the OTP and Competent Authority 2FA (always `123456`, no SMS), the bot check (swap point: `verifyBotToken` and `components/bot-check.tsx`), SMS reminders (logged only), and the evidence check without a vision model (scores the note and file types; it does not inspect images). Browser speech recognition, used when Groq transcription is unavailable, may send audio to the browser vendor's speech service.

Text sent to Groq is pre-redacted (phones, emails, roll numbers, APAAR IDs). Identity masking uses those rules plus names found by AI; when AI is down the UI shows "Masking: basic". It cannot catch every name written in free text, so treat it as a safeguard rather than a guarantee. Students' free text is stored as written; only name, mobile and roll number are encrypted.

**Still demo-grade:** the shared password, mock OTP and 2FA, in-memory rate limits (per server instance), whole-state JSON storage, and `unsafe-inline` in the CSP, which Next.js needs without nonces.

**Map:** boundaries come from the [DataMeet India community](https://github.com/datameet/maps) (CC BY 4.0), which follows India's claimed boundaries including PoK, Aksai Chin and Arunachal Pradesh. Ladakh is built from the 2011 Leh and Kargil districts, so the J&K and Ladakh internal line is approximate, with the Gilgit-Baltistan area drawn under J&K. It is not an official Survey of India product; check it against the Survey of India map before any official use. To rebuild: `npm run build:map -- <states.geojson> <dists11.geojson>`.

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
lib/store.ts         state store: data/db.json, Supabase or memory
lib/seed.ts          synthetic data generator
lib/overlap.ts       overlap + burst detection
lib/resolve.ts       institution resolution (advisory)
lib/text.ts          normalisation, Levenshtein, TF-IDF
lib/server.ts        role resolution, visibility, SLA, alerts
lib/analytics.ts     dashboard and reports
lib/intake.ts        categorising, severity, urgency, masking, voice samples
lib/student.ts       student sessions, sweeps, escalation, routing, role-safe views
lib/risk.ts          College Risk Index
lib/groq.ts          optional Groq AI, always with fallbacks
lib/session.ts       signed session cookies
lib/auth.ts          sign-in, lockout
lib/vault.ts         encryption of student identity fields
lib/files.ts         upload checks and storage
lib/india-paths.ts   generated map shapes (scripts/build-india-map.mjs)
middleware.ts        session check, page and API role guards, Origin check
```

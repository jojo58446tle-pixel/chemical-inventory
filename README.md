# IQC Risk Assessment System

Production-ready IQC web application for recording Incoming/Production NG, calculating explainable risk, generating supplier-facing quality-control recommendations, sending DingTalk alerts, searching historical risk, and exporting Excel.

> **Risk Engine answers: HOW RISKY IS THIS?**  
> **AI answers: WHICH CONTROL AREAS SHOULD BE REVIEWED?**

AI never determines LOW/MEDIUM/HIGH and never claims a confirmed root cause without explicit evidence. This system does not replace SQE corrective-action management.

## What is included

- Incoming NG and Production NG database
- Rule-based, explainable Risk Engine
- Critical and Safety HIGH overrides
- 30-day frequency detection: Incoming row = 1 Batch, Production row = 1 Occurrence; `NG Quantity (PCS)` is impact only and never raises Risk
- Defect normalization (for example, thread-paint descriptions map to the same repeat group)
- AI Quality Recommendation module with provider abstraction
- Strict structured JSON validation and safe fallback recommendations
- AI result persistence; no repeated API call on page refresh
- Admin-only manual **Regenerate AI** action
- Professional supplier message copy function
- DingTalk signed-webhook integration and alert history
- Duplicate-alert prevention
- Public Material Code risk search without supplier AI content
- Internal Risk-Based Inspection Focus
- Evidence picture upload through Netlify Blobs
- Edit/Delete risk recalculation and audit log
- Protected Excel export
- Cookie-based admin authentication
- Responsive mobile/desktop interface
- Automated tests

## Architecture

```text
React/Vite Frontend
        |
        v
Netlify Function API  ───────────────> Netlify Blobs (evidence pictures)
        |
        +── Admin Authentication
        +── NG Record Service ───────> Supabase/PostgreSQL
        +── Rule-Based Risk Engine
        +── AI Recommendation Engine ─> Configured AI provider
        +── DingTalk Alert Service ───> DingTalk Robot Webhook
        +── Excel Export
```

The database uses five tables:

| Table | Purpose |
| --- | --- |
| `ng_records` | Raw Incoming/Production NG; source of truth |
| `risk_events` | Rule-engine result derived from NG history |
| `ai_recommendations` | Derived control-area recommendations |
| `alert_history` | DingTalk message result and idempotency record |
| `audit_logs` | Create/Edit/Delete audit trail |

## Existing Risk Engine

Risk level is always calculated by `netlify/functions/lib/risk-engine.mjs`.

Rules implemented in V2:

1. `Safety Impact = YES` → **HIGH**, trigger `SAFETY_IMPACT`.
2. `Defect Level = CRITICAL` → **HIGH**, trigger `CRITICAL_DEFECT`.
3. Frequency is counted only for the same **Source + Material Code + normalized Defect** within 30 days:
   - Incoming: **1 row = 1 Batch**
   - Production: **1 row = 1 Occurrence**
   - `1 Batch/Occurrence` → **LOW / OBSERVE**
   - `2 Batches/Occurrences` → **MEDIUM**
   - `>=3 Batches/Occurrences` → **HIGH**
4. Incoming Major has a minimum level of **MEDIUM**. If the same Incoming Material + Defect reaches 3 batches within 30 days, frequency escalates it to **HIGH**.
5. `NG Quantity (PCS)` is displayed as damage/impact only. A single record with 5, 20, or 70 PCS still counts as only **one** Batch/Occurrence and PCS never raises Risk.

Incoming and Production frequency are not mixed. Lot ID is optional and is not used as a frequency-detection requirement.

Existing `risk_events.repeat_occurrences` is retained for API/database compatibility: it stores Batch count for Incoming and Occurrence count for Production. `repeat_qty` stores accumulated PCS for impact display only.

## AI Recommendation Architecture

AI runs **after** the NG record and rule-based risk are saved. It is triggered only when configured conditions are met:

- HIGH risk
- Production repeat trigger
- Critical defect
- Safety-related defect

The AI request contains only relevant quality information and a maximum of ten related historical records. The system prompt requires cautious engineering language and prohibits:

- confirmed root-cause statements without evidence
- invented technical facts
- detailed process-parameter prescriptions
- 8D/CAPA workflow actions
- due dates, SQE approval, supplier blame, or automatic 100% inspection

The provider must return structured JSON. The response is validated by Zod before it is saved. Invalid JSON, timeouts, rate limits, provider errors, or a missing API key produce a safe fallback recommendation. NG and Risk remain saved.

Prompt version is stored as `V1` for auditability.

### Provider contract

The built-in `compatible` provider calls:

```text
POST {AI_BASE_URL}/chat/completions
Authorization: Bearer {AI_API_KEY}
```

It expects a chat-completions-compatible response with JSON content in `choices[0].message.content`. To add another provider, create an adapter in `netlify/functions/lib/ai/provider.mjs`; do not copy the prompt or model name into other modules.

## Prerequisites

- Node.js 20 or newer
- A Netlify account/site
- A Supabase project (PostgreSQL + REST API)
- Optional: DingTalk custom robot
- Optional: an AI provider with a compatible JSON chat endpoint

The system is fully usable without an AI API key; it will save `FALLBACK` recommendations.

## 1. Install and verify

Unzip the project, open a terminal in the project folder, then run:

```bash
npm install
npm run check
```

Expected result: automated tests pass and Vite creates the `dist` folder.

For local full-stack development:

```bash
cp .env.example .env
npm run dev
```

## 2. Database setup

1. Create a Supabase project.
2. Open **SQL Editor**.
3. Run `database/migrations/001_initial_schema.sql`.
4. Copy the Supabase **Project URL** to `DATABASE_URL`.
5. Copy the Supabase **service_role key** to `DATABASE_KEY`.

Important:

- In this project, `DATABASE_URL` means the Supabase Project URL, for example `https://xxxx.supabase.co`, not a PostgreSQL connection string.
- `DATABASE_KEY` must be the server-side service-role key because Row Level Security intentionally denies browser access.
- Never prefix an environment variable with `VITE_`; doing so would expose it to the browser.

## 3. Environment variables

Copy every key from `.env.example` to Netlify **Site configuration → Environment variables**.

| Variable | Required | Description |
| --- | --- | --- |
| `ADMIN_PASSWORD` | Yes | Strong password for password-only admin login |
| `SESSION_SECRET` | Yes | Random secret, recommended 32+ bytes |
| `DATABASE_URL` | Yes | Supabase Project URL |
| `DATABASE_KEY` | Yes | Supabase service-role key |
| `DINGTALK_WEBHOOK_URL` | No | Custom robot webhook |
| `DINGTALK_SECRET` | No | DingTalk robot signing secret |
| `AI_PROVIDER` | No | `compatible` (default) |
| `AI_BASE_URL` | For real AI | Provider API base URL ending before `/chat/completions` |
| `AI_API_KEY` | For real AI | Provider key, server-side only |
| `AI_MODEL` | For real AI | Provider model name |
| `AI_TIMEOUT_MS` | No | Timeout in milliseconds; default `12000` |
| `AI_TRIGGER_*` | No | Set a trigger to `false` to disable it |
| `APP_TIMEZONE` | No | Default `Asia/Bangkok` |

Generate a session secret locally, for example:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Do not place real values in `.env.example`, GitHub, frontend source, or static JavaScript.

## 4. DingTalk setup

1. Create a DingTalk group custom robot.
2. Enable signed security.
3. Save its webhook in `DINGTALK_WEBHOOK_URL`.
4. Save its signing secret in `DINGTALK_SECRET`.
5. Redeploy the site.

DingTalk runs after NG and Risk are committed. If DingTalk fails, the application keeps the NG and Risk and saves the failed alert in `alert_history`.

Alert behavior:

- First new HIGH repeat threshold → alert.
- HIGH remains HIGH with no new trigger → no spam.
- New Critical event → may alert again.
- New Safety event → may alert again.
- The same risk event cannot send a duplicate successful alert.

The supplier message includes AI/fallback supplier recommendations but never includes the internal IQC inspection focus.

## 5. Netlify deployment

Recommended production path:

1. Unzip the complete project.
2. Push the unzipped folder to your Git repository.
3. In Netlify, choose **Add new site → Import an existing project**.
4. Select the repository. Netlify reads `netlify.toml` automatically.
5. Add the environment variables listed above.
6. Deploy.
7. Open `/login` and sign in.

Alternative with Netlify CLI:

```bash
npm install
npx netlify login
npx netlify init
npx netlify deploy --build --prod
```

Do **not** upload only the `dist` folder: that would omit the API functions, AI module, DingTalk, authentication, pictures, and Excel export.

## Usage flow

1. Admin opens `/login`.
2. Select **New NG**, **Incoming NG**, or **Production NG**.
3. Enter evidence. Lot ID may be blank.
4. Click **Save & assess risk**.
5. The raw NG is saved first.
6. Risk Engine calculates LOW/MEDIUM/HIGH.
7. If an AI trigger matches, the recommendation runs once and is saved.
8. For a new HIGH alert trigger, the DingTalk message is generated and sent.
9. Open the record to review Control Areas, copy the supplier message, or regenerate AI.
10. Use **Export Excel** for the complete NG/Risk/AI dataset.

Public users may search `/` by Material Code. Public results include risk, history, repeat metrics, and IQC inspection focus. Supplier AI recommendation remains admin-only.

## AI failure handling

| Failure | NG | Risk | AI status | DingTalk recommendation |
| --- | --- | --- | --- | --- |
| Missing API key | Saved | Saved | `FALLBACK` | Safe fallback |
| Timeout | Saved | Saved | `FALLBACK` | Safe fallback |
| Invalid JSON | Saved | Saved | `FALLBACK` | Safe fallback |
| Rate limit/provider error | Saved | Saved | `FALLBACK` | Safe fallback |
| DingTalk error | Saved | Saved | Unchanged | Alert history = `FAILED` |

The UI visibly identifies a fallback recommendation. It never changes the rule-based Risk Level.

## Testing

```bash
npm test
npm run build
```

The automated suite covers:

- Critical override
- Safety override
- 30-day Batch/Occurrence frequency rules
- PCS-is-impact-only rule (including single records with high PCS)
- Source separation: Incoming batches never increment Production occurrences
- Real-number wording for frequency, PCS impact, and 30-day window
- Defect normalization
- No-Lot calculation
- delete/recalculation behavior at engine level
- AI trigger evaluation
- structured JSON validation
- missing API key and invalid-provider fallback
- conservative unknown-defect behavior
- DingTalk supplier-message boundaries
- duplicate alert prevention
- protected Excel export contract
- responsive mobile breakpoint

## Troubleshooting

### Login returns an error

Confirm `ADMIN_PASSWORD` and `SESSION_SECRET` exist in Netlify and redeploy. The admin login requires only the password. Environment changes do not affect an already-built deployment until it is redeployed.

### Records cannot load or save

Confirm `DATABASE_URL` is the Supabase Project URL, `DATABASE_KEY` is the service-role key, and the migration ran successfully. Check the Netlify Function log for the API request.

### AI always shows FALLBACK

Check `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, and provider compatibility. The endpoint must support `POST /chat/completions` and return JSON content in `choices[0].message.content`.

### DingTalk alert is not sent

Check the webhook, signing secret, DingTalk robot keyword/security settings, and `alert_history.error_message`. A prior successful fingerprint is intentionally not resent.

### Pictures fail locally

Netlify Blobs needs the Netlify development/deployment context. Use `npm run dev` (Netlify Dev), not `npm run dev:vite`, for full picture/API behavior.

### Excel export redirects to login

Sign in as Admin in the same browser, then use the **Export Excel** button. The file endpoint is intentionally admin-protected.

## Project structure

```text
src/                           React UI
netlify/functions/api.mjs      Server API and Excel/image endpoints
netlify/functions/lib/         Auth, DB, Risk, DingTalk, validation
netlify/functions/lib/ai/      Provider, prompt, schema, recommendation
database/migrations/           PostgreSQL/Supabase schema
tests/                         Automated tests
.env.example                   Environment template (no secrets)
netlify.toml                   Netlify build/functions/redirect config
```

## Scope boundary

This project intentionally does **not** include Supplier Login, Supplier Portal, CAPA/8D workflow, Corrective Action due date, SQE approval, Supplier Scorecard, Supplier Audit, Supplier response tracking, AI NG probability, automatic root-cause determination, automatic 100% inspection, or machine-learning risk scoring.

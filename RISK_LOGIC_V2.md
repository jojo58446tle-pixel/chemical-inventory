# Risk Logic V2 — Frequency-Based Fix

This release fixes the previous defect where `NG Quantity (PCS)` could raise Risk.

## Source of truth

Risk is based on frequency for the same **Source + Material Code + normalized Defect** within 30 days.

- Incoming: 1 database row = 1 Batch
- Production: 1 database row = 1 Occurrence
- 1 Batch/Occurrence = LOW / OBSERVE
- 2 Batches/Occurrences = MEDIUM
- 3 or more Batches/Occurrences = HIGH
- Incoming Major = minimum MEDIUM
- Critical = HIGH immediately
- Safety Impact = HIGH immediately
- NG Quantity (PCS) = impact/damage display only; it never increases Risk

Incoming and Production frequency are counted separately.

## Existing database data

`risk_source` is now `RULE_ENGINE_V2`.

On the first Admin records load after deployment, the application detects old/missing Risk rows and recalculates stored `risk_events` without sending DingTalk alerts or calling AI. Public Risk Search calculates with V2 in memory so it is correct even before the Admin page is opened.

No database schema migration is required.

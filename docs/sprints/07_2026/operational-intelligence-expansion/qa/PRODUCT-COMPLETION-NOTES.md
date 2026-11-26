# OI Product Completion — QA notes (2026-07-28)

## Authenticated browser (127.0.0.1:3012)

- Questions chapter: compact cards (Future Room Capacity, Room Utilization only); no oversized hero; Financials-style underline chapter tabs.
- Calculation Library: left definitions rail + right workspace; New definition opens ReadableDefinitionBuilder (no “Start from”).
- Population / weighting catalogs load (`Active children · v1`, `Full-time equivalents · v1` with days table).
- Try it runs against South Campus / Bears; current staging data returns unavailable (0 matching children; effective capacity unknown) — deterministic Bears matrix not fully seeded in this org yet. Fixture contract documented in `web/lib/operationalQuestions/oiQaFixtures.ts`.

## Remaining visual gaps vs Financials

- Questions chapter still lacks a dense contained workspace chrome around the card grid.
- Measurement list on Questions home is still a simple list (Measurements tab has L/R shell).
- Weighting/population **editors** are inspect/read panels; draft edit tables (Parts 12–13) not fully authorable inline yet.

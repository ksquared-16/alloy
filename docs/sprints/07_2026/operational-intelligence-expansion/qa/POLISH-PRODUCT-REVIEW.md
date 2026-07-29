# Operational Intelligence V1 Polish — Product Review Notes

## Cross-product audit (what OI still lacks vs polished Organization products)

| Product | Strength OI should match | Remaining OI gap |
|---|---|---|
| Financials | Dense tuition rail + selected workspace; quiet chapter tabs | Measurement rail still uses ConfigurationQueue (taller than Locations rows); duplicate Future Room Capacity rows from prior setup |
| Rooms | Glyph + name + status + meta hierarchy | Definition rail now matches; Questions cards are denser but not glyph-row collections |
| Processes | Configuration workspace with sticky actions | Definition Test sits beside Definition; Save still top-only on new builder |
| Surfaces / Programs | Clear collection status language | OI Measurements mixes platform KPIs with org-calc measurements in one list |
| Access | Operator vs developer separation | Developer mode (`?developer=1` / localStorage) hides QA from operators |

## Director walkthrough — hesitations fixed this sprint

1. Definition list felt like cards → dense Locations-style rows (name, status, where used, updated).
2. Multiple Room Utilization-looking QA defs → operator filter hides `OI-QA` / try-it / proving fixtures.
3. Builder said Use / Calculate / Compare with → English: Definition / Count / Treat each child as / Compare against / Show.
4. Room Utilization (FTE) as a second question → product catalog shows one question; counting mode is configuration.
5. Measurement Overview showed capacity recipe for utilization → recipe sentence now unit/question-aware.
6. Definition workspace required scrolling Test separately → Definition + Test side-by-side.

## Remaining friction (not blocking demo, note for follow-up)

- Three identically named Future Room Capacity measurements in the rail (data hygiene / dedupe UX).
- Platform KPI rows still appear under “What we measure” alongside org-calc measurements.
- “Then” still exposes operator names like Divide / Use first available value (math language, not AST).
- Measurement Overview still sparse until Get answer is clicked (intentional empty state; denser after answer).
- Narrow mobile: collection → select pattern exists; not as polished as Locations mobile select.

## Demo readiness

If we demoed Operational Intelligence tomorrow, a director would recognize Questions → Configuration → Measurement → History → Definition as a finished Organization chapter. They would not see QA fixtures or an FTE twin question. Residual polish (duplicate capacity measurements, mixed KPI list) is data/UX hygiene—not unfinished platform architecture.

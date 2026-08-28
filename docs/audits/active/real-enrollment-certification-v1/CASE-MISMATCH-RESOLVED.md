# The case was right. The view was wrong. Fixed — plus one thing you should decide.

**No decisions mutated. Nothing applied. Nothing published.**

---

## §1 — What you were actually looking at

You were on the correct case. Only one case is active in the certification tenant:
`89caf3ec-2c3d-4286-a022-524bdaad16a8`, with three sources.

It durably stores **two** analyses:

| Metadata key | Contents |
|---|---|
| `packet_intake` | **180 destinations · 32 obligations · 3 sources** — the certification analysis |
| `form_draft_preview` | **3 fields · 2 sections** — the handbook alone, auto-detected on import |

"3 concepts from 3 questions" was the second one.

### The defect: durable analysis, ephemeral view

`reviewMode` is React state initialised to `"concepts"`, and only becomes `"packet"` by pressing
*Analyse as one packet* **in that browser session**. Reopening the case threw the packet view away
even though the tenant still held the analysis — so the packet was reachable exactly once, by the
person who had just created it, and never again.

**Fixed:** the stored packet now rides on the case detail read model, and a case that has been
analysed as a packet lands on the packet. Deterministic, with no click.

### How to open it

`http://127.0.0.1:3014/login` → sidebar **Processing** → **Recent work** →
`school-of-enrichment-family-handbook.pdf`. It is the only active case. You now arrive on
**Packet review** directly — verified in the browser, screenshot at
[`evidence/CERT-packet-review.png`](evidence/CERT-packet-review.png):

> 3 source documents analysed together · **SOURCES 3 · ARTIFACTS 6 · DESTINATIONS 180 · FACTS 89 ·
> OBLIGATIONS 32 · SIGNATURES 6** · **BALANCED — 180 of 180 normalized destinations accounted for,
> 0 counted twice**

(FACTS reads 89 because that panel counts fact *concepts*; 86 is the count after correlation merges
three across artifacts. Both are in the certified record.)

## §2 — Language is now operator-facing

| Was | Now |
|---|---|
| Owned elsewhere in Alloy | **Handled by another area** |
| Alloy already knows these | **Handled automatically** |
| Needs an owner | **Needs your decision** |
| Existing fields matched | **Alloy already has** |
| Form responses (no field) | **Families will provide** |

Architecture words — owner, routing, grain, disposition — no longer appear in a row's primary lines.
They are in **Why**, which every row still carries.

### The correction you flagged, taken seriously

The old grouping named **durable ownership**, so medications sat under "held" — which reads as
*this will not be asked*. It will be asked.

The primary grouping now answers **what happens to this family**:

- **Families will provide** — questions this enrollment asks
- **Alloy already has** — existing facts to confirm or prefill
- **Handled automatically** — submission date, derived values; no question asked
- **Needs your review** — genuine configuration decisions
- **Documents & signatures** — obligations executed through artifacts

Medications now read: *"Asked during enrollment. Health & Safety keeps the ongoing record."* Where an
answer finally lives moved to Why. A concept that needs your decision **also** appears under
*Families will provide*, because an undecided owner does not remove the question from the packet.

A control asserts a health concept can never again render as "held" or imply exclusion.

## §3 — What Accept actually records (checked before changing anything)

**Accept is not decoration.** `applyDiscovery` **skips** any proposal that is not `accepted` — an
un-accepted row is dropped at apply time. So the honest framing is *Alloy decided, you confirm*, and
I did not weaken persistence for presentation. A row already decided now shows its conclusion with a
quiet **Change** (was "Undo"); primary Accept is reserved for undecided rows.

## §4 — Focus Panel treatment

Sections use `WS_PANEL_SURFACE` / `WS_PANEL_SURFACE_FLAT` / `WS_PANEL_HEADER` — the same border,
radius, elevation, ring and header hierarchy as the drawer panels. **No new tokens.** Order is now
decisions → what families provide → obligations → conclusions → audit, and the groups you only
inspect (`Alloy already has`, `Handled automatically`, static/output) render in the flatter, quieter
surface.

## §5 — One thing to decide: there are two decision stores 🛑

The packet review header says **"0 decisions recorded"**. That is true, and not a bug in the count:

| Store | Contents | Used by |
|---|---|---|
| `configuration_discovery_decisions` | **50 accepted** — the safe-accept I persisted | the per-document **concept** review |
| `packet_intake_review` | **absent** | the **packet** review you now land on |

So the 50 decisions are real and durable, and they live in the store the *other* surface reads. The
packet review is packet-grain (fact and obligation), the concept review is per-document — they were
built for different grains and never reconciled.

I did not migrate decisions between stores, because which store is authoritative for the
certification publish is a modelling decision, not a cleanup. **My read:** the packet review is the
right authority — it is the surface that matches the certified analysis, and it is where you are now
landing. If you agree, the next run reconciles the 50 into it and re-runs safe-accept there.

Tell me which store is authoritative and I will continue.

## State

Permit held. No decision mutated, nothing applied, nothing published, shared dev untouched. Branch
clean; zero new test failures; typecheck green.

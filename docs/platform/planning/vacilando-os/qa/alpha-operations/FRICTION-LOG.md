# Vacilando Alpha Operations — Friction Log

The lightweight, durable place to record **Operational Learning observations** during real Alpha use, until the Operational Learning runtime is realized. This is the *smallest existing evidence pathway* — a markdown file, appended by hand — **not** a telemetry system, surveillance layer, analytics dashboard, or nightly runner. Its only job is to collect trustworthy operational evidence.

## The one rule

**Every observation describes the product, never the person.**

- ✅ *"Vacilando did not show whether execution was still progressing, so the provider window was opened for confirmation."*
- ❌ *"The operator was impatient."*

The subject of every line is Vacilando. The operator's actions are evidence of *the product's* shortcomings, never judgments of the operator.

## What to record (product-centered friction)

- The operator had to leave Vacilando (opened a provider console, terminal, editor, branch, or `lsof`).
- Execution progress became unclear (couldn't tell running-vs-progressing).
- Director interrupted at the wrong time.
- A frontier was hidden or confusing.
- The review lacked evidence needed to accept.
- The operator had to reconcile machine state by hand.
- Work appeared stuck when it was progressing (or vice-versa).
- The operator repeated an action because feedback was unclear.

## Format (one entry per friction)

```
### <short product-centered title>
- when: <capability / operational state / moment>
- what happened: <the product behavior, described objectively>
- escape required: <did the operator have to leave Vacilando? to where? why?>
- recurrence: <first time / "also happened in …">
- hypothesis (optional): <why the product caused it — a cause, not a symptom>
```

Recurrence is what turns a single observation into evidence — note when the same friction repeats. An isolated one-off is an observation, not yet a candidate improvement.

## Observations

### Starting a mission gives no way to capture what the work should specifically do
- when: Access & Roles, starting a new mission (state: Ready to start)
- what happened: The "What are we working on?" box accepts text, but the operator's words don't shape the compiled work — a rich intent ("Access & Roles V2 — add an audit trail and role templates, exclude per-user grants") produces the **identical** templated objective as just typing "Access & Roles". At a Ready mission the only actions are *Start this work* / *Ask Director to prepare again*; there is no field or reply box to add scope, decisions, or specifics before starting. Clicking a capability card also overwrites any fuller text the operator had typed.
- escape required: none yet, but the operator cannot express what this specific mission should do from inside Vacilando — the work would have to be shaped by opening the package or the provider directly.
- recurrence: first observed, on the first real start attempt.
- hypothesis: (1) the compiler templates the objective from the capability's Product Definition and uses the operator's intent only for capability + version matching, so typed detail is captured (m.intent) but inert; (2) the conversation's decision/reply composer is rendered only on send-back or needs-operator, never at Ready, so there is no always-available way to shape the work; (3) the capability card writes only the name into the intent box, discarding richer framing. The product tells the operator "you author via intent and decisions," then gives no place to do either at the moment of starting.

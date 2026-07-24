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

_(none yet — Alpha Operations Day 1 begins with Communications)_

# Operational Intelligence — Equivalency Engine

## Platform chain

```text
Facts → Populations → Equivalency Definitions → Equivalent Count → Calculations → Measurements → Answers
```

| Primitive | Persistence | Versioning |
|-----------|------------|------------|
| Population | `org_settings.metadata.organization_populations` | draft → published immutable |
| Equivalency Definition | `org_settings.metadata.organization_weightings` (compat key) | draft → published immutable |
| Equivalent Count | AST `equivalent_count` | binds exact population + equivalency version IDs |

Calculations always consume **Equivalent Count**, never raw category maps or weekly-hour inputs.

## Strategies (operator chooses one)

| Strategy | Operator prompt | Controls |
|----------|-----------------|----------|
| A · `category` | Full-time / Part-time categories | Category → counts as |
| B · `session_or_day` | Days or sessions attended | Days/week map **or** attendance types |
| C · `weekly_hours` | Weekly scheduled hours | Hours that equal one full-time child |

Legacy schemes `unweighted` and `days_per_week` remain readable and map into the canonical strategies.

## Product language

- UI: Equivalency, Counts as, Equivalent children, How should scheduled children count?
- Avoid: Weighting, Weight, Weighting algorithm

## Explanation shape

```text
Population
Children expected in Bears
Strategy
Days or sessions
Equivalent definition
5 days = 1.0
…
Equivalent children
10.0
```

## Future subjects (not implemented)

Equivalent Staff · Equivalent Workload · Equivalent Revenue Units · Equivalent Attendance Days · Equivalent Classroom Load — same Equivalency → Equivalent Count abstraction.

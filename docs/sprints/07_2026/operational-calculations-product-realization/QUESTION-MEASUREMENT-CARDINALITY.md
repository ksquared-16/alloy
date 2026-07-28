# Future Room Capacity — measurement cardinality

**Canonical rule (proving slice):**

```text
One active measurement per Question key (`future_room_capacity`) per organization.
```

- Starting measuring again retires the prior active Future Room Capacity measurement and activates the new one (shared configure path for UI and BOS).
- Retired / historical measurements may remain in metadata for audit; they are not shown as current product instances.
- Multiple active measurements for the same question are not supported in this slice — Add / Start measuring routes to configure or open the existing instance.
- Do not destructively delete QA artifacts without approval; retire via lifecycle instead.

Questions Alloy can answer ≠ measurement instances. Home shows both distinctly.

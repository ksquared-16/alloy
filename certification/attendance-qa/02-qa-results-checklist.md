# Attendance V1 — Director QA results checklist

One row per scenario. Copy this file per pass and keep the old ones: a second
pass after repairs is expected, and comparing passes is how you see whether a fix
held.

**Pass header — fill in before starting**

| Field | Value |
|---|---|
| Pass number | |
| Date | |
| Staging SHA | |
| Site(s) used | |
| Operator / role | |
| Browser + device | |

**Result values:** `PASS` · `FAIL` · `BLOCKED` · `NOT TESTED` · `DEFERRED BY DESIGN`

- `BLOCKED` — you could not reach the scenario (setup missing, dependency failed).
  Say what blocked it in Notes; a blocked scenario is not a pass.
- `DEFERRED BY DESIGN` — the guide told you this is intentionally absent. Expected
  for the marked rows; **not** a finding.

| ID | Scenario | Expected result | Result | Bug ID | Severity | Notes |
|---|---|---|---|---|---|---|
| ATT-QA-01 | Room hierarchy | Nested rooms included in site lists and totals | | | | |
| ATT-QA-02 | Capture scope | Refuses to save until explicitly chosen | | | | |
| ATT-QA-03 | Device register/revoke | Code shown once; no health indicator | | | | |
| ATT-QA-04 | Connected systems | Sites, matches, problems; no provider fiction | | | | |
| ATT-QA-05 | Absence/closure signpost | Explains where; has no editor | | | | |
| ATT-QA-06 | Today's roster | Expected / Here now / Not arrived | | | | |
| ATT-QA-07 | Check in | Counts move; Focus Panel agrees | | | | |
| ATT-QA-08 | Move to playground | Location changes, *Here now* does not | | | | |
| ATT-QA-09 | Move between groups | Placement unchanged | | | | |
| ATT-QA-10 | Correct a movement | One child, original room | | | | |
| ATT-QA-11 | Check out | Leaves *Here now* | | | | |
| ATT-QA-12 | Re-entry | Present again | | | | |
| ATT-QA-13 | Not arrived | Unexplained only | | | | |
| ATT-QA-14 | Off sick | *Not arrived* falls | | | | |
| ATT-QA-15 | Holiday range | Away across the range | | | | |
| ATT-QA-16 | Withdraw absence | Day expects her again; history kept | | | | |
| ATT-QA-17 | Site closure | **No mass not-arrived** | | | | |
| ATT-QA-18 | Room closure | Scoped to that room | | | | |
| ATT-QA-19 | Attends despite plan | Present **and** unplanned | | | | |
| ATT-QA-20 | Kiosk arrival | Same result as operator capture | | | | |
| ATT-QA-21 | Siblings | All permitted children offered | | | | |
| ATT-QA-22 | Authorized collection | Succeeds | | | | |
| ATT-QA-23 | Unauthorized collection | Declines, **says nothing** | | | | |
| ATT-QA-24 | Revoked device | Records nothing | | | | |
| ATT-QA-25 | Wrong site | Refused | | | | |
| ATT-QA-26 | Double tap | One arrival | | | | |
| ATT-QA-27 | Privacy reset | No names left on screen | | | | |
| ATT-QA-28 | Assignment-scoped capture | Allowed in, refused out | | | | |
| ATT-QA-29 | Family intent | Bounded intent, operator decides | | | | |
| ATT-QA-30 | Holiday credit | Traceable in Financials | | | | |
| ATT-QA-31 | No-credit cases | No credit appears | | | | |
| ATT-QA-32 | Correction before posting | Withdrawn/superseded | | | | |
| ATT-QA-33 | Day metrics agree | Match the workspace | | | | |
| ATT-QA-34 | Children on site now | Unchanged by a move | | | | |
| ATT-QA-35 | Site filter | Unavailable, never zero | | | | |
| ATT-QA-36 | Live never stale | Reflects the change now | | | | |
| ATT-QA-37 | Integration health | Child counts unaffected | | | | |
| ATT-QA-38 | Consequences awaiting | A count, not an amount | | | | |
| ATT-QA-39 | Honest trends | No unearned arrow | | | | |

## Rows expected to be `DEFERRED BY DESIGN`

These are **not** bugs. If any of them is present and working, that is itself
worth a note — it means this guide is out of date.

| What | Why |
|---|---|
| Device/producer "last seen", health, online | the timestamp is never written, so a badge would be invented |
| Financial-consequence line inside Attendance screens | derived but not mounted; check Financials |
| Attendance configuration diagnostics panel | derived but not mounted |
| Historical attendance rate / absence rate | the only windowed source ignores known-away and would contradict the live figures |
| Late-arrival / early-departure | no scheduled arrival time or grace policy exists to measure against |
| Staffing / ratio metrics | staff supply is not modelled; the denominator would be invented |
| Named provider integrations (incl. Classroom Coach) | generic foundation only; no provider is built |
| Parent portal / family app | V1 ships bounded family intent only |

## Pass summary

| | Count |
|---|---|
| PASS | |
| FAIL | |
| BLOCKED | |
| NOT TESTED | |
| DEFERRED BY DESIGN | |

**Gate:** every non-deferred scenario must be `PASS` before `DIRECTOR_QA_ACCEPTED`.
Any `P0` finding blocks acceptance outright regardless of the totals.

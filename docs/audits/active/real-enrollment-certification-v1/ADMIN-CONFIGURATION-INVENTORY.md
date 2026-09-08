# Admin configuration inventory — what the parent path actually depends on

Recorded while driving the parent Enrollment journey end to end against the certification tenant
(Firefly Early Learning, hosted certification project). This is an inventory, not a design: Thread 2
is not started here.

For each behaviour: where it is configured, whether an admin can find it in the product, and what is
hidden, manual, or correctly code-owned.

---

## 1. What the parent is asked for

| Behaviour | Where configured | Admin-discoverable? |
|---|---|---|
| Which facts are confirmed vs collected | Business Process stage requirements, published configuration | Yes — Organization → Business Processes |
| How many Forms the stage requires | Same | Yes |
| The Form's fields and their semantic types | Form authoring (a date stays a date in the parent editor) | Yes |
| Which document is compiled for Review | Published packet on the stage | Yes |

**The open question from `KELLY-LOCAL-QA.md` still stands and is configuration, not code:** the
Enrollment stage asks for **one** Form. The certification was written expecting five. Nobody removed
four — the configuration has always had one. Adding requirements is a configuration change.

The suite states this in its own words: `L_sufficiency` passes because the gate and the operator
projection *agree*, whatever the configured number is.

---

## 2. Two capabilities this tenant does not publish

Both were certified as configuration-proven N/A rather than assumed working, and both are worth a
deliberate decision:

- **Repeatable party collection** (`F_parties`). The active packet presents no add-another, and no
  parent/guardian/emergency-contact collection appears anywhere in the parent runtime. Not a defect
  — a capability this tenant does not publish today.
- **Childcare Operational Enrollment v1** (`P_handoff`). The feature flag is off for this org, so
  completing Enrollment materializes no agreement, placement or schedule assignment. Zero
  operational records is the configured behaviour here. Complete Enrollment still moves the child
  durably regardless.

`P_handoff` is a **hidden dependency**: an org-level feature flag, not visible in the product, that
silently changes what completing an Enrollment produces downstream.

---

## 3. Requiring an acquisition episode — now explicit

Several outcome targets are Opportunity-scoped and cannot run for a context-free child. They now
refuse **by name** instead of passing absence down a layer:

| Target | Behaviour without an acquisition episode |
|---|---|
| `update_family_case_status` | Refuses — the family case *is* the Opportunity |
| `create_next_work` | Refuses — stage work hangs off the Opportunity |
| enrollment materialization | Degrades (non-blocking); the child still enrols |
| contact-outcome trace | Skipped — no Opportunity event stream |
| transition requirement preflight | Not blocking — its context is the Opportunity record |

This is **correctly code-owned**. An admin should not be able to configure a target onto a stage
whose subjects cannot satisfy it, and the refusal now names the target so the message is actionable.

---

## 4. Gaps an admin would hit

### 4.1 There is no in-product way to reach or re-send a parent's Enrollment link

**The most significant finding here.** The parent link is created by the participant launch. Once
created, the operator has no affordance to open, copy, or re-send it:

- The child record (`/workspace/record/child/<id>`) renders **only** the Children card. The
  Enrollment tab is selected by default and shows the same card — no Enrollment work, no Current
  Work, no link.
- This is identical for **both** the context-free and Opportunity-backed children, so it is not a
  context-free gap. (That sameness is itself the parity the slice claims.)
- `Send form` on the Focus Panel is Opportunity-grain and appears on pipeline records such as
  Waitlist. It did not surface on either certification family's record.

So today, re-sending a family their link is not an operator action. **This is the gap most likely to
be hit first in real use** — a parent loses the email and there is nothing the office can do in the
product.

### 4.2 Form list accumulates certification debris

The Send form picker lists ~20 forms, most named `Cert Enrollment <timestamp>` and
`Cert Consent <timestamp>` — fixture debris in the tenant. An admin choosing a form has to know
which of these is real. Cosmetic, but it is what an operator sees in the picker.

### 4.3 Trusted server configuration is invisible by design

`DEV_TENANT_SPINUP_ENABLED`, the Supabase keys and the certification org binding live in the trusted
env tier and never enter the worktree. Correct, and correctly code/operator-owned — noted so it is
not mistaken for something an admin can self-serve.

---

## 5. Parent-facing language

The parent runtime keeps the distinction §7 requires:

> Enrollment **paperwork** is complete → "Patha Certfree's enrollment paperwork has been submitted.
> Our staff will review it and follow up if anything else is needed."

It never says the child is enrolled, and enrolling stays the operator's decision
(`K_participant_complete` proves the child reads `enrolling`, not `enrolled`, after the parent
finishes).

One leak was found and fixed in this lane: a parent **returning** to a finished link was told
"Packet already completed" — the only place that internal word reached a family, and it dropped the
staff-review half of the message.

No tenant configuration controls this copy; it is code-owned, which is right for a legal/consent
distinction.

# CORE FINANCIALS V1 — MANUAL QA GUIDE

A human pass over the non-subsidy Financials product on hosted staging. Every label below is the
one actually rendered by the build this guide was written against — if the screen says something
different, that is itself a finding worth writing down.

You do not need to read any source code to run this.

---

## ENVIRONMENT

| | |
|---|---|
| Staging URL | https://staging.workwithalloy.com |
| Deployed build | must contain the collectibility repair, merged as `2103b3973` — check `/api/build-info`. A **newer** SHA is fine and expected: staging moves with other threads. |
| QA identity | `qa-slot1-product@example.com` |
| Organization | `93667019-bd28-49b5-a688-acc9bb1e0a19` (Firefly Early Learning) |
| Household | **Alvarez Household (demo)** · `fd000000-0000-4000-8000-0000000c0001` |
| Child | **Ana Alvarez** · `fd000000-0000-4000-8000-0000000d0001` |
| Responsible adult | **Dana Alvarez** · `fd000000-0000-4000-8000-0000000b0002` |
| Second child | **Rio Alvarez** · `fd000000-0000-4000-8000-0000000d0005` — deliberately has **no** enrolment agreement |
| Site | **North Campus** · `1a5644a7-45c4-413b-9021-5f556118b6e2` |
| Enrolment agreement | `fd000000-0000-4000-8000-0000000a0001` |
| Fixture | `certification/fixtures/financials-demo-tenant.sql` |

### Restoring your QA session

The browser session lasts about an hour. When it lapses you are signed out; that is runtime
behaviour and **is not a Financials defect** — do not log it as one.

An agent restores it through the governed action `environment.restore_deployed_qa_session` with
target `alloy_staging_web`. You approve it the way you approve any privileged action.

### Resetting the fixture — read this before you do it

The hosted reset is the governed action `environment.execute_registered_reconciliation` with
`reconciliation_key: seed_financials_demo_tenant`, `target_environment: staging`, `dry_run: false`.
The organization is frozen in the registry and is never supplied by the caller.

> **The reset recreates the RELATIONSHIP structure only — households, children, enrolment
> agreements, the funding agency. It seeds NO money.**
>
> After a reset every charge, payment, reduction, responsibility arrangement and expected-funding
> row for this household is gone, and all of it must be rebuilt through the ordinary product
> actions in this guide. Scenario 1 is then your genuine zero state.

### What a clean starting state looks like

Alvarez opens, the card renders, and everything reads zero: no charges, no payments, no
adjustments, nothing owed, nothing collectible — and **Add charge** is still offered. An account
with no financial history is a perfectly ordinary, fully supported state.

### Getting to Financials

1. Sign in at https://staging.workwithalloy.com.
2. Go to **/workspace**.
3. In the left sidebar click **Financials**.
4. The workspace opens with the header **Financials** and, underneath, the scope — e.g.
   *All sites · operational*.
5. Tabs across the top: **Overview · Accounts · Charges · Payments · Subsidy · Activity**
   (and a **Work / Studio** pair above them — stay in **Work**).
6. Click **Accounts**, then **Alvarez Household (demo)**.
7. The right-hand pane is headed **Account-wide financial detail**.

> While it loads you may briefly see *Loading the account…*. If it settles on
> **Financial account unavailable** and stays there, that is a finding — record it.

---

## HOW TO RECORD A RESULT

Each scenario gives you a **PASS condition**. Anything else is a FAIL, and a FAIL needs:
scenario number · what you saw · what you expected · a screenshot · the household · and the charge
or payment id if one is on screen.

---

## 1 · FINANCIAL SUBJECT / ZERO STATE

**Starting state:** any state, but most meaningful straight after a fixture reset.

1. Open **Financials → Accounts → Alvarez Household (demo)**.
2. Read the account pane.
3. Reload the browser (a real reload, not a tab switch) and open the same account again.

**Expected:** the household name appears; the card renders rather than an error; **Add charge →**
is offered even with no activity; reload rebuilds the same view.

**PASS:** the account opens, renders, and survives a reload.

**FAIL symptoms:** the words *No financial record*; a stuck **Financial account unavailable**; a
blank pane; **Add charge** missing on an empty account.

**Evidence:** screenshot of the account pane before and after reload.

---

## 2 · ADD CHARGE — THE DRAFT

**Starting state:** note what the account currently says is owed. Write the number down.

1. Click **Add charge →**.
2. Choose **Registration fee** ($75.00) from the menu.
3. A preview appears. Read it — it says *Creates a draft · the balance changes when it is posted*.
4. Click **Add charge** to confirm.
5. Go to the **Charges** tab and look at **Awaiting posting**.

**Expected:** the draft is listed as awaiting posting, and **what is owed has not changed at all**.

**PASS:** draft visible, balance identical to the number you wrote down.

**FAIL symptoms:** the balance moves on creating the draft; the draft does not appear; the preview
claims the balance has already changed.

**Evidence:** the balance before, the preview text, the balance after.

> **Field trip** is worth one extra try: it bills against an event, so it asks for a date. Being
> refused with *missing event date* until you give one is correct behaviour, not a bug.

---

## 3 · POST THE CHARGE

**Starting state:** the draft from scenario 2, balance unchanged.

1. Post the draft from the charge row (**Charges → Awaiting posting**).
2. Return to the account.

**Expected:** the charge leaves **Awaiting posting** and appears as posted; gross rises by exactly
$75.00; what is owed rises by exactly $75.00.

**PASS:** the obligation moves **only** at posting, and by exactly the charge amount.

**FAIL symptoms:** the draft stays in Awaiting posting; the balance moves by a different amount;
the charge appears twice.

**Evidence:** Awaiting posting before and after, plus the account totals.

---

## 4 · CHARGE DETAIL

1. Open the posted **Registration fee** charge.

**Expected:** amount $75.00; the service/occurrence date; a posted lifecycle; and attribution to
**Ana Alvarez** in **Alvarez Household (demo)**.

**PASS:** every one of those four agrees with the account list.

**FAIL symptoms:** a different amount; a missing date; attribution to another child or household.

**Evidence:** screenshot of the charge detail beside the account row.

---

## 5 · RESPONSIBILITY

**Starting state:** the posted $75.00 obligation. Note what is owed.

1. Open the charge detail and find **Responsibility arrangement**.
2. Use **Manage responsibility**.
3. Choose **Responsible party → Dana Alvarez**.
4. Enter **Amount** `75.00`.
5. Click **Preview**, read it, then **Confirm**.

**Expected:** *Responsibility updated.* Dana Alvarez is named as carrying $75.00, nothing is left
unassigned — and **what is owed has not changed by a cent**. Responsibility answers *who owes*; it
never creates or removes money.

Then set up a **later** arrangement for the same household and confirm the total stays $75.00 —
the later one supersedes rather than adding to the earlier one.

**PASS:** Dana named, nothing unassigned, obligation and payments untouched, no doubling on
supersession.

**FAIL symptoms:** the balance changes; two live shares for Dana; the whole amount sitting in
*unassigned*; the child offered as a responsible party.

> Being refused because *an arrangement already in force starts on or after this date* is correct.
> Supersede from a **later** date.

**Evidence:** the arrangement panel, and the account totals before and after.

---

## 6 · EXPECTED FUNDING

**Starting state:** Dana Alvarez holds a $75.00 share. Note what is owed and what is collectible.

1. Under Dana's share, click **Manage expected funding →**.
2. Choose an employer-sponsorship funding type (not a government subsidy).
3. **Name the funding source** — e.g. `Northwind Employer Benefit (demo)`.
4. **Expected to cover** → `50.00`.
5. **Preview**, then **Confirm**.
6. Now repeat the whole thing with `45.00` — this is the correction.

**Expected:** the share reads **Expected from Northwind Employer Benefit (demo) · $45.00**, and
beneath it *$30.00 still their responsibility.* The figure is **$45.00**, never $50.00 and never
$95.00 — a correction replaces, it does not accumulate.

Crucially: **nothing owed changed, nothing collectible changed, and no payment was created.** An
expectation is not money. No subsidy authorization, claim or remittance is needed for any of this.

**PASS:** $45.00 shown; obligation, outstanding and collectible all identical to before.

**FAIL symptoms:** $95.00; outstanding falling by the expected amount; a payment appearing; being
asked for a subsidy authorization.

**Evidence:** the funding line, and the account totals before and after both writes.

---

## 7 · ADJUSTMENT — THE DRAFT

**Starting state:** post a **Field trip** ($40.00) charge first, so there is something to reduce
that is not your baseline obligation. Note what is owed.

1. On the account, click **Add adjustment →**.
2. **Against charge** → choose the Field trip charge (*Choose the charge this is about…*).
3. **Type** → *Credit — lowers what the family owes*.
4. **Amount** → `40.00`.
5. **Reason** → e.g. `QA: reduce to zero`.
6. **Effective date** → today.
7. Confirm.

**Expected:** the adjustment is listed and names the obligation it is against. Its status line reads
**Recorded — lowers what is owed once posted**. **What is owed has not moved.**

**PASS:** the adjustment exists, is attached to the right charge, and the balance is unchanged.

**FAIL symptoms:** the balance drops immediately; the adjustment is attached to the wrong charge or
to none.

> This is the same law as scenario 2: a credit is drafted, and **posting** is what makes it real.

---

## 8 · POST THE ADJUSTMENT

1. Post the adjustment's charge the same way you posted the Registration fee.
2. Read the account, then check **Collections** / the collectible figure.

**Expected:** now the reduction bites — the Field trip obligation falls to $0.00 and what is owed
falls by exactly $40.00. The account view and the Collections view **agree**.

**PASS:** obligation reduced by exactly the credit, and both surfaces show the same number.

**FAIL symptoms:** the two surfaces disagree (see scenario 18 — this is the case that was repaired);
the reduction lands twice.

---

## 9 · REDUCTION ZERO BOUNDARY

**Starting state:** the Field trip obligation now nets $0.00.

1. Try to add another credit against the same charge for **$0.01**.

**Expected:** **refused**, and the refusal is about the obligation — you cannot reduce it below
zero — not about your permissions. Nothing is written.

**PASS:** refused, and the account is untouched afterwards.

**FAIL symptoms:** it succeeds; the obligation goes negative; the refusal talks about permissions.

**Evidence:** the refusal message, and the account totals after it.

---

## 10 · REVERSE THE ADJUSTMENT

1. On the adjustment row, click **Reverse adjustment →**, give a reason, confirm.
2. Post the reversal (it drafts, exactly like the credit did).
3. Try **Reverse adjustment** on the same original a second time.

**Expected:** the original stays listed and is marked **Reversed** — it is history and is never
edited away. An opposite entry is appended (marked **Reversal**). The obligation is restored to
$40.00. The second reversal is **refused**.

**PASS:** original preserved, opposite appended, obligation restored, repeat refused.

**FAIL symptoms:** the original disappears or is edited; the obligation does not come back; a
second reversal succeeds and credits the family twice.

---

## 11 · PAYMENT RECEIPT

**Starting state:** an obligation with something still owed on it. Note the amount.

1. Record a payment against it — use **Check**, enter an amount **larger** than what is owed (say
   the outstanding **plus $10.00**), and give it a reference you will recognise.

**Expected:** a receipt appears showing **Received**, the **From** (payer), the **Method**, and the
amount you entered.

**PASS:** all four correct.

**FAIL symptoms:** a different amount; a missing payer or method; two receipts.

---

## 12 · APPLY PAYMENT

**Expected (from the same receipt):** the obligation it was recorded against is settled, its
outstanding falls to $0.00, and **what is owed falls by the amount APPLIED — not by the whole
receipt**. The receipt itself is unchanged: money that arrived is history.

**PASS:** obligation settled; balance fell by the applied amount only; receipt untouched.

**FAIL symptoms:** the balance falls by the full receipt; the receipt amount changes.

---

## 13 · PARTIAL UNAPPLIED

**Expected:** the receipt shows three different numbers and they are all correct —
**Received** (what you entered), **Applied** (what settled an obligation), **Unapplied** (the rest).
Applied + Unapplied = Received, exactly.

1. Post another charge so there is something else to pay.
2. On the receipt, click **Apply payment →** and place some of the unapplied money on it.

**Expected:** the target obligation falls by what you placed; **Unapplied** falls by the same;
**no new receipt is created**; the original receipt amount is unchanged; no refund appears.

**PASS:** three distinct correct numbers, and placing money creates no new receipt.

**FAIL symptoms:** a second receipt appears; Unapplied does not move; the receipt total changes.

---

## 14 · MOVE PAYMENT

**Starting state:** a receipt with an **Active** application on some charge.

1. On that application click **Move payment →**.
2. Look at the target chooser (*Choose a charge…*).
3. Give a **Reason** (e.g. *Applied to the wrong charge*).
4. Preview, then confirm.

**Expected:**
- **Move payment** is offered only on an **Active** application, never on a **Reversed** one.
- The chooser offers **only this household's** charges, and never the charge the money is already on.
- A reason is **required**.
- After the move: the source obligation is owed again; the target obligation falls; the receipt,
  payer and method are unchanged.
- The history keeps all three steps — the old application still listed and marked **Reversed**, with
  its **Reason:**, and the new one **Active**.

**PASS:** every bullet above.

**FAIL symptoms:** another household's charges offered; Move offered on a reversed application; the
reversal removed from history; the receipt amount changing; a card/bank refund being triggered —
moving money inside the ledger must touch no payment rail.

---

## 15 · FAILED REAPPLY — RECOVERY

This is the one that matters most, because the product deliberately does **not** roll back.

1. Reverse an **Active** application (as in scenario 14), giving a reason.
2. Now deliberately make the next step fail: try to apply **more than the receipt still has
   unplaced** — e.g. if $10.00 is unapplied, try to apply $200.00.

**Expected:** the apply is **refused**. And critically:
- the reversal **stays done** — the source obligation is still owed again;
- the money is still **Unapplied**, not lost and not silently put back;
- nothing on screen claims the reversal was undone or rolled back;
- **Apply payment →** is still available to recover;
- applying a **valid** amount afterwards succeeds.

**PASS:** reversal survives the failure, money is visibly unapplied, recovery works.

**FAIL symptoms:** any message implying the whole move was rolled back; the money vanishing; the
reversal silently undone; no way to reapply.

**Evidence:** screenshot of the refusal **and** of the receipt showing the unapplied money still
there.

---

## 16 · REFUND

1. Refund part of a receipt that has unapplied money.
2. Try the same refund again.

**Expected:** the original receipt is still there, still inbound, still the amount originally
received. A separate **outbound** refund entry exists and is linked to the receipt it refunds.
Refunded money is **not** shown as *Unapplied* — those are two different facts. The second attempt
creates **no duplicate**.

**PASS:** original intact, one outbound refund, correct linkage, refunded money not counted as
unapplied, no duplicate.

**FAIL symptoms:** the original receipt reduced or removed; the refund shown as unapplied money;
two refunds.

---

## 17 · CHARGE REVERSE

1. Post a **Late pickup** ($25.00) charge.
2. Open it and use **Reverse charge**, with a reason.
3. Try **Reverse charge** on the same charge again.

**Expected:** the original charge remains posted and visible — it is history. A reversing entry is
appended beside it for the opposite amount. What is owed falls by $25.00. **Reverse charge** is no
longer offered on it. The second attempt is **refused**.

**PASS:** original preserved, reversal appended, obligation correct, repeat refused.

**FAIL symptoms:** the charge disappears or is edited in place; the balance does not change; a
second reversal succeeds.

---

## 18 · CROSS-SURFACE CONSISTENCY

**Do this after you have done reductions and reversals**, because that is exactly when the surfaces
used to disagree.

Compare the same household across: **Workspace account detail · charge detail · Collections ·
the payments section · Responsibility · Expected funding**.

| Check | Same everywhere it is shown? |
|---|---|
| Gross | |
| Net obligation | |
| Named responsibility (Dana Alvarez) | |
| Expected funding ($45.00) | |
| Payments received | |
| Unapplied | |
| Outstanding | |
| Collectible | |

A surface that simply **does not show** a figure is fine. A surface showing a **different** figure
is a FAIL.

Mind the grain: the account card reports the **current period**, and a list scoped to all sites is
answering a wider question than one household. A number that differs because it answers a different
question is not a mismatch — say so rather than logging a defect.

### The repaired case — check this one explicitly

After reduction and reversal activity, and with no subsidy anywhere:

> **What the account says is owed must equal what Collections says is collectible.**

This is the defect that was found and fixed: the collections side was counting credit reversals as
new obligations of their own, and reported **$173.00 collectible against $93.00 actually owed**.
If you ever see collectible sitting above owed with no subsidy in play, stop and record it — that
is this defect returning.

---

## 19 · RELOAD AND HOUSEHOLD SWITCHING

1. Cold-reload the browser on the Alvarez account.
2. Switch to another household in **Accounts**.
3. Switch back to Alvarez.

**Expected:** Alvarez rebuilds exactly as before; the other household shows **its own** money and
never Alvarez's (Dana Alvarez must not appear on it); coming back shows Alvarez's own obligations
again.

**PASS:** no stale financial state anywhere in that round trip.

**FAIL symptoms:** one household's figures or named parties appearing on another; the account pane
keeping the previous household's numbers after a switch.

> Households with an enrolment agreement but no money are legitimately **absent** from the Accounts
> list — it lists accounts with financial activity. That is not a bug.

---

## 20 · NARROW VIEWPORT (≈390 × 844)

Resize to roughly phone width, or use a phone.

Check each is reachable and usable: the section **tabs**; the charge controls (**Add charge**, post,
**Reverse charge**); the payment rows and their controls; **Move payment** and **Apply payment**;
**Manage responsibility**; **Manage expected funding**.

**Expected:** everything reachable; **the page does not scroll sideways**. A wide table or ledger
scrolling inside its own box is fine; the whole page sliding is not.

**PASS:** all controls reachable, no page-level horizontal scroll.

**FAIL symptoms:** a control off-screen and unreachable; the page itself scrolling left-to-right;
a panel that opens but cannot be operated.

---

## 21 · OVERVIEW SMOKE

In the same session, at the same scope:

1. Read **Overview → *N* · Charges awaiting posting**.
2. Open **Charges → Awaiting posting** and count.

**Expected:** they tell the same story. Overview is **tenant-wide**, so its number can legitimately
be **larger** than one household's drafts.

**PASS:** consistent, allowing for that grain difference.

**FAIL symptoms:** Overview showing fewer than you can actually see listed; the two disagreeing at
the same scope.

**Do not log a valid grain difference as a defect.**

---

## 22 · SUBSIDY EXCLUSION

> ### SUBSIDY IS NOT PART OF THIS MANUAL QA PASS.

Do **not** test subsidy authorizations, claim generation, submission, remittance, or variance. If
you find yourself on the **Subsidy** tab, you have left the scope of this pass.

**Expected funding IS part of Core QA** (scenario 6) and needs no subsidy object of any kind.

The tenant does contain an agency, a programme and an authorization — they belong to the **Chen**
household, deliberately, so that Alvarez proves the absence of subsidy rather than merely the
absence of the feature. Leave Chen alone for this pass.

---

## HUMAN SIGN-OFF CHECKLIST

- [ ] Financial Subject
- [ ] Add Charge draft
- [ ] Post Charge
- [ ] Charge Detail
- [ ] Responsibility
- [ ] Expected Funding
- [ ] Adjustment draft
- [ ] Post Adjustment
- [ ] Reduction zero boundary
- [ ] Reverse Adjustment
- [ ] Payment Receipt
- [ ] Apply Payment
- [ ] Partial Unapplied
- [ ] Move Payment
- [ ] Failed Reapply Recovery
- [ ] Refund
- [ ] Charge Reverse
- [ ] Cross-surface consistency
- [ ] Account vs Collections convergence
- [ ] Cold reload
- [ ] Household switching
- [ ] Narrow viewport
- [ ] Overview smoke
- [ ] Subsidy excluded

**OVERALL RESULT:  PASS / FAIL**

If FAIL, for each failure record: scenario number · actual result · expected result ·
screenshot or other evidence · household/customer · charge or payment id where relevant.

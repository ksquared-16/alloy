/**
 * CORE FINANCIALS — THE DIRECTOR QA SCENARIO CATALOG.
 *
 * One canonical list of what a human must personally accept before Core Financials V1 is signed off,
 * and — just as importantly — an explicit disposition for every capability that is NOT in that list.
 * Thread 11 certified 18 mounted gates automatically. Automated certification proves the product
 * does what the tests say; it cannot prove an operator can understand what they are looking at, and
 * it can never produce a human acceptance. Those are four different things and this catalog keeps
 * them apart.
 *
 * ── WHY A CATALOG AND NOT A SCRIPT ──────────────────────────────────────────────────────────────
 *
 * The harness renders these; it does not hard-code them. Starting figures are DERIVED from the live
 * account at the moment the Director opens a scenario, never written down here — a scenario whose
 * expected numbers were baked in at authoring time would either drift into fiction or quietly force
 * a reseed of a shared tenant. What is written here is what cannot be derived: what the scenario is
 * for, what the operator should do, what must change, what must NOT change, and the invariant the
 * step exists to protect.
 *
 * ── DISPOSITIONS ────────────────────────────────────────────────────────────────────────────────
 *
 *   HUMAN_WALKTHROUGH                 the Director drives this in the product, start to finish
 *   AUTOMATED_CERTIFIED_HUMAN_PENDING certified by Thread 11's mounted suite; human pass still owed
 *   EXPLICITLY_DEFERRED               cannot be walked through in this environment, with the reason
 *   OUT_OF_SCOPE_THREAD_11A           belongs to another thread, named so it is not silently missing
 *
 * Nothing is omitted. A capability absent from this file is a defect in this file.
 */

/**
 * THE WORDING OF THE QUESTIONS, VERSIONED.
 *
 * An acceptance is an answer to a specific question. Rewrite the question and the previous answer
 * stops being an answer to it — so every recorded result carries the version it was given under,
 * and this must be bumped whenever a scenario's meaning changes. Adding a scenario counts; fixing a
 * typo does not.
 */
export const CATALOG_VERSION = "2026-09-14.1";

/** The acceptance program these scenarios belong to. Results are namespaced by it. */
export const SUITE_KEY = "core_financials_director_qa";

export type ScenarioDisposition =
    | "HUMAN_WALKTHROUGH"
    | "AUTOMATED_CERTIFIED_HUMAN_PENDING"
    | "EXPLICITLY_DEFERRED"
    | "OUT_OF_SCOPE_THREAD_11A";

/** What the scenario needs to be true before the Director can meaningfully run it. */
export type ScenarioPrecondition =
    /** A named earlier scenario must have been accepted. */
    | { kind: "scenario_passed"; scenarioKey: string }
    /** The live account must satisfy a named, machine-checkable condition. */
    | { kind: "account_state"; check: AccountStateCheck; describe: string };

/**
 * The conditions the harness can actually verify against the canonical account read. Deliberately a
 * closed set: a free-form predicate would become a second financial authority by the back door.
 */
export type AccountStateCheck =
    | "has_posted_obligation"
    | "has_draft"
    | "has_no_draft"
    | "has_obligation_with_room_to_reduce"
    | "has_posted_reduction"
    | "has_inbound_payment"
    | "has_active_application"
    | "has_unapplied_money"
    | "has_named_responsibility"
    | "has_expected_funding"
    | "has_second_child_without_agreement"
    | "is_financially_addressable";

export type Scenario = {
    /** Stable across renumbering — results are persisted against this, never against the position. */
    key: string;
    /** Display order. */
    order: number;
    title: string;
    disposition: ScenarioDisposition;
    /** Plain language. What this proves, for someone who does not read code. */
    purpose: string;
    /** Two or three sentences of business meaning. No engineering jargon. */
    whyItMatters: string;
    /** Stated reason, required whenever the disposition is not HUMAN_WALKTHROUGH. */
    dispositionReason?: string;
    requires: ScenarioPrecondition[];
    /** Exact product navigation, in the labels the build actually renders. */
    navigate: string[];
    /** Short numbered actions. */
    doThis: string[];
    /** What must change. */
    expectChanges: string[];
    /** What must NOT change. This is usually where the real defects hide. */
    expectUnchanged: string[];
    /** The one financial law the step protects. */
    invariant: string;
    /** What a failure tends to look like, so a tester recognises one. */
    failSymptoms: string[];
};

/** The money laws the harness restates beside the scenarios that depend on them. */
export const MONEY_INVARIANTS = Object.freeze({
    DRAFT_IS_NOT_OWED: "A draft charge or draft adjustment changes nothing that is owed. Posting is what makes it real.",
    RESPONSIBILITY_MOVES_NO_CASH: "Responsibility answers who owes. Changing it never creates, removes or moves money.",
    EXPECTATION_IS_NOT_PAYMENT: "Expected Funding is Core Financials and it is an expectation, not a payment. It does not reduce what is owed and does not suppress collectibility by itself.",
    CORRECTION_REPLACES: "Correcting expected funding from $750 to $700 leaves $700, never $1,450.",
    FOUR_DISTINCT_FIGURES: "Received, applied, unapplied and refunded are four different facts about the same receipt.",
    PAYER_IS_HISTORY: "The actual payer never changes because an application moved. Moving a payment changes applications, not payment identity.",
    MOVE_IS_NON_ATOMIC: "Move Payment is deliberately not atomic. If the reversal succeeds and the reapplication fails, the cash stays unapplied and recovery is Apply Payment. Nothing fabricates a rollback.",
    REDUCTION_FLOOR: "A reduction may take an obligation to exactly zero and not one cent further.",
    POSTED_MONEY_IS_IMMUTABLE: "Posted money is never edited or deleted. A correction is appended beside it and the original stays readable.",
    PROVIDER_RETURN_IS_NOT_A_REFUND: "A provider return is the rail giving money back. An operator refund is a decision someone made. They are different events and must not be shown as one.",
    GRAIN_BEFORE_MISMATCH: "Cross-surface comparisons only mean something at equivalent scope and period. A legitimate grain difference is explained, not filed as a defect.",
    FAILED_READ_IS_NOT_ZERO: "A read that failed must never render as a valid zero balance. Not knowing and owing nothing are different answers.",
});

const S = (s: Scenario) => s;

export const SCENARIOS: readonly Scenario[] = Object.freeze([
    S({
        key: "financial_subject",
        order: 1,
        title: "A household with no money is still a financial subject",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Open the household and confirm the product can talk about its money at all.",
        whyItMatters:
            "An account with no financial history is an ordinary, fully supported state. The product must say so plainly rather than implying the family is unknown to it, because that is the difference between an empty account and a broken one.",
        requires: [{ kind: "account_state", check: "is_financially_addressable", describe: "the household resolves an enrolment agreement to bill against" }],
        navigate: ["Open /workspace.", "Click Financials in the left sidebar.", "Open the Accounts tab.", "Select Alvarez Household (demo)."],
        doThis: ["Read the account pane, headed Account-wide financial detail.", "Reload the browser and open the same account again."],
        expectChanges: [],
        expectUnchanged: ["The household name and its figures survive a reload."],
        invariant: MONEY_INVARIANTS.FAILED_READ_IS_NOT_ZERO,
        failSymptoms: ["The words No financial record.", "A stuck Financial account unavailable.", "A blank pane.", "Add charge missing on an account that has no activity."],
    }),
    S({
        key: "add_charge_draft",
        order: 2,
        title: "Add Charge creates a draft",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Raise a new obligation and watch it arrive as a draft rather than as money owed.",
        whyItMatters:
            "Billing someone is a two-step decision on purpose. Creating the charge and committing to it are separate acts, so a mistake can be caught before a family is ever asked for the money.",
        requires: [{ kind: "account_state", check: "is_financially_addressable", describe: "the household can be billed" }],
        navigate: ["From the account pane, find Add charge →."],
        doThis: ["Click Add charge →.", "Choose a charge type from the menu.", "Read the preview.", "Click Add charge to confirm.", "Open the Charges tab and look at Awaiting posting."],
        expectChanges: ["The new charge appears in Awaiting posting."],
        expectUnchanged: ["Everything the account says is owed."],
        invariant: MONEY_INVARIANTS.DRAFT_IS_NOT_OWED,
        failSymptoms: ["The preview claims the balance has already changed.", "The draft never appears.", "Being refused for a date on an event-billed charge is CORRECT, not a defect."],
    }),
    S({
        key: "draft_moves_nothing",
        order: 3,
        title: "The draft has not changed what is owed",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Confirm from the totals, not from the wording, that drafting moved no money.",
        whyItMatters:
            "This is the claim the preview makes to the operator. If the totals disagree with it, the product is telling an operator one thing and doing another — which is worse than either being wrong alone.",
        requires: [{ kind: "account_state", check: "has_draft", describe: "a draft charge exists to inspect" }],
        navigate: ["Return to the account pane."],
        doThis: ["Compare what is owed with the figure you noted before drafting."],
        expectChanges: [],
        expectUnchanged: ["Outstanding.", "Collectible now.", "Gross charges posted."],
        invariant: MONEY_INVARIANTS.DRAFT_IS_NOT_OWED,
        failSymptoms: ["Any of the three moved when only a draft was created."],
    }),
    S({
        key: "post_charge",
        order: 4,
        title: "Posting is what makes it owed",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Commit the draft and watch the obligation appear, once and for the right amount.",
        whyItMatters:
            "Posting is the moment a family genuinely owes money. It must move the balance by exactly the charge and never by a penny more, and it must happen once.",
        requires: [{ kind: "account_state", check: "has_draft", describe: "a draft to post" }],
        navigate: ["Charges tab → Awaiting posting → the draft you created."],
        doThis: ["Post the draft.", "Return to the account."],
        expectChanges: ["The charge leaves Awaiting posting.", "It appears as posted.", "Gross and what is owed each rise by exactly the charge amount."],
        expectUnchanged: ["Payments received.", "The named responsible adult.", "Expected funding."],
        invariant: MONEY_INVARIANTS.DRAFT_IS_NOT_OWED,
        failSymptoms: ["The balance moves by a different amount.", "The charge appears twice.", "The draft stays in Awaiting posting."],
    }),
    S({
        key: "charge_detail_attribution",
        order: 5,
        title: "The charge says whose it is",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Open the posted charge and confirm amount, date, lifecycle and who it belongs to.",
        whyItMatters:
            "A charge nobody can attribute is a charge nobody can defend. An operator answering a parent on the phone needs to say which child it was for and when.",
        requires: [{ kind: "account_state", check: "has_posted_obligation", describe: "a posted charge to open" }],
        navigate: ["Open the posted charge from the account ledger or the Charges tab."],
        doThis: ["Read the amount, the service date, the lifecycle and the attribution."],
        expectChanges: [],
        expectUnchanged: ["Every figure matches what the account list showed for the same charge."],
        invariant: MONEY_INVARIANTS.GRAIN_BEFORE_MISMATCH,
        failSymptoms: ["A different amount from the account list.", "A missing date.", "Attribution to another child or another household."],
    }),
    S({
        key: "manage_responsibility",
        order: 6,
        title: "Naming who owes it changes no money",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Make Dana Alvarez responsible for the obligation and confirm nothing financial moved.",
        whyItMatters:
            "Who owes and how much is owed are separate questions. Deciding a parent carries a bill must never quietly change the bill.",
        requires: [{ kind: "account_state", check: "has_posted_obligation", describe: "an obligation to divide" }],
        navigate: ["Open the charge detail.", "Find Responsibility arrangement.", "Use Manage responsibility."],
        doThis: ["Choose Responsible party → Dana Alvarez.", "Enter the Amount.", "Click Preview, read it, then Confirm."],
        expectChanges: ["Dana Alvarez is named as carrying the amount.", "Nothing is left unassigned."],
        expectUnchanged: ["What is owed.", "Gross.", "Payments received."],
        invariant: MONEY_INVARIANTS.RESPONSIBILITY_MOVES_NO_CASH,
        failSymptoms: ["The balance changes.", "The whole amount sits in unassigned.", "A child is offered as a responsible party."],
    }),
    S({
        key: "responsibility_supersession",
        order: 7,
        title: "A later arrangement replaces the earlier one",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Record a second arrangement and confirm the family is not made responsible twice.",
        whyItMatters:
            "Arrangements change — a parent takes over, a split is renegotiated. The new one has to replace the old one, because two live arrangements would double what the family appears to owe.",
        requires: [{ kind: "scenario_passed", scenarioKey: "manage_responsibility" }],
        navigate: ["Manage responsibility again, from a later effective date."],
        doThis: ["Configure the same party from a later date.", "Confirm.", "Re-read the arrangement."],
        expectChanges: ["The arrangement in force is the later one."],
        expectUnchanged: ["The total assigned — it must not double.", "What is owed."],
        invariant: MONEY_INVARIANTS.RESPONSIBILITY_MOVES_NO_CASH,
        failSymptoms: ["Two live shares for the same person.", "The assigned total doubling.", "Being refused because an arrangement already in force starts on or after this date is CORRECT — supersede from a later date."],
    }),
    S({
        key: "expected_funding",
        order: 8,
        title: "Expected Funding is an expectation, not a payment",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Record that an employer is expected to cover part of Dana's share.",
        whyItMatters:
            "Money somebody has promised is not money that has arrived. Until it does, the family is still responsible for it, and the product must not quietly treat a promise as a payment.",
        requires: [{ kind: "scenario_passed", scenarioKey: "manage_responsibility" }],
        navigate: ["Under Dana's share, click Manage expected funding →."],
        doThis: ["Choose an employer sponsorship type, not a government subsidy.", "Name the funding source.", "Enter Expected to cover.", "Preview, then Confirm."],
        expectChanges: ["The share reads Expected from <source> · <amount>, with the remainder shown as still their responsibility."],
        expectUnchanged: ["What is owed.", "Collectible now.", "Payments received — no payment is created."],
        invariant: MONEY_INVARIANTS.EXPECTATION_IS_NOT_PAYMENT,
        failSymptoms: ["Outstanding falling by the expected amount.", "A payment appearing.", "Being asked for a subsidy authorization."],
    }),
    S({
        key: "expected_funding_correction",
        order: 9,
        title: "Correcting the expectation replaces it",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Change the expected amount and confirm the new figure replaces the old one.",
        whyItMatters:
            "Employers revise what they will cover. If a correction added instead of replacing, every corrected figure in the product would be wrong in the same direction and nobody would see it.",
        requires: [{ kind: "scenario_passed", scenarioKey: "expected_funding" }],
        navigate: ["Manage expected funding → on the same share."],
        doThis: ["Record a different expected amount.", "Preview, Confirm.", "Read the share again."],
        expectChanges: ["The share shows the corrected amount only."],
        expectUnchanged: ["What is owed.", "Collectible now."],
        invariant: MONEY_INVARIANTS.CORRECTION_REPLACES,
        failSymptoms: ["Both figures shown as live.", "The sum of the two appearing anywhere."],
    }),
    S({
        key: "adjustment_draft",
        order: 10,
        title: "A credit is drafted against a named obligation",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Record a manual credit and confirm it names what it reduces and moves nothing yet.",
        whyItMatters:
            "A credit is a financial correction someone decided to make. It must say which obligation it applies to, and like a charge it must not take effect until it is posted.",
        requires: [{ kind: "account_state", check: "has_obligation_with_room_to_reduce", describe: "an obligation that still has something left to reduce" }],
        navigate: ["From the account pane, click Add adjustment →."],
        doThis: ["Against charge → choose the obligation.", "Type → Credit — lowers what the family owes.", "Enter Amount, Reason and Effective date.", "Confirm."],
        expectChanges: ["The adjustment is listed, reading Recorded — lowers what is owed once posted."],
        expectUnchanged: ["What is owed."],
        invariant: MONEY_INVARIANTS.DRAFT_IS_NOT_OWED,
        failSymptoms: ["The balance drops on creation.", "The adjustment attaches to the wrong obligation, or to none."],
    }),
    S({
        key: "adjustment_post",
        order: 11,
        title: "Posting the credit is what reduces the obligation",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Post the credit and confirm the account and Collections agree afterwards.",
        whyItMatters:
            "This is the same two-step rule as a charge, applied to money going the other way. It is also where the account view and the collections view have to keep telling the same story.",
        requires: [{ kind: "scenario_passed", scenarioKey: "adjustment_draft" }],
        navigate: ["Post the adjustment the same way you posted the charge."],
        doThis: ["Post it.", "Read the account totals.", "Read Collectible now."],
        expectChanges: ["The obligation falls by exactly the credit."],
        expectUnchanged: ["Payments received.", "The named responsible adult."],
        invariant: MONEY_INVARIANTS.GRAIN_BEFORE_MISMATCH,
        failSymptoms: ["The two surfaces disagree.", "The reduction lands twice."],
    }),
    S({
        key: "reduction_zero_bound",
        order: 12,
        title: "A credit stops at zero",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Try to reduce an obligation below nothing and confirm the product refuses.",
        whyItMatters:
            "An obligation reduced past zero would mean the business owes the family money it never received. The floor is what keeps a credit from silently becoming a debt.",
        requires: [{ kind: "account_state", check: "has_posted_reduction", describe: "an obligation already reduced to nothing" }],
        navigate: ["Add adjustment → against the obligation you just reduced to zero."],
        doThis: ["Attempt a further credit of one cent.", "Read the refusal.", "Re-read the account."],
        expectChanges: [],
        expectUnchanged: ["The obligation stays at zero.", "The account position is untouched."],
        invariant: MONEY_INVARIANTS.REDUCTION_FLOOR,
        failSymptoms: ["It succeeds.", "The obligation goes negative.", "The refusal talks about permissions instead of the obligation."],
    }),
    S({
        key: "reverse_adjustment",
        order: 13,
        title: "Reversing a credit restores the obligation",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Undo the credit and confirm the original stays visible while the money comes back.",
        whyItMatters:
            "Financial history is never edited away. Undoing a decision means recording the opposite decision beside it, so a year later somebody can still see what was done and why.",
        requires: [{ kind: "scenario_passed", scenarioKey: "adjustment_post" }],
        navigate: ["On the adjustment row, click Reverse adjustment →."],
        doThis: ["Give a reason and confirm.", "Post the reversal — it drafts, exactly as the credit did.", "Try Reverse adjustment on the same original again."],
        expectChanges: ["The original is marked Reversed.", "An opposite entry is appended, marked Reversal.", "The obligation is restored."],
        expectUnchanged: ["The original credit is still listed with its reason."],
        invariant: MONEY_INVARIANTS.POSTED_MONEY_IS_IMMUTABLE,
        failSymptoms: ["The original disappears or is edited.", "The obligation does not come back.", "A second reversal succeeds and credits the family twice."],
    }),
    S({
        key: "payment_receipt",
        order: 14,
        title: "A receipt records what actually arrived, and from whom",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Record a payment larger than the obligation and read the receipt back.",
        whyItMatters:
            "The receipt is the historical fact: this much money arrived, this way, from this person. Everything downstream is a decision about where to put it, and none of those decisions may change the receipt.",
        requires: [{ kind: "account_state", check: "has_posted_obligation", describe: "an obligation to pay against" }],
        navigate: ["From the account pane, record a payment against a posted obligation."],
        doThis: ["Use Check.", "Enter more than is owed — the outstanding plus a margin.", "Give it a reference you will recognise.", "Confirm."],
        expectChanges: ["A receipt appears showing Received, From, Method and the amount."],
        expectUnchanged: ["Gross charges posted."],
        invariant: MONEY_INVARIANTS.PAYER_IS_HISTORY,
        failSymptoms: ["A different amount.", "A missing payer or method.", "Two receipts."],
    }),
    S({
        key: "apply_payment",
        order: 15,
        title: "What is owed falls by what was applied",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Confirm the obligation is settled and the balance fell by the applied amount, not the receipt.",
        whyItMatters:
            "Overpaying one bill does not pay the others. The balance may only move by the part of the money that actually settled something.",
        requires: [{ kind: "scenario_passed", scenarioKey: "payment_receipt" }],
        navigate: ["Read the obligation you paid, then the account totals."],
        doThis: ["Compare the obligation before and after.", "Compare what is owed before and after."],
        expectChanges: ["The obligation is settled.", "What is owed falls by the applied amount."],
        expectUnchanged: ["The receipt amount.", "The payer."],
        invariant: MONEY_INVARIANTS.FOUR_DISTINCT_FIGURES,
        failSymptoms: ["The balance falls by the full receipt.", "The receipt amount changes."],
    }),
    S({
        key: "partial_unapplied",
        order: 16,
        title: "Received, applied and unapplied are three different numbers",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Place some of the leftover money on another obligation without creating a new receipt.",
        whyItMatters:
            "Money that arrived and has not been assigned yet is still the family's money and still in the business's hands. It is not a credit, not a refund, and not a second payment.",
        requires: [{ kind: "account_state", check: "has_unapplied_money", describe: "a receipt with money not yet placed" }],
        navigate: ["On the receipt, find the unapplied line and click Apply payment →."],
        doThis: ["Place part of the unapplied money on another obligation.", "Confirm.", "Re-read the receipt."],
        expectChanges: ["The target obligation falls by what you placed.", "Unapplied falls by the same."],
        expectUnchanged: ["The receipt amount.", "The payer.", "The number of receipts — no new one is created.", "No refund appears."],
        invariant: MONEY_INVARIANTS.FOUR_DISTINCT_FIGURES,
        failSymptoms: ["A second receipt appears.", "Unapplied does not move.", "The receipt total changes."],
    }),
    S({
        key: "move_payment",
        order: 17,
        title: "Moving a payment changes where it sits, not what it is",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Move an application from one obligation to another and confirm the receipt is untouched.",
        whyItMatters:
            "Money gets applied to the wrong bill. Correcting that is routine, and it must never look like the family paid twice, paid a different amount, or paid somebody else.",
        requires: [{ kind: "account_state", check: "has_active_application", describe: "a receipt with an active application to move" }],
        navigate: ["On an Active application, click Move payment →."],
        doThis: ["Read the target chooser.", "Give a Reason.", "Preview, then confirm."],
        expectChanges: ["The source obligation is owed again.", "The target obligation falls.", "History shows the old application marked Reversed with its reason, and a new Active one."],
        expectUnchanged: ["The receipt amount, payer and method.", "No card or bank refund is triggered."],
        invariant: MONEY_INVARIANTS.PAYER_IS_HISTORY,
        failSymptoms: ["Another household's charges offered as targets.", "Move offered on an already reversed application.", "The reversal dropped from history."],
    }),
    S({
        key: "failed_reapply_recovery",
        order: 18,
        title: "A half-finished move leaves the money visible, not lost",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Force the second half of a move to fail and confirm the product tells the truth about it.",
        whyItMatters:
            "This is the most important scenario here. A move is two steps, and the product deliberately does not pretend to undo the first when the second fails. The operator must be able to see exactly where the money is and put it right.",
        requires: [{ kind: "account_state", check: "has_active_application", describe: "an application to reverse" }],
        navigate: ["Reverse an Active application, giving a reason.", "Then attempt to apply more than the receipt still has unplaced."],
        doThis: ["Reverse the application.", "Attempt an application larger than the unapplied balance.", "Read the refusal.", "Read the receipt.", "Apply a valid amount to recover."],
        expectChanges: ["The source obligation is owed again and stays owed.", "The money is shown as Unapplied.", "A valid application afterwards succeeds."],
        expectUnchanged: ["The reversal is not undone by the failure.", "The receipt."],
        invariant: MONEY_INVARIANTS.MOVE_IS_NON_ATOMIC,
        failSymptoms: ["Any message implying the whole move rolled back.", "The money vanishing.", "The reversal silently undone.", "No way to reapply."],
    }),
    S({
        key: "refund",
        order: 19,
        title: "A refund is money going back, recorded separately",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Refund part of a receipt and confirm the original receipt survives untouched.",
        whyItMatters:
            "Refunding does not un-receive money. Both facts are true and both must stay on the record: this much arrived, and this much went back.",
        requires: [{ kind: "account_state", check: "has_unapplied_money", describe: "a receipt with money available to refund" }],
        navigate: ["From the receipt, issue a partial refund.", "Then attempt the same refund again."],
        doThis: ["Refund part of the receipt.", "Read the original receipt.", "Read the refund entry.", "Attempt the identical refund a second time."],
        expectChanges: ["A separate outbound refund entry exists, linked to the receipt it refunds."],
        expectUnchanged: ["The original receipt, still inbound and still the amount originally received.", "Refunded money is NOT shown as unapplied.", "No duplicate refund is created."],
        invariant: MONEY_INVARIANTS.FOUR_DISTINCT_FIGURES,
        failSymptoms: ["The original receipt reduced or removed.", "The refund counted as unapplied money.", "Two refunds."],
    }),
    S({
        key: "reverse_charge",
        order: 20,
        title: "Reversing a charge appends, it does not erase",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Reverse a posted charge and confirm the original remains readable.",
        whyItMatters:
            "A charge raised in error still happened. The correction sits beside it so the ledger explains itself, and it can only happen once.",
        requires: [{ kind: "account_state", check: "has_posted_obligation", describe: "a live posted charge to reverse" }],
        navigate: ["Open a posted charge and use Reverse charge."],
        doThis: ["Reverse it with a reason.", "Read the ledger.", "Attempt Reverse charge on the same charge again."],
        expectChanges: ["A reversing entry is appended for the opposite amount.", "What is owed falls by the charge."],
        expectUnchanged: ["The original charge is still posted and visible.", "Reverse charge is no longer offered on it."],
        invariant: MONEY_INVARIANTS.POSTED_MONEY_IS_IMMUTABLE,
        failSymptoms: ["The charge disappears or is edited in place.", "The balance does not change.", "A second reversal succeeds."],
    }),
    S({
        key: "cross_surface_consistency",
        order: 21,
        title: "Every surface tells the same story",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Compare the account, the charge detail and Collections at the same scope and period.",
        whyItMatters:
            "Two surfaces that disagree about one family's money mean one of them will ask for the wrong amount. This is the scenario that caught the collectibility defect, and it is checked after credits and reversals because that is when it broke.",
        requires: [{ kind: "scenario_passed", scenarioKey: "reverse_adjustment" }],
        navigate: ["Compare: Workspace account detail · charge detail · Collections · the payments section · Responsibility · Expected funding."],
        doThis: ["For each of gross, net obligation, named responsibility, expected funding, payments, unapplied, outstanding and collectible: note where it is shown and whether the surfaces agree."],
        expectChanges: [],
        expectUnchanged: ["With no subsidy in play, what the account says is owed equals what Collections says is collectible."],
        invariant: MONEY_INVARIANTS.GRAIN_BEFORE_MISMATCH,
        failSymptoms: ["Collectible sitting above owed with no subsidy in play — that is the repaired defect returning.", "A surface showing a different figure for the same thing at the same scope."],
    }),
    S({
        key: "reload_switch_viewport",
        order: 22,
        title: "Reload, switch household, and shrink the window",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Confirm no stale financial state survives navigation, and the account is usable on a phone.",
        whyItMatters:
            "One family's numbers appearing under another family's name is the worst class of bug in this product. Operators also work on phones, and a control that cannot be reached cannot be used.",
        requires: [{ kind: "account_state", check: "is_financially_addressable", describe: "an account to navigate" }],
        navigate: ["Cold-reload on the account.", "Switch to another household in Accounts.", "Switch back.", "Resize to roughly 390 x 844."],
        doThis: ["Reload and reopen.", "Switch away and back.", "At phone width, reach the tabs, the charge controls, the payment controls, Move/Apply, Responsibility and Expected funding."],
        expectChanges: [],
        expectUnchanged: ["The account rebuilds identically.", "The other household shows only its own money.", "The page does not scroll sideways."],
        invariant: MONEY_INVARIANTS.FAILED_READ_IS_NOT_ZERO,
        failSymptoms: ["Another family's figures or named parties appearing.", "The page sliding left to right.", "A control off-screen and unreachable."],
    }),
    S({
        key: "overview_smoke",
        order: 23,
        title: "Overview agrees with the Charges list",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Compare the Overview drafts figure with the Awaiting posting list.",
        whyItMatters:
            "Overview is where an operator starts the day. If its headline counts disagree with the list behind them, the queue stops being trustworthy.",
        requires: [{ kind: "account_state", check: "is_financially_addressable", describe: "the workspace is reachable" }],
        navigate: ["Overview tab, then the Charges tab."],
        doThis: ["Read N · Charges awaiting posting on Overview.", "Open Charges → Awaiting posting and count."],
        expectChanges: [],
        expectUnchanged: ["They tell the same story."],
        invariant: MONEY_INVARIANTS.GRAIN_BEFORE_MISMATCH,
        failSymptoms: ["Overview showing fewer than are listed.", "Disagreement at the same scope. Overview is tenant-wide, so a LARGER number than one household's drafts is correct, not a defect."],
    }),
    S({
        key: "tuition_chain",
        order: 24,
        title: "Recommendation, acceptance, then a charge",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Follow a tuition price from what the catalog suggests, through what was agreed, to the charge that results.",
        whyItMatters:
            "Tuition is the largest money in the product and it is not typed in by hand. A price is recommended from the catalog, somebody accepts a term — which may deliberately differ from the recommendation — and only then does a charge exist. Knowing which step created the money is how a disputed bill gets settled.",
        dispositionReason:
            "The tenant carries a live tuition catalog (offerings and rates), so the recommendation side is real. Whether the walkthrough can be completed end to end depends on the QA child having an accepted pricing term; the harness checks that live and says SCENARIO NOT READY rather than inviting a test on invalid preconditions.",
        requires: [{ kind: "account_state", check: "is_financially_addressable", describe: "the child has an enrolment to price" }],
        navigate: ["Open the tuition configuration for the organization, then the child's enrolment."],
        doThis: ["Identify the recommended rate from the catalog.", "Identify the accepted term for the child.", "Identify the charge generated from it."],
        expectChanges: ["Only the generation step creates money."],
        expectUnchanged: ["A recommendation on its own owes nothing.", "An accepted term on its own owes nothing until tuition is generated."],
        invariant: MONEY_INVARIANTS.DRAFT_IS_NOT_OWED,
        failSymptoms: ["Money appearing at recommendation or acceptance.", "A generated charge that does not match the accepted term.", "Attribution to the wrong child."],
    }),
    S({
        key: "discount_vs_adjustment",
        order: 25,
        title: "An authored discount is not a manual correction",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Tell the two kinds of reduction apart and be able to explain the difference afterwards.",
        whyItMatters:
            "A discount comes from how the business prices things — a sibling rate, a staff rate, a promotion someone configured. An adjustment is a human deciding to correct one family's bill. Confusing them makes pricing policy look like a favour, and a favour look like policy.",
        requires: [{ kind: "account_state", check: "has_posted_obligation", describe: "an obligation that can carry a reduction" }],
        navigate: ["Look at where discounts are authored in the organization's financial configuration, then at Add adjustment → on the account."],
        doThis: ["Identify a reduction that came from authored pricing.", "Identify a reduction that a person recorded by hand.", "Note how each is labelled on the account."],
        expectChanges: [],
        expectUnchanged: ["The two are distinguishable on the account without reading code."],
        invariant: MONEY_INVARIANTS.POSTED_MONEY_IS_IMMUTABLE,
        failSymptoms: ["The two appear interchangeable.", "A manual credit presented as a pricing discount, or the reverse."],
    }),
    S({
        key: "multi_child_attribution",
        order: 26,
        title: "Which child, and what belongs to the household",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Use the second child to tell child-level money apart from household-level responsibility.",
        whyItMatters:
            "Families have more than one child and one bill. An operator must be able to say which child generated a charge, and separately who in the household is responsible for paying it — those are different questions with different answers.",
        dispositionReason:
            "Alvarez deliberately carries a second child, Rio, with NO enrolment agreement. So the fixture proves the GRAIN — obligations are per child, responsibility is per household — rather than two parallel billing streams. The harness states that plainly so the absence of Rio's charges is not read as a defect.",
        requires: [{ kind: "account_state", check: "has_second_child_without_agreement", describe: "the household has a second child with no enrolment agreement" }],
        navigate: ["Open the account and read the ledger rows and the Responsibility section."],
        doThis: ["For each posted charge, identify which child it belongs to.", "Identify who is responsible for the household's money.", "Note that the second child has no obligations of their own, and why."],
        expectChanges: [],
        expectUnchanged: ["Charges name their child.", "Responsibility names an adult, at household grain."],
        invariant: MONEY_INVARIANTS.RESPONSIBILITY_MOVES_NO_CASH,
        failSymptoms: ["A charge that cannot be attributed to a child.", "The second child appearing to owe money they were never billed for.", "Responsibility shown per child when it is a household arrangement."],
    }),
    S({
        key: "subsidy_exclusion",
        order: 27,
        title: "Where Core Financials stops",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Confirm the boundary: Expected Funding is Core, subsidy processing is not.",
        whyItMatters:
            "Accepting Core Financials means knowing what was accepted. Expected Funding is part of it and works today. Claiming, submitting and reconciling agency money is a separate body of work and is not being signed off here.",
        requires: [{ kind: "scenario_passed", scenarioKey: "expected_funding" }],
        navigate: ["Read the account's funding and collectibility figures."],
        doThis: ["Confirm expected funding is present and usable.", "Confirm no claim, submission, remittance or variance exists for this household.", "Do not open the Subsidy tab — it is out of scope for this pass."],
        expectChanges: [],
        expectUnchanged: ["Nothing suppresses collectibility, because nothing has been claimed."],
        invariant: MONEY_INVARIANTS.EXPECTATION_IS_NOT_PAYMENT,
        failSymptoms: ["Collectibility suppressed with no claim submitted.", "Expected Funding requiring a subsidy authorization."],
    }),

    // ── NOT WALKED THROUGH, AND WHY ─────────────────────────────────────────────────────────────
    S({
        key: "card_collection",
        order: 28,
        title: "Collecting a card payment",
        disposition: "EXPLICITLY_DEFERRED",
        purpose: "Take a card payment through the product and recognise the provider's result.",
        whyItMatters:
            "Most families pay by card. The product must start the collection, recognise what the processor says, and represent a failure as a failure.",
        dispositionReason:
            "NO PAYMENT PROVIDER IS CONFIGURED ON THIS TENANT. The canonical account read returns paymentSetup: null, so there is no merchant to collect against and no test-mode credential to use. Deferred rather than out of scope: the product has payment.collect_card, and this becomes a walkthrough as soon as a test-mode merchant exists. Real card details must never be used.",
        requires: [],
        navigate: [],
        doThis: [],
        expectChanges: [],
        expectUnchanged: [],
        invariant: MONEY_INVARIANTS.PAYER_IS_HISTORY,
        failSymptoms: [],
    }),
    S({
        key: "ach_processing",
        order: 29,
        title: "ACH initiation, processing and recognition",
        disposition: "EXPLICITLY_DEFERRED",
        purpose: "Distinguish an ACH collection that has started from one that has actually settled.",
        whyItMatters:
            "ACH is not instant. Treating initiation as settlement would show money the business does not have yet, and a return days later would arrive as a surprise.",
        dispositionReason:
            "NOT AVAILABLE ON THIS TENANT: the canonical account read returns achAvailable: false and paymentSetup: null. There is nothing to initiate and nothing to await. Deferred, with the settlement distinction recorded here so it is not lost.",
        requires: [],
        navigate: [],
        doThis: [],
        expectChanges: [],
        expectUnchanged: [],
        invariant: MONEY_INVARIANTS.FOUR_DISTINCT_FIGURES,
        failSymptoms: [],
    }),
    S({
        key: "provider_return",
        order: 30,
        title: "A provider return is not an operator refund",
        disposition: "EXPLICITLY_DEFERRED",
        purpose: "Tell money the rail took back apart from money somebody decided to give back.",
        whyItMatters:
            "One is a bank reversing itself; the other is a decision a person made and must answer for. Showing them as the same event destroys the audit trail for both.",
        dispositionReason:
            "Depends on the same absent provider configuration as card and ACH. The operator-refund half IS covered, as scenario 19.",
        requires: [],
        navigate: [],
        doThis: [],
        expectChanges: [],
        expectUnchanged: [],
        invariant: MONEY_INVARIANTS.PROVIDER_RETURN_IS_NOT_A_REFUND,
        failSymptoms: [],
    }),
    S({
        key: "subsidy_processing",
        order: 31,
        title: "Subsidy claims, submission, remittance and variance",
        disposition: "OUT_OF_SCOPE_THREAD_11A",
        purpose: "Claim agency money, submit it, reconcile what arrives and resolve the difference.",
        whyItMatters:
            "Agency funding is a large, separate body of product work. It is named here so its absence from this acceptance pass is a decision on the record rather than an oversight.",
        dispositionReason:
            "Thread 12. Expected Funding remains Core Financials and is accepted here as scenario 8; subsidy PROCESSING is not part of Core Financials acceptance and must not be built or tested in Thread 11A.",
        requires: [],
        navigate: [],
        doThis: [],
        expectChanges: [],
        expectUnchanged: [],
        invariant: MONEY_INVARIANTS.EXPECTATION_IS_NOT_PAYMENT,
        failSymptoms: [],
    }),
]);

/** The scenarios a human is actually asked to drive. */
export const WALKTHROUGH_SCENARIOS = SCENARIOS.filter((s) => s.disposition === "HUMAN_WALKTHROUGH");

export function scenarioByKey(key: string): Scenario | undefined {
    return SCENARIOS.find((s) => s.key === key);
}

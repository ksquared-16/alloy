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
export const CATALOG_VERSION = "2026-09-20.2";

/** The acceptance program these scenarios belong to. Results are namespaced by it. */
export const SUITE_KEY = "core_financials_director_qa";

/**
 * WHICH PROGRAM OWNS THIS SCENARIO — a second axis, and deliberately not the first one.
 *
 * `disposition` says HOW a scenario is proven: a human drives it, a suite certified it, the
 * environment cannot reach it. `program` says WHOSE it is. They are independent, and collapsing
 * them is how a Payments scenario ends up sitting in a Core catalog looking runnable: "deferred on
 * environment evidence" and "belongs to the next program" are different sentences, and a reader
 * planning Core acceptance needs the second one.
 *
 *   CORE_RUNNABLE            a human can drive it today against the certified Core product
 *   PAYMENTS_PHASE           it needs the Payments productization that has not been built
 *   DEFERRED_PRODUCTIZATION  the capability is real and correct, with no operator surface in Core
 *   RETIRED                  it no longer describes this product, named so its absence is not silent
 */
export type ScenarioProgram =
    | "CORE_RUNNABLE"
    | "PAYMENTS_PHASE"
    | "DEFERRED_PRODUCTIZATION"
    | "RETIRED";

export type ScenarioDisposition =
    | "HUMAN_WALKTHROUGH"
    | "AUTOMATED_CERTIFIED_HUMAN_PENDING"
    | "EXPLICITLY_DEFERRED"
    | "OUT_OF_SCOPE_THREAD_11A"
    /**
     * THE CAPABILITY EXISTS IN THE PLATFORM AND HAS NO OPERATOR SURFACE.
     *
     * Distinct from EXPLICITLY_DEFERRED, which is "the environment cannot exercise this yet", and
     * from OUT_OF_SCOPE, which is "another thread owns it". This says: the data model, the
     * enforcement and the arithmetic are all present and correct, and there is no screen through
     * which a human being can configure or inspect them. It is a PRODUCT gap, not a test gap.
     *
     * It exists as its own disposition so that this class of finding cannot be laundered into a
     * PASS by inspecting the database. A tester who cannot reach a capability from the product has
     * not accepted it, whatever `psql` says.
     */
    | "MISSING_PRODUCTIZATION";

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
    /*
     * THE ACCOUNT EXISTS AND READS. Deliberately NOT "has an enrolment agreement": the canonical
     * account reader settled that an enrolment is one billable source and not eligibility for
     * Financials, because a family incurs charges — a registration fee, a deposit — before they
     * enrol. A precondition that required an agreement here would re-impose the product assumption
     * the reader removed, on the surface whose first scenario denies it.
     */
    | "is_financially_addressable"
    /** The narrower thing: a child with an enrolment to price. Only tuition actually needs it. */
    | "has_billable_enrollment";

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
    BILLING_PERIOD_IS_DERIVED: "A billing period is DERIVED from the date a charge is billable on — `billable_on`, then `occurs_on`, `service_date`, `created_at`. There is no billing-period table and no billing-period setting: the period is a consequence of the charge, and a row with no usable date is reported as unplaced rather than swept into the current month.",
    ACCOUNTING_PERIOD_IS_ATTRIBUTED_AT_WRITE: "A journal entry's accounting period is decided by the database when the entry is written, against the configured accounting calendar. Nothing downstream may re-decide it, and no screen may imply the period can be changed after the fact. A CLOSED period does not refuse the entry: it DEFERS it to the earliest later open period and records the date it was deferred from, so the work is never lost and the closed books are never reopened. The write is refused only when there is no later open period to carry it \u2014 a calendar that has run out, not a closed month.",
    REVIEW_IS_CONFIGURED_NOT_ASSUMED: "Whether a new charge waits for review is the tenant's configured answer \u2014 the posting_review Financial Policy, OR a charge template that marks itself review_required \u2014 not a property of having used a manual command. An organization that has configured no review boundary must not be made to confirm the same intent twice.",
    ACCEPTED_PRICE_IS_GROSS: "The amount a family accepted is the gross obligation. A charge template describes HOW tuition posts — its category, its GL account, when it occurs and when it is billable — and has no second opinion about WHAT THIS CHILD AGREED TO PAY. A generated obligation carrying the template's configured figure instead of the accepted one is billing a number nobody agreed to.",
    PREVIEW_IS_THE_OPERATION: "A preview is a promise about the act that follows it. The billing frequency and the period an operator previewed are the billing frequency and the period Confirm runs, and the money a preview states is the money the run produces.",
    EXISTING_IS_NOT_GENERATED: "A rerun that creates nothing has generated nothing. An obligation that already stood and still agrees is converged, and reporting it as billed again tells an operator they have charged a family twice.",
    REDUCTION_IS_A_SECOND_CONSEQUENCE: "A discount never rewrites the gross. Gross stays the accepted price, the reduction is written beside it with its own policy, basis and provenance, and the net is what falls out. Gross − Reduction = Net, and each of the three is stated by the surface that owns it.",
    BILLING_FREQUENCY_IS_OPERATOR_INTENT: "One account can hold a weekly term for one child and a monthly term for another, so a month alone is not an instruction. The operator names the billing frequency, and a run bills only the terms on that cadence.",
    PUBLISHED_LAYOUT_IS_THE_RENDERED_ONE: "A published Focus Panel document carries an authored card list and an explicit layout, and the runtime renders the explicit layout. A card authored visible and absent from that layout would be drawn by nothing, so the publication is refused rather than silently rendered short.",
    POSTED_IS_NOT_PERIOD_CLOSED: "Posting makes an obligation real. Closing an accounting period ends bookkeeping for a span of time. A posted charge is not a closed period, a closed period posts nothing, and neither word may be used for the other.",
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
        requires: [{ kind: "account_state", check: "is_financially_addressable", describe: "the account to resolve" }],
        navigate: ["Open /workspace.", "Click Financials in the left sidebar.", "Open the Accounts tab.", "Select Alvarez Household (demo)."],
        doThis: ["Read the account pane, headed Account-wide financial detail.", "Reload the browser and open the same account again."],
        expectChanges: [],
        expectUnchanged: ["The household name and its figures survive a reload."],
        invariant: MONEY_INVARIANTS.FAILED_READ_IS_NOT_ZERO,
        failSymptoms: ["The words No financial record.", "A stuck Financial account unavailable.", "A blank pane.", "Add missing on an account that has no activity."],
    }),
    S({
        /*
         * KEY CHANGED DELIBERATELY. The old key `add_charge_draft` asserted that Add always creates
         * a draft. That is no longer the product's claim, and a prior PASS against the old key is
         * not evidence for the new one, so the earlier result does not carry over.
         */
        key: "add_charge_honours_review_boundary",
        order: 2,
        title: "Add puts the charge where the configured review boundary says",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Raise a new obligation and watch it land where this organization's configuration says it should.",
        whyItMatters:
            "Review before billing is a real business control and some organizations run it. It is CONFIGURED \u2014 the posting_review Financial Policy, or a charge template that marks itself review_required \u2014 and where it is configured a new charge waits to be reviewed. Where it is NOT configured, an operator who chose the charge, the child, the amount and the date has already made the decision, and asking them to confirm that same intent again in another tab is ceremony rather than control.",
        requires: [{ kind: "account_state", check: "is_financially_addressable", describe: "the household can be billed" }],
        navigate: ["Note what the account says is owed.", "From the account pane, find Add."],
        doThis: [
            "Click Add.",
            "Leave the mode on Charge.",
            "Choose a charge type from the menu.",
            "Read the preview.",
            "Confirm.",
            "Open the Charges tab and look at Awaiting posting.",
        ],
        expectChanges: [
            "WITH a review boundary configured: the charge appears in Awaiting posting and what is owed does not move.",
            "WITHOUT one: the charge is posted, and what is owed rises by exactly the charge.",
        ],
        expectUnchanged: [
            "Payments received.",
            "The named responsible adult.",
            "Whichever of the two above did not apply \u2014 a charge cannot both wait for review and be owed.",
        ],
        invariant: MONEY_INVARIANTS.REVIEW_IS_CONFIGURED_NOT_ASSUMED,
        failSymptoms: [
            "A draft on an organization that configured no review boundary \u2014 the defect this scenario exists to catch.",
            "A posted charge on an organization that DID configure one.",
            "The preview claiming the balance has already changed before you confirm.",
            "Being refused for a date on an event-billed charge is CORRECT, not a defect.",
        ],
    }),
    S({
        key: "draft_moves_nothing",
        order: 3,
        title: "The draft has not changed what is owed",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Confirm from the totals, not from the wording, that drafting moved no money.",
        whyItMatters:
            "This is the claim the preview makes to the operator. If the totals disagree with it, the product is telling an operator one thing and doing another — which is worse than either being wrong alone. The law is unchanged by the review decision: a draft is still not owed. What changed is how a draft ARRIVES — from a generated or tuition run, or from a manual Add on an organization that configured a review boundary. Where no boundary is configured there is no draft to inspect, the precondition is unmet, and this scenario is not runnable. That is the correct outcome, not a skipped test.",
        requires: [{ kind: "account_state", check: "has_draft", describe: "a draft charge exists to inspect — generated, or manual under a configured review boundary" }],
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
            "Posting is the moment a family genuinely owes money. It must move the balance by exactly the charge and never by a penny more, and it must happen once. Posting is also the ONLY authoritative money write, whoever asks for it: the review boundary decides whether an operator is asked to press this a second time, never whether posting is what makes the obligation real.",
        requires: [{ kind: "account_state", check: "has_draft", describe: "a draft to post — generated, or manual under a configured review boundary" }],
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
        navigate: ["From the account pane, click Add.", "Switch the mode to Adjustment."],
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
        navigate: ["Add → Adjustment, against the obligation you just reduced to zero."],
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
        key: "actual_payer_is_not_responsibility",
        order: 15,
        title: "The person who paid is not necessarily the person who owes",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Record a payment from a household adult who carries no responsibility, and read both facts back.",
        whyItMatters:
            "Responsibility is who owes it; payer is who supplied the money. A grandparent settling a bill is a payer and is responsible for nothing, and a product that collapses the two will eventually chase the wrong person. The chooser is deliberately ordered by primary contact rather than by who owes, so the responsible party is never the accidental default.",
        requires: [
            { kind: "account_state", check: "has_posted_obligation", describe: "an obligation to pay against" },
            { kind: "scenario_passed", scenarioKey: "manage_responsibility" },
        ],
        navigate: ["From the account pane, record a payment against a posted obligation.", "Open the Who paid? chooser."],
        doThis: [
            "Read the chooser: every current household adult appears, not only the responsible one.",
            "Choose an adult who is NOT marked also responsible.",
            "Use Cash, enter part of what is owed, and confirm.",
            "Open the Payments lens on the account and read the receipt.",
        ],
        expectChanges: ["The receipt names the person you chose as the payer."],
        expectUnchanged: [
            "Responsibility shares are exactly as they were — paying does not make somebody responsible.",
            "The responsible party's assigned amount is unchanged.",
        ],
        invariant: MONEY_INVARIANTS.PAYER_IS_HISTORY,
        failSymptoms: [
            "The chooser offers only the responsible party.",
            "The chooser is missing entirely.",
            "The receipt names the responsible party instead of who you chose.",
            "Responsibility changes because a payment was recorded.",
        ],
    }),
    S({
        key: "apply_payment",
        order: 16,
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
        order: 17,
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
        order: 18,
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
        order: 19,
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
        order: 20,
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
        order: 21,
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
        order: 22,
        title: "Every surface tells the same story",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Compare the account, the charge detail and Collections at the same scope and period.",
        whyItMatters:
            "Two surfaces that disagree about one family's money mean one of them will ask for the wrong amount. This is the scenario that caught the collectibility defect, and it is checked after credits and reversals because that is when it broke.",
        requires: [{ kind: "scenario_passed", scenarioKey: "reverse_adjustment" }],
        navigate: ["Compare: Workspace account detail · charge detail · Collections · the payments section · Responsibility · Expected funding."],
        doThis: [
            "For each of gross, net obligation, named responsibility, expected funding, payments, unapplied, outstanding and collectible: note where it is shown and whether the surfaces agree.",
            "Switch the lens to Credits & adjustments on BOTH surfaces. The result must be the SAME ledger, narrowed — same columns, same row shape — and never a separate Adjustments list written as sentences.",
            "Switch to Payments on both. The same ledger family again, and no second Payments block.",
            "Collapse a period and expand it again. The rows must come back in the columns they left in.",
            "Read a row whose amount is negative — a credit or a refund — beside one that is positive. You should be able to tell what each IS without relying on colour: the sign carries direction, and colour is reserved for state such as past due or unapplied money.",
            "Open an account and watch the header load. A metric must never appear as a label above an empty space that could be read as a zero.",
        ],
        expectChanges: [],
        expectUnchanged: [
            "With no subsidy in play, what the account says is owed equals what Collections says is collectible.",
            "The ledger's columns, whichever lens is selected and whichever surface it is read on.",
        ],
        invariant: MONEY_INVARIANTS.GRAIN_BEFORE_MISMATCH,
        failSymptoms: [
            "Collectible sitting above owed with no subsidy in play — that is the repaired defect returning.",
            "A surface showing a different figure for the same thing at the same scope.",
            "A lens that changes the RENDERER rather than the cohort — prose rows for adjustments, stat strips for payments, or an empty ledger with a different list beneath it.",
            "A period that comes back from collapse in a different column grammar.",
            "Money coloured by its sign: a negative credit in red, or a positive charge in green.",
            "A financial metric label above a blank value that an operator could read as zero.",
        ],
    }),
    S({
        key: "reload_switch_viewport",
        order: 23,
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
        order: 24,
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
        order: 25,
        title: "Recommendation, acceptance, then a charge",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Follow a tuition price from what the catalog suggests, through what was agreed, to the charge that results.",
        whyItMatters:
            "Tuition is the largest money in the product and it is not typed in by hand. A price is recommended from the catalog, somebody accepts a term — which may deliberately differ from the recommendation — and only then does a charge exist. Knowing which step created the money is how a disputed bill gets settled.",
        dispositionReason:
            "The tenant carries a live tuition catalog (offerings and rates), so the recommendation side is real. Whether the walkthrough can be completed end to end depends on the QA child having an accepted pricing term; the harness checks that live and says SCENARIO NOT READY rather than inviting a test on invalid preconditions.",
        requires: [{ kind: "account_state", check: "has_billable_enrollment", describe: "the child has an enrolment to price" }],
        navigate: ["Open the tuition configuration for the organization, then the child's enrolment."],
        doThis: ["Identify the recommended rate from the catalog.", "Identify the accepted term for the child.", "Identify the charge generated from it."],
        expectChanges: ["Only the generation step creates money."],
        expectUnchanged: ["A recommendation on its own owes nothing.", "An accepted term on its own owes nothing until tuition is generated."],
        invariant: MONEY_INVARIANTS.DRAFT_IS_NOT_OWED,
        failSymptoms: ["Money appearing at recommendation or acceptance.", "A generated charge that does not match the accepted term.", "Attribution to the wrong child."],
    }),
    S({
        key: "discount_vs_adjustment",
        order: 26,
        title: "An authored discount is not a manual correction",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Tell the two kinds of reduction apart and be able to explain the difference afterwards.",
        whyItMatters:
            "A discount comes from how the business prices things — a sibling rate, a staff rate, a promotion someone configured. An adjustment is a human deciding to correct one family's bill. Confusing them makes pricing policy look like a favour, and a favour look like policy.",
        requires: [{ kind: "account_state", check: "has_posted_obligation", describe: "an obligation that can carry a reduction" }],
        navigate: ["Look at where discounts are authored in the organization's financial configuration, then at Add → Adjustment on the account."],
        doThis: ["Identify a reduction that came from authored pricing.", "Identify a reduction that a person recorded by hand.", "Note how each is labelled on the account."],
        expectChanges: [],
        expectUnchanged: ["The two are distinguishable on the account without reading code."],
        invariant: MONEY_INVARIANTS.POSTED_MONEY_IS_IMMUTABLE,
        failSymptoms: ["The two appear interchangeable.", "A manual credit presented as a pricing discount, or the reverse."],
    }),
    S({
        key: "multi_child_attribution",
        order: 27,
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
        order: 28,
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
        order: 29,
        title: "Collecting a card payment",
        disposition: "EXPLICITLY_DEFERRED",
        purpose: "Take a card payment through the product and recognise the provider's result.",
        whyItMatters:
            "Most families pay by card. The product must start the collection, recognise what the processor says, and represent a failure as a failure.",
        dispositionReason:
            "NO PAYMENT PROVIDER IS CONFIGURED ON THIS TENANT. The canonical account read reports takePaymentCard as not_configured, because no active merchant row exists for this organisation, so there is no merchant to collect against and no test-mode credential to use. Deferred rather than out of scope: the product has payment.collect_card, and this becomes a walkthrough as soon as a test-mode merchant exists. Real card details must never be used.",
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
        order: 30,
        title: "ACH initiation, processing and recognition",
        disposition: "EXPLICITLY_DEFERRED",
        purpose: "Distinguish an ACH collection that has started from one that has actually settled.",
        whyItMatters:
            "ACH is not instant. Treating initiation as settlement would show money the business does not have yet, and a return days later would arrive as a surprise.",
        dispositionReason:
            "NOT AVAILABLE ON THIS TENANT: the canonical account read reports achAvailable false and takePaymentAch as not_configured. There is nothing to initiate and nothing to await. Deferred, with the settlement distinction recorded here so it is not lost.",
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
        order: 31,
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
        order: 32,
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
    /*
     * ── THE TWO PERIODS, WHICH ARE NOT THE SAME PERIOD ─────────────────────────────────────────
     *
     * Financials carries two period concepts and an operator who conflates them will close a month
     * that is still open, or reopen one that is closed. They are covered separately and honestly:
     * the billing period is walked through, because it is fully on screen; the accounting period is
     * NOT, because the platform gives a human no way to reach it.
     */
    S({
        key: "billing_period",
        order: 33,
        title: "The billing period is derived, and every surface agrees which one a charge is in",
        disposition: "HUMAN_WALKTHROUGH",
        purpose:
            "Confirm a charge lands in the period its billable date implies, that the period is shown with the year, and that filtering by period never changes a figure.",
        whyItMatters:
            "An operator reconciling a month needs to know which month a charge belongs to and to trust that every surface agrees. A period that is shown as a bare month — 'September' — cannot be reconciled against a statement, and a period filter that quietly changed a total would make the ledger a different ledger depending on how it was looked at.",
        requires: [{ kind: "scenario_passed", scenarioKey: "post_charge" }],
        navigate: [
            "Workspace → Financials → Accounts → select the account.",
            "The account body beneath the summary: the period-grouped ledger and its period filter.",
        ],
        doThis: [
            "Read the period heading the posted charge is grouped under, and the charge's own date.",
            "Confirm the date carries a YEAR — 'Dec 1, 2026', never '2026-12-01' and never 'Dec 1'.",
            "Confirm the period heading reads as a period in WORDS — 'September 2026'. A heading, a filter option or a row that says '2026-09' is a defect: that is the period's internal identifier, not its name.",
            "OPEN THE PERIOD FILTER and read the options themselves. Every option must read 'September 2026', 'October 2026'; none may read '2026-09'.",
            "Choose that period in the filter and confirm the activity shown is that period's and only that period's; then choose All periods again and confirm the full history returns.",
            "Check the other period surfaces for the same rule: the Charges list row context, the charge detail, and the result line after a bulk generation run.",
            "Open the same account in a Focus Panel (Financials → Details) and compare the grouping and the filter options.",
            "Open the charge's detail and confirm the Billing period there matches the period it is grouped under in the ledger.",
        ],
        expectChanges: [
            "Filtering to one period shows only that period's rows.",
            "The lens counts beside All / Charges / Credits & adjustments / Funding follow the filter.",
        ],
        expectUnchanged: [
            "Current balance, Due and Past due in the account summary — a filter narrows what is LISTED and never what is OWED.",
            "The period a charge is grouped under, whichever surface it is read on.",
        ],
        invariant: MONEY_INVARIANTS.BILLING_PERIOD_IS_DERIVED,
        failSymptoms: [
            "A ledger date with no year, or a raw 2026-12-01.",
            "A billing period shown as '2026-09' anywhere a human label belongs — a heading, a filter option, a row's context line, a run result.",
            "A charge grouped under a different period on the workspace than in the Focus Panel detail.",
            "The summary figures moving when a period filter is applied.",
            "A period filter that returns activity from another period, or that hides activity belonging to the chosen one.",
            "A row with no usable date appearing in the current month rather than as unplaced.",
        ],
    }),
    S({
        key: "accounting_period",
        order: 34,
        title: "The accounting period a journal entry is attributed to, and who may close it",
        disposition: "HUMAN_WALKTHROUGH",
        purpose:
            "Confirm an operator can see the accounting calendar, which period is open, and which accounting period a posted charge was attributed to — and that it is visibly a different thing from the billing period.",
        whyItMatters:
            "The accounting period is what a finance team closes a month against, and closing it is the act that makes a month's figures final. The platform already enforces it — `financial_accounting_calendars` and `financial_accounting_periods` are canonical, and the `attribute_financial_journal_entry` BEFORE INSERT trigger decides each entry's period — so the enforcement is real. What it does with a CLOSED period is defer, not refuse: an entry effective inside one is attributed to the earliest later OPEN period and stamped with where it came from, because a reporting boundary must not be able to stop a family being charged. It refuses only when there is no later open period to defer to.",
        dispositionReason:
            "The INSPECTION half was productized in Repair Pass 5F. The LIFECYCLE half is productized as of Financials 11B: `billing.adopt_accounting_calendar` materialises a calendar-month calendar and its twelve periods, and `billing.close_accounting_period` closes one behind a preview that states how many entries stay attributed and where later ones will defer. Both require `fin.write`. Reopening is NOT supported in V1 and no control offers it.",
        requires: [{ kind: "account_state", check: "has_posted_obligation", describe: "a posted charge whose period can be read" }],
        navigate: [
            "Organization → Financials → Accounting: the GL codes list, then the Accounting calendar panel beneath it.",
            "Workspace → Financials → Accounts → an account with a POSTED charge → open that charge's detail.",
        ],
        doThis: [
            "On the Accounting chapter, read the Accounting calendar panel: its name, its shape (Calendar month / 4-4-5 / Custom), whether it is active, and which period is marked Current.",
            "Read the period table: each period's name, its start and end dates, and whether it is Open or Closed. Confirm the dates carry the year.",
            "Confirm the period marked Current is the one today falls inside, and that it is the only one so marked.",
            "Open a POSTED charge's detail in the Accounts workspace and read the Posting block: Billing period, Accounting period, GL account.",
            "Confirm Billing period and Accounting period are shown as TWO SEPARATE facts and are not the same control. They may name the same month and still be different answers.",
            "Open a DRAFT charge's detail. Confirm the accounting period reads that it has not posted to a period yet, rather than showing a period it has not reached.",
            "LIMIT TO RECORD, not to work around: there is no control to open or close a period. Confirm none is offered, and that the panel says so. Do not close a period in the database to test it.",
        ],
        expectChanges: [],
        expectUnchanged: [
            "The accounting period on a posted charge — it was decided when the entry was written and nothing on these screens may move it.",
            "The billing period, which is derived from the charge's own dates and is unaffected by anything on the accounting calendar.",
        ],
        invariant: MONEY_INVARIANTS.ACCOUNTING_PERIOD_IS_ATTRIBUTED_AT_WRITE,
        failSymptoms: [
            "Any surface implying an entry's accounting period can be edited after the entry was written.",
            "A closed period accepting a write.",
            "This scenario being marked PASS on the strength of a database inspection.",
            "Billing period and accounting period presented as one field, or one used as a label for the other.",
            "A posted charge showing no accounting period, or a draft showing one.",
            "More than one period marked Current, or none while a period covers today.",
            "An organization with no calendar rendering an empty table rather than saying it has none.",
        ],
    }),
    S({
        key: "billing_preview_reachable",
        order: 40,
        title: "Recurring tuition terms are reachable from the child the operator is working in",
        disposition: "HUMAN_WALKTHROUGH",
        purpose:
            "Prove an ordinary operator can reach the card that accepts a child's recurring tuition terms, from the panel they actually work in, without being told where it is.",
        whyItMatters:
            "For two published versions this card was authored onto the panel and drawn by nothing, because a published layout carries an authored card list AND an explicit layout and only the second decides what renders. No operator on this tenant could establish a child's recurring price, and nothing anywhere reported an error. Reachability is the whole capability: a pricing surface nobody can find prices nothing.",
        requires: [{ kind: "account_state", check: "has_billable_enrollment", describe: "an enrolled child with an assignment to price" }],
        navigate: ["Workspace → the enrolled-children work unit → select an enrolled child → the Focus Panel Summary."],
        doThis: [
            "Read the panel without scrolling past it. Find the Tuition card.",
            "Confirm it appears ONCE. Two cards with the same question is a publication defect, not a display quirk.",
            "Confirm it names the child you selected, and the program and schedule that child is actually on.",
            "Confirm the other cards on the panel are the ones that were there before — nothing displaced, nothing missing.",
        ],
        expectChanges: [],
        expectUnchanged: [
            "Every other card on the panel, in its place and with its content.",
            "The Financials card, which answers a different question and must not have moved or changed.",
        ],
        invariant: MONEY_INVARIANTS.PUBLISHED_LAYOUT_IS_THE_RENDERED_ONE,
        failSymptoms: [
            "No Tuition card at all — the layout was published without it.",
            "Two Tuition cards.",
            "A Tuition card naming a different child than the one selected.",
            "The card reading that there is no assignment to price on a child who plainly has one.",
        ],
    }),
    S({
        key: "accept_recurring_terms",
        order: 41,
        title: "Accepting the authored price, and reading it back",
        disposition: "HUMAN_WALKTHROUGH",
        purpose:
            "Prove an operator accepts the price the organisation authored — not a number they typed — and that the acceptance is still there when they come back.",
        whyItMatters:
            "An accepted term is a contract fact: it is what the family agreed to, and everything billed afterwards is computed from it. If an operator could type an amount here, tuition would stop being a commercial decision and become whatever the last person entered. And an acceptance that does not read back has not been recorded, whatever the screen said at the time.",
        requires: [{ kind: "scenario_passed", scenarioKey: "billing_preview_reachable" }],
        navigate: ["Workspace → enrolled-children → an enrolled child → Focus Panel Summary → the Tuition card."],
        doThis: [
            "Read what the card recommends: the amount, the billing frequency, and the reasons it lists for that option — program, attendance, schedule, effective date.",
            "Confirm there is nowhere to type an amount. The operator chooses an authored option; they do not price it.",
            "Accept the recommendation.",
            "Confirm the card now states the accepted amount, its cadence and its effective date.",
            "Navigate away, come back, and read it again.",
        ],
        expectChanges: [
            "The card states an accepted term with its amount, cadence and effective date.",
            "The card's summary line moves to say how many of the family's assignments are agreed.",
        ],
        expectUnchanged: [
            "The balance, and everything on the Financials card. Accepting a price creates no charge — that is a later, separate act.",
            "The recommended option itself, which is still shown beside the acceptance.",
        ],
        invariant: MONEY_INVARIANTS.ACCEPTED_PRICE_IS_GROSS,
        failSymptoms: [
            "Any field that accepts a typed amount.",
            "An acceptance that disappears on reload — the card was optimistic and nothing was written.",
            "The balance moving when a price is accepted.",
            "An accepted amount that is not one of the authored options.",
        ],
    }),
    S({
        key: "recurring_preview_is_the_run",
        order: 42,
        title: "The generation preview is the run that follows it",
        disposition: "HUMAN_WALKTHROUGH",
        purpose:
            "Prove the billing frequency and period an operator previews are the billing frequency and period Confirm executes, and that the money agrees.",
        whyItMatters:
            "One account can hold a weekly term for one child and a monthly term for another. A preview that quietly ran monthly while Confirm generated five weekly obligations was measured on this product — the operator confirmed one operation and got another. A preview is a promise, and this is the step that holds it to that.",
        requires: [{ kind: "scenario_passed", scenarioKey: "accept_recurring_terms" }],
        navigate: ["Workspace → Financials → Charges → Generate a period's tuition."],
        doThis: [
            "Confirm the panel asks for a Billing frequency as well as a Service period. A month alone is not an instruction.",
            "Choose Monthly and the current service period. Preview the run. Write down the count and the amount it states.",
            "Change the Billing frequency to Weekly WITHOUT previewing again. Confirm the previous preview is cleared rather than left standing — it described a different operation.",
            "Preview Weekly. Write down its count and amount, and read the periods it names.",
            "Confirm the weekly preview names each week separately, and that a week crossing into the next month is named as ONE period, not split.",
        ],
        expectChanges: ["The preview's counts and total change when the billing frequency changes."],
        expectUnchanged: [
            "Every charge on the account. A preview writes nothing.",
            "The accepted terms.",
        ],
        invariant: MONEY_INVARIANTS.PREVIEW_IS_THE_OPERATION,
        failSymptoms: [
            "No billing-frequency control — a month-only preview that can execute another cadence.",
            "A preview that survives a change of frequency and is still offered for confirmation.",
            "A weekly preview reporting one monthly figure.",
            "A week that spans a month boundary appearing as two periods.",
        ],
    }),
    S({
        key: "recurring_generation_bills_the_accepted_price",
        order: 43,
        title: "What is generated is what was accepted",
        disposition: "HUMAN_WALKTHROUGH",
        purpose:
            "Prove a generated recurring obligation carries the accepted commercial price, in the period it belongs to, for the right child.",
        whyItMatters:
            "This is the step where a commercial agreement becomes money a family owes. It was measured billing the charge template's configured figure instead of the accepted price — every generated obligation the same wrong number, silently. A tester who checks only that a charge appeared would not have caught it; this scenario checks the amount against what was agreed.",
        requires: [{ kind: "scenario_passed", scenarioKey: "recurring_preview_is_the_run" }],
        navigate: ["Workspace → Financials → Charges → Generate a period's tuition, then the Charges list."],
        doThis: [
            "Confirm the weekly run for the current period, and read the result line: how many were newly generated, and how many already existed.",
            "Open one generated tuition charge. Read the Gross charge.",
            "Compare it to the amount accepted on the Tuition card for that child. They must be the same number.",
            "Read the child named on the charge, the Billing period, the Service date and the Invoice date.",
            "Repeat for the monthly child, whose accepted amount is different.",
        ],
        expectChanges: [
            "One draft tuition obligation per eligible billing period, at the accepted amount.",
            "The account's tuition total rises by the generated amounts.",
        ],
        expectUnchanged: [
            "The accepted terms themselves — generation reads them and does not rewrite them.",
            "Any obligation belonging to a child whose term is on a different cadence.",
        ],
        invariant: MONEY_INVARIANTS.ACCEPTED_PRICE_IS_GROSS,
        failSymptoms: [
            "A generated amount that matches neither accepted term — most likely a charge template's configured figure.",
            "Weekly and monthly children both billed the same amount.",
            "A charge attributed to the wrong child, or to the household when a child was priced.",
        ],
    }),
    S({
        key: "recurring_rerun_is_honest",
        order: 44,
        title: "Running the period again bills nothing again, and says so",
        disposition: "HUMAN_WALKTHROUGH",
        purpose:
            "Prove a second run over the same period creates no second obligation, and that the result distinguishes what it generated from what already stood.",
        whyItMatters:
            "Operators rerun. They rerun after adding a child, after fixing a rate, or because they are not sure the first run took. A billing system that duplicates on rerun bills families twice; one that converges silently but reports the work as freshly generated tells the operator they have. Both are failures, and only one of them shows up in the ledger.",
        requires: [{ kind: "scenario_passed", scenarioKey: "recurring_generation_bills_the_accepted_price" }],
        navigate: ["Workspace → Financials → Charges → Generate a period's tuition."],
        doThis: [
            "Count the tuition charges for the period before you start.",
            "Run the SAME billing frequency and period again.",
            "Read the result line. It must say nothing was newly generated and that the existing obligations already existed.",
            "Count the tuition charges again.",
        ],
        expectChanges: ["Nothing. The counts before and after are identical."],
        expectUnchanged: [
            "The number of tuition charges.",
            "Each charge's amount, dates, child and billing period.",
            "The account balance.",
        ],
        invariant: MONEY_INVARIANTS.EXISTING_IS_NOT_GENERATED,
        failSymptoms: [
            "A second set of tuition charges for the same weeks.",
            "A result line reporting the same count as newly generated on the second run.",
            "The balance moving on a rerun.",
        ],
    }),
    S({
        key: "recurring_term_lifecycle",
        order: 45,
        title: "A term that has not begun bills nothing",
        disposition: "HUMAN_WALKTHROUGH",
        purpose:
            "Prove generation respects a term's effective dating: a period before the term starts produces no obligation, and the refusal says which reason it is.",
        whyItMatters:
            "Effective dating is how a price change is made without rewriting history. If generation ignored it, a rate accepted for September would bill August retroactively, and a family would receive an invoice for a month at a price nobody had agreed to at the time.",
        requires: [{ kind: "scenario_passed", scenarioKey: "accept_recurring_terms" }],
        navigate: ["Workspace → Financials → Charges → Generate a period's tuition."],
        doThis: [
            "Set the Service period to a month BEFORE the accepted term's effective date. Keep the same billing frequency.",
            "Preview the run.",
            "Read the exceptions. Confirm the reason names the term as not yet effective, and is not a generic 'nothing to bill'.",
            "Confirm nothing is offered to confirm.",
        ],
        expectChanges: [],
        expectUnchanged: [
            "Every charge on the account. Nothing is generated for a period the term does not cover.",
        ],
        invariant: MONEY_INVARIANTS.BILLING_FREQUENCY_IS_OPERATOR_INTENT,
        failSymptoms: [
            "Obligations generated for a period before the term began.",
            "A silent zero with no stated reason, which cannot be told from a misconfiguration.",
            "'Not yet effective' and 'already ended' reported as the same reason.",
        ],
    }),
    S({
        key: "recurring_discount_reduces_net",
        order: 46,
        title: "A discount reduces the net and never the accepted price",
        disposition: "HUMAN_WALKTHROUGH",
        purpose:
            "Prove the organisation's authored discount policy reaches a generated recurring obligation, that gross stays the accepted price, and that the reduction says which policy produced it.",
        whyItMatters:
            "Gross and net answer different questions: gross is what was agreed, net is what is owed after the organisation's own rules. A system that discounts by lowering the gross loses the agreement; one that cannot discount a generated obligation at all forces an operator to apply policy by hand, one family at a time, and to remember to.",
        requires: [
            { kind: "scenario_passed", scenarioKey: "recurring_generation_bills_the_accepted_price" },
            { kind: "account_state", check: "has_obligation_with_room_to_reduce", describe: "a generated obligation the authored policy can reduce" },
        ],
        navigate: [
            "Organization → Financials → Policies: read the authored discount policy, its basis and its effective window.",
            "Workspace → Financials → Charges: apply the period's discounts, then open a generated tuition charge.",
        ],
        doThis: [
            "Read the discount policy: its kind, its basis and value, and the dates it is in force.",
            "Preview the discount run for the period. Confirm it states how many obligations would be reduced AND by how much — not merely which policies exist.",
            "Confirm the run.",
            "Open a generated tuition charge and read Gross charge, Reductions and Net obligation as three separate figures.",
            "Open the account's Details and find the discount row. Read what it says the reduction was taken on, and which child it belongs to.",
        ],
        expectChanges: [
            "A reduction appears against the obligation, and the net falls by it.",
            "A discount row appears in the credits and adjustments ledger, naming its policy basis.",
        ],
        expectUnchanged: [
            "The gross charge — still the accepted price, to the cent.",
            "The accepted term.",
            "Responsibility. A discount changes what is owed, not who owes it.",
        ],
        invariant: MONEY_INVARIANTS.REDUCTION_IS_A_SECOND_CONSEQUENCE,
        failSymptoms: [
            "The gross falling to the discounted figure — the agreement has been overwritten.",
            "A discount preview that names policies and no money.",
            "A reduction with no policy, basis or base recorded against it.",
            "The reduction shown as a Credit or an Adjustment rather than a Discount.",
        ],
    }),
    S({
        key: "discount_rerun_and_veto",
        order: 47,
        title: "Discounts do not stack on rerun, and a category that refuses one is refused",
        disposition: "HUMAN_WALKTHROUGH",
        purpose:
            "Prove re-running the discount authority applies nothing a second time, and that a charge whose category cannot be discounted does not receive one.",
        whyItMatters:
            "A discount that stacks on rerun gives money away quietly and repeatedly. And a reduction of a reduction is something no reconciliation can explain — which is why the category refuses it regardless of what a policy says it applies to.",
        requires: [{ kind: "scenario_passed", scenarioKey: "recurring_discount_reduces_net" }],
        navigate: ["Workspace → Financials → Charges, and the account's Details ledger."],
        doThis: [
            "Note each discounted obligation's gross, reduction and net.",
            "Run the period's discounts again.",
            "Read the result: nothing newly applied, the existing reductions unchanged.",
            "Re-read the same three figures on one obligation.",
            "In the ledger, confirm no discount row has been written against another discount or against a credit.",
        ],
        expectChanges: ["Nothing."],
        expectUnchanged: [
            "Every gross, reduction and net.",
            "The number of discount rows in the ledger.",
        ],
        invariant: MONEY_INVARIANTS.REDUCTION_IS_A_SECOND_CONSEQUENCE,
        failSymptoms: [
            "A second reduction against the same obligation.",
            "A net that falls again on a rerun.",
            "A discount written against a discount or a credit row.",
        ],
    }),
    S({
        key: "recurring_due_date",
        order: 48,
        title: "A generated obligation carries the organisation's own payment terms",
        disposition: "HUMAN_WALKTHROUGH",
        purpose:
            "Prove a generated recurring charge takes its Due Date from the configured due-date policy, and that Invoice date and Due date are two distinct facts.",
        whyItMatters:
            "When payment is expected is a term of business, configured once and applied consistently. A charge with no due date cannot be chased, and a due date that quietly equalled today would make every new obligation instantly overdue.",
        requires: [{ kind: "scenario_passed", scenarioKey: "recurring_generation_bills_the_accepted_price" }],
        navigate: [
            "Organization → Financials → Policies: read the due-date policy, its strategy, its offset and the date it takes effect.",
            "Workspace → Financials → Charges → a generated tuition charge's detail.",
        ],
        doThis: [
            "Read the due-date policy's strategy and offset, and the date from which it is in force.",
            "Open a generated obligation and read Invoice date and Due date as separate fields.",
            "Check the arithmetic against the policy's strategy.",
            "Confirm an obligation whose invoice date falls BEFORE any policy takes effect says it has no configured terms, rather than inventing a date.",
        ],
        expectChanges: [],
        expectUnchanged: ["The amount, the child, and the billing period."],
        invariant: MONEY_INVARIANTS.BILLING_PERIOD_IS_DERIVED,
        failSymptoms: [
            "Due date equal to today on every charge.",
            "Invoice date and Due date rendered as one field.",
            "A due date on a charge invoiced before any policy was in force.",
            "A configured policy that never reaches a charge that already stood as a draft.",
        ],
    }),
    S({
        key: "prepaid_available_and_applied",
        order: 49,
        title: "Money held for a family, and what happens when it is applied",
        disposition: "HUMAN_WALKTHROUGH",
        purpose:
            "Prove available prepaid is shown when it exists, stays out of the balance, is offered only when it is genuinely available, and moves the right two numbers when applied.",
        whyItMatters:
            "Unapplied money is the family's, held by the organisation. Netting it into the balance would tell an operator a family owes less than they do; offering money that has not cleared would apply funds that may never arrive. Both are the kind of error that is found months later in a reconciliation.",
        requires: [{ kind: "account_state", check: "has_unapplied_money", describe: "an account holding unapplied money" }],
        navigate: ["Workspace → Financials → Accounts → an account with unapplied money, then its Details."],
        doThis: [
            "Read Available and Balance as two separate figures. Confirm the balance is not reduced by the available money.",
            "Open an account with NO unapplied money and confirm no Available line is rendered at all — zero is silence, not a displayed zero.",
            "Back on the funded account, apply some of the available money to an obligation.",
            "Read Available, Paid and the obligation's outstanding amount afterwards.",
        ],
        expectChanges: [
            "Available falls by exactly the amount applied.",
            "The obligation's outstanding amount falls by the same amount, and Paid rises by it.",
        ],
        expectUnchanged: [
            "The payer on the original receipt. Applying money does not change who sent it.",
            "Responsibility on the obligation. Settlement does not rewrite who owes.",
            "Any money that has not cleared — it must not have been offered.",
        ],
        invariant: MONEY_INVARIANTS.FOUR_DISTINCT_FIGURES,
        failSymptoms: [
            "A balance that already includes the available money.",
            "An 'Available $0.00' line on an account with none.",
            "Pending or failed money offered for application.",
            "The responsible party changing because a payment was applied.",
        ],
    }),
    S({
        key: "child_responsibility_and_partial",
        order: 50,
        title: "A child-grain arrangement, and an obligation only partly divided",
        disposition: "HUMAN_WALKTHROUGH",
        purpose:
            "Prove responsibility can be arranged for one child rather than the whole account, that a more specific arrangement wins, and that an obligation not fully divided says so.",
        whyItMatters:
            "Families split differently per child — one parent covers one child's care, both split another's. And a partly divided obligation is the dangerous case: an operator who cannot see that $57.00 is unassigned will think the whole charge has an owner.",
        requires: [{ kind: "account_state", check: "has_posted_obligation", describe: "a posted obligation to arrange" }],
        navigate: ["Workspace → Financials → Accounts → a household with more than one child → a charge detail → Manage responsibility."],
        doThis: [
            "On a child-grain charge, confirm the arrangement offers both the household and that child as scopes, and that the household is the default.",
            "Arrange a FIXED share for one responsible party that is deliberately LESS than the whole charge.",
            "Read what the charge now says about the remainder.",
            "Confirm the Details ledger states the same partial state, and that the Responsible Party filter can narrow to that party.",
            "Confirm an older obligation from before the arrangement's effective date is unchanged.",
        ],
        expectChanges: [
            "The charge names a responsible party and states the amount still unassigned.",
        ],
        expectUnchanged: [
            "The charge's amount, child, dates and period. Responsibility moves no money.",
            "Obligations dated before the arrangement took effect.",
        ],
        invariant: MONEY_INVARIANTS.RESPONSIBILITY_MOVES_NO_CASH,
        failSymptoms: [
            "A partially divided charge presented as fully assigned.",
            "An arrangement rewriting obligations from before its effective date.",
            "A child-grain arrangement changing the charge's amount or attribution.",
        ],
    }),
    S({
        key: "organization_financial_configuration",
        order: 51,
        title: "The configuration an operator can actually reach, and the policies deliberately withheld",
        disposition: "HUMAN_WALKTHROUGH",
        purpose:
            "Prove the organisation's financial configuration is reachable and complete for the capabilities Core supports, and that policy types nothing consumes are NOT offered.",
        whyItMatters:
            "A configuration control for a policy nothing resolves is worse than an absent one, because it looks like a capability: an operator configures it, believes the organisation now behaves that way, and nothing happens. Withholding those is a deliberate product decision, and this step checks it held.",
        requires: [],
        navigate: ["Organization → Financials, through every chapter: Tuition, Catalog, Policies, Accounting, Simulator, Funding."],
        doThis: [
            "Tuition: confirm Tuition Plans, Enrolment Commitments and Billing Frequencies are all reachable, and that the frequency list includes the cadences the organisation bills on.",
            "Policies: open the authoring form and read the policy TYPES offered. Confirm the ones the runtime actually consumes are there — proration, billing cadence, due date, deposit, posting review.",
            "Confirm the types nothing consumes are NOT offered.",
            "Due date: confirm all four strategies are offered, and that a policy carries an effective date.",
            "Accounting: confirm GL codes and the accounting calendar are reachable.",
        ],
        expectChanges: [],
        expectUnchanged: ["Every account and charge. This is configuration, not money."],
        invariant: MONEY_INVARIANTS.REVIEW_IS_CONFIGURED_NOT_ASSUMED,
        failSymptoms: [
            "A policy type offered that nothing resolves.",
            "A missing billing frequency for a cadence the organisation bills.",
            "A due-date policy with no effective date.",
            "A chapter that renders a shell with no content.",
        ],
    }),
]);

/** The scenarios a human is actually asked to drive. */
export const WALKTHROUGH_SCENARIOS = SCENARIOS.filter((s) => s.disposition === "HUMAN_WALKTHROUGH");

export function scenarioByKey(key: string): Scenario | undefined {
    return SCENARIOS.find((s) => s.key === key);
}

/**
 * WHICH PROGRAM OWNS EACH SCENARIO — stated per key, because a classification that is derived is a
 * classification nobody decided.
 *
 * Read with `disposition`, never instead of it. `refund` is a HUMAN_WALKTHROUGH that belongs to
 * PAYMENTS_PHASE: it is written, it is drivable in principle, and the product it needs does not
 * exist yet. `subsidy_processing` is RETIRED from THIS catalog and not from the platform — Core's
 * boundary with Subsidy is still walked through by `subsidy_exclusion`, and the processing
 * scenarios belong to the Subsidy program's own acceptance, not to a Core list that can never run
 * them.
 */
export const SCENARIO_PROGRAM: Readonly<Record<string, ScenarioProgram>> = Object.freeze({
    // ── Foundation, charges, corrections: the Core product, drivable today ──────────────────
    financial_subject: "CORE_RUNNABLE",
    add_charge_honours_review_boundary: "CORE_RUNNABLE",
    draft_moves_nothing: "CORE_RUNNABLE",
    post_charge: "CORE_RUNNABLE",
    charge_detail_attribution: "CORE_RUNNABLE",
    manage_responsibility: "CORE_RUNNABLE",
    responsibility_supersession: "CORE_RUNNABLE",
    expected_funding: "CORE_RUNNABLE",
    expected_funding_correction: "CORE_RUNNABLE",
    adjustment_draft: "CORE_RUNNABLE",
    adjustment_post: "CORE_RUNNABLE",
    reduction_zero_bound: "CORE_RUNNABLE",
    reverse_adjustment: "CORE_RUNNABLE",
    reverse_charge: "CORE_RUNNABLE",
    cross_surface_consistency: "CORE_RUNNABLE",
    reload_switch_viewport: "CORE_RUNNABLE",
    overview_smoke: "CORE_RUNNABLE",
    tuition_chain: "CORE_RUNNABLE",
    discount_vs_adjustment: "CORE_RUNNABLE",
    multi_child_attribution: "CORE_RUNNABLE",
    subsidy_exclusion: "CORE_RUNNABLE",
    billing_period: "CORE_RUNNABLE",

    // ── The payment primitives Payments EXTENDS. These are Core and stay Core ───────────────
    payment_receipt: "CORE_RUNNABLE",
    actual_payer_is_not_responsibility: "CORE_RUNNABLE",
    apply_payment: "CORE_RUNNABLE",
    partial_unapplied: "CORE_RUNNABLE",
    move_payment: "CORE_RUNNABLE",
    failed_reapply_recovery: "CORE_RUNNABLE",

    // ── Certified this thread, and now walkable ─────────────────────────────────────────────
    billing_preview_reachable: "CORE_RUNNABLE",
    accept_recurring_terms: "CORE_RUNNABLE",
    recurring_preview_is_the_run: "CORE_RUNNABLE",
    recurring_generation_bills_the_accepted_price: "CORE_RUNNABLE",
    recurring_rerun_is_honest: "CORE_RUNNABLE",
    recurring_term_lifecycle: "CORE_RUNNABLE",
    recurring_discount_reduces_net: "CORE_RUNNABLE",
    discount_rerun_and_veto: "CORE_RUNNABLE",
    recurring_due_date: "CORE_RUNNABLE",
    prepaid_available_and_applied: "CORE_RUNNABLE",
    child_responsibility_and_partial: "CORE_RUNNABLE",
    organization_financial_configuration: "CORE_RUNNABLE",

    // ── The next program ───────────────────────────────────────────────────────────────────
    card_collection: "PAYMENTS_PHASE",
    ach_processing: "PAYMENTS_PHASE",
    provider_return: "PAYMENTS_PHASE",
    refund: "PAYMENTS_PHASE",

    // ── Real, correct, and with no operator surface in Core ─────────────────────────────────
    accounting_period: "DEFERRED_PRODUCTIZATION",

    // ── Another program's acceptance, not this list's ───────────────────────────────────────
    subsidy_processing: "RETIRED",
});

export function scenarioProgram(key: string): ScenarioProgram | undefined {
    return SCENARIO_PROGRAM[key];
}

/** What a Director can actually drive against the certified Core product today. */
export const CORE_RUNNABLE_SCENARIOS = SCENARIOS.filter((s) => SCENARIO_PROGRAM[s.key] === "CORE_RUNNABLE");

/**
 * THE THREE ACCEPTED CORE DEFERRALS, in the words the certification uses.
 *
 * These are NOT Core QA failures and must never be counted as one. Each names a capability whose
 * authority is real and proven, and whose operator surface is deliberately not in Core.
 */
export const CORE_DEFERRALS = Object.freeze([
    {
        key: "SHARE_METHODS_PERCENTAGE_REMAINDER_DEFERRED",
        statement:
            "A FIXED responsibility share is operator-authorable end to end. Percentage and remainder share methods exist in the arrangement authority and are enforced there, and no operator surface authors them in Core. An operator can divide an obligation by amount today; dividing it by proportion is a Payments-era surface.",
    },
    {
        key: "LEDGER_ROW_PROVENANCE_INSPECTION_DEFERRED",
        statement:
            "Canonical provenance exists for every reduction — the policy that decided it, the basis, the base it was taken on, whether a cap bound it — and the ledger states a concise preview of it beside the row. There is no deep row-inspection surface in Core that opens a single ledger row into its full decision record.",
    },
    {
        key: "DEPOSIT_OPERATOR_PRODUCTIZATION_GAP",
        statement:
            "The deposit policy type and the deposit model foundation exist and are configurable. The HELD DEPOSIT LIFECYCLE — taking a deposit, holding it, applying it and releasing it — belongs to Payments and has no operator surface in Core.",
    },
]);

/**
 * ONE OBLIGATION, ANSWERED ONCE — the canonical read behind charge detail.
 *
 * ── WHY THIS EXISTS ──
 *
 * Financials had no charge-detail surface. The Charges section lists a work queue of drafts, and a
 * queue row is a preview: it carries the amount ALREADY on the charge and says so, explicitly not a
 * balance, a net or a total. Building a detail view on top of those rows would have meant deriving
 * the money in a component — which is how a presentation layer becomes a second financial
 * authority, and the failure this whole thread has been unpicking.
 *
 * So nothing here decides anything about money. Every figure is asked of the service that already
 * owns it and passed through:
 *
 *   * `resolveFamilyCollectible` — gross, reductions, net, applied, outstanding, expected subsidy,
 *     submitted-claim suppression and collectible-now for THIS charge (Threads 8, 9 and 10);
 *   * `readResponsibility` — the named parties and the unassigned amount (Thread 6), the same
 *     reader the account card uses, so the two cannot answer differently;
 *   * the charge row and its billable source — identity, dates, lifecycle and attribution
 *     (Thread 1).
 *
 * This composition adds no arithmetic of its own. It joins.
 *
 * ── ATTRIBUTION ──
 *
 * A charge billed from an enrolment agreement is about that agreement's child. A charge billed from
 * the household is about the household and has no child — `customerMemberId` is null and that null
 * is an answer, not a gap to fill. Nothing here reaches for "the family's first child" when the
 * charge does not name one.
 *
 * ── PERIOD ──
 *
 * The charge's own service date, not today's billing period. The account card is deliberately
 * scoped to the current period and says so on its face; a selected obligation is not, and an
 * October charge opened in September is still an October charge.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { readResponsibility } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";
import { resolveFamilyCollectible } from "@/lib/financials/subsidy/resolveFamilyCollectible";
import {
    readAccountArrangement,
    type AccountArrangement,
} from "@/lib/financials/responsibility/readAccountArrangement";
import type { CollectiblePosition } from "@/lib/financials/subsidy/collectiblePosition";
import { billingPeriodLabel, placeInBillingPeriod } from "@/lib/financials/billingPeriod";
import { CHARGE_CATEGORY_GL_MAPPING_KEY } from "@/lib/financials/chargeCategories";

import {
    classifyChargeOrigin,
    describeChargeOrigin,
    type ChargeOrigin,
} from "@/lib/financials/workspace/chargeOrigin";
import { operatorIdentity } from "@/lib/access/operatorAccountName";
import {
    awaitingPostingReason,
    type AwaitingPostingReason,
} from "@/lib/financials/posting/awaitingPostingReason";
import {
    financialActorIdentityGap,
    resolveFinancialActorIdentity,
    type FinancialActorIdentity,
} from "@/lib/financials/identity/financialActorIdentity";
import {
    directionFromSignedCents,
    type AdjustmentDirection,
} from "@/lib/financials/corrections/correctionIntent";
/** One payment that satisfied part of this charge, as the operator needs to read it. */
export type ChargeDetailApplication = {
    paymentId: string;
    allocatedAmountCents: number;
    /** What the payer actually did — cash, check, card, bank debit. Never inferred. */
    method: string | null;
    /** The payment's own status, so money still in flight is not shown as settled. */
    paymentStatus: string | null;
    /**
     * THE APPLICATION'S OWN STATUS, and the reason it is here.
     *
     * An allocation can be reversed while the payment that made it stands. The collectible position
     * stops counting a reversed allocation — correctly — so a surface that lists every allocation
     * as applied money shows a family paying for something the balance says they still owe. The
     * status travels with the row so the presentation can tell the two apart instead of implying
     * one from the other.
     */
    status: string | null;
    receivedAt: string | null;
    referenceNumber: string | null;
};

export type ChargeDetail = {
    chargeId: string;
    orgId: string;

    /** IDENTITY — what an operator is looking at, before any money. */
    label: string | null;
    description: string | null;
    currencyCode: string;
    /** "posted" | "draft" | "void" | whatever the spine says. Never re-derived here. */
    status: string;
    serviceDate: string | null;
    /** When the obligation is issued — `billable_on`. */
    invoiceDate: string | null;
    /** When payment is expected. Null where the organisation has configured no terms. */
    dueDate: string | null;
    postedAt: string | null;

    /**
     * ── PROVENANCE: WHERE THIS CAME FROM, AND NOT ONE WORD MORE ─────────────────────────────
     *
     * `origin` is classified from stored evidence only — see `chargeOrigin`, which carries the
     * census that bounds it. `createdByName` is the canonical identity's answer and `null` is one
     * of its real answers: an unknown name stays unknown rather than an address or an id standing
     * in for a person.
     *
     * `correctionOfChargeId` is a RELATIONSHIP, not an origin: a human-authored correction is still
     * the human's charge, so it is carried beside `origin` rather than inside it.
     */
    createdAt: string | null;
    createdBy: string | null;
    createdByName: string | null;
    updatedAt: string | null;
    postedBy: string | null;
    postedByName: string | null;
    /**
     * WHETHER THE AUDIT TRAIL CAN NAME WHO CREATED THIS, and if not, why.
     *
     * Separate from `createdByName` on purpose. A name may be present from the weaker source (the
     * auth account's own display name) while the identity requirement is unmet, and a financial
     * surface must be able to say both things at once.
     */
    createdByIdentityStatus: FinancialActorIdentity["status"];
    /** The unmet requirement in one sentence, naming where it is closed. Null when there is none. */
    createdByIdentityGap: string | null;
    /**
     * WHY this charge is still a draft, when it is one (W7-F001).
     *
     * Null for anything that is not a draft. The same classifier the work queue uses, so a row and
     * the panel it opens cannot describe one charge differently.
     */
    awaiting: AwaitingPostingReason | null;
    correctionOfChargeId: string | null;
    chargeTemplateId: string | null;
    origin: ChargeOrigin;
    originDescription: string;

    /** ATTRIBUTION — the child this is about, or null when it is genuinely the household's. */
    customerId: string | null;
    customerMemberId: string | null;
    householdName: string | null;
    childName: string | null;
    /** How the charge came to exist: an agreement, or the household itself. */
    billableSourceType: string;
    billableSourceId: string;
    enrollmentAgreementId: string | null;

    /**
     * THE MONEY, ENTIRELY FROM THE CANONICAL RESOLVER.
     *
     * Null only when the resolver declines to speak for this charge — a draft owes nothing yet, and
     * a reduction row is not an obligation. A caller must render the identity above and say the
     * money is not applicable, rather than substituting zeros that read as "nothing is owed".
     */
    position: CollectiblePosition | null;

    /** WHO OWES IT — Thread 6's persisted allocations, named. */
    responsibility: {
        allocatedCents: number;
        unassignedCents: number;
        parties: { personId: string | null; name: string; assignedCents: number }[];
    };
    /** Funding expected against it. An expectation, never money received. */
    expectedFunding: { label: string; sourceType: string; expectedCents: number | null }[];

    /** WHAT HAS ACTUALLY BEEN PAID AGAINST IT. */
    applications: ChargeDetailApplication[];

    /**
     * ── WHEN WAS THIS BILLED, AND IN WHICH ACCOUNTING PERIOD DID IT POST ───────────────────────
     *
     * Two different periods, and an operator must be able to tell them apart without conflating
     * them. They are on the DETAIL rather than in the ledger deliberately: the ledger groups by
     * billing period because that is the customer-facing month, and a second permanent period
     * column would cost scan density to answer a question asked occasionally.
     *
     *   billingPeriod     the charge's BOUND commercial period (`billing_period_id`, bound from the
     *                     service date). A legacy charge with no binding is placed by the
     *                     historical derivation (`billable_on`, then `occurs_on`, …).
     *
     *   accountingPeriod  CONFIGURED, and decided by the database when the journal entry was
     *                     written: `attribute_financial_journal_entry` resolves it at INSERT
     *                     against the org's active calendar and refuses a closed period. This is
     *                     READ from the entry — never recomputed here, because recomputing it would
     *                     be a second opinion about where money landed, and the trigger's answer is
     *                     the one the books were closed on. Null for a charge that has not posted a
     *                     journal entry, which is an ordinary state for a draft.
     *
     *   glAccount         where the charge's category posts, through the mapping chain. Null when
     *                     the category has no mapping — a configuration fact, not a blank.
     */
    billingPeriodKey: string | null;
    billingPeriodLabel: string | null;
    accountingPeriod: { key: string; label: string | null; status: string; startsOn: string; endsOn: string } | null;
    /**
     * Set when the entry's own period was CLOSED and attribution deferred to a later open one —
     * the date it was effective on. Null for an ordinary posting, so the two are distinguishable.
     */
    accountingDeferredFrom: string | null;
    /** Present when attribution could not be READ — which is not the same as not posted. */
    accountingReadError: string | null;
    glAccount: { code: string; name: string | null } | null;

    /*
     * THE ACCOUNT'S ARRANGEMENT, WHICH IS NOT THIS CHARGE'S ALLOCATION.
     *
     * `responsibility` above says who bears THIS obligation. This says who bears the ACCOUNT, from
     * a date. A posted charge is not re-divided when an arrangement is configured — Thread 6
     * refuses to move billed money without an explicit decision — so the two can legitimately
     * disagree, and a surface that knows only the first tells an operator who has just created an
     * arrangement that there isn't one.
     */
    accountArrangement: AccountArrangement | null;

    /**
     * ── WHEN THIS CHARGE IS SOMEBODY'S CORRECTION ────────────────────────────────────────────
     *
     * Null for an ordinary charge, which is almost all of them. Present when this charge IS the
     * contra charge of a manual adjustment or correction, and then it answers §15's questions from
     * the record rather than from inference:
     *
     *   what changed, and which way   `direction` — stated, not read off a sign
     *   how much                      the charge's own amount, above
     *   effective date                the charge's service date, above
     *   commercial period             `billingPeriodLabel`, above
     *   the source fact               `sourceChargeId` and its own historical period
     *   who and when                  `createdByName` / `createdAt`, above
     *   why                           `reason` — the durable one, see below
     *
     * ── THE REASON IS THE EXISTING CANONICAL FIELD ───────────────────────────────────────────
     *
     * §16 asks whether a durable reason exists before anything invents one. It does, in two places
     * that agree because one writer populates both: `financial_reduction_applications.reason` is
     * NOT NULL for a manual reduction — the table's own CHECK refuses one without it — and
     * `applyManualReduction` also stores it in the contra charge's metadata. The application row is
     * read here because it is the constrained one; no parallel notes store is created.
     */
    adjustment: ChargeDetailAdjustment | null;
};

/** The provenance of one manual adjustment, as the operator needs to read it. */
export type ChargeDetailAdjustment = {
    applicationId: string;
    /** `reduce` or `increase`. The sign is never the operator's to interpret. */
    direction: AdjustmentDirection;
    /** Always positive — the magnitude a person reads. */
    magnitudeCents: number;
    /** Why the account changed. Durable, constrained NOT NULL for a manual reduction. */
    reason: string | null;
    /** Any further human note. Separate from the reason, and ordinarily absent. */
    note: string | null;
    /** The historical fact this corrects, when it corrects one. Account-level ones name none. */
    sourceChargeId: string | null;
    sourceDescription: string | null;
    sourceServiceDate: string | null;
    /** The source's OWN period label, whichever generation it belongs to. */
    sourcePeriodLabel: string | null;
    /** `closed` where the source's period is finalized. Null for a legacy source — it has none. */
    sourcePeriodStatus: string | null;
    /** True when this adjustment is itself the reversal of another. */
    reversesApplicationId: string | null;
    /** True when this adjustment has been reversed by a later one. */
    reversedByApplicationId: string | null;
};

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

/**
 * Resolve everything an operator needs to understand one charge.
 *
 * Returns null when the charge does not exist in this org — the caller's 404. Tenancy is enforced
 * by the org filter on every read here, not by the surface that called it.
 */
export async function resolveChargeDetail(
    supabase: SupabaseClient,
    args: { orgId: string; chargeId: string },
): Promise<ChargeDetail | null> {
    const chargeId = t(args.chargeId);
    if (!chargeId) return null;

    const { data: chargeRow, error } = await supabase
        .from("charges")
        .select(
            "id, billable_source_type, billable_source_id, amount_cents, currency_code, status, "
            + "service_date, posted_at, description, charge_template_id, billable_on, occurs_on, due_date, created_at, "
            + "charge_category, charge_type, metadata, "
            /* PROVENANCE. Read because Details must answer "where did this come from" from stored
               evidence alone; the census that bounds what may be SAID from them is recorded in
               `chargeOrigin`. */
            + "created_by, updated_at, updated_by, posted_by, job_id, source_charge_id, "
            /* The BOUND commercial period — the answer, when the charge carries one (W7). */
            + "billing_period_id",
        )
        .eq("org_id", args.orgId)
        .eq("id", chargeId)
        .maybeSingle();
    if (error) throw new Error(`charge detail: the charge could not be read (${error.message.trim()})`);
    if (!chargeRow) return null;

    const charge = chargeRow as unknown as {
        id: string;
        billable_source_type: string;
        billable_source_id: string;
        amount_cents: number;
        currency_code: string | null;
        status: string;
        service_date: string | null;
        posted_at: string | null;
        description: string | null;
        charge_template_id: string | null;
        /* The period and GL inputs. `placeInBillingPeriod` reads the date columns by name. */
        billable_on: string | null;
        due_date: string | null;
        occurs_on: string | null;
        created_at: string | null;
        charge_category: string | null;
        charge_type: string | null;
        metadata: Record<string, unknown> | null;
        /* Provenance — read and typed together, so a column cannot be selected and then unreadable. */
        created_by: string | null;
        updated_at: string | null;
        updated_by: string | null;
        posted_by: string | null;
        billing_period_id?: string | null;
        job_id: string | null;
        source_charge_id: string | null;
    };

    /*
     * PROVENANCE DECIDES ATTRIBUTION. The agreement names both the household and the child; the
     * household source names only the household, and correctly so.
     */
    let customerId: string | null = null;
    let customerMemberId: string | null = null;
    let enrollmentAgreementId: string | null = null;
    if (charge.billable_source_type === "enrollment_agreement") {
        enrollmentAgreementId = charge.billable_source_id;
        const { data: agreement, error: agreementError } = await supabase
            .from("child_enrollment_agreements")
            .select("id, customer_id, customer_member_id")
            .eq("org_id", args.orgId)
            .eq("id", charge.billable_source_id)
            .maybeSingle();
        if (agreementError) {
            throw new Error(`charge detail: the agreement could not be read (${agreementError.message.trim()})`);
        }
        const a = agreement as unknown as { customer_id: string | null; customer_member_id: string | null } | null;
        customerId = a?.customer_id ?? null;
        customerMemberId = a?.customer_member_id ?? null;
    } else {
        customerId = charge.billable_source_id;
    }

    const [householdName, childName] = await Promise.all([
        (async () => {
            if (!customerId) return null;
            const { data } = await supabase.from("customers").select("name").eq("id", customerId).maybeSingle();
            return (data as unknown as { name: string | null } | null)?.name ?? null;
        })(),
        (async () => {
            if (!customerMemberId) return null;
            const { data } = await supabase
                .from("customer_members")
                .select("display_name")
                .eq("id", customerMemberId)
                .maybeSingle();
            return (data as unknown as { display_name: string | null } | null)?.display_name ?? null;
        })(),
    ]);

    /*
     * THE MONEY. A resolver refusal is not an error here: a draft owes nothing yet and a reduction
     * row is not an obligation, and both legitimately have no collectible position. The caller is
     * told so by a null rather than by zeros that would read as a settled balance.
     */
    let position: CollectiblePosition | null = null;
    try {
        position = await resolveFamilyCollectible(supabase, { orgId: args.orgId, chargeId } as never);
    } catch {
        position = null;
    }

    const responsibilityRead = await readResponsibility(supabase, args.orgId, [chargeId]);
    /*
     * THE ARRANGEMENT IN FORCE FOR THIS CHARGE, not "whatever this account most recently arranged".
     * The charge is for a child, and a child-scoped arrangement beats the household one — so the
     * charge's own subject is what decides which arrangement governs it.
     */
    const accountArrangement = await readAccountArrangement(supabase, {
        orgId: args.orgId,
        customerId,
        customerMemberId,
    });

    /*
     * ── THE TWO PERIODS AND THE GL ACCOUNT ─────────────────────────────────────────────────────
     *
     * The billing period is derived from the charge's own dates by the one authority that derives
     * it. The accounting period is READ from the journal entry the database already attributed —
     * never recomputed, because the trigger's answer is the one the books were closed on. The GL
     * account travels the same mapping chain the ledger does, so the detail and the ledger cannot
     * disagree about where a category posts.
     *
     * Each is independently tolerant: a charge whose journal entry or GL mapping cannot be read is
     * still a charge an operator must be able to open.
     */
    /*
     * ── THE BOUND PERIOD IS THE ANSWER (W7) ──────────────────────────────────────────────────
     *
     * A charge on the childcare spine carries `billing_period_id`, bound from its SERVICE date.
     * Re-deriving the period here from `billable_on` gave a second answer that followed invoice
     * timing: a Nov 5 charge invoiced Oct 25 would read "October" on the detail while it is a
     * November obligation everywhere that matters. The bound row is read; only a legacy charge with
     * no binding is placed by the historical derivation.
     */
    let billing: { key: string | null } = placeInBillingPeriod(charge as unknown as Record<string, unknown>);
    if (t(charge.billing_period_id)) {
        const { data: bound } = await supabase
            .from("financial_billing_periods")
            .select("period_key")
            .eq("org_id", args.orgId)
            .eq("id", t(charge.billing_period_id))
            .maybeSingle();
        const key = t((bound as { period_key?: unknown } | null)?.period_key);
        if (key) billing = { key };
    }

    /* Configuration owns the word an operator reads. See the note on `label` below. */
    let templateLabel = "";
    if (t(charge.charge_template_id)) {
        const { data: template } = await supabase
            .from("financial_charge_templates")
            .select("label")
            .eq("org_id", args.orgId)
            .eq("id", t(charge.charge_template_id))
            .maybeSingle();
        templateLabel = t((template as { label?: unknown } | null)?.label);
    }

    let accountingPeriod: ChargeDetail["accountingPeriod"] = null;
    /** The effective date whose own period was closed, when attribution was deferred. */
    let accountingDeferredFrom: string | null = null;
    /** Why the attribution is unknown, when it is — never conflated with "not posted". */
    let accountingReadError: string | null = null;
    try {
        /*
         * ── THE JOURNAL HAS NO `charge_id` COLUMN ─────────────────────────────────────────────
         *
         * This filtered `.eq("charge_id", chargeId)` against a column that does not exist. The
         * charge is identified by `source_type = 'charge'` and `source_id`; the id also travels in
         * `metadata.charge_id` for entries whose SOURCE is something else, such as a payment
         * application. PostgREST answers an unknown column with an error, the `try` below swallowed
         * it, and so EVERY charge — posted or not — reported "Not posted to a period yet".
         *
         * Measured: charge 18e860f9, status `posted`, accountingPeriod null. The accounting period
         * row on charge detail had never once displayed a period.
         */
        const { data: entry, error: entryError } = await supabase
            .from("financial_journal_entries")
            .select("accounting_period_id, effective_on, metadata")
            .eq("org_id", args.orgId)
            .eq("source_type", "charge")
            .eq("source_id", chargeId)
            .not("accounting_period_id", "is", null)
            .limit(1)
            .maybeSingle();
        /*
         * A FAILED READ IS NOT "NOT POSTED". Those are different answers and only one of them is
         * safe to show; the silence is what let a broken query look like an unposted charge.
         */
        if (entryError) throw new Error(`accounting attribution could not be read (${entryError.message.trim()})`);
        const journal = entry as {
            accounting_period_id?: unknown;
            effective_on?: unknown;
            metadata?: Record<string, unknown> | null;
        } | null;
        const periodId = t(journal?.accounting_period_id);
        /*
         * ── WHY IT LANDED WHERE IT DID ────────────────────────────────────────────────────────
         *
         * A closed accounting period does not refuse a posting — it defers it to the next open
         * period and stamps the entry with where it came from. Without reading that stamp, an
         * entry effective in September and reporting in October looks identical to one that was
         * always an October entry, and the operator has no way to tell a deferral from an
         * ordinary posting. The trigger records it; this is the read that makes it visible.
         */
        const meta = (journal?.metadata ?? {}) as Record<string, unknown>;
        if (meta.accounting_period_deferred === true) {
            accountingDeferredFrom = t(meta.accounting_period_deferred_from_date) || t(journal?.effective_on) || null;
        }
        if (periodId) {
            const { data: period } = await supabase
                .from("financial_accounting_periods")
                .select("period_key, label, status, starts_on, ends_on")
                .eq("org_id", args.orgId)
                .eq("id", periodId)
                .maybeSingle();
            const row = period as {
                period_key?: string;
                label?: string | null;
                status?: string;
                starts_on?: string;
                ends_on?: string;
            } | null;
            if (row?.period_key) {
                accountingPeriod = {
                    key: row.period_key,
                    label: row.label?.trim() || null,
                    status: t(row.status) || "open",
                    startsOn: t(row.starts_on),
                    endsOn: t(row.ends_on),
                };
            }
        }
    } catch (e) {
        /*
         * TOLERANT, BUT NOT SILENT. A charge whose attribution cannot be read is still a charge an
         * operator must be able to open, so this does not fail the whole detail — but the reason is
         * carried out rather than discarded. A bare `catch {}` here is what let a query against a
         * non-existent column read as "not posted" on every charge in the system.
         */
        accountingPeriod = null;
        accountingDeferredFrom = null;
        accountingReadError = e instanceof Error ? e.message : "accounting attribution could not be read";
    }

    let glAccount: ChargeDetail["glAccount"] = null;
    try {
        const categoryKey = t(charge.charge_category) || t(charge.charge_type) || "one_time";
        const metadata = (charge.metadata ?? {}) as Record<string, unknown>;
        const mappingKey =
            t(metadata.gl_mapping_key)
            || CHARGE_CATEGORY_GL_MAPPING_KEY[categoryKey as keyof typeof CHARGE_CATEGORY_GL_MAPPING_KEY]
            || "";
        if (mappingKey) {
            const { data: mapping } = await supabase
                .from("gl_account_mappings")
                .select("gl_account_id, is_active")
                .eq("org_id", args.orgId)
                .eq("key", mappingKey)
                .maybeSingle();
            const accountId = t((mapping as { gl_account_id?: unknown; is_active?: boolean } | null)?.gl_account_id);
            const mappingActive = (mapping as { is_active?: boolean } | null)?.is_active !== false;
            if (accountId && mappingActive) {
                const { data: account } = await supabase
                    .from("gl_accounts")
                    .select("code, name")
                    .eq("org_id", args.orgId)
                    .eq("id", accountId)
                    .maybeSingle();
                const row = account as { code?: string; name?: string | null } | null;
                if (row?.code) glAccount = { code: row.code, name: row.name?.trim() || null };
            }
        }
    } catch {
        glAccount = null;
    }

    const { data: allocationRows, error: allocationError } = await supabase
        .from("payment_allocations")
        .select("payment_id, allocated_amount_cents, status")
        .eq("charge_id", chargeId);
    if (allocationError) {
        throw new Error(`charge detail: applied payments could not be read (${allocationError.message.trim()})`);
    }
    const allocations = ((allocationRows ?? []) as unknown) as Array<{
        payment_id: string;
        allocated_amount_cents: number;
        status: string | null;
    }>;

    const paymentIds = [...new Set(allocations.map((a) => a.payment_id).filter(Boolean))];
    const paymentById = new Map<string, { status: string | null; method: string | null; receivedAt: string | null; reference: string | null }>();
    if (paymentIds.length > 0) {
        const { data: paymentRows, error: paymentError } = await supabase
            .from("payments")
            .select("id, status, payment_method, received_at, reference_number")
            .eq("org_id", args.orgId)
            .in("id", paymentIds);
        if (paymentError) {
            throw new Error(`charge detail: the payments behind applied money could not be read (${paymentError.message.trim()})`);
        }
        for (const row of ((paymentRows ?? []) as unknown) as Array<Record<string, unknown>>) {
            paymentById.set(t(row.id), {
                status: t(row.status) || null,
                method: t(row.payment_method) || null,
                receivedAt: t(row.received_at) || null,
                reference: t(row.reference_number) || null,
            });
        }
    }

    /*
     * ── THE ACTORS, THROUGH THE CANONICAL IDENTITY AUTHORITY ────────────────────────────────
     *
     * `auth.admin.getUserById` is where an operator's display name actually lives — the same
     * source the Users rail reads — and `operatorIdentity` is the projection of it. An unread or
     * unnamed account yields `null`, which stays null: a surface says the name is unknown rather
     * than printing an address or a uuid in a person's place.
     *
     * At most two ids, looked up once each, on a surface that is already one charge.
     */
    const actorNames = new Map<string, string>();
    /*
     * ── AND WHETHER THE LEDGER IS ENTITLED TO A NAME AT ALL (W7-F002) ─────────────────────────
     *
     * The name and the REQUIREMENT are two different answers and the panel needs both. An operator
     * whose auth account happens to carry a `full_name` renders with a name, and the tenant still
     * has not met the requirement — the attribution rests on whatever the account was created with
     * rather than on a recorded decision about who this login is. Reporting only the name would
     * close the gap on screen while leaving it open in the data, which is the shape of defect that
     * produced F002 in the first place.
     */
    const actorIdentities = new Map<string, FinancialActorIdentity>();
    for (const actorId of new Set([charge.created_by, charge.posted_by].filter((v): v is string => Boolean(v)))) {
        /*
         * ── THE PERSON THIS OPERATOR IS, BEFORE THE ACCOUNT THEY SIGN IN WITH ─────────────────
         *
         * `resolveFinancialActorIdentity` is the one statement of the requirement: the canonical
         * bridge `user_person_links` → `persons` → a human name, with no email anywhere in it. This
         * surface used to read the auth account's `user_metadata` and nothing else, so an operator
         * whose account carried no `full_name` rendered as "Created by a person whose name is not
         * on file" on a FINANCIAL AUDIT LINE while their actual name sat one join away.
         */
        const identity = await resolveFinancialActorIdentity(supabase, { orgId: args.orgId, actorUserId: actorId });
        actorIdentities.set(actorId, identity);
        let name: string | null = identity.name;

        /*
         * The account's own display name, for DISPLAY only. A weak name beats no name on a screen,
         * and it is what this read did before. It does NOT satisfy the requirement and deliberately
         * does not touch `identity.requirementMet`, so the gap stays visible beside it. Still no
         * email fallback: an unknown name stays unknown rather than printing an address in a
         * person's place.
         */
        if (!name) {
            try {
                const { data } = await supabase.auth.admin.getUserById(actorId);
                const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
                name = operatorIdentity({
                    display_name:
                        typeof meta.full_name === "string" ? meta.full_name
                        : typeof meta.name === "string" ? meta.name
                        : null,
                    email: data?.user?.email ?? null,
                }).name;
            } catch {
                /* An unreadable account is an unknown name, which is already the default. */
            }
        }

        if (name) actorNames.set(actorId, name);
    }

    /*
     * ── IS THIS CHARGE SOMEBODY'S CORRECTION? ────────────────────────────────────────────────
     *
     * One read, keyed on `charge_id`, because the contra charge IS the join: `reductionCore` writes
     * the application rows pointing at the charge it created. A charge with no application is an
     * ordinary charge and this stays null — which is the common case and costs one indexed miss.
     *
     * MANUAL ONLY. A policy reduction's contra charge is also a reduction, and it is not an
     * operator's adjustment: its reason is the policy, it is not reversible through this surface,
     * and presenting it with a "why did somebody decide this" block would invite an answer that
     * does not exist. `reduction_kind` is what tells them apart.
     *
     * A FAILED READ IS NOT "NOT AN ADJUSTMENT". Swallowing the error would make a correction look
     * like a plain charge — stripping the operator of the source fact, the reason and the reversal
     * lineage with no sign that anything was missing — so it propagates like every other read here.
     */
    let adjustment: ChargeDetailAdjustment | null = null;
    {
        const { data: appRow, error: appError } = await supabase
            .from("financial_reduction_applications")
            .select(
                "id, reduction_kind, amount_cents, reason, explanation, source_charge_id, reverses_id, reversed_by_id",
            )
            .eq("org_id", args.orgId)
            .eq("charge_id", charge.id)
            .eq("reduction_kind", "manual")
            .maybeSingle();
        if (appError) {
            throw new Error(`charge detail: the adjustment record could not be read (${appError.message.trim()})`);
        }
        const app = appRow as unknown as {
            id: string;
            amount_cents: number;
            reason: string | null;
            explanation: string | null;
            source_charge_id: string | null;
            reverses_id: string | null;
            reversed_by_id: string | null;
        } | null;
        if (app) {
            /*
             * THE SOURCE'S OWN PERIOD, read from the source rather than assumed from this charge.
             * §12: a legacy source carries a key and no period row, so its label comes from the key
             * and its status is genuinely null — there is no row to have a status. That absence is
             * reported as absence; no fake historical canonical period is materialized to fill it.
             */
            let sourceDescription: string | null = null;
            let sourceServiceDate: string | null = null;
            let sourcePeriodLabel: string | null = null;
            let sourcePeriodStatus: string | null = null;
            if (app.source_charge_id) {
                const { data: srcRow, error: srcError } = await supabase
                    .from("charges")
                    .select("description, service_date, billing_period_id, legacy_billing_period_key")
                    .eq("org_id", args.orgId)
                    .eq("id", app.source_charge_id)
                    .maybeSingle();
                if (srcError) {
                    throw new Error(`charge detail: the corrected charge could not be read (${srcError.message.trim()})`);
                }
                const src = srcRow as unknown as {
                    description: string | null;
                    service_date: string | null;
                    billing_period_id: string | null;
                    legacy_billing_period_key: string | null;
                } | null;
                if (src) {
                    sourceDescription = t(src.description) || null;
                    sourceServiceDate = src.service_date;
                    sourcePeriodLabel = src.legacy_billing_period_key
                        ? billingPeriodLabel(src.legacy_billing_period_key)
                        : null;
                    if (src.billing_period_id) {
                        const { data: periodRow, error: periodError } = await supabase
                            .from("financial_billing_periods")
                            .select("period_key, status")
                            .eq("org_id", args.orgId)
                            .eq("id", src.billing_period_id)
                            .maybeSingle();
                        if (periodError) {
                            throw new Error(
                                `charge detail: the corrected charge's period could not be read (${periodError.message.trim()})`,
                            );
                        }
                        const period = periodRow as unknown as { period_key: string; status: string } | null;
                        if (period) {
                            sourcePeriodLabel = billingPeriodLabel(period.period_key);
                            sourcePeriodStatus = period.status;
                        }
                    }
                }
            }
            const metadata = (charge.metadata ?? {}) as Record<string, unknown>;
            adjustment = {
                applicationId: app.id,
                direction: directionFromSignedCents(app.amount_cents),
                magnitudeCents: Math.abs(app.amount_cents),
                /*
                 * The application row's reason is the constrained one and wins. The charge
                 * metadata copy is the fallback for a row written before the column was populated,
                 * not a second authority.
                 */
                reason: t(app.reason) || t(metadata.reason) || null,
                note: t(app.explanation) || t(metadata.note) || null,
                sourceChargeId: app.source_charge_id,
                sourceDescription,
                sourceServiceDate,
                sourcePeriodLabel,
                sourcePeriodStatus,
                reversesApplicationId: app.reverses_id,
                reversedByApplicationId: app.reversed_by_id,
            };
        }
    }

    const origin = classifyChargeOrigin({
        createdBy: charge.created_by ?? null,
        jobId: charge.job_id ?? null,
        sourceChargeId: charge.source_charge_id ?? null,
        chargeTemplateId: charge.charge_template_id ?? null,
        metadataSource:
            charge.metadata && typeof charge.metadata === "object"
                ? ((charge.metadata as Record<string, unknown>).source as string | null) ?? null
                : null,
    });

    return {
        chargeId: charge.id,
        orgId: args.orgId,
        /*
         * THE CONFIGURED LABEL, NEVER THE TEMPLATE KEY.
         *
         * `writeTemplateDraftCharge` stores `description: intent.templateKey`, so a charge's stored
         * description is `field_trip` — an internal key that was being shown to an operator as the
         * charge's NAME on its own detail. The ledger already resolves this through the template's
         * configured label and has for some time; the detail did not, so one charge had two names
         * depending on which surface you opened. A charge whose template has since been retired
         * keeps its stored description rather than losing its identity.
         */
        label: templateLabel || t(charge.description) || null,
        description: t(charge.description) || null,
        currencyCode: t(charge.currency_code) || "USD",
        status: t(charge.status),
        serviceDate: charge.service_date,
        postedAt: charge.posted_at,
        createdAt: charge.created_at ?? null,
        createdBy: charge.created_by ?? null,
        createdByName: actorNames.get(charge.created_by ?? "") ?? null,
        awaiting: charge.status === "draft" ? awaitingPostingReason(charge.metadata) : null,
        createdByIdentityStatus:
            actorIdentities.get(charge.created_by ?? "")?.status ?? "no_actor",
        createdByIdentityGap: financialActorIdentityGap(
            actorIdentities.get(charge.created_by ?? "")
            ?? { status: "no_actor", name: null, personId: null, requirementMet: false },
        ),
        updatedAt: charge.updated_at ?? null,
        postedBy: charge.posted_by ?? null,
        postedByName: actorNames.get(charge.posted_by ?? "") ?? null,
        correctionOfChargeId: charge.source_charge_id ?? null,
        chargeTemplateId: charge.charge_template_id ?? null,
        origin,
        originDescription: describeChargeOrigin(origin, actorNames.get(charge.created_by ?? "") ?? null),
        /*
         * ── FIVE DATES, FIVE FIELDS ──────────────────────────────────────────────────────────
         *
         * The detail already carried the service date, the billing period and the accounting
         * period, and stopped there. The INVOICE date — when the obligation is issued — was read
         * from the row and never exposed, and the DUE date was not read at all, so an organisation
         * could configure its payment terms, the charge could record them, and no surface in the
         * product would say what they were.
         *
         * They are separate fields because they are separate facts. A specimen where they coincide
         * is a coincidence, not a licence to collapse them.
         */
        invoiceDate: charge.billable_on,
        dueDate: charge.due_date,
        billingPeriodKey: billing.key,
        billingPeriodLabel: billing.key ? billingPeriodLabel(billing.key) : null,
        accountingPeriod,
        accountingDeferredFrom,
        accountingReadError,
        glAccount,
        customerId,
        customerMemberId,
        householdName,
        childName,
        billableSourceType: charge.billable_source_type,
        billableSourceId: charge.billable_source_id,
        enrollmentAgreementId,
        position,
        responsibility: {
            allocatedCents: responsibilityRead.responsibility.allocatedCents,
            unassignedCents: responsibilityRead.responsibility.unassignedCents,
            parties: responsibilityRead.responsibility.parties.map((p) => ({
                personId: p.personId ?? null,
                name: p.name,
                assignedCents: p.assignedCents,
            })),
        },
        accountArrangement,
        adjustment,
        expectedFunding: responsibilityRead.expectedFunding.map((f) => ({
            label: f.label,
            sourceType: f.sourceType,
            expectedCents: f.expectedCents,
        })),
        applications: allocations.map((a) => {
            const payment = paymentById.get(a.payment_id);
            return {
                paymentId: a.payment_id,
                allocatedAmountCents: Number(a.allocated_amount_cents) || 0,
                status: a.status ?? null,
                method: payment?.method ?? null,
                paymentStatus: payment?.status ?? null,
                receivedAt: payment?.receivedAt ?? null,
                referenceNumber: payment?.reference ?? null,
            };
        }),
    };
}

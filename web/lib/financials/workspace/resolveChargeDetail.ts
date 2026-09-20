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
     *   billingPeriod     DERIVED from the charge's own dates — `billable_on`, then `occurs_on`,
     *                     `service_date`, `created_at`. No table and no configuration, by design.
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
            + "charge_category, charge_type, metadata",
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
    const billing = placeInBillingPeriod(charge as unknown as Record<string, unknown>);

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

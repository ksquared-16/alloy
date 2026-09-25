/**
 * WHOSE INSTRUMENT MAY A PAYER USE — and, just as importantly, whose may they not see.
 *
 * `customer_payment_methods` is household grain, so a saved card belonged to an ACCOUNT and every
 * adult attached to it was implicitly entitled to use it. `payment_instruments` gives an instrument
 * an explicit owner; this is the read that honours it.
 *
 * ── THE FOUR IDENTITIES THIS FILE KEEPS APART ──
 *
 *   respondent          completing the paperwork
 *   responsible party   who Financials says owes the money
 *   actual payer        who sent it (`payments.payer_entity_type/id`)
 *   instrument owner    who may reuse a stored method
 *
 * No pair of these implies another. Owning a card assigns no responsibility; being responsible
 * grants no access to someone else's card; paying makes nobody responsible; and filling in the form
 * makes a person neither a payer nor an owner. Every function here resolves exactly one of them.
 *
 * ── ELIGIBILITY IS BORROWED, NOT INVENTED ──
 *
 * "Who may pay for this household" is answered from `customer_persons`, the canonical household
 * edge that `resolveResponsibilityPartyCandidates` already reads for the parallel question of who
 * may be made responsible. Reusing it means a grandmother attached to the household is offerable
 * without a second relationship model, and it deliberately does NOT mean "every guardian", "the
 * respondent only", or "the responsible parties" — each of which would be a new rule.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type PaymentInstrumentRail = "card" | "us_bank_account";

export type PaymentInstrument = {
    readonly id: string;
    readonly customerId: string;
    /** Null means UNOWNED — a legacy row nobody has claimed. Never offered to a payer. */
    readonly ownerPersonId: string | null;
    readonly rail: PaymentInstrumentRail;
    readonly reusable: boolean;
    readonly status: string;
    readonly verificationState: string | null;
    readonly brand: string | null;
    readonly last4: string | null;
    readonly legacyCustomerPaymentMethodId: string | null;
};

const COLUMNS =
    "id, customer_id, owner_entity_type, owner_entity_id, rail, reusable, status, verification_state, brand, last4, legacy_customer_payment_method_id";

type Row = {
    id: string;
    customer_id: string;
    owner_entity_type: string | null;
    owner_entity_id: string | null;
    rail: string;
    reusable: boolean;
    status: string;
    verification_state: string | null;
    brand: string | null;
    last4: string | null;
    legacy_customer_payment_method_id: string | null;
};

function toInstrument(row: Row): PaymentInstrument {
    return {
        id: row.id,
        customerId: row.customer_id,
        ownerPersonId: row.owner_entity_type === "person" ? row.owner_entity_id : null,
        rail: row.rail as PaymentInstrumentRail,
        reusable: row.reusable,
        status: row.status,
        verificationState: row.verification_state,
        brand: row.brand,
        last4: row.last4,
        legacyCustomerPaymentMethodId: row.legacy_customer_payment_method_id,
    };
}

/**
 * The instruments ONE payer may reuse. The only list a participant surface may be given.
 *
 * Filtered on the owner in the query rather than after it: a read that fetched the household's
 * instruments and then filtered in code is one refactor away from leaking Dad's card to Mom, and the
 * filter that matters should be the one the database applied.
 */
export async function listReusableInstrumentsForPayer(
    supabase: SupabaseClient,
    args: { readonly orgId: string; readonly customerId: string; readonly payerPersonId: string },
): Promise<readonly PaymentInstrument[]> {
    if (!args.orgId?.trim() || !args.customerId?.trim() || !args.payerPersonId?.trim()) return [];
    const { data, error } = await supabase
        .from("payment_instruments")
        .select(COLUMNS)
        .eq("org_id", args.orgId)
        .eq("customer_id", args.customerId)
        .eq("owner_entity_type", "person")
        .eq("owner_entity_id", args.payerPersonId)
        .eq("reusable", true)
        .eq("status", "active");
    if (error) throw new Error(`payment instruments could not be read (${error.message.trim()})`);
    return ((data ?? []) as Row[]).map(toInstrument);
}

/**
 * Every instrument on an account, for an OPERATOR. Includes unowned legacy rows.
 *
 * Kept separate from the payer read on purpose. An administrator has a legitimate reason to see that
 * an account has three stored methods and that one of them belongs to nobody; a participant does
 * not, and a single function with a flag is how those two audiences end up sharing a query.
 */
export async function listAccountInstrumentsForOperator(
    supabase: SupabaseClient,
    args: { readonly orgId: string; readonly customerId: string },
): Promise<readonly PaymentInstrument[]> {
    if (!args.orgId?.trim() || !args.customerId?.trim()) return [];
    const { data, error } = await supabase
        .from("payment_instruments")
        .select(COLUMNS)
        .eq("org_id", args.orgId)
        .eq("customer_id", args.customerId);
    if (error) throw new Error(`payment instruments could not be read (${error.message.trim()})`);
    return ((data ?? []) as Row[]).map(toInstrument);
}

export type PayerCandidate = {
    readonly personId: string;
    readonly name: string;
    readonly roleLabel: string | null;
    /** How many reusable instruments this payer already has on this account. */
    readonly reusableInstrumentCount: number;
};

/**
 * WHO MAY PAY for this household.
 *
 * The household edge, and nothing narrower. A grandmother attached as an emergency contact is
 * offerable; being responsible is not required, because a payer need not be responsible and a
 * responsible party need not pay.
 */
export async function resolvePayerCandidates(
    supabase: SupabaseClient,
    args: { readonly orgId: string; readonly customerId: string },
): Promise<readonly PayerCandidate[]> {
    if (!args.orgId?.trim() || !args.customerId?.trim()) return [];

    const { data: edges, error: edgeError } = await supabase
        .from("customer_persons")
        .select("person_id, role_key, status")
        .eq("org_id", args.orgId)
        .eq("customer_id", args.customerId);
    if (edgeError) throw new Error(`household members could not be read (${edgeError.message.trim()})`);

    const personIds = [
        ...new Set(
            ((edges ?? []) as Array<{ person_id: string | null; status: string | null }>)
                .filter((e) => (e.status ?? "active") !== "inactive")
                .map((e) => e.person_id)
                .filter((v): v is string => Boolean(v)),
        ),
    ];
    if (personIds.length === 0) return [];

    // Names, org-filtered — the same load-bearing filter the candidate resolver uses.
    const { data: people } = await supabase
        .from("persons")
        .select("id, display_name")
        .eq("org_id", args.orgId)
        .in("id", personIds);
    const nameById = new Map(
        ((people ?? []) as Array<{ id: string; display_name: string | null }>).map((p) => [
            p.id,
            (p.display_name ?? "").trim() || "This person",
        ]),
    );

    const { data: instruments } = await supabase
        .from("payment_instruments")
        .select("owner_entity_id")
        .eq("org_id", args.orgId)
        .eq("customer_id", args.customerId)
        .eq("owner_entity_type", "person")
        .eq("reusable", true)
        .eq("status", "active");
    const countByOwner = new Map<string, number>();
    for (const row of (instruments ?? []) as Array<{ owner_entity_id: string | null }>) {
        if (!row.owner_entity_id) continue;
        countByOwner.set(row.owner_entity_id, (countByOwner.get(row.owner_entity_id) ?? 0) + 1);
    }

    const roleByPerson = new Map(
        ((edges ?? []) as Array<{ person_id: string | null; role_key: string | null }>)
            .filter((e) => e.person_id)
            .map((e) => [e.person_id as string, e.role_key ?? null]),
    );

    return personIds
        .filter((id) => nameById.has(id))
        .map((id) => ({
            personId: id,
            name: nameById.get(id) as string,
            roleLabel: roleByPerson.get(id) ?? null,
            reusableInstrumentCount: countByOwner.get(id) ?? 0,
        }));
}

/**
 * An unowned legacy instrument becomes reusable only when somebody CLAIMS it.
 *
 * The claim is explicit and recorded. The alternative — assigning it to the account's primary
 * contact — is the inference the Director forbids, and it would hand one person a card that may
 * never have been theirs.
 */
export async function claimLegacyInstrument(
    supabase: SupabaseClient,
    args: {
        readonly orgId: string;
        readonly instrumentId: string;
        readonly ownerPersonId: string;
        readonly actorUserId?: string | null;
    },
): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> {
    const { data: existing, error } = await supabase
        .from("payment_instruments")
        .select("id, owner_entity_id, rail, verification_state")
        .eq("org_id", args.orgId)
        .eq("id", args.instrumentId)
        .maybeSingle();
    if (error) return { ok: false, reason: error.message };
    const row = existing as { owner_entity_id: string | null; rail: string; verification_state: string | null } | null;
    if (!row) return { ok: false, reason: "No such payment instrument in this organisation." };
    if (row.owner_entity_id) return { ok: false, reason: "This instrument already has an owner." };

    /*
     * A claim cannot make an unverified bank account reusable. The database enforces this too; the
     * check is mirrored so a caller reads a sentence rather than a constraint name.
     */
    const reusable = row.rail !== "us_bank_account" || row.verification_state === "verified";

    const { error: updateError } = await supabase
        .from("payment_instruments")
        .update({
            owner_entity_type: "person",
            owner_entity_id: args.ownerPersonId,
            reusable,
            updated_at: new Date().toISOString(),
            updated_by: args.actorUserId ?? null,
        })
        .eq("org_id", args.orgId)
        .eq("id", args.instrumentId);
    if (updateError) return { ok: false, reason: updateError.message };
    return { ok: true };
}

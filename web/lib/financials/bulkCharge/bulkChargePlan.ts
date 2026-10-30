/**
 * BULK CHARGE — one canonical `charge.add` per account, never a shared obligation (W7-F021).
 *
 * ── WHY THIS IS SAFE AS AN ORCHESTRATION ──
 *
 * The Charges workspace lets an operator apply one charge (a field trip, a materials fee) to many
 * accounts at once. There is no new economic authority here and no batch table. Each selected
 * household gets exactly ONE request to the registered `charge.add` action — the same action, the
 * same payload shape and the same resolver Add Charge on an account uses — and:
 *
 *   · every charge is its own canonical obligation on its own account; nothing spans households;
 *   · within a household, child-grained charge types are billed per child by `charge.add` itself
 *     (`customer_member_ids`), which already writes N independent obligations in one operation;
 *   · idempotency is the database's: `charges_resolution_key_unique` keys every charge by template,
 *     date and billable source, so retrying the bulk — or re-running it after a partial failure —
 *     converges on the same charges rather than creating more. That is the property a client loop
 *     normally lacks, and the reason this loop is allowed;
 *   · posting follows `charge.add`'s own rule (the review boundary and the period gate), so a
 *     charge in a future period stays a draft and posts when its period begins.
 *
 * Preview runs the same action in `preview` mode for every target first. A row the domain refuses
 * (grain, an account it cannot bill, a catalog item that does not apply to a child's site) is shown
 * refused before anything is written, and the operator confirms knowing the count, the total and
 * what is left out.
 *
 * ── WHAT IS CHARGED IS A CATALOG ITEM ──
 *
 * Like Add Charge on an account, Bulk charge offers the organisation's Catalog through the shared
 * `catalogChargeOptions` rule and sends `catalog_product_id`: one-time fees at their configured
 * amount, to their configured account. Nothing here prices anything — the amount is the catalog's.
 */
import { subjectGrainIsLegal } from "@/lib/financials/chargeCategorySemantics";

export const BULK_CHARGE_ACTION_KEY = "charge.add" as const;

export type BulkGrain = "household" | "child";

export type BulkTarget = {
    customerId: string;
    householdName: string;
    /** Children selected in this household. Empty for a household-grained charge. */
    children: ReadonlyArray<{ customerMemberId: string; name: string }>;
};

export type BulkChargeInput = {
    /** The catalog item (`commercial_products.id`) every target is charged. */
    catalogProductId: string;
    category: string;
    grain: BulkGrain;
    /** YYYY-MM-DD — the service date every charge resolves its date chain from. */
    serviceDate: string;
};

/** Can this charge type be billed at this grain? The category decides; the operator never overrides it. */
export function bulkGrainIsLegal(category: string, grain: BulkGrain): boolean {
    return subjectGrainIsLegal(category, grain === "child" ? "child" : null);
}

/** The grains a category permits, child first — which is what most bulk charges are. */
export function legalBulkGrains(category: string): BulkGrain[] {
    return (["child", "household"] as const).filter((g) => bulkGrainIsLegal(category, g));
}

/**
 * THE ONE REQUEST A TARGET RECEIVES — Add Charge's own wire shape.
 *
 * Household grain names the household and no child (`subject_grain: household`); child grain names
 * the household as context and the selected children as the subjects.
 */
export function chargeAddRequest(target: BulkTarget, input: BulkChargeInput, mode: "preview" | "execute") {
    const childIds = target.children.map((c) => c.customerMemberId);
    return {
        action_key: BULK_CHARGE_ACTION_KEY,
        entity_type: "customer",
        entity_id: target.customerId,
        mode,
        ...(mode === "execute" ? { confirmation: { confirmed: true } } : {}),
        payload: {
            customer_id: target.customerId,
            catalog_product_id: input.catalogProductId,
            ...(input.grain === "household"
                ? { subject_grain: "household" }
                : childIds.length === 1
                  ? { customer_member_id: childIds[0], child_label: target.children[0]!.name }
                  : { customer_member_ids: childIds, child_labels: target.children.map((c) => c.name) }),
            event_date: input.serviceDate,
            service_date: input.serviceDate,
        },
    };
}

/** How many obligations a target will receive: one per child, or one for the household. */
export function obligationsFor(target: BulkTarget, grain: BulkGrain): number {
    return grain === "household" ? 1 : target.children.length;
}

export type BulkRowState =
    | { state: "pending" }
    | { state: "previewed"; summary: string; changes: string[] }
    | { state: "refused"; reason: string }
    | { state: "created"; chargeIds: string[]; note: string }
    | { state: "failed"; reason: string };

/**
 * WHAT ONE TARGET'S PREVIEW SAID — read from `charge.add`'s own answer.
 *
 * Refused when the request failed, when eligibility said no, or when the preview itself carries the
 * domain's refusal (`blocked`) — a catalog item that does not apply to this household's site, for
 * example. Only an unrefused preview is `previewed`, and only previewed rows are ever sent.
 */
export function bulkPreviewOutcome(response: {
    ok: boolean;
    error?: string;
    data?: Record<string, unknown>;
}): BulkRowState {
    if (!response.ok) return { state: "refused", reason: response.error ?? "Refused." };
    const result = (response.data?.execution_result ?? {}) as {
        eligibility?: { eligible?: boolean; blockers?: Array<{ message?: string }> };
        preview?: { summary?: string; changes?: string[]; blocked?: { reason?: string } | null };
    };
    if (result.eligibility && result.eligibility.eligible === false) {
        return {
            state: "refused",
            reason: result.eligibility.blockers?.map((b) => b.message).filter(Boolean).join(" ") || "Not eligible.",
        };
    }
    if (result.preview?.blocked) {
        return { state: "refused", reason: result.preview.blocked.reason || result.preview.summary || "Refused." };
    }
    return { state: "previewed", summary: result.preview?.summary ?? "", changes: result.preview?.changes ?? [] };
}

/** A target the plan can never send: the wrong grain, or a child grain with no child chosen. */
export function refusalBeforeSending(target: BulkTarget, input: BulkChargeInput): string | null {
    if (!bulkGrainIsLegal(input.category, input.grain)) {
        return input.grain === "household"
            ? "This charge type is billed per child, not to the household."
            : "This charge type is billed to the household, not per child.";
    }
    if (input.grain === "child" && target.children.length === 0) return "No child selected in this household.";
    return null;
}

/** Run `fn` over `items`, at most `limit` at a time, in order of completion. */
export async function runWithConcurrency<T>(
    items: readonly T[],
    limit: number,
    fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
    let next = 0;
    const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
        while (next < items.length) {
            const i = next++;
            await fn(items[i]!, i);
        }
    });
    await Promise.all(workers);
}

export type BulkTally = { targets: number; obligations: number; refused: number; created: number; failed: number };

export function tallyBulk(
    targets: readonly BulkTarget[],
    grain: BulkGrain,
    states: Readonly<Record<string, BulkRowState>>,
): BulkTally {
    const out: BulkTally = { targets: targets.length, obligations: 0, refused: 0, created: 0, failed: 0 };
    for (const t of targets) {
        const s = states[t.customerId];
        if (s?.state === "refused") out.refused += 1;
        else out.obligations += obligationsFor(t, grain);
        if (s?.state === "created") out.created += 1;
        if (s?.state === "failed") out.failed += 1;
    }
    return out;
}

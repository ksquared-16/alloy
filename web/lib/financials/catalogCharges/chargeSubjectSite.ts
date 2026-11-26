/**
 * WHICH SITE A MANUAL CHARGE IS FOR — one rule for the picker, the preview and the write.
 *
 * ── THE RULE (the command's, unchanged) ──────────────────────────────────────────────────────
 *
 * `charge.add` writes a child's charge against that child's ACTIVE enrollment agreement, or — when
 * none is active — the most recent one, which still owns the child's history (`resolveChargeSubject`).
 * The charge is then FOR the site that agreement attends (`resolveFinancialPolicyScope`). A child with
 * no agreement at all is charged to the household, and a household charge is for no site.
 *
 * ── WHY IT IS HERE ───────────────────────────────────────────────────────────────────────────
 *
 * The card used to judge a location-scoped catalog item against EVERY site on the account — any
 * child's, any agreement's, ended ones included — while the command judged it against the one site
 * the selected child's charge is for. An item could be listed as chargeable and then refused at
 * preview. Both sides now take the agreement from `selectBillableAgreement` and the site from
 * `chargeSiteForAgreements`, so the subject an item is judged for is the subject it is written for.
 *
 * Pure: the caller reads the rows; nothing here touches the database.
 */

/** The `Applies to` value for the household itself — a charge that names no child. */
export const HOUSEHOLD_CHARGE_SUBJECT = "household" as const;

export type BillableAgreementRow = {
    id: string;
    status?: string | null;
    site_location_id?: string | null;
};

/**
 * The agreement a child's charge is written against: the first ACTIVE one, else the first one.
 *
 * `rows` must be that child's agreements NEWEST FIRST, in the order the database returns
 * `order("created_at", { ascending: false })` — the order the command reads them in. Re-sorting here
 * would be a second ordering rule for the same question.
 */
export function selectBillableAgreement<T extends BillableAgreementRow>(rows: readonly T[]): T | null {
    if (rows.length === 0) return null;
    return rows.find((r) => (r.status ?? "").trim() === "active") ?? rows[0]!;
}

/**
 * The site a child's charge is for, given that child's agreements newest first. Null when the child
 * has no agreement (the charge falls back to the household, which attends nowhere) or the agreement
 * names no site.
 */
export function chargeSiteForAgreements(rows: readonly BillableAgreementRow[]): string | null {
    const agreement = selectBillableAgreement(rows);
    return (agreement?.site_location_id ?? "").trim() || null;
}

/**
 * Every child's charge site, from one read of the account's agreements NEWEST FIRST. Each child's
 * rows keep the read's order, so each child's answer is the one the command would reach alone.
 */
export function chargeSitesByChild(
    agreementsNewestFirst: ReadonlyArray<BillableAgreementRow & { customer_member_id?: string | null }>,
    childIds: readonly string[],
): Map<string, string | null> {
    const byChild = new Map<string, BillableAgreementRow[]>();
    for (const row of agreementsNewestFirst) {
        const child = (row.customer_member_id ?? "").trim();
        if (!child) continue;
        const list = byChild.get(child) ?? [];
        list.push(row);
        byChild.set(child, list);
    }
    return new Map(childIds.map((id) => [id, chargeSiteForAgreements(byChild.get(id) ?? [])]));
}

/**
 * WHY THIS ITEM MAY NOT BE CHARGED TO THIS SELECTION, or null when it may.
 *
 * The command refuses a selection when ANY selected subject is refused (the multi-child preview judges
 * every child), so a surface does the same: the item's own verdict first, then each selected subject
 * at its own site. Pure and client-safe — it reads only what the server already judged.
 */
export function catalogChargeRefusalFor(
    option: {
        availability: string;
        unavailableReason: string | null;
        unavailableForSubjects?: Readonly<Record<string, string>>;
    },
    subjects: ReadonlyArray<{ key: string; label?: string | null }>,
): string | null {
    if (option.availability !== "offerable") return option.unavailableReason ?? "Not available here.";
    for (const subject of subjects) {
        const reason = option.unavailableForSubjects?.[subject.key];
        if (reason) return subject.label ? `${subject.label}: ${reason}` : reason;
    }
    return null;
}

/** The subject key of ONE household among many (Bulk charge), distinct from every child's member id. */
export function householdChargeSubjectKey(customerId: string): string {
    return `${HOUSEHOLD_CHARGE_SUBJECT}:${customerId}`;
}

import type { GlobalRecordSearchCluster, GlobalRecordSearchHit } from "@/lib/admin/globalSearch/globalRecordSearchTypes";

/** True when a label is a generic inquiry template — never show in global search UI. */
export function globalSearchLabelIsGenericInquiry(label: string | null | undefined): boolean {
    const raw = String(label ?? "").trim();
    if (!raw) return false;
    const lower = raw.toLowerCase();
    if (lower === "inquiry" || lower === "family inquiry") return true;
    return /family\s*inquir/i.test(raw);
}

/** Short lead token for meta — prefer household surname token. */
export function globalSearchLeadShortLabel(
    opportunityName: string | null | undefined,
    householdName: string | null | undefined
): string | null {
    const household = String(householdName ?? "").trim();
    if (household) {
        const sansSuffix = household.replace(/\s+(household|family)$/i, "").trim();
        if (sansSuffix) return sansSuffix;
    }
    const opp = String(opportunityName ?? "").trim();
    if (!opp || globalSearchLabelIsGenericInquiry(opp)) return household ? household.replace(/\s+(household|family)$/i, "").trim() : null;
    const parts = opp.split(/\s[-–—/]\s/);
    const tail = parts[parts.length - 1]?.trim();
    if (tail && !globalSearchLabelIsGenericInquiry(tail)) return tail;
    return null;
}

/** Lead row primary — stored/configured short name, never generic inquiry boilerplate. */
export function globalSearchLeadPrimaryName(hit: Pick<
    GlobalRecordSearchHit,
    "name" | "lead_short_label" | "household_name" | "opportunity_name"
>): string {
    const short = hit.lead_short_label?.trim();
    if (short && !globalSearchLabelIsGenericInquiry(short)) return short;

    const householdToken = formatGlobalSearchHouseholdContextLabel(hit.household_name)?.replace(
        /\s+(Household|Family)$/i,
        ""
    ).trim();
    if (householdToken) return householdToken;

    const candidates = [hit.name, hit.opportunity_name].map((v) => String(v ?? "").trim()).filter(Boolean);
    for (const c of candidates) {
        if (!globalSearchLabelIsGenericInquiry(c)) return c;
    }

    if (short) return `Lead: ${short}`;
    if (householdToken) return `Lead: ${householdToken}`;
    return "Lead";
}

/** Household label for secondary lines — e.g. Chen Family. */
export function formatGlobalSearchHouseholdContextLabel(householdName: string | null | undefined): string | null {
    const raw = String(householdName ?? "").trim();
    if (!raw) return null;
    if (/\bfamily$/i.test(raw) || /\bhousehold$/i.test(raw)) return raw;
    return raw.replace(/\s+household$/i, " Family");
}

export type GlobalSearchResultPill = {
    kind: "status";
    label: string;
};

/** Status-only pill when meaningful (V1 closeout — type/context via typography). */
export function buildGlobalSearchStatusPill(hit: GlobalRecordSearchHit): GlobalSearchResultPill | null {
    const status = hit.status_label?.trim();
    if (!status) return null;
    return { kind: "status", label: status };
}

/** Primary display line — leads use configured short label, not raw opportunity title. */
export function formatGlobalSearchHitPrimaryName(hit: GlobalRecordSearchHit): string {
    if (hit.group === "leads") return globalSearchLeadPrimaryName(hit);
    return hit.name.trim() || "Record";
}

type SecondaryLineOptions = {
    /** Shared household/location shown in cluster header — omit from row secondary. */
    inCluster?: boolean;
};

/** Secondary typography line: type · age · location (children) or Lead · location (leads). */
export function formatGlobalSearchHitSecondaryLine(
    hit: GlobalRecordSearchHit,
    options: SecondaryLineOptions = {}
): string | null {
    const typeLabel = hit.type_label?.trim();
    const location = hit.location_label?.trim();

    if (hit.group === "leads") {
        if (location) return `Lead · ${location}`;
        return typeLabel ?? "Lead";
    }

    if (hit.group === "children") {
        const parts: string[] = [];
        if (typeLabel) parts.push(typeLabel);
        const age = hit.age_label?.trim();
        if (age) parts.push(age);
        if (!options.inCluster) {
            const household = formatGlobalSearchHouseholdContextLabel(hit.household_name);
            if (household) parts.push(household);
            if (location) parts.push(location);
        }
        return parts.length ? parts.join(" · ") : null;
    }

    if (options.inCluster) {
        return typeLabel ?? null;
    }

    const parts: string[] = [];
    if (typeLabel) parts.push(typeLabel);

    const household = formatGlobalSearchHouseholdContextLabel(hit.household_name);
    if (household) parts.push(household);

    if (location) parts.push(location);

    return parts.length ? parts.join(" · ") : null;
}

/** Non-clickable cluster header context — typography only. */
export function formatGlobalSearchClusterContextLine(
    cluster: Pick<
        GlobalRecordSearchCluster,
        "household_name" | "lead_short_label" | "location_label"
    >
): string | null {
    const parts: string[] = [];
    const household = formatGlobalSearchHouseholdContextLabel(cluster.household_name);
    if (household) parts.push(household);
    const leadShort = cluster.lead_short_label?.trim();
    if (leadShort && !globalSearchLabelIsGenericInquiry(leadShort)) {
        parts.push(`Lead: ${leadShort}`);
    }
    const location = cluster.location_label?.trim();
    if (location) parts.push(location);
    return parts.length ? parts.join(" · ") : null;
}

/** @deprecated Use formatGlobalSearchHitSecondaryLine — kept for tests migrating off pill strings. */
export function buildGlobalSearchResultPills(hit: GlobalRecordSearchHit): GlobalSearchResultPill[] {
    const pill = buildGlobalSearchStatusPill(hit);
    return pill ? [pill] : [];
}

/** @deprecated Cluster context is typography-only in V1 closeout. */
export function buildGlobalSearchClusterContextPills(
    cluster: Pick<
        GlobalRecordSearchCluster,
        "household_name" | "lead_short_label" | "location_label" | "status_label"
    >
): GlobalSearchResultPill[] {
    const status = cluster.status_label?.trim();
    return status ? [{ kind: "status", label: status }] : [];
}

/** @deprecated */
export function buildGlobalSearchMemberPillsInCluster(_hit: GlobalRecordSearchHit): GlobalSearchResultPill[] {
    return [];
}

export function formatGlobalSearchHitMetaLine(hit: GlobalRecordSearchHit): string {
    const secondary = formatGlobalSearchHitSecondaryLine(hit);
    const status = hit.status_label?.trim();
    return [secondary, status].filter(Boolean).join(" · ");
}

/** Guard for tests — no generic inquiry strings in composed presentation output. */
export function globalSearchPresentationLinesForHit(
    hit: GlobalRecordSearchHit,
    inCluster = false
): string[] {
    return [
        formatGlobalSearchHitPrimaryName(hit),
        formatGlobalSearchHitSecondaryLine(hit, { inCluster }) ?? "",
        hit.status_label ?? "",
    ].filter(Boolean);
}

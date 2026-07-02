/**
 * Communications V2 — audience resolution IO loader (Phase 1 / B6 → B8A).
 *
 * READ-ONLY, org-scoped resolution of an Announcement Audience SPEC (grain + filters)
 * into recipient counts and the messageable family-guardian list. Every query is a SELECT
 * scoped by org_id; NO inserts/updates/deletes, NO announcement_recipients writes, NO send,
 * NO provider. B8A replaced fixed buckets with composable filters:
 *   - AND across filters; OR within a filter's value list.
 *   - Child filters (child_enrollment_status, program) apply to the SAME OCM row.
 *   - room is UNRESOLVED by design until a safe option endpoint exists (never faked).
 *   - empty filters = all families.
 * Status filters use concrete operator-selected status_keys (no fixed lifecycle bucket
 * concepts). Recipients are always family guardians, never children.
 */

import { createAdminClient } from "@/lib/supabaseAdmin";
import type { RecipientPerson } from "@/lib/communications/v2/announcementFanout";
import {
    aggregateChannelCounts,
    buildRecipientPreview,
    intersectDistinct,
    unionDistinct,
    type ChannelCounts,
    type PersonContact,
    type RecipientPreview,
    type TargetResolution,
} from "@/lib/communications/v2/audienceResolver";
import {
    resolveTargetsToSpec,
    type AnnouncementAudienceSpec,
    type AudienceFilter,
    type AudiencePreview,
    type FilterResolution,
    type LegacyTargetRow,
} from "@/lib/communications/v2/audienceSpec";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Legacy typed-target input (B7 schedule + B6 preview route). `rule` is optional/back-compat. */
export type ResolveTarget = { target_type: string; target_ref: string | null; rule?: Record<string, unknown> | null };

const FAMILY_CAP = 2000;
const PERSON_CAP = 10000;
const OPP_SCAN_CAP = 5000;

// ---- shared read helpers (all org-scoped, read-only) ----

async function oppIdsToCustomerIds(supabase: AdminClient, orgId: string, oppIds: string[]): Promise<string[]> {
    if (oppIds.length === 0) return [];
    const { data } = await supabase
        .from("opportunities")
        .select("customer_id")
        .eq("org_id", orgId)
        .in("id", oppIds.slice(0, OPP_SCAN_CAP));
    return unionDistinct([(data ?? []).map((r) => String((r as { customer_id: string }).customer_id)).filter(Boolean)]);
}

async function allFamilies(supabase: AdminClient, orgId: string): Promise<string[]> {
    const { data } = await supabase.from("customers").select("id").eq("org_id", orgId).limit(FAMILY_CAP + 1);
    return (data ?? []).map((r) => String((r as { id: string }).id));
}

type FamilyResolution = {
    families: string[];
    matchedChildren: number | null;
    perFilter: FilterResolution[];
    capped: boolean;
    unresolved: boolean;
};

/**
 * Resolve a spec to a deduped family-id set. Child filters combine on the SAME OCM row;
 * family filters combine on the SAME opportunity; the two AND-intersect. Room → unresolved.
 */
async function resolveFamiliesForSpec(
    supabase: AdminClient,
    orgId: string,
    spec: AnnouncementAudienceSpec
): Promise<FamilyResolution> {
    const perFilter: FilterResolution[] = [];
    let capped = false;

    const childFilters = spec.filters.filter(
        (f): f is Extract<AudienceFilter, { kind: "child_enrollment_status" | "program" | "room" }> =>
            f.kind === "child_enrollment_status" || f.kind === "program" || f.kind === "room"
    );
    const familyFilters = spec.filters.filter(
        (f): f is Extract<AudienceFilter, { kind: "family_status" | "location" }> =>
            f.kind === "family_status" || f.kind === "location"
    );

    // ROOM: unresolved by design (no safe option endpoint). Never fake counts.
    if (childFilters.some((f) => f.kind === "room")) {
        for (const f of spec.filters) {
            perFilter.push({
                kind: f.kind,
                status: "unresolved",
                family_count: 0,
                detail:
                    f.kind === "room"
                        ? "room targeting needs a safe option endpoint (program_room_cohort_key scoped by location+program) — not available yet; counts are not faked"
                        : "not evaluated — audience includes an unresolved room filter",
            });
        }
        return { families: [], matchedChildren: null, perFilter, capped, unresolved: true };
    }

    try {
        // CHILD filters → same OCM row.
        let childCustomerIds: string[] | null = null;
        let matchedChildren: number | null = null;
        if (childFilters.length > 0) {
            let q = supabase.from("opportunity_customer_members").select("opportunity_id").eq("org_id", orgId);
            for (const f of childFilters) {
                if (f.kind === "child_enrollment_status") q = q.in("outcome_status_key", f.status_keys);
                else if (f.kind === "program") q = q.in("program_category_id", f.program_category_ids);
            }
            const { data: ocm, error } = await q.limit(OPP_SCAN_CAP * 2);
            if (error) {
                for (const f of childFilters) perFilter.push({ kind: f.kind, status: "unresolved", family_count: 0, detail: `query error: ${error.message}` });
                return { families: [], matchedChildren: null, perFilter, capped, unresolved: true };
            }
            const rows = ocm ?? [];
            matchedChildren = rows.length;
            if (rows.length >= OPP_SCAN_CAP * 2) capped = true;
            const oppIds = unionDistinct([rows.map((r) => String((r as { opportunity_id: string }).opportunity_id)).filter(Boolean)]);
            if (oppIds.length > OPP_SCAN_CAP) capped = true;
            childCustomerIds = await oppIdsToCustomerIds(supabase, orgId, oppIds);
            for (const f of childFilters) perFilter.push({ kind: f.kind, status: "resolved", family_count: childCustomerIds.length, detail: "child enrollment match (same OCM row)" });
        }

        // FAMILY filters → opportunities (location defaults to opportunities.location_id;
        // OCM-location fallback for child grain is a documented refinement, not implemented here).
        let familyCustomerIds: string[] | null = null;
        if (familyFilters.length > 0) {
            let q = supabase.from("opportunities").select("customer_id").eq("org_id", orgId);
            for (const f of familyFilters) {
                if (f.kind === "family_status") q = q.in("status_key", f.status_keys);
                else if (f.kind === "location") q = q.in("location_id", f.location_ids);
            }
            const { data: opps, error } = await q.limit(OPP_SCAN_CAP);
            if (error) {
                for (const f of familyFilters) perFilter.push({ kind: f.kind, status: "unresolved", family_count: 0, detail: `query error: ${error.message}` });
                return { families: [], matchedChildren, perFilter, capped, unresolved: true };
            }
            const rows = opps ?? [];
            if (rows.length >= OPP_SCAN_CAP) capped = true;
            familyCustomerIds = unionDistinct([rows.map((r) => String((r as { customer_id: string }).customer_id)).filter(Boolean)]);
            for (const f of familyFilters) perFilter.push({ kind: f.kind, status: "resolved", family_count: familyCustomerIds.length, detail: "family/case match" });
        }

        let families: string[];
        if (childCustomerIds && familyCustomerIds) families = intersectDistinct(childCustomerIds, familyCustomerIds);
        else if (childCustomerIds) families = childCustomerIds;
        else if (familyCustomerIds) families = familyCustomerIds;
        else {
            // Empty filters = all families.
            const all = await allFamilies(supabase, orgId);
            if (all.length > FAMILY_CAP) capped = true;
            families = all;
        }
        return { families: families.slice(0, FAMILY_CAP), matchedChildren, perFilter, capped, unresolved: false };
    } catch (e) {
        perFilter.push({ kind: "family_status", status: "unresolved", family_count: 0, detail: e instanceof Error ? e.message : "resolution error" });
        return { families: [], matchedChildren: null, perFilter, capped, unresolved: true };
    }
}

// ---- people (messageable family guardians) ----

type FamilyChannelData = {
    persons: RecipientPerson[];
    channelCounts: ChannelCounts | null;
    optedOut: number;
    sampleFamilies: string[];
    capped: boolean;
};

async function loadFamilyChannelData(supabase: AdminClient, orgId: string, families: string[]): Promise<FamilyChannelData> {
    if (families.length === 0) {
        return { persons: [], channelCounts: { email: 0, sms: 0, in_app: 0, messageable: 0 }, optedOut: 0, sampleFamilies: [], capped: false };
    }
    let capped = false;
    try {
        const { data: custRows } = await supabase.from("customers").select("id, name").eq("org_id", orgId).in("id", families.slice(0, 5));
        const sampleFamilies = (custRows ?? []).map((r) => String((r as { name?: string | null }).name ?? "")).filter(Boolean);

        const { data: cpRows } = await supabase.from("customer_persons").select("person_id").eq("org_id", orgId).in("customer_id", families);
        const personIds = unionDistinct([(cpRows ?? []).map((r) => String((r as { person_id: string }).person_id)).filter(Boolean)]);
        const personIdsCapped = personIds.slice(0, PERSON_CAP);
        if (personIdsCapped.length < personIds.length) capped = true;
        if (personIdsCapped.length === 0) {
            return { persons: [], channelCounts: { email: 0, sms: 0, in_app: 0, messageable: 0 }, optedOut: 0, sampleFamilies, capped };
        }

        const { data: personRows } = await supabase.from("persons").select("id, email, phone, archived_at").eq("org_id", orgId).in("id", personIdsCapped);
        const { data: prefRows } = await supabase
            .from("communication_preferences")
            .select("person_id")
            .eq("org_id", orgId)
            .eq("category", "announcements")
            .eq("state", "opted_out")
            .in("person_id", personIdsCapped);
        const optedOutSet = new Set((prefRows ?? []).map((r) => String((r as { person_id: string }).person_id)));

        const contacts: PersonContact[] = [];
        const persons: RecipientPerson[] = [];
        const seen = new Set<string>();
        for (const p of personRows ?? []) {
            const row = p as { id: string; email?: string | null; phone?: string | null; archived_at?: string | null };
            const id = String(row.id);
            if (seen.has(id)) continue;
            seen.add(id);
            const email = row.email ?? null;
            const phone = row.phone ?? null;
            const archived = row.archived_at != null;
            contacts.push({ id, email, phone, archived });
            if (!archived && ((email && email.trim()) || (phone && phone.trim()))) {
                persons.push({ person_id: id, email, phone, opted_out: optedOutSet.has(id) });
            }
        }
        return { persons, channelCounts: aggregateChannelCounts(contacts), optedOut: optedOutSet.size, sampleFamilies, capped };
    } catch {
        return { persons: [], channelCounts: null, optedOut: 0, sampleFamilies: [], capped };
    }
}

// ---- public spec API ----

/** Resolve an audience spec into a read-only recipient-count preview. */
export async function resolveAudienceSpec(
    supabase: AdminClient,
    orgId: string,
    spec: AnnouncementAudienceSpec
): Promise<AudiencePreview> {
    const fam = await resolveFamiliesForSpec(supabase, orgId, spec);
    const data = await loadFamilyChannelData(supabase, orgId, fam.families);
    return {
        grain: spec.grain,
        total_families: fam.families.length,
        matched_children: fam.matchedChildren,
        per_filter: fam.perFilter,
        counts_by_channel: data.channelCounts,
        excluded: { opted_out: data.optedOut },
        unresolved: fam.perFilter.filter((p) => p.status === "unresolved"),
        sample_recipients: data.sampleFamilies.slice(0, 5).map((family) => ({ family })),
        capped: fam.capped || data.capped,
    };
}

export type RecipientListResultForSpec = {
    persons: RecipientPerson[];
    grain: AnnouncementAudienceSpec["grain"];
    perFilter: FilterResolution[];
    capped: boolean;
};

/** Resolve an audience spec into the messageable family-guardian list (for fan-out). */
export async function listAnnouncementRecipientPersonsForSpec(
    supabase: AdminClient,
    orgId: string,
    spec: AnnouncementAudienceSpec
): Promise<RecipientListResultForSpec> {
    const fam = await resolveFamiliesForSpec(supabase, orgId, spec);
    const data = await loadFamilyChannelData(supabase, orgId, fam.families);
    return { persons: data.persons, grain: spec.grain, perFilter: fam.perFilter, capped: fam.capped || data.capped };
}

// ---- legacy back-compat (recipient-preview route + B7 schedule path compile unchanged) ----

function perFilterToTargets(perFilter: FilterResolution[]): TargetResolution[] {
    return perFilter.map((f) => ({ target_type: f.kind, target_ref: null, status: f.status, family_count: f.family_count, detail: f.detail }));
}

export type RecipientListResult = { persons: RecipientPerson[]; perTarget: TargetResolution[]; capped: boolean };

function unresolvedTargets(detail: string): TargetResolution[] {
    return [{ target_type: "audience", target_ref: null, status: "unresolved", family_count: 0, detail }];
}

/**
 * Resolve targets (legacy typed and/or a custom spec row) into the legacy preview shape.
 * STRICT (B8B): a custom row missing a valid rule.audience_spec resolves UNRESOLVED — it
 * never broadens to all families.
 */
export async function resolveAnnouncementAudience(
    supabase: AdminClient,
    orgId: string,
    targets: ResolveTarget[]
): Promise<RecipientPreview> {
    const r = resolveTargetsToSpec(targets as LegacyTargetRow[]);
    if (!r.ok) {
        return buildRecipientPreview({
            perTarget: unresolvedTargets(r.error),
            totalFamilies: 0,
            channelCounts: null,
            optedOut: 0,
            sampleFamilies: [],
            capped: false,
        });
    }
    const preview = await resolveAudienceSpec(supabase, orgId, r.spec);
    return buildRecipientPreview({
        perTarget: perFilterToTargets(preview.per_filter),
        totalFamilies: preview.total_families,
        channelCounts: preview.counts_by_channel,
        optedOut: preview.excluded.opted_out,
        sampleFamilies: preview.sample_recipients.map((s) => s.family),
        capped: preview.capped,
    });
}

/**
 * Resolve targets into the messageable person list (B7 fan-out). STRICT (B8B): a custom
 * row missing a valid rule.audience_spec yields NO persons (never all families).
 */
export async function listAnnouncementRecipientPersons(
    supabase: AdminClient,
    orgId: string,
    targets: ResolveTarget[]
): Promise<RecipientListResult> {
    const r = resolveTargetsToSpec(targets as LegacyTargetRow[]);
    if (!r.ok) return { persons: [], perTarget: unresolvedTargets(r.error), capped: false };
    const res = await listAnnouncementRecipientPersonsForSpec(supabase, orgId, r.spec);
    return { persons: res.persons, perTarget: perFilterToTargets(res.perFilter), capped: res.capped };
}

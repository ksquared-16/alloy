import "server-only";

/**
 * SUBJECT CONTEXTS FOR ONE SUBJECT — the durable record host's reader.
 *
 * Search batches these reads across a candidate set because its query count must stay constant
 * regardless of how many people matched. A record host has exactly one subject and must not pay for
 * a batch of one, so it reads narrowly here.
 *
 * WHAT THE TWO PATHS SHARE IS THE JUDGEMENT, NOT THE FETCH. Every context this returns is built by
 * `lib/context/buildSubjectContexts` — the same pure functions `searchEnrichment` calls with its
 * batched rows. That is the whole point of the split: two fetch strategies, one authority. If this
 * module ever decided a context for itself, the platform would hold two answers about who is in what
 * and neither would report an error.
 *
 * ── EMPLOYMENT IS READ HERE, AND ONLY HERE ──
 *
 * Search does not read employment (it never needed to), so the person path adds one canonical call
 * to `lib/employment`. It is still not a second authority: the composition is produced by
 * `buildPersonEmploymentComposition` and carried verbatim, exactly as the case projection carries it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { opportunityIdsForEnrollmentContexts } from "@/lib/enrollment/completion/resolveEnrollmentJourneyContext";

import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import {
    LOCATION_DISPLAY_LABEL_SELECT,
    locationDisplayLabelFromRow,
    type LocationDisplayLabelRow,
} from "@/lib/admin/locationDisplayLabel";
import {
    buildSubjectEmploymentContext,
    buildSubjectHouseholdContext,
    buildSubjectIdentityContext,
    buildSubjectProcessContexts,
    buildSubjectScheduleContext,
    type SubjectProcessRow,
    type SubjectScheduleRow,
} from "@/lib/context/buildSubjectContexts";
import type { SubjectContext } from "@/lib/context/subjectContextTypes";
import { buildPersonEmploymentComposition } from "@/lib/employment/buildPersonEmploymentComposition";
import { loadFamilyMembershipRows } from "@/lib/search/searchFamilyMembershipRows";
import { loadSearchProcessConfiguration } from "@/lib/search/searchProcessConfiguration";
import {
    fetchHostWorkUnitKeys,
    fetchStageWorkViewTargets,
} from "@/lib/workUnits/hostWorkUnitResolver";

/** Statuses that represent a schedule an operator cares about now. Mirrors Search exactly. */
const LIVE_SCHEDULE_STATUSES = ["planned", "active", "ending"];

export type LoadSubjectContextsInput = {
    supabase: SupabaseClient;
    orgId: string;
    dimensions: AdminAccessScopeDimensions;
    subject: {
        /** `child` = a `customer_members` row; `person` = a `persons` row. */
        grain: "child" | "person";
        /** `customer_members.id` for a child, `persons.id` for a person. */
        id: string;
        /** A child's linked person, when it has one. `customer_members.person_id` is NULLABLE. */
        personId?: string | null;
    };
};

export async function loadSubjectContexts(
    input: LoadSubjectContextsInput,
): Promise<SubjectContext[]> {
    const { supabase, orgId, subject } = input;
    const subjectId = subject.id.trim();
    if (!subjectId) return [];

    const personId = (subject.personId ?? "").trim() || null;
    // A child's participations may be keyed on the member row OR on its person. Both are read; the
    // builder de-duplicates by process so a child keyed both ways is still in one process once.
    const subjectKeys = [...new Set([subjectId, personId].filter((v): v is string => Boolean(v)))];

    const [processConfig, processRows, scheduleRow] = await Promise.all([
        loadSearchProcessConfiguration(supabase, orgId, input.dimensions),
        fetchProcessInstances(supabase, orgId, subjectKeys),
        // The SAME table for both grains. `schedule_assignments` was deliberately extended in place
        // rather than forked so children and staff would not acquire competing scheduling engines;
        // reading it per grain here honours that rather than working around it.
        fetchLiveSchedule(supabase, orgId, subject.grain, subjectId),
    ]);


    /*
     * Each journey's Opportunity, resolved once.
     *
     * These reads used to filter on `context_type === "opportunity"` and take the context id as the
     * Opportunity. The guard was correct and the consequence was still wrong: a journey anchored to
     * its Enrollment Participation matched neither branch, so it silently lost its Work View and its
     * family-grain enrichment — the row still rendered, just with less on it, which is why nothing
     * ever surfaced as an error.
     */
    const opportunityIdByContextId = await opportunityIdsForEnrollmentContexts(supabase, orgId, processRows);

    const opportunityIds = [
        ...new Set(
            processRows
                .map((r) => opportunityIdByContextId.get((r.context_id ?? "").trim()) ?? "")
                .filter(Boolean),
        ),
    ];

    const stageWorkViewInputs = processRows
        .map((r) => ({
            opportunityId: opportunityIdByContextId.get((r.context_id ?? "").trim()) ?? "",
            stageKey: (r.stage_key ?? "").trim(),
        }))
        .filter((e) => e.opportunityId && e.stageKey);

    // Family-grain predicates read facts the queue attaches (`has_active_tour`, the tour wall date),
    // not raw columns — so a family subject needs the materialized row or its membership evaluates
    // to "not a member" for a family that plainly is one. A child needs nothing but its own stage,
    // so this is skipped entirely on the child path.
    const needsFamilyRows = subject.grain === "person" && opportunityIds.length > 0;

    const [hostWorkUnitKeys, stageWorkViewTargets, familyMembershipRows, employment] =
        await Promise.all([
            opportunityIds.length
                ? fetchHostWorkUnitKeys(supabase, orgId, opportunityIds)
                : Promise.resolve(new Map<string, string>()),
            stageWorkViewInputs.length
                ? fetchStageWorkViewTargets(supabase, orgId, stageWorkViewInputs)
                : Promise.resolve(new Map<string, string>()),
            needsFamilyRows
                ? loadFamilyMembershipRows({ supabase, orgId, opportunityIds })
                : Promise.resolve(new Map<string, Record<string, unknown>>()),
            // Employment is a PERSON standing. A child's linked person is not read for it: a child
            // does not work here, and asking would eventually answer yes for a person row shared
            // with an adult.
            subject.grain === "person"
                ? buildPersonEmploymentComposition(supabase, orgId, subjectId).catch(() => null)
                : Promise.resolve(null),
        ]);

    const processBySubject = new Map<string, SubjectProcessRow[]>();
    for (const row of processRows) {
        const list = processBySubject.get(row.subject_id) ?? [];
        list.push(row);
        processBySubject.set(row.subject_id, list);
    }

    const { contexts, locationId } = buildSubjectProcessContexts({
        grain: subject.grain === "child" ? "child" : "family",
        subjectKeys,
        processBySubject,
        processConfig,
        hostWorkUnitKeys,
        stageWorkViewTargets,
        familyMembershipRows,
        locationId: null,
    });

    const scheduleLocationId = scheduleRow?.site_location_id ?? locationId ?? null;
    const schedule = buildSubjectScheduleContext(
        scheduleRow,
        scheduleLocationId ? await locationLabel(supabase, orgId, scheduleLocationId) : null,
    );
    if (schedule) contexts.push(schedule);

    const employmentContext = buildSubjectEmploymentContext(employment, subjectId);
    if (employmentContext) contexts.push(employmentContext);

    /*
     * THE RECORD ITSELF, AND ITS FAMILY.
     *
     * Both are emitted HERE rather than assembled by whichever host happens to need them, for the
     * reason this module's own docblock gives: two fetch strategies, one authority. A host that
     * synthesized "Child" and "Household" in its UI would be a second answer to "what is going on
     * with this subject" — and the two would drift with nothing reporting an error.
     *
     * Search does not currently offer either, and that is a placement decision, not a different
     * truth: it reads the same producer and may simply rank them out. What it must never do is
     * disagree about whether Lennon HAS a household.
     */
    const identity = buildSubjectIdentityContext(
        subject.grain === "child" ? "child" : "person",
        "Child",
    );
    if (identity) contexts.push(identity);

    if (subject.grain === "child") {
        const household = await fetchChildHousehold(supabase, orgId, subjectId);
        const householdContext = buildSubjectHouseholdContext(household?.id, household?.name);
        if (householdContext) contexts.push(householdContext);
    }

    return contexts;
}

/**
 * The child's household — one narrow read, in keeping with this module's single-subject contract.
 *
 * `customer_members.customer_id` IS the durable household's id, so this needs no case and no join
 * beyond the family's own name. The column is NULLABLE: a child with no family is a real state, and
 * the builder turns that into no option rather than an option that opens nothing.
 */
async function fetchChildHousehold(
    supabase: SupabaseClient,
    orgId: string,
    memberId: string,
): Promise<{ id: string; name: string | null } | null> {
    const { data, error } = await supabase
        .from("customer_members")
        .select("customer_id, customers(name)")
        .eq("org_id", orgId)
        .eq("id", memberId)
        .maybeSingle();
    if (error || !data) return null;
    const row = data as { customer_id?: string | null; customers?: { name?: string | null } | null };
    const id = (row.customer_id ?? "").trim();
    if (!id) return null;
    return { id, name: row.customers?.name ?? null };
}

// ---------------------------------------------------------------------------
// Narrow readers — one subject, never a batch.
// ---------------------------------------------------------------------------

async function fetchProcessInstances(
    supabase: SupabaseClient,
    orgId: string,
    subjectIds: readonly string[],
): Promise<SubjectProcessRow[]> {
    if (!subjectIds.length) return [];
    const { data, error } = await supabase
        .from("process_instances")
        .select("id, subject_id, process_key, stage_key, state, context_type, context_id, metadata")
        .eq("org_id", orgId)
        .in("subject_id", subjectIds as string[]);
    if (error) throw new Error(error.message);

    return ((data ?? []) as Array<{
        id: string;
        subject_id: string;
        process_key: string;
        stage_key?: string | null;
        state?: string | null;
        context_type?: string | null;
        context_id?: string | null;
        metadata?: Record<string, unknown> | null;
    }>).map((row) => ({
        id: String(row.id),
        subject_id: String(row.subject_id),
        process_key: String(row.process_key ?? "").trim(),
        stage_key: row.stage_key ?? null,
        state: row.state ?? null,
        context_type: row.context_type ?? null,
        context_id: row.context_id ?? null,
        location_id:
            row.metadata && typeof row.metadata.location_id === "string"
                ? String(row.metadata.location_id)
                : null,
    }));
}

/**
 * The subject's live recurring assignment.
 *
 * A child is keyed on `customer_member_id`; a staff member on `subject_person_id` with
 * `subject_type = 'staff'`. Both are rows in the same table for the same reason the write service
 * gives: one scheduling engine, extended in place.
 *
 * The staff filter carries `subject_type` explicitly rather than relying on `subject_person_id`
 * being null for children — a child WITH a linked person would otherwise match a staff query.
 */
async function fetchLiveSchedule(
    supabase: SupabaseClient,
    orgId: string,
    grain: "child" | "person",
    subjectId: string,
): Promise<SubjectScheduleRow | null> {
    const base = supabase
        .from("schedule_assignments")
        .select("customer_member_id, start_date, status, schedule_patterns(label, site_location_id)")
        .eq("org_id", orgId);
    const scoped =
        grain === "child"
            ? base.eq("customer_member_id", subjectId)
            : base.eq("subject_type", "staff").eq("subject_person_id", subjectId);

    const { data, error } = await scoped
        .in("status", LIVE_SCHEDULE_STATUSES)
        .order("start_date", { ascending: false })
        .limit(1);
    if (error) throw new Error(error.message);

    const row = ((data ?? []) as Array<{
        schedule_patterns?: { label?: string | null; site_location_id?: string | null } | null;
    }>)[0];
    const label = (row?.schedule_patterns?.label ?? "").trim();
    if (!label) return null;
    return {
        pattern_label: label,
        site_location_id: row?.schedule_patterns?.site_location_id
            ? String(row.schedule_patterns.site_location_id)
            : null,
    };
}

/**
 * The configured display label for one location.
 *
 * `locations` has NO `name` column — the label is `label`, then address parts — so this delegates to
 * the canonical helper rather than selecting a column that does not exist and quietly answering
 * null. `org_id` is on the filter because this runs on the service-role client, which bypasses RLS.
 */
async function locationLabel(
    supabase: SupabaseClient,
    orgId: string,
    locationId: string,
): Promise<string | null> {
    const { data } = await supabase
        .from("locations")
        .select(LOCATION_DISPLAY_LABEL_SELECT)
        .eq("org_id", orgId)
        .eq("id", locationId)
        .limit(1);
    return locationDisplayLabelFromRow(
        ((data ?? []) as LocationDisplayLabelRow[])[0] ?? null,
    );
}

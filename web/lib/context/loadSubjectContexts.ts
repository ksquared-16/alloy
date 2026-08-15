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

import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import {
    LOCATION_DISPLAY_LABEL_SELECT,
    locationDisplayLabelFromRow,
    type LocationDisplayLabelRow,
} from "@/lib/admin/locationDisplayLabel";
import {
    buildSubjectEmploymentContext,
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
        subject.grain === "child"
            ? fetchLiveSchedule(supabase, orgId, subjectId)
            : Promise.resolve(null),
    ]);

    const opportunityIds = [
        ...new Set(
            processRows
                .filter((r) => (r.context_type ?? "").trim() === "opportunity")
                .map((r) => (r.context_id ?? "").trim())
                .filter(Boolean),
        ),
    ];

    const stageWorkViewInputs = processRows
        .filter((r) => (r.context_type ?? "").trim() === "opportunity")
        .map((r) => ({ opportunityId: (r.context_id ?? "").trim(), stageKey: (r.stage_key ?? "").trim() }))
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

    return contexts;
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

async function fetchLiveSchedule(
    supabase: SupabaseClient,
    orgId: string,
    customerMemberId: string,
): Promise<SubjectScheduleRow | null> {
    const { data, error } = await supabase
        .from("schedule_assignments")
        .select("customer_member_id, start_date, status, schedule_patterns(label, site_location_id)")
        .eq("org_id", orgId)
        .eq("customer_member_id", customerMemberId)
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

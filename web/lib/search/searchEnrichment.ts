/**
 * Alloy Search Platform V2 — context enrichment.
 *
 * Answers: **what relationships, process participation, and operational context
 * make this result recognisable and useful?**
 *
 * Two laws shape this module.
 *
 * 1. NO N+1. Every lookup is batched by id set. The number of queries is constant
 *    (seven) no matter how many candidates matched. Search V1 issued per-batch
 *    follow-ups plus a second full resolution pass, and read `persons` twice for
 *    the same id set.
 *
 * 2. GRAIN IS PRESERVED. Schedule truth is keyed on `customer_members.id`, so a
 *    household-name query yields each child's own schedule. It is never rolled up
 *    to one misleading household-level answer.
 *
 * Enrichment READS canonical truth. It never writes, and what it returns is a
 * preview — see `SEARCH_RESULT_DOCTRINE`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { globalSearchAgeLabelFromDob } from "@/lib/admin/globalSearch/globalRecordSearchAgeLabel";
import {
    fetchHostWorkUnitKeys,
    fetchHouseholdCaseHosts,
    fetchStageWorkViewTargets,
    stageWorkViewCacheKey,
} from "@/lib/workUnits/hostWorkUnitResolver";
import { resolveOperationalMemberships } from "@/lib/search/searchOperationalMemberships";
import { loadFamilyMembershipRows } from "@/lib/search/searchFamilyMembershipRows";
import {
    LOCATION_DISPLAY_LABEL_SELECT,
    locationDisplayLabelFromRow,
    type LocationDisplayLabelRow,
} from "@/lib/admin/locationDisplayLabel";
import { searchLocationAllowed, type SearchAccessEnvelope } from "@/lib/search/searchAccessEnvelope";
import type { SearchContext, SearchRecognition } from "@/lib/search/searchContracts";
import {
    resolveProcessDetail,
    type SearchProcessConfiguration,
} from "@/lib/search/searchProcessConfiguration";
import type { SearchCandidate } from "@/lib/search/searchRetrieval";

/** Schedule assignment statuses that represent a schedule an operator cares about now. */
const LIVE_SCHEDULE_STATUSES = ["planned", "active", "ending"];

export type SearchEnrichment = {
    recognition: SearchRecognition;
    contexts: SearchContext[];
    /** Resolved location for the site-scope backstop. */
    location_id: string | null;
    /**
     * Household resolved during enrichment. For a PERSON this comes from the
     * `customer_persons` edge and is not known at retrieval time, so the subject's
     * household destination depends on this value.
     */
    household_id: string | null;
    /**
     * The household's operational case + the Work Unit holding it. Only children participate in a
     * process, so this is the ONLY way a parent or a household resolves a Work Unit to be worked in.
     */
    household_case_entity_id: string | null;
    household_case_work_unit_key: string | null;
};

export type SearchEnrichmentResult = Map<string, SearchEnrichment>;

export function candidateKey(c: Pick<SearchCandidate, "kind" | "id">): string {
    return `${c.kind}:${c.id}`;
}

function uniq(values: Array<string | null | undefined>): string[] {
    return [...new Set(values.map((v) => (v == null ? "" : String(v).trim())).filter(Boolean))];
}

/**
 * Resolve every context layer for a candidate set.
 *
 * `processConfig` is the tenant's configuration; process labels and stage labels
 * come from it and from nowhere else.
 */
export async function enrichSearchCandidates(args: {
    supabase: SupabaseClient;
    orgId: string;
    envelope: SearchAccessEnvelope;
    processConfig: SearchProcessConfiguration;
    candidates: SearchCandidate[];
}): Promise<SearchEnrichmentResult> {
    const { supabase, orgId, envelope, processConfig, candidates } = args;
    const out: SearchEnrichmentResult = new Map();
    if (!candidates.length) return out;

    const childIds = uniq(candidates.filter((c) => c.kind === "child").map((c) => c.id));
    const personIds = uniq(candidates.filter((c) => c.kind === "person").map((c) => c.id));
    const childPersonIds = uniq(candidates.filter((c) => c.kind === "child").map((c) => c.person_id));

    // Wave 1 — a PERSON candidate carries no household on the row; its household
    // membership is the `customer_persons` edge. Household names, siblings, and the
    // household destination all depend on it, so it must resolve before the rest.
    //
    // Skipped entirely when nothing matched a person, which removes a sequential
    // round trip from the common child-only query.
    const customerPersonRows = personIds.length
        ? await fetchCustomerPersons(supabase, orgId, personIds)
        : [];

    const householdIds = uniq([
        ...candidates.map((c) => c.household_id),
        ...customerPersonRows.map((r) => r.customer_id),
    ]);

    // Process participation is keyed on the SUBJECT — children by member id,
    // persons by person id. One query covers both.
    const processSubjectIds = uniq([...childIds, ...personIds, ...childPersonIds]);

    // Wave 2 — everything else, in parallel.
    //
    // Location labels join this wave rather than waiting for it. Their id set is
    // only known after the rows above land, but an org's location table is small,
    // so reading it wholesale removes an entire sequential round trip from the
    // critical path. `fetchOrgLocationLabels` reports whether it hit its cap.
    const [processRows, scheduleRows, householdRows, siblingRows, dobRows, orgLocations] =
        await Promise.all([
            fetchProcessInstances(supabase, orgId, processSubjectIds),
            fetchScheduleAssignments(supabase, orgId, childIds),
            fetchHouseholds(supabase, orgId, householdIds),
            fetchSiblings(supabase, orgId, householdIds),
            fetchPersonDobs(supabase, orgId, childPersonIds),
            fetchOrgLocationLabels(supabase, orgId),
        ]);

    // Wave 3 — the Work Unit that HOSTS each process context. Its id set is only
    // known once the process rows land, so this is the one genuinely sequential hop;
    // it is skipped entirely when nothing matched a process participation.
    const hostOpportunityIds = uniq(
        processRows
            .filter((r) => (r.context_type ?? "").trim() === "opportunity")
            .map((r) => r.context_id)
    );
    // …and the household's own case, for the subjects that have no process of their own. Runs
    // alongside, not after: its id set (households) was known in wave 1.
    // …and the configured Work View that holds each PARTICIPATION's own stage. Same wave: its inputs
    // (case id + stage key) are on the process rows already in hand, and it must not serialize behind
    // the family answer it is allowed to override.
    const stageWorkViewInputs = processRows
        .filter((r) => (r.context_type ?? "").trim() === "opportunity")
        .map((r) => ({ opportunityId: (r.context_id ?? "").trim(), stageKey: (r.stage_key ?? "").trim() }))
        .filter((e) => e.opportunityId && e.stageKey);

    // …and the materialized rows a FAMILY-grain membership must be evaluated against. Family lens
    // predicates read facts the queue attaches (`has_active_tour`, the tour wall date), not columns,
    // so a raw row would answer "not a member" for a family that plainly is one.
    //
    // Paid ONLY when a family-grain subject is actually in the results: a child's membership needs
    // nothing but its own stage, so the common child-only query adds no round trips at all.
    const familyGrainSubjectIds = new Set(
        candidates
            .filter((c) => c.kind !== "child")
            .flatMap((c) => [c.id, c.person_id])
            .filter((id): id is string => Boolean(id)),
    );
    const familyMembershipOpportunityIds = uniq(
        processRows
            .filter(
                (r) =>
                    familyGrainSubjectIds.has(r.subject_id) &&
                    (r.context_type ?? "").trim() === "opportunity",
            )
            .map((r) => r.context_id),
    );

    const [hostWorkUnitKeys, householdCases, stageWorkViewTargets, familyMembershipRows] = await Promise.all([
        hostOpportunityIds.length
            ? fetchHostWorkUnitKeys(supabase, orgId, hostOpportunityIds)
            : Promise.resolve(new Map<string, string>()),
        householdIds.length
            ? fetchHouseholdCaseHosts(supabase, orgId, householdIds)
            : Promise.resolve(new Map<string, { opportunityId: string; workUnitKey: string | null }>()),
        stageWorkViewInputs.length
            ? fetchStageWorkViewTargets(supabase, orgId, stageWorkViewInputs)
            : Promise.resolve(new Map<string, string>()),
        familyMembershipOpportunityIds.length
            ? loadFamilyMembershipRows({
                  supabase,
                  orgId,
                  opportunityIds: familyMembershipOpportunityIds,
              })
            : Promise.resolve(new Map<string, Record<string, unknown>>()),
    ]);

    const locationIds = uniq([
        ...processRows.map((r) => r.location_id),
        ...scheduleRows.map((r) => r.site_location_id),
        ...candidates.map((c) => c.location_id),
    ]);

    // Correctness fallback: only if the wholesale read was capped AND a needed id
    // is genuinely missing do we pay for a targeted follow-up. Zero extra hops in
    // the normal case; never a silently missing label.
    const locationLabels = orgLocations.labels;
    if (orgLocations.capped) {
        const missing = locationIds.filter((id) => !locationLabels.has(id));
        if (missing.length) {
            for (const [id, label] of await fetchLocationLabels(supabase, orgId, missing)) {
                locationLabels.set(id, label);
            }
        }
    }

    // --- index the batched rows -------------------------------------------------
    const processBySubject = new Map<string, typeof processRows>();
    for (const row of processRows) {
        const list = processBySubject.get(row.subject_id) ?? [];
        list.push(row);
        processBySubject.set(row.subject_id, list);
    }

    const scheduleByChild = new Map<string, (typeof scheduleRows)[number]>();
    for (const row of scheduleRows) {
        // Highest-precedence live assignment wins; rows arrive ordered.
        if (!scheduleByChild.has(row.customer_member_id)) scheduleByChild.set(row.customer_member_id, row);
    }

    const householdNameById = new Map(householdRows.map((r) => [r.id, r.name]));
    const dobByPersonId = new Map(dobRows.map((r) => [r.id, r.date_of_birth]));

    const cpByPerson = new Map<string, typeof customerPersonRows>();
    for (const row of customerPersonRows) {
        const list = cpByPerson.get(row.person_id) ?? [];
        list.push(row);
        cpByPerson.set(row.person_id, list);
    }

    const siblingsByHousehold = new Map<string, typeof siblingRows>();
    for (const row of siblingRows) {
        const list = siblingsByHousehold.get(row.customer_id) ?? [];
        list.push(row);
        siblingsByHousehold.set(row.customer_id, list);
    }

    // --- build enrichment per candidate ----------------------------------------
    for (const c of candidates) {
        const contexts: SearchContext[] = [];
        let locationId: string | null = c.location_id ?? null;
        // A person's household comes from the customer_persons edge; every other
        // subject kind already carries it.
        const resolvedHouseholdId =
            c.household_id ?? (c.kind === "person" ? cpByPerson.get(c.id)?.[0]?.customer_id ?? null : null);

        // Process participation — one context per participation, never a subject.
        const subjectKeys = uniq([c.id, c.person_id]);
        const seenProcessKeys = new Set<string>();
        for (const sk of subjectKeys) {
            for (const row of processBySubject.get(sk) ?? []) {
                const configured = processConfig.byKey.get(row.process_key);
                // Configuration can only REMOVE a process from view, never add one.
                if (configured && !configured.operator_has_access) continue;
                if (seenProcessKeys.has(row.process_key)) continue;
                seenProcessKeys.add(row.process_key);

                if (!locationId && row.location_id) locationId = row.location_id;

                contexts.push({
                    kind: "process",
                    key: row.process_key,
                    label: configured?.label ?? row.process_key,
                    detail: resolveProcessDetail(configured, row.stage_key, row.state),
                    // The process runs IN a context; that context entity owns the
                    // authoritative surface. Enrollment: context_type='opportunity'.
                    destination_entity_type: row.context_type,
                    destination_entity_id: row.context_id,
                    // Where that context is WORKED. Read from the host record's own
                    // queue membership — never from the process key, which names a
                    // different namespace and resolves to no work unit.
                    destination_work_unit_key: row.context_id
                        ? hostWorkUnitKeys.get(row.context_id) ?? null
                        : null,
                    // …and where THIS PARTICIPANT is worked. A sibling in the same case can sit in
                    // a different stage, so the family answer above cannot be right for both.
                    destination_work_view_id:
                        row.context_id && row.stage_key
                            ? stageWorkViewTargets.get(
                                  stageWorkViewCacheKey(row.context_id, row.stage_key),
                              ) ?? null
                            : null,
                    // EVERY cohort this subject truthfully belongs to — evaluated at its own grain
                    // through the canonical runtime machinery, never inferred from the stage above.
                    // Zero queries: the configuration is already loaded and cached, and the row (for
                    // family grain) was materialized in bulk with the wave.
                    operational_memberships: configured
                        ? resolveOperationalMemberships({
                              process: configured,
                              subject: {
                                  grain: c.kind === "child" ? "child" : "family",
                                  stageKey: row.stage_key,
                                  row:
                                      c.kind === "child" || !row.context_id
                                          ? null
                                          : familyMembershipRows.get(row.context_id) ?? null,
                                  // THE ROW IDENTITY, at the grain the lens actually rows at.
                                  // A child-grain lens selects PARTICIPATIONS, so the participation
                                  // this membership was evaluated from IS the member — not the
                                  // durable child (one child, two leads, two rows) and not the case.
                                  memberRowId: c.kind === "child" ? row.id : row.context_id,
                              },
                          }).map((m) => ({
                              work_view_id: m.workViewId,
                              label: m.workViewLabel,
                              row_grain: m.rowGrain,
                              // The unit that holds the host RECORD. A view commits as a LENS on that
                              // unit's surface — the live shape is
                              // `/workspace/work-unit/new-leads?work_view_id=new_work_view_4`.
                              host_work_unit_key: row.context_id
                                  ? hostWorkUnitKeys.get(row.context_id) ?? null
                                  : null,
                              host_entity_id: row.context_id ?? null,
                              // Carried SEPARATELY from the host. For a child these differ; for a
                              // family they coincide — and the runtime is entitled to both.
                              operational_member_id: m.operationalMemberId,
                          }))
                        : null,
                });
            }
        }

        // Schedule — child grain only. A household never carries a schedule.
        if (c.kind === "child") {
            const sched = scheduleByChild.get(c.id);
            if (sched) {
                if (!locationId && sched.site_location_id) locationId = sched.site_location_id;
                contexts.push({
                    kind: "schedule",
                    key: "schedule",
                    label: "Schedule",
                    detail: sched.pattern_label,
                    secondary: sched.site_location_id
                        ? locationLabels.get(sched.site_location_id) ?? null
                        : null,
                });
            }
        }

        // --- recognition ---
        const householdName = resolvedHouseholdId ? householdNameById.get(resolvedHouseholdId) ?? null : null;
        const locationLabel = locationId ? locationLabels.get(locationId) ?? null : null;

        const recognition: SearchRecognition = {
            type_label: resolveTypeLabel(c, cpByPerson.get(c.id) ?? []),
            household_name: c.kind === "household" ? null : householdName,
            // A campus's own name IS the location — repeating it as recognition
            // ("North Campus · Campus · North Campus") is noise, not disambiguation.
            location_label: c.kind === "location" ? null : locationLabel,
            age_label:
                c.kind === "child" && c.person_id
                    ? globalSearchAgeLabelFromDob(dobByPersonId.get(c.person_id) ?? null)
                    : null,
        };

        if (c.kind === "person") {
            const cps = cpByPerson.get(c.id) ?? [];
            // Only note primary-contact status when the configured role label does
            // not already say it — otherwise the row reads
            // "Primary Contact · Household / Primary contact · 2 children".
            if (cps.some((r) => r.is_primary) && !/primary/i.test(recognition.type_label)) {
                recognition.role_note = "Primary contact";
            }

            // Related children — ACCESS-FILTERED. Only households the operator can
            // already reach contribute names, so recognition metadata cannot leak
            // a relationship the operator may not know about.
            const related: string[] = [];
            for (const cp of cps) {
                for (const sib of siblingsByHousehold.get(cp.customer_id) ?? []) {
                    if (sib.display_name) related.push(sib.display_name);
                }
            }
            const unique = [...new Set(related)];
            if (unique.length) {
                recognition.related_names = unique.slice(0, 4);
                recognition.relation_summary = `${unique.length} related ${unique.length === 1 ? "child" : "children"}`;
            }
        }

        if (c.kind === "household") {
            const kids = siblingsByHousehold.get(c.id) ?? [];
            const withSchedules = kids.filter((k) => scheduleByChild.has(k.id)).length;
            if (kids.length) {
                recognition.relation_summary = withSchedules
                    ? `${withSchedules} ${withSchedules === 1 ? "child" : "children"} with active schedules`
                    : `${kids.length} ${kids.length === 1 ? "child" : "children"}`;
            }
        }

        const householdCase = resolvedHouseholdId ? householdCases.get(resolvedHouseholdId) ?? null : null;

        out.set(candidateKey(c), {
            recognition,
            contexts,
            location_id: locationId,
            household_id: resolvedHouseholdId,
            household_case_entity_id: householdCase?.opportunityId ?? null,
            household_case_work_unit_key: householdCase?.workUnitKey ?? null,
        });
    }

    // Site-scope backstop. Primary enforcement happened at query time; this drops
    // any candidate whose resolved location turns out to be outside the operator's
    // site scope. Fails closed on an unknown location.
    for (const c of candidates) {
        const key = candidateKey(c);
        const enrichment = out.get(key);
        if (!enrichment) continue;
        if (envelope.allowedSiteLocationIds === null) continue;
        // Only enforce when a location is actually known for this subject; a
        // subject with no location context was already allow-listed by id.
        if (enrichment.location_id && !searchLocationAllowed(envelope, enrichment.location_id)) {
            out.delete(key);
        }
    }

    return out;
}

function resolveTypeLabel(
    c: SearchCandidate,
    customerPersons: Array<{ role_type: string | null }>
): string {
    if (c.kind === "child") return "Child";
    if (c.kind === "household") return "Household";
    if (c.kind === "location") return "Campus";
    const roles = customerPersons.map((r) => (r.role_type ?? "").trim()).filter(Boolean);
    if (roles.length) {
        const primary = roles[0];
        if (/parent|guardian/i.test(primary)) return "Parent / Guardian";
        return primary.replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
    }
    return "Person";
}

// ---------------------------------------------------------------------------
// Batched readers — each is ONE query over an id set.
// ---------------------------------------------------------------------------

type ProcessInstanceRow = {
    /**
     * `process_instances.id` — the PARTICIPATION.
     *
     * For a child-grain Work View this is the row identity the runtime selects on. It is deliberately
     * not the durable child: one child can hold two participations across two leads, and those are
     * two different rows.
     */
    id: string;
    subject_id: string;
    process_key: string;
    stage_key: string | null;
    state: string | null;
    location_id: string | null;
    context_type: string | null;
    context_id: string | null;
};

async function fetchProcessInstances(
    supabase: SupabaseClient,
    orgId: string,
    subjectIds: string[]
): Promise<ProcessInstanceRow[]> {
    if (!subjectIds.length) return [];
    const { data, error } = await supabase
        .from("process_instances")
        // `id` is the PARTICIPATION — and for a child-grain Work View it is the row identity the
        // runtime selects on (`subjectRows[].entityId` is `participationId`). Without it Search can
        // prove a child belongs to a cohort and still be unable to say WHICH ROW that is, which is
        // how the destination came to carry the family case as the subject and be refused.
        .select("id, subject_id, process_key, stage_key, state, context_type, context_id, metadata")
        .eq("org_id", orgId)
        .in("subject_id", subjectIds);
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


type ScheduleRow = {
    customer_member_id: string;
    pattern_label: string;
    site_location_id: string | null;
};

/**
 * Schedule at CHILD grain, joined to the configured pattern label.
 *
 * `schedule_patterns.label` is the configured display value ("Mon / Wed / Fri") —
 * Search does not format weekday arrays itself.
 */
async function fetchScheduleAssignments(
    supabase: SupabaseClient,
    orgId: string,
    childIds: string[]
): Promise<ScheduleRow[]> {
    if (!childIds.length) return [];
    const { data, error } = await supabase
        .from("schedule_assignments")
        .select("customer_member_id, start_date, status, schedule_patterns(label, site_location_id)")
        .eq("org_id", orgId)
        .in("customer_member_id", childIds)
        .in("status", LIVE_SCHEDULE_STATUSES)
        .order("start_date", { ascending: false });
    if (error) throw new Error(error.message);

    const rows: ScheduleRow[] = [];
    for (const row of (data ?? []) as Array<{
        customer_member_id: string;
        schedule_patterns?: { label?: string | null; site_location_id?: string | null } | null;
    }>) {
        const label = (row.schedule_patterns?.label ?? "").trim();
        if (!label) continue;
        rows.push({
            customer_member_id: String(row.customer_member_id),
            pattern_label: label,
            site_location_id: row.schedule_patterns?.site_location_id
                ? String(row.schedule_patterns.site_location_id)
                : null,
        });
    }
    return rows;
}

async function fetchHouseholds(
    supabase: SupabaseClient,
    orgId: string,
    ids: string[]
): Promise<Array<{ id: string; name: string | null }>> {
    if (!ids.length) return [];
    const { data, error } = await supabase.from("customers").select("id, name").eq("org_id", orgId).in("id", ids);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{ id: string; name?: string | null }>).map((r) => ({
        id: String(r.id),
        name: (r.name ?? "").trim() || null,
    }));
}

async function fetchCustomerPersons(
    supabase: SupabaseClient,
    orgId: string,
    personIds: string[]
): Promise<Array<{ person_id: string; customer_id: string; role_type: string | null; is_primary: boolean }>> {
    if (!personIds.length) return [];
    const { data, error } = await supabase
        .from("customer_persons")
        .select("person_id, customer_id, role_type, is_primary")
        .eq("org_id", orgId)
        .in("person_id", personIds);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{
        person_id: string;
        customer_id: string;
        role_type?: string | null;
        is_primary?: boolean | null;
    }>).map((r) => ({
        person_id: String(r.person_id),
        customer_id: String(r.customer_id),
        role_type: r.role_type ?? null,
        is_primary: r.is_primary === true,
    }));
}

async function fetchSiblings(
    supabase: SupabaseClient,
    orgId: string,
    householdIds: string[]
): Promise<Array<{ id: string; customer_id: string; display_name: string | null }>> {
    if (!householdIds.length) return [];
    const { data, error } = await supabase
        .from("customer_members")
        .select("id, customer_id, display_name, first_name, last_name")
        .eq("org_id", orgId)
        .in("customer_id", householdIds);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{
        id: string;
        customer_id: string;
        display_name?: string | null;
        first_name?: string | null;
        last_name?: string | null;
    }>).map((r) => ({
        id: String(r.id),
        customer_id: String(r.customer_id),
        display_name:
            (r.display_name ?? "").trim() ||
            [r.first_name, r.last_name].filter(Boolean).join(" ").trim() ||
            null,
    }));
}

async function fetchPersonDobs(
    supabase: SupabaseClient,
    orgId: string,
    personIds: string[]
): Promise<Array<{ id: string; date_of_birth: string | null }>> {
    if (!personIds.length) return [];
    const { data, error } = await supabase
        .from("persons")
        .select("id, date_of_birth")
        .eq("org_id", orgId)
        .in("id", personIds);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{ id: string; date_of_birth?: string | null }>).map((r) => ({
        id: String(r.id),
        date_of_birth: r.date_of_birth ?? null,
    }));
}

/** Cap for the wholesale org location read. Orgs are far below this in practice. */
const ORG_LOCATION_LABEL_CAP = 1000;

/**
 * Read the org's location labels wholesale so label resolution can join wave 2
 * instead of forming its own sequential hop.
 *
 * Reports `capped` so the caller can fall back to a targeted read rather than
 * silently dropping a label it could not resolve.
 */
async function fetchOrgLocationLabels(
    supabase: SupabaseClient,
    orgId: string
): Promise<{ labels: Map<string, string>; capped: boolean }> {
    const labels = new Map<string, string>();
    const { data, error } = await supabase
        .from("locations")
        .select(LOCATION_DISPLAY_LABEL_SELECT)
        .eq("org_id", orgId)
        .limit(ORG_LOCATION_LABEL_CAP);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Array<{ id: string } & LocationDisplayLabelRow>;
    for (const row of rows) {
        const label = locationDisplayLabelFromRow(row);
        if (label) labels.set(String(row.id), label);
    }
    return { labels, capped: rows.length >= ORG_LOCATION_LABEL_CAP };
}

async function fetchLocationLabels(
    supabase: SupabaseClient,
    orgId: string,
    ids: string[]
): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (!ids.length) return out;
    const { data, error } = await supabase
        .from("locations")
        .select(LOCATION_DISPLAY_LABEL_SELECT)
        .eq("org_id", orgId)
        .in("id", ids);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{ id: string } & LocationDisplayLabelRow>) {
        const label = locationDisplayLabelFromRow(row);
        if (label) out.set(String(row.id), label);
    }
    return out;
}

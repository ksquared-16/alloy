/**
 * SUBJECT CONTEXT ASSEMBLY — pure, and shared by every consumer.
 *
 * These builders hold the whole of "which business contexts apply to this subject". They take rows
 * that someone else fetched (Search batches them across a candidate set; the durable record host
 * fetches them for one subject) and return the same `SubjectContext[]` either way.
 *
 * PURE ON PURPOSE. The two consumers have genuinely different fetch strategies — Search must batch
 * by id set to keep its query count constant, a record host must not pay for a batch of one — and
 * the thing that must NOT differ is the answer. Keeping the judgement pure is what makes the shared
 * authority real rather than nominal: there is no second place where a context could be decided.
 *
 * Nothing here fetches, and nothing here re-decides eligibility. `resolveOperationalMemberships`
 * already applied grain, predicate support, access and operability; these functions only shape.
 */

import type {
    SubjectContext,
    SubjectOperationalMembershipRef,
} from "@/lib/context/subjectContextTypes";
import { stageWorkViewCacheKey } from "@/lib/workUnits/hostWorkUnitResolver";
import { resolveOperationalMemberships } from "@/lib/search/searchOperationalMemberships";
import {
    resolveProcessDetail,
    type SearchProcessConfiguration,
} from "@/lib/search/searchProcessConfiguration";
import type { PersonEmploymentComposition } from "@/lib/employment/buildPersonEmploymentComposition";

/** One `process_instances` row, in the shape both consumers already read it. */
export type SubjectProcessRow = {
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

/** One live `schedule_assignments` row joined to its configured pattern label. */
export type SubjectScheduleRow = {
    pattern_label: string;
    site_location_id: string | null;
};

/** The grain a context set is being built for. `family` covers households and their adults. */
export type SubjectContextGrain = "child" | "family";

export type BuildProcessContextsInput = {
    grain: SubjectContextGrain;
    /** Every id this subject's participations could be keyed on — its own id, and its person id. */
    subjectKeys: readonly string[];
    /** Participations indexed by `subject_id`. */
    processBySubject: ReadonlyMap<string, readonly SubjectProcessRow[]>;
    processConfig: SearchProcessConfiguration;
    /** `opportunities.id` → the Work Unit key that holds it. */
    hostWorkUnitKeys: ReadonlyMap<string, string>;
    /** `stageWorkViewCacheKey(opportunityId, stageKey)` → configured Work View id. */
    stageWorkViewTargets: ReadonlyMap<string, string>;
    /** Materialized family rows, for family-grain predicate evaluation. */
    familyMembershipRows: ReadonlyMap<string, Record<string, unknown>>;
    /** Location resolved so far; a participation may supply the first one. */
    locationId: string | null;
};

export type BuildProcessContextsResult = {
    contexts: SubjectContext[];
    /** The location after participations had a chance to supply one. */
    locationId: string | null;
};

/**
 * Every process participation this subject holds, as contexts.
 *
 * One context per PROCESS, not per participation: a child with two leads in one process is in that
 * process once, and the memberships below carry the per-participation rows.
 */
export function buildSubjectProcessContexts(
    input: BuildProcessContextsInput,
): BuildProcessContextsResult {
    const contexts: SubjectContext[] = [];
    let locationId = input.locationId;
    const seenProcessKeys = new Set<string>();

    for (const sk of input.subjectKeys) {
        for (const row of input.processBySubject.get(sk) ?? []) {
            const configured = input.processConfig.byKey.get(row.process_key);
            // Configuration can only REMOVE a process from view, never add one.
            if (configured && !configured.operator_has_access) continue;
            if (seenProcessKeys.has(row.process_key)) continue;
            seenProcessKeys.add(row.process_key);

            if (!locationId && row.location_id) locationId = row.location_id;

            const memberships: SubjectOperationalMembershipRef[] | null = configured
                ? resolveOperationalMemberships({
                      process: configured,
                      subject: {
                          grain: input.grain,
                          stageKey: row.stage_key,
                          row:
                              input.grain === "child" || !row.context_id
                                  ? null
                                  : input.familyMembershipRows.get(row.context_id) ?? null,
                          // THE ROW IDENTITY, at the grain the lens actually rows at. A child-grain
                          // lens selects PARTICIPATIONS, so the participation this membership was
                          // evaluated from IS the member — not the durable child (one child, two
                          // leads, two rows) and not the case.
                          memberRowId: input.grain === "child" ? row.id : row.context_id,
                      },
                  }).map((m) => ({
                      work_view_id: m.workViewId,
                      label: m.workViewLabel,
                      row_grain: m.rowGrain,
                      host_work_unit_key: row.context_id
                          ? input.hostWorkUnitKeys.get(row.context_id) ?? null
                          : null,
                      host_entity_id: row.context_id ?? null,
                      operational_member_id: m.operationalMemberId,
                  }))
                : null;

            contexts.push({
                kind: "process",
                key: row.process_key,
                label: configured?.label ?? row.process_key,
                detail: resolveProcessDetail(configured, row.stage_key, row.state),
                // The process runs IN a context; that context entity owns the authoritative surface.
                destination_entity_type: row.context_type,
                destination_entity_id: row.context_id,
                // Where that context is WORKED. Read from the host record's own queue membership —
                // never from the process key, which names a different namespace.
                destination_work_unit_key: row.context_id
                    ? input.hostWorkUnitKeys.get(row.context_id) ?? null
                    : null,
                // …and where THIS PARTICIPANT is worked. A sibling in the same case can sit in a
                // different stage, so the family answer above cannot be right for both.
                destination_work_view_id:
                    row.context_id && row.stage_key
                        ? input.stageWorkViewTargets.get(
                              stageWorkViewCacheKey(row.context_id, row.stage_key),
                          ) ?? null
                        : null,
                // The ADDRESSING axes, carried raw. `detail` above is a renameable sentence; a
                // configured surface variant must never be resolved against one.
                stage_key: row.stage_key,
                state: row.state,
                operational_memberships: memberships,
            });
        }
    }

    return { contexts, locationId };
}

/**
 * The child's live schedule, as a context.
 *
 * Child grain only — a household never carries a schedule, and rolling one up to household level
 * would be a misleading single answer for several children.
 */
export function buildSubjectScheduleContext(
    schedule: SubjectScheduleRow | null | undefined,
    locationLabel: string | null,
): SubjectContext | null {
    if (!schedule) return null;
    return {
        kind: "schedule",
        key: "schedule",
        label: "Schedule",
        detail: schedule.pattern_label,
        secondary: locationLabel,
        // The site the commitment is AT. Every canonical scheduling read is site-scoped, and this
        // row is where the site is stated — so the Schedule card composes against the same site the
        // chip describes, instead of re-deriving one and eventually disagreeing with it.
        site_location_id: schedule.site_location_id ?? null,
    };
}

/**
 * Whether this person works here, as a context.
 *
 * PERSON-GRAIN, AND CARRIED VERBATIM. `PersonEmploymentComposition` is produced by `lib/employment`
 * and decided there; this only phrases it. Nothing about employment is judged in the context layer.
 *
 * Returns null when the person is not staff — "never employed" is an answer, and a context that
 * exists to say "no relationship" would put an empty destination in a selector.
 *
 * There is NO Work View and NO work unit here, and that is not a gap: employment is a standing, not
 * a queue position. A destination resolver reads the absence and offers a record destination only.
 */
export function buildSubjectEmploymentContext(
    employment: PersonEmploymentComposition | null | undefined,
    personId: string | null,
): SubjectContext | null {
    if (!employment?.is_staff) return null;
    const current = employment.current ?? null;
    const detail = current
        ? [current.position_label, current.state_label].filter(Boolean).join(" · ") || null
        : "Not currently employed";

    return {
        kind: "employment",
        key: "employment",
        label: "Employment",
        detail,
        secondary: current?.primary_location_label ?? null,
        // The person IS the record that owns employment. There is no case, and naming one would be
        // the case creeping back into a person's own standing.
        destination_entity_type: personId ? "persons" : null,
        destination_entity_id: personId,
        destination_work_unit_key: null,
        destination_work_view_id: null,
        stage_key: null,
        state: current?.status ?? null,
        operational_memberships: null,
    };
}

/**
 * The record's own information, as a context.
 *
 * ── WHY IDENTITY IS A CHOICE AND NOT THE FRAME ──
 *
 * The durable record used to open as an identity page with the other contexts arranged underneath
 * it. That made identity the frame and everything else an accessory, and it is not how an operator
 * arrives: someone opening Lennon is as likely to want his schedule as his date of birth. Listing
 * identity beside the others lets them say which, instead of paying for a composition they did not
 * ask for on the way to the one they did.
 *
 * It resolves the canonical `child_identity` card — the same card the durable child composition
 * already builds. No configuration, no second composition.
 */
export function buildSubjectIdentityContext(
    grain: "child" | "family" | "person",
    label: string,
): SubjectContext | null {
    // Child grain only for now. A person's identity card is Employment, which is already its own
    // context; offering "Person" beside it would be two names for one card.
    if (grain !== "child") return null;
    return {
        kind: "identity",
        key: "identity",
        label,
        detail: null,
    };
}

/**
 * The subject's household, as a context.
 *
 * CHILD GRAIN ONLY, and the reason is the same one `buildSubjectScheduleContext` records for itself:
 * a household rolled up to household level is a misleading single answer. Here the direction is
 * reversed — a household asked about its own household is a tautology — but the rule is identical.
 *
 * Returns null when the child has no household. `customer_members.customer_id` is nullable, and a
 * child without a family is a real state; an option that opens nothing is worse than no option.
 *
 * It carries the household's id as its destination so the host composes the EXISTING durable
 * household (`composeDurableHouseholdSubject`) rather than reaching for a case. There is no Work
 * Unit here and there must not be one: a family is a record, not a queue position.
 */
export function buildSubjectHouseholdContext(
    householdId: string | null | undefined,
    householdName: string | null | undefined,
): SubjectContext | null {
    const id = (householdId ?? "").trim();
    if (!id) return null;
    return {
        kind: "relationship",
        key: "household",
        label: "Household",
        detail: (householdName ?? "").trim() || null,
        destination_entity_type: "customers",
        destination_entity_id: id,
    };
}

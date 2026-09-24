import type { ResolvedActionsBySlot } from "@/lib/admin/actions/types";
/**
 * CP-1 / S4.2 — Shared Canonical Dependencies (Module C).
 *
 * The DATA foundation both the Initial-Panel (Tier-2) and Deferred-Detail (Tier-3) resources read: the
 * opportunity record (visible payload + household attach), the resolved layout inputs, the work-unit
 * identity + queue definition, the once-resolved department metadata + status definitions, and the
 * lifecycle rail. Resolved ONCE and passed by value — neither tier re-fetches it.
 *
 * This owns NO UI, NO tier orchestration, and NO shell/first-viewport assembly (those consume C and are
 * owned downstream). Behavior is identical to the inline block it replaced in
 * `composeOpportunityDrawerViewModel` — same fetches, same order, same `phases_ms` keys. `lifecycle_rail`
 * is computed here (it is a pure function of already-resolved inputs and is read nowhere earlier).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminRouteGateSuccess } from "@/lib/admin/adminRouteGate";
import { resolveActionsForContext } from "@/lib/admin/actions/resolveActionsForContext";
import { stageKeyFromLifecycleWorkUnitMetadata } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { fetchEffectiveRecordDrawerLayout } from "@/lib/admin/effectiveRecordDrawerLayout";
import { fetchDepartmentMetadataForActivity } from "@/lib/admin/loadOpportunityActivitySignal";
import {
    attachOpportunityHouseholdCustomerPersonsForDrawer,
    buildOpportunityDrawerVisiblePayload,
} from "@/lib/admin/opportunityEntityRecord";
import { documentActorFromAdminGate } from "@/lib/documents/projectPersonProfilePhotos";
import { resolveWorkUnitQueueDefinitionForDrawer } from "@/lib/admin/drawer/resolveWorkUnitQueueDefinitionForDrawer";
import { fetchEffectiveStatusDefinitionsTagged } from "@/lib/admin/statusDefinitionsResolve";
import { OPPORTUNITY_CANONICAL_ADMIN_SELECT } from "@/lib/fields/canonicalEntitySelectColumns";
import { buildOpportunityWorkspaceLifecycleRail } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityWorkspaceLifecycleRail";
import { attachEffectiveEnrollmentStagesToOpportunityRows } from "@/lib/process/definitions/enrollment/attachEffectiveEnrollmentStagesToOpportunityRows";
import {
    effectiveParticipantStageKeysFromRow,
    resolveContextMissionStages,
} from "@/lib/process/engine/resolveContextMissionStages";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";
import type { QueueDefinitionV1 } from "@/lib/config/queueDefinitionSchema";
import type { SharedCanonicalDeps } from "@/lib/adminV2/viewModel/drawer/opportunity/drawerVmComposition.types";

export type ResolveSharedCanonicalDepsParams = {
    supabase: SupabaseClient;
    gate: AdminRouteGateSuccess;
    opportunityId: string;
    departmentId: string | null;
    workUnitId: string | null;
    /**
     * Publish the canonical header action set the INSTANT it resolves — phase 1 of the two-phase
     * selected-drawer delivery.
     *
     * It is handed `departmentId` as a non-null string on purpose. The early resolve only runs when
     * department authority is already known, and this signature makes that a type-level fact: there
     * is no way to publish an action set that was resolved against an unknown department.
     */
    onEarlyHeaderActions?: (published: {
        resolved: ResolvedActionsBySlot;
        departmentId: string;
        workUnitId: string | null;
    }) => void;
};

/** A "skipped" foundation — the compose short-circuits with the same reason it did inline. */
export type SharedCanonicalDepsSkip = {
    ok: false;
    reason: "opportunity_not_found" | "classic_layout_deferred" | "layout_unavailable";
};

export type ResolveSharedCanonicalDepsResult = ({ ok: true } & SharedCanonicalDeps) | SharedCanonicalDepsSkip;

function trimOrNull(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s ? s : null;
}

function layoutFromEffective(
    effective: Awaited<ReturnType<typeof fetchEffectiveRecordDrawerLayout>>
): {
    config_json: RecordLayoutConfigJson;
    inquiry_drawer_mode: "workflow_v1" | "classic";
    layout_version: string;
} | null {
    if (!effective.ok || !effective.layout) return null;
    const cfg = (effective.layout.config_json ?? {}) as RecordLayoutConfigJson;
    const mode = cfg.inquiry_drawer_mode === "workflow_v1" ? "workflow_v1" : "classic";
    return {
        config_json: cfg,
        inquiry_drawer_mode: mode,
        layout_version: effective.layout.key,
    };
}

function queueDefinitionFromWorkUnit(
    wu: { queue_definition?: unknown } | null | undefined
): QueueDefinitionV1 | null {
    return resolveWorkUnitQueueDefinitionForDrawer(wu?.queue_definition);
}

/**
 * Resolve the shared canonical data foundation for the opportunity drawer VM, or a skip reason. The
 * `record` returned is fully household-attached (the mutable baseline the tiers patch); `_record_surface`
 * and shell compilation are NOT applied here (they stay with the orchestrator/A, preserving the inline order).
 */
export async function resolveSharedCanonicalDeps(
    params: ResolveSharedCanonicalDepsParams
): Promise<ResolveSharedCanonicalDepsResult> {
    const { supabase, gate, opportunityId } = params;
    const orgId = gate.orgId;
    const phases_ms: Record<string, number> = {};

    /**
     * The record layout is a function of the ORG and the entity type — it does not read the
     * opportunity at all — yet it waited behind the opportunity select because it shared a
     * `Promise.all` with the work-unit lookup, which does. Started here it overlaps the select
     * instead of following it: measured 99-124 ms recovered from a serial critical path.
     * The awaited value and every downstream read are unchanged.
     */
    const layoutP = fetchEffectiveRecordDrawerLayout(supabase, orgId, "opportunity");
    const tOpp0 = Date.now();
    const { data: oppRow, error: oppErr } = await supabase
        .from("opportunities")
        .select(OPPORTUNITY_CANONICAL_ADMIN_SELECT)
        .eq("id", opportunityId)
        .eq("org_id", orgId)
        .single();
    phases_ms.opportunity_select_ms = Date.now() - tOpp0;

    if (oppErr || !oppRow) {
        return { ok: false, reason: "opportunity_not_found" };
    }

    const ctxDept = trimOrNull(params.departmentId);
    const ctxWu = trimOrNull(params.workUnitId);
    const rowWu = trimOrNull((oppRow as { work_unit_id?: unknown }).work_unit_id);
    const workUnitId = ctxWu || rowWu;
    const tLayout0 = Date.now();
    const wuP =
        workUnitId ?
            supabase
                .from("work_units")
                .select("id, department_id, metadata, queue_definition")
                .eq("id", workUnitId)
                .eq("org_id", orgId)
                .maybeSingle()
        :   Promise.resolve({ data: null, error: null });

    const [layoutRes, wuRes] = await Promise.all([layoutP, wuP]);
    phases_ms.record_layout_ms = Date.now() - tLayout0;

    const layoutParsed = layoutFromEffective(layoutRes);
    if (!layoutParsed || layoutParsed.inquiry_drawer_mode !== "workflow_v1") {
        return { ok: false, reason: layoutParsed ? "classic_layout_deferred" : "layout_unavailable" };
    }

    phases_ms.base_subject_ms = phases_ms.opportunity_select_ms + phases_ms.record_layout_ms;
    const tVisible0 = Date.now();
    /*
     * THE CANONICAL ACTION AUTHORITY, RESOLVED AT ITS OWN DEPENDENCY BOUNDARY.
     *
     * `resolveActionsForContext` needs the org, the opportunity id, the department and work unit,
     * the opportunity's status key and metadata, and the lifecycle stage from work-unit metadata.
     * All of those exist once the opportunity select and the layout/work-unit join have landed - it
     * reads nothing from the visible payload, the children shell, household persons, photos or any
     * capability card, so it can start beside them instead of behind them.
     *
     * It is threaded to the first-paint consumer rather than recomputed there: ONE resolver, one
     * input contract, one answer. Moving the computation earlier is not itself a saving - measured,
     * the resolver costs ~140ms inside a first-paint block whose ~586ms wall is set by
     * `attention_bundle` at ~260ms - so this exists to make the authority DELIVERABLE early, which
     * is where the value is.
     *
     * Resolves to null when it could not be attempted. Null means "not resolved", never an
     * authoritative empty action set.
     */
    const earlyWu = (wuRes.data ?? null) as { department_id?: string | null; metadata?: unknown } | null;
    /*
     * ONLY WHEN THE INPUTS ARE PROVABLY THE SAME ONES.
     *
     * The first-paint resolver is handed the fully-derived `departmentId`, whose last fallback is
     * `record._work_unit_department_id` — a field that does not exist until the visible payload has
     * been built. Resolving early with a null department where the later path would have found one
     * would produce a DIFFERENT action set, which is a correctness change wearing a performance
     * costume. So the early resolution is attempted only when the department is already known from
     * the request context or the work-unit row; otherwise this stays null and the first-paint
     * resolver runs exactly as it always has.
     *
     * `status_key` and `metadata` are safe to read from the selected row: the visible payload adds
     * underscore-prefixed fields and child collections and never rewrites either.
     *
     * Deliberately NOT wrapped in `.catch`. A rejection must keep propagating the way it always did
     * — swallowing it here would turn a failed resolution into an authoritative empty action set.
     */
    const earlyDepartmentId = ctxDept || trimOrNull(earlyWu?.department_id) || null;
    const earlyHeaderActions: Promise<ResolvedActionsBySlot> | null =
        earlyDepartmentId ?
            resolveActionsForContext(supabase, {
                orgId,
                surface: "record_header",
                entityType: "opportunity",
                entityId: opportunityId,
                departmentId: earlyDepartmentId,
                workUnitId: workUnitId || null,
                hintOpportunityStatusKey: trimOrNull((oppRow as { status_key?: unknown }).status_key),
                hintOpportunityMetadata:
                    (oppRow as { metadata?: unknown }).metadata
                    && typeof (oppRow as { metadata?: unknown }).metadata === "object" ?
                        ((oppRow as { metadata?: unknown }).metadata as Record<string, unknown>)
                    :   null,
                lifecycleViewStageKey: stageKeyFromLifecycleWorkUnitMetadata(
                    (earlyWu?.metadata as Record<string, unknown> | null) ?? null,
                ),
            })
        :   null;

    /*
     * PUBLISH IT THE MOMENT IT EXISTS — WITHOUT TOUCHING THE PROMISE THE DRAWER AWAITS.
     *
     * `then(onOk, onErr)` derives a SECOND promise and handles only that one's rejection.
     * `earlyHeaderActions` itself is handed on untouched and still rejects into
     * `resolveOpportunityDrawerFirstPaintDependencies` exactly as it always has, so a failed
     * resolution remains a failure. The rejection arm here deliberately publishes NOTHING: it exists
     * so the derived promise is not an unhandled rejection, and converting a refusal into an
     * authoritative empty action set is the one thing phase 1 must never do.
     */
    if (earlyHeaderActions && earlyDepartmentId && params.onEarlyHeaderActions) {
        const publish = params.onEarlyHeaderActions;
        const publishedDepartmentId: string = earlyDepartmentId;
        void earlyHeaderActions.then(
            (resolved) => {
                publish({ resolved, departmentId: publishedDepartmentId, workUnitId: workUnitId || null });
            },
            () => {
                /* The real consumer owns this rejection. Phase 1 simply never arrives. */
            },
        );
    }

    const record = await buildOpportunityDrawerVisiblePayload(
        supabase,
        orgId,
        oppRow as Record<string, unknown>,
        // Profile photos are DOCUMENTS, minted per actor per request (~300s) and never persisted.
        // Without the actor this payload reaches the Focus Panel with `_inquiry_children` carrying no
        // `resolved_photo_url`, so every child avatar placement falls back to initials while the same
        // children resolve correctly through the entity-record path (R-019).
        { hintDepartmentId: ctxDept, documentActor: documentActorFromAdminGate(gate) }
    );
    phases_ms.visible_entity_ms = Date.now() - tVisible0;
    // Bubble the visible-payload sub-phases so the dominant first-useful cost is measurable in the
    // response `phases_ms` (drawer_primary_* = the parallel FK batch, children_* = child orientation).
    const visiblePrimaryPhase = (record as { _drawer_primary_phase_ms?: Record<string, number> })._drawer_primary_phase_ms;
    if (visiblePrimaryPhase) for (const [k, v] of Object.entries(visiblePrimaryPhase)) phases_ms[`visible_${k}`] = v;
    const childrenShellPhase = (record as { _children_shell_phase_ms?: Record<string, number> })._children_shell_phase_ms;
    if (childrenShellPhase) {
        for (const [k, v] of Object.entries(childrenShellPhase)) phases_ms[`children_${k}`] = v;
        /*
         * A SUM, AND THE NAME NOW SAYS SO.
         *
         * This is `reduce(+)` over nested legs that partly OVERLAP, so it can — and does — exceed
         * the wall of the phase containing it: measured 979ms against a 870ms `shell_children_ms`
         * parent. Read as a wall it invents ~109ms of work that never happened, and added to a
         * sibling it invents far more. The `_sum_ms` suffix is the contract: anything ending
         * `_sum_ms` is nested-inclusive and may never be added to a wall.
         *
         * The wall for this work already exists and is `visible_shell_children_ms`. This stays
         * because the per-leg breakdown it totals is still the fastest way to see where the
         * children chain spends its time.
         */
        phases_ms.children_orientation_sum_ms = Object.values(childrenShellPhase).reduce((a, b) => a + b, 0);
    }

    const wuData = wuRes.data as {
        id?: string;
        department_id?: string | null;
        metadata?: unknown;
        queue_definition?: unknown;
    } | null;
    const departmentId =
        ctxDept ||
        trimOrNull(wuData?.department_id) ||
        trimOrNull((record as Record<string, unknown>)._work_unit_department_id as string | null);
    const queueDefinition = queueDefinitionFromWorkUnit(wuData);

    const tPrep0 = Date.now();
    const tHousehold0 = Date.now();
    const [, deptMetadata, statusDefsPack] = await Promise.all([
        attachOpportunityHouseholdCustomerPersonsForDrawer(supabase, orgId, record).then((r) => {
            phases_ms.household_persons_ms = Date.now() - tHousehold0;
            return r;
        }),
        departmentId ?
            fetchDepartmentMetadataForActivity(supabase, orgId, departmentId)
        :   Promise.resolve(null),
        fetchEffectiveStatusDefinitionsTagged(supabase, orgId, "opportunities", {
            activeOnly: true,
        }),
    ]);
    phases_ms.status_and_dept_ms = Date.now() - tPrep0;

    const statusDefs = statusDefsPack.rows;
    const recordStatusKey = (record as Record<string, unknown>).status_key;
    const statusKey = recordStatusKey != null ? String(recordStatusKey).trim() : null;

    // Lifecycle rail — a pure function of the already-resolved inputs above (deptMetadata, statusKey,
    // statusDefs, work-unit metadata); read nowhere earlier, so computing it here is behavior-identical.
    const lifecycle_rail = buildOpportunityWorkspaceLifecycleRail({
        departmentMetadata: deptMetadata,
        statusKey,
        statusDefs,
        /*
         * The record the stage annotations are ABOUT.
         *
         * The stages are configuration; the annotations are truth about THIS record, resolved
         * through the platform's projection registry. Passing the record here rather than letting
         * the card read it keeps one answer to "what does this stage say" — the same reason the
         * stage ORDER is published on the rail instead of being re-derived downstream.
         */
        record: record as Record<string, unknown>,
        annotationLabels: {
            locationLabel:
                trimOrNull((record as Record<string, unknown>)._location_name as string | null)
                ?? trimOrNull((record as Record<string, unknown>)._location_label as string | null),
            /*
             * NULL, deliberately. `assigned_to` is on the record as an id and nothing resolves it
             * to a name in this payload, so the `assigned_owner` projection has nothing to render
             * and correctly renders nothing. Passing the raw id would put a uuid on an operator
             * card; inventing a lookup here would add a query to the drawer's hot path for a
             * projection no configuration currently selects.
             */
            ownerLabel: null,
        },
    });
    // Mission stage for Current Work: Effective Process Position when participants diverge.
    // Lifecycle rail still reflects shared/context stage for chrome; stage-work uses Mission.
    const [recordWithEpp] = await attachEffectiveEnrollmentStagesToOpportunityRows({
        supabase,
        orgId,
        rows: [record as Record<string, unknown>],
        logLabel: "drawer-mission",
    });
    const mission = resolveContextMissionStages({
        contextStageKey: trimOrNull((recordWithEpp ?? record).stage_key),
        effectiveParticipantStageKeys: effectiveParticipantStageKeysFromRow(
            (recordWithEpp ?? record) as Record<string, unknown>,
        ),
        // Drawer open has no Work View lens — Mission from effective tracks only.
        workViewLensStageKeys: [],
    });
    const missionStageKey = mission.primaryMissionStageKey;
    const railStageKey = lifecycle_rail?.current_stage_key ?? null;
    const currentStageKey = missionStageKey ?? railStageKey;
    const currentStageLabel =
        lifecycle_rail?.stages.find((s) => s.key === currentStageKey)?.label
        ?? (currentStageKey === railStageKey
            ? lifecycle_rail?.stages.find((s) => s.key === railStageKey)?.label ?? null
            : null);

    return {
        ok: true,
        orgId,
        opportunityId,
        record: (recordWithEpp ?? record) as Record<string, unknown>,
        departmentId,
        workUnitId: workUnitId || null,
        layoutConfigJson: layoutParsed.config_json,
        layoutVersion: layoutParsed.layout_version,
        queueDefinitionRaw: wuData?.queue_definition ?? null,
        queueDefinition,
        wuMetadata: wuData?.metadata ?? null,
        deptMetadata: deptMetadata as Record<string, unknown> | null,
        statusDefs,
        statusKey,
        lifecycle_rail,
        currentStageKey,
        currentStageLabel,
        earlyHeaderActions,
        phases_ms,
    };
}

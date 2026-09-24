import type { SupabaseClient } from "@supabase/supabase-js";
import { projectFocusPanelOperational } from "@/lib/adminV2/runtime/focusPanel/focusPanelOperationalProjection";
import {
    buildOperationalContext,
    canonicalParticipantScopeFromTruth,
    type ParticipantCardProducerContract,
} from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";
import { hasPortalAdminMutateAccess } from "@/lib/admin/adminPortalRolePick";

/** A title the projection can name the subject by; never a fabricated one. */
const strOrEmpty = (v: unknown): string => (typeof v === "string" ? v : "");

import type { AdminRouteGateSuccess } from "@/lib/admin/adminRouteGate";
import {
    OPPORTUNITY_DRAWER_VM_COMPOSE_VERSION,
    stripOpportunityDrawerRecordStaging,
} from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelContract";
import { computeOpportunityDrawerViewModelGeneration } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelGeneration";
import { logOpportunityDrawerViewModelComposeShadowSummary } from "@/lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelShadowServer";
import type {
    OpportunityDrawerViewModel,
    OpportunityDrawerViewModelResult,
} from "@/lib/adminV2/viewModel/drawer/types";
import { resolveSharedCanonicalDeps } from "@/lib/adminV2/viewModel/drawer/opportunity/sharedCanonicalDeps";
import { buildInitialPanelResource } from "@/lib/adminV2/viewModel/drawer/opportunity/initialPanelResource";
import { buildDeferredDetailResource } from "@/lib/adminV2/viewModel/drawer/opportunity/deferredDetailResource";

export type ComposeOpportunityDrawerViewModelParams = {
    supabase: SupabaseClient;
    gate: AdminRouteGateSuccess;
    opportunityId: string;
    departmentId: string | null;
    workUnitId: string | null;
    hintOperTrustHeadline?: string | null;
    hintOperTrustUrgency?: string | null;
    /**
     * Skip the family-communications preview compute during first-paint composition.
     * The preview is only an initial seed for the Activity mode embedded workspace, which
     * fetches on demand and is prewarmed on idle (`focusPanelActivityPrewarm`) — so on the
     * workspace inline Focus Panel path it never blocks first paint. Defaults to false so
     * any full-drawer caller keeps the seeded preview. The workspace VM route sets it true,
     * removing one server round-trip (`activity_comms_preview_ms`) from record-open.
     */
    deferCommunicationsPreview?: boolean;
    /** The selected participation this surface is scoped to; resolved, never trusted. */
    attentionSubjectId?: string | null;
    /**
     * `attentionSubjectId` already resolved to its authoritative member by the ROUTE, scoped to this
     * org and this opportunity. Passed in rather than resolved here because the resolver queries the
     * database and this module is reachable from a client component — see the note at the context
     * build below. Absent means nothing was resolvable, and the candidate fallback stands.
     */
    resolvedParticipant?: { participationId: string; customerMemberId: string } | null;
};

export async function composeOpportunityDrawerViewModel(
    params: ComposeOpportunityDrawerViewModelParams
): Promise<OpportunityDrawerViewModelResult> {
    const composeStart = Date.now();
    const phases: Record<string, number> = {};
    const { supabase, gate, opportunityId } = params;
    const orgId = gate.orgId;

    const finishCompose = (result: OpportunityDrawerViewModelResult): OpportunityDrawerViewModelResult => {
        logOpportunityDrawerViewModelComposeShadowSummary(opportunityId, result, Date.now() - composeStart);
        return result;
    };

    // S4.2 — the shared canonical DATA foundation (Module C): opportunity record (visible payload +
    // household attach), layout inputs, work-unit identity + queue definition, department metadata +
    // status definitions, and the lifecycle rail. Resolved once; both tiers read it by value.
    const shared = await resolveSharedCanonicalDeps({
        supabase,
        gate,
        opportunityId,
        departmentId: params.departmentId,
        workUnitId: params.workUnitId,
    });
    if (!shared.ok) {
        return finishCompose({
            ok: false,
            skipped: {
                structureSettled: false,
                reason: shared.reason,
                compose_version: OPPORTUNITY_DRAWER_VM_COMPOSE_VERSION,
            },
        });
    }
    const {
        record,
        workUnitId,
        departmentId,
        layoutConfigJson,
        layoutVersion,
        queueDefinitionRaw,
        queueDefinition,
        wuMetadata,
        deptMetadata,
        statusDefs,
        statusKey,
        lifecycle_rail,
        currentStageKey,
        currentStageLabel,
    } = shared;
    Object.assign(phases, shared.phases_ms);

    /*
     * THE EARLY PARTICIPANT CONTRACT — published here, and here is why here.
     *
     * `record` carries `_inquiry_children` with `customer_member_id` and the enrollment
     * participation already applied: the children shell is complete once the shared deps resolve.
     * Everything still ahead — the initial/deferred modules, status and department, the projection
     * — measured a median 1,355ms, and the producers measure 763ms, so publishing at this boundary
     * is enough to hide them entirely. Reaching deeper into the shell to publish before the photo
     * projection would widen the window to ~2,090ms and buy nothing, at the cost of threading a
     * publisher through a second module.
     *
     * The verdict comes from the canonical owner, not a local re-derivation, so the contract and
     * the settled scope built at the end of this function cannot disagree.
     */
    phases.participant_contract_ready_ms = Date.now() - composeStart;

    // S4.4 — the Tier-2 Initial Panel composition (Module A): readiness, first-paint deps, above-fold
    // render model, first-paint contract, header, registry actions, and Tier-2 summaries. Mutates the
    // shared record in place (first-paint patches) BEFORE B; the orchestrator snapshots above_fold.record
    // ONCE, after B's patches. Imports no Tier-3.
    /*
     * A AND B RUN TOGETHER — B never reads A.
     *
     * B's whole input list is ids, `deptMetadata` and the stage key/label, all of which come from
     * `shared`; it is not passed `record` and cannot patch it, so the "A mutates the record before B"
     * ordering the comment above describes is preserved by construction rather than by the await.
     * Awaiting them in sequence therefore cost `initial + deferred` for no dependency at all.
     *
     * This is what lets stage-work stop being a second round-trip: measured, B carrying the stage-work
     * slice is 181-380 ms against A's ~650-800 ms, so `Promise.all` hides B inside A entirely and the
     * compose still costs `max(A, B)` = A.
     */
    const [initial, deferred] = await Promise.all([
        buildInitialPanelResource({
            supabase,
            gate,
            opportunityId,
            departmentId,
            workUnitId: workUnitId || null,
            statusKey,
            record,
            deptMetadata,
            layoutConfigJson,
            queueDefinition,
            wuMetadata,
            statusDefs,
            lifecycleRail: lifecycle_rail,
            hintOperTrustHeadline: params.hintOperTrustHeadline,
            hintOperTrustUrgency: params.hintOperTrustUrgency,
            // The SAME promise the shared deps started. Consumed here, never re-resolved.
            earlyHeaderActions: shared.earlyHeaderActions,
        }),
        buildDeferredDetailResource({
            supabase,
            orgId,
            opportunityId,
            viewerUserId: gate.userId,
            departmentId,
            deptMetadata,
            currentStageKey,
            currentStageLabel,
            deferCommunicationsPreview: params.deferCommunicationsPreview === true,
        }),
    ]);
    if (!initial.ok) {
        return finishCompose({
            ok: false,
            skipped: {
                structureSettled: false,
                reason: initial.reason,
                compose_version: OPPORTUNITY_DRAWER_VM_COMPOSE_VERSION,
            },
        });
    }
    Object.assign(phases, initial.phases_ms);

    // S4.3 — the deep/deferred (Tier-3) composition (Module B): stage context, family comms preview, and
    // the heavy stage-work slice. Resolved independently of the visible primary panel; the workspace VM
    // route defers comms + stage-work off the record-open path.
    Object.assign(phases, deferred.phases_ms);
    const {
        stage_context,
        work_intent_runtime,
        stage_work_runtime,
        published_stage_inputs,
        stage_work: stage_work_state,
    } = deferred.workspace_detail;
    // Activity → Work Items must show the same open stage-work rows as global Work Items
    // (e.g. Contact Family) — do not strip operating-plan work from the inquiry preview.
    const tasksSummary = initial.summaries.tasks_raw;
    record._inquiry_summary_tasks = tasksSummary;
    if (record._overview_data && typeof record._overview_data === "object" && !Array.isArray(record._overview_data)) {
        (record._overview_data as Record<string, unknown>)._inquiry_summary_tasks = tasksSummary;
    }
    Object.assign(record, deferred.record_patches);

    const tSerialize0 = Date.now();

    const viewModel: OpportunityDrawerViewModel = {
        generation: computeOpportunityDrawerViewModelGeneration({
            orgId,
            opportunityId,
            departmentId,
            workUnitId: workUnitId || null,
            statusKey,
            layoutVersion,
            headerActionKeys: initial.actions.header.map((a) => a.key),
            aboveFoldSectionKeys: initial.aboveFoldRenderModel.sections.map((s) => s.section_key),
        }),
        structureSettled: true,
        compose_version: OPPORTUNITY_DRAWER_VM_COMPOSE_VERSION,
        entity: { type: "opportunity", id: opportunityId },
        workspace: {
            department_id: departmentId,
            work_unit_id: workUnitId || null,
            /** Raw work-unit JSON (v1/v2) — client lifecycle parser re-coerces via resolveWorkUnitQueueDefinitionForDrawer. */
            queue_definition: queueDefinitionRaw,
            lifecycle_rail,
            stage_context,
            work_intent_runtime,
            stage_work_runtime,
            published_stage_inputs,
            stage_work: stage_work_state,
        },
        first_paint: initial.first_paint,
        header: initial.header,
        actions: initial.actions,
        layout: initial.layout,
        activity: deferred.activity,
        above_fold: {
            render_model: initial.aboveFoldRenderModel,
            record: stripOpportunityDrawerRecordStaging(record),
        },
        summaries: {
            tasks: tasksSummary,
            active_tour_bookings: initial.summaries.active_tour_bookings,
            operator_relevant_tour_booking: initial.summaries.operator_relevant_tour_booking ?? null,
            reminders: initial.summaries.reminders,
            bos: initial.summaries.bos,
            attention: initial.summaries.attention,
        },
        background_refresh: {
            // Stage work is never deferred now, so it is never a background refresh target.
            allowed: ["task_status", "scheduled_send_status", "readiness_values"],
        },
        timing: {
            compose_ms: Date.now() - composeStart,
            phases_ms: phases,
        },
    };

    /*
     * THE SETTLED FRAME'S OPERATIONAL PROJECTION — the same chokepoint the commit frame runs.
     *
     * The drawer VM is the steady-state carrier: once Settlement arrives, the cards take their
     * context from here rather than from the provisioning answer. Projecting in both producers is
     * what makes that a change of TRANSPORT rather than a change of AUTHORITY — before this, the
     * settled frame republished the raw configuration and the browser re-derived the card's truth
     * from it, which is why removing the payload from the answer alone would have freed nothing.
     *
     * `selectedParticipantId` is deliberately absent. It marks one child for emphasis and is
     * ephemeral browser state; the renderer applies it over the supplied projection, which is
     * presentation, not a decision about what may run.
     */
    const tProjection = Date.now();
    /*
     * The context is hoisted because the CARD PRODUCERS need the same one.
     *
     * Two frames sharing a producer but building two contexts is how they came to disagree about the
     * subject in the first place. One context, both consumers.
     */
    /*
     * WHICH CHILD THIS SURFACE IS ABOUT — RESOLVED BY THE ROUTE, NOT HERE.
     *
     * `attentionSubjectId` on a child lens is `process_instances.id`. The in-truth candidate set it
     * was matched against (`_inquiry_children`) is intake metadata keyed by inquiry-child id and a
     * best-effort `customer_member_id`, so the match answered `not_found` for EVERY child and the
     * settled `participantScope` was null. Attendance and Health are both keyed on that scope, so
     * they returned `unavailable` for a child the COMMIT frame had already described in full.
     *
     * THE RESOLUTION DOES NOT HAPPEN IN THIS FILE, for the same reason the producers do not: a client
     * component reaches this composer (`ChildDrawerRuntimeProofClient` → the `lib/layout/runtime`
     * barrel → `evaluateOpportunityLayoutRuntimeBody` → here), so importing the `server-only`
     * resolver from here puts it in the client graph and fails the build. It did — the note below
     * about the producers describes this exact edge, and it applies unchanged to any database owner.
     * The route resolves and passes the answer in; `null` leaves every prior path untouched.
     */
    const settledOperationalContext = buildOperationalContext({
                    subjectId: String(viewModel.entity.id),
                    title: strOrEmpty(viewModel.above_fold.record?.title),
                    subjectVm: viewModel,
                    truth: viewModel.above_fold.record,
                    // No projection function reads perspective — verified across both card
                    // projectors — and the server has no viewer lens to state.
                    perspective: null,
                    // `StatusControlVm` is a union; only the dropdown variant names a label.
                    statusLabel:
                        viewModel.header?.status && "label" in viewModel.header.status
                            ? viewModel.header.status.label
                            : null,
                    /*
                     * THE VM'S OWN VERDICT, not a second interpretation.
                     *
                     * `resolveOpportunityVmStatusCanMutate` — the client's rule — prefers
                     * `header.status_can_mutate` and falls back to the gate only when the VM is
                     * absent. Here the VM exists, so reading its verdict is exactly what the browser
                     * would have concluded, including any narrowing for a closed record. The commit
                     * frame has no VM and so uses the gate rule; that difference is the frames', not
                     * two permission models.
                     */
                    canMutate: viewModel.header?.status_can_mutate ?? hasPortalAdminMutateAccess(gate.roleKeys ?? []),
                    /*
                     * THE SAME SUBJECT THE SURFACE IS SCOPED TO.
                     *
                     * This was `null`, and the canonical resolver then fell through to
                     * `sole_participant` — a DIFFERENT child from the one on screen. The resolver was
                     * right; the input was wrong. Passing the attention identity is what makes the
                     * settled frame able to project the subject it claims to.
                     */
                    selectedParticipationId: params.attentionSubjectId ?? null,
                    /*
                     * The resolved member, stated rather than inferred. `buildOperationalContext`
                     * prefers this over the candidate scan; absent, every prior path is unchanged.
                     */
                    resolvedParticipant: params.resolvedParticipant ?? null,
    });

    /*
     * THE PRODUCERS DO NOT RUN HERE, AND THIS MODULE MUST NOT IMPORT THEM.
     *
     * They need `buildAttendanceCardVM`, which is `server-only` because it queries the database. A
     * client component reaches this composer — `ChildDrawerRuntimeProofClient` imports the
     * `lib/layout/runtime` barrel, which re-exports `evaluateOpportunityLayoutRuntimeBody`, which
     * imports this file — so an edge from here to the producers puts a `server-only` module in the
     * browser graph and the production build fails outright. It did: the staging deployment for the
     * first attempt failed while all thirteen required checks were green, because no required check
     * runs a real `next build`.
     *
     * So the context travels OUT instead, and the App Route above — which cannot be imported by a
     * client component — runs the producers with it. That is the same rule the commit frame follows
     * in `composeProvisioningAnswerForRoute`: CONTRACTS may cross to the browser, SERVER
     * IMPLEMENTATIONS may not. Handing the context out costs no second derivation, so both frames
     * still produce from ONE context.
     */
    const projectedViewModel: OpportunityDrawerViewModel = {
        ...viewModel,
        workspace: {
            ...viewModel.workspace,
            /*
             * The settled frame stops carrying the configuration too — both frames or neither, or a
             * change of transport would restore the architecture this migration removed.
             */
            published_stage_inputs: null,
            operational_projection: projectFocusPanelOperational({ context: settledOperationalContext }),
        },
    };
    phases.operational_projection_ms = Date.now() - tProjection;

    // `phases` is referenced by viewModel.timing.phases_ms — these post-literal writes still surface.
    phases.serialization_ms = Date.now() - tSerialize0;
    phases.total_ms = Date.now() - composeStart;
    return finishCompose({
        ok: true,
        viewModel: projectedViewModel,
        // The context the projection was built from, for the route's producers. A VALUE, not an edge.
        operationalContext: settledOperationalContext,
    });
}

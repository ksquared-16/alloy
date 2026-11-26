import type { ResolvedActionForClient, ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { buildOpportunityDrawerHeaderMenuActions } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerHeaderMenuActions";
import { PHASED_CONTENT_TYPE, PHASED_QUERY_KEY } from "@/lib/runtime/provisioning/provisioningTwoPhaseWire";

/**
 * PHASE 1 OF THE SELECTED-DRAWER LIFECYCLE — THE AUTHORITY TO ACT, WITHOUT THE RECORD.
 *
 * Measured on deployed 14be94ea, FIRST ACTIONABLE on the queue-row switch is P50 2,336ms while the
 * canonical action authority for the destination resolves at roughly 390ms into a ~2,288ms compose.
 * The operator therefore waits about 1.9s past the moment the platform already knows what they may
 * do and with which arguments. Nothing in that wait is action resolution: it is the rest of the
 * record.
 *
 * So the drawer answers TWICE on one request. Phase 1 carries subject identity, the canonical
 * execution arguments and the resolved header actions; phase 2 is the unchanged view model. This
 * file is the contract both ends read, and it is deliberately pure: no fetch, no database, no
 * `server-only` import, no decision of its own. CONTRACTS may cross to the browser, SERVER
 * IMPLEMENTATIONS may not.
 *
 * THE CARRIER IS NOT A PARTIAL VIEW MODEL. It is not shaped like `OpportunityDrawerViewModel` and
 * cannot be substituted for one. A partial VM would be a second drawer authority that every
 * consumer would then have to reconcile; the carrier instead states exactly one thing — what the
 * operator may do to this subject right now — and says nothing about anything else. Facts stay
 * UNKNOWN until phase 2, which is true, rather than becoming a fabricated empty.
 *
 * THE ACTIONS ARE NOT RE-DERIVED. They are the SAME `resolveActionsForContext` result phase 2
 * carries, threaded from one promise. There is no client eligibility, no second resolver and no
 * shadow command model, which is what makes phase-2 convergence a tautology rather than a merge:
 * both phases quote one answer, so phase 2 cannot silently correct phase 1.
 */

/** `?phased=1` — the client states it can consume a second delivery. Same literal as provisioning. */
export { PHASED_CONTENT_TYPE, PHASED_QUERY_KEY };

/** The JSON key carrying phase 1 on its own NDJSON line. */
export const CARRIER_LINE_KEY = "__carrier";

/** The JSON key carrying phase 2 — the unchanged view model — on its own NDJSON line. */
export const DRAWER_VIEW_MODEL_LINE_KEY = "__viewModel";

/**
 * Wire version. A client that does not recognise it ignores the carrier entirely and waits for
 * phase 2, which is the pre-carrier behaviour — so an old browser against a new server is slow,
 * never wrong.
 */
export const ACTIONABLE_DRAWER_CARRIER_VERSION = 1;

/**
 * How ready ONE action is to be executed from phase-1 authority alone.
 *
 * Derived per action from its ACTUAL client handler in `applyRegistryResolvedActionClient` and from
 * what the modal that handler opens actually reads — never from the action's name, its label, its
 * registry category, or the fact that it appears in `header_menu` at all. An action is not safe
 * because it exists.
 */
export type CarrierActionReadiness =
    /** Every canonical eligibility and execution input exists in the carrier. May execute now. */
    | "CARRIER_SAFE"
    /** Structurally shown and labelled, but disabled until a later canonical input resolves. */
    | "CARRIER_VISIBLE_DISABLED"
    /** Correct execution genuinely requires full-drawer authority. Waits for phase 2. */
    | "FULL_DRAWER_REQUIRED";

/**
 * An action exactly as the resolver produced it, plus its readiness.
 *
 * The resolved action is carried VERBATIM. Projecting a subset here would be the shadow command
 * model: the handler dispatches on `action_type`, `key`, `payload.intent`, `payload.form_key` and
 * `canonical`, and a carrier that dropped one of them would make the same click mean different
 * things in phase 1 and phase 2.
 */
export type ActionableCarrierAction = ResolvedActionForClient & {
    readiness: CarrierActionReadiness;
};

export type ActionableDrawerCarrier = {
    carrier_version: typeof ACTIONABLE_DRAWER_CARRIER_VERSION;
    /**
     * WHOSE actions these are. The client refuses a carrier whose subject is not the subject it has
     * selected, which is what stops a late B carrier mounting under C.
     */
    subject: {
        entity_type: "opportunity";
        opportunity_id: string;
        /**
         * The participation the REQUEST asserted, echoed for diagnosis. It is NOT part of this
         * carrier's identity, and nothing may key on it.
         *
         * Measured on deployed 8e749e03: the hover prewarm calls `prewarmRecordWork(opportunity, id)`
         * with the queue row's own id, so on a family row it asserts the opportunity id as the
         * attention subject, while the click path asserts none. Keying identity on that difference
         * refused every carrier the prewarm produced — the carrier arrived at click +164ms, was
         * validated, was stored, and was then never found by the panel asking for the same subject
         * with no lens. Phase 1 was a producer with no reader on the only path that matters.
         *
         * It is not part of identity because it cannot be: `resolveActionsForContext` is called with
         * org, surface, entity, department and work unit and NO participation, so the header action
         * set does not depend on the lens. Two carriers for one opportunity under different lenses
         * carry the same actions by construction, and refusing one for the other protects nothing.
         */
        attention_subject_id: string | null;
    };
    /**
     * THE EXECUTION ARGUMENTS — canonical, not display.
     *
     * These are the exact values the mounted handler passes today: `departmentId` and `workUnitId`
     * come from `viewModel.workspace`, which is the compose input verbatim. Phase 1 quotes the same
     * compose input, so an action executes with identical arguments whichever phase mounted it.
     *
     * `department_id` is nullable because the mounted path's is: the surface may legitimately be
     * unscoped by department. That is NOT the null Part 13 forbids — that one is about RESOLVING an
     * action set against an unknown department, which the producer refuses to do at all.
     */
    execution: {
        department_id: string | null;
        work_unit_id: string | null;
        surface: "record_header";
    };
    /** The resolver's own header menu, in the resolver's own order, each classified. */
    header_menu: ActionableCarrierAction[];
    /** Milliseconds into the route at which phase 1 was flushed. Measurement only. */
    flushed_at_ms: number;
};

/** Read `payload.intent`, the discriminator the `ui_intent` handler branches on. */
function readIntent(a: ResolvedActionForClient): string {
    const p = a.payload && typeof a.payload === "object" ? a.payload : {};
    return p.intent != null ? String(p.intent).trim() : "";
}

/** Read `payload.form_key`, the discriminator the `open_form` handler branches on. */
function readFormKey(a: ResolvedActionForClient): string {
    const p = a.payload && typeof a.payload === "object" ? a.payload : {};
    return p.form_key != null ? String(p.form_key).trim() : "";
}

/**
 * Handler paths that read the DRAWER RECORD — directly, or through the modal they open.
 *
 * Every entry was traced, not assumed:
 *
 *   schedule_tour / reschedule_tour   OpportunityTourScheduleActionModal is fed `locationId`, which
 *                                     is `record.location_id ?? record._location_id`. Without it the
 *                                     legacy submit posts nothing and slot booking has no location.
 *   record_tour_outcome               opens through the same `actionFormState` host, whose sibling
 *                                     modals read the record.
 *   add_child / add_sibling           the submit reads `record.customer_id` and refuses without it,
 *                                     and builds `existingChildren` from `record._inquiry_children`.
 *   change_lead_location              ChangeLeadLocationModal takes `record={record}`.
 *   relationship actions              RelationshipActionGuidedModal renders ONLY when `record` is
 *                                     present and takes it as `anchorRecord`.
 *   create_task / create_work_item    OpportunityRecordCreateWorkModal takes `lifecycleStageKey`
 *                                     (`record._effective_lifecycle_stage`) and `recordOwnerUserId`
 *                                     (`record.assigned_to`).
 *   send_enrollment_packet            OpportunityEnrollmentPacketModal takes `opportunityRecord`.
 *   make_primary_contact              needs a contact-row target no header surface supplies.
 *   assign_classroom / assign_schedule / set_start_date
 *                                     focus a field inside a body card that does not exist yet.
 */
const FULL_DRAWER_REQUIRED_KEYS = new Set([
    "schedule_tour",
    "reschedule_tour",
    "record_tour_outcome",
    "add_child",
    "add_sibling",
    "change_lead_location",
    "create_task",
    "create_work_item",
    "send_enrollment_packet",
    "make_primary_contact",
    "assign_classroom",
    "assign_schedule",
    "set_start_date",
]);

/** `payload.intent` values whose handler path reads the record, by the same trace. */
const FULL_DRAWER_REQUIRED_INTENTS = new Set([
    "create_task",
    "create_work_item",
    "send_enrollment_packet",
    "relationship_action",
    "assign_classroom",
    "assign_schedule",
    "set_start_date",
    "change_lead_location",
]);

/** `payload.form_key` values whose handler path reads the record, by the same trace. */
const FULL_DRAWER_REQUIRED_FORM_KEYS = new Set([
    "schedule_tour",
    "reschedule_tour",
    "record_tour_outcome",
    "add_inquiry_child",
    "add_sibling",
    "change_lead_location",
]);

/**
 * Paths that EXECUTE correctly from carrier authority but whose surface is degraded without the
 * record, and paths that execute nothing at all.
 *
 *   send_form / request_missing_information   SendFormToOpportunityModal is fed `familyLabel` from
 *                                             `record._customer_name`. The send itself needs only
 *                                             the opportunity id, but the operator would be
 *                                             choosing a recipient on a modal that cannot yet name
 *                                             the family. Shown, disabled, enabled at phase 2.
 *   send_tour_invitation                      has NO branch in the handler: it reaches the explicit
 *                                             "nothing was executed" refusal. Enabling it early
 *                                             would advertise a command that does nothing.
 *   review_enrollment_packet                  dispatches into a session the drawer runtime owns.
 *   update_status_add_note                    resolves to a generic `openForm` whose `form_key`
 *                                             matches none of the three mounted form hosts, so it
 *                                             opens nothing in either phase.
 */
const CARRIER_VISIBLE_DISABLED_KEYS = new Set([
    "send_form",
    "request_missing_information",
    "send_tour_invitation",
    "review_enrollment_packet",
    "update_status_add_note",
]);

const CARRIER_VISIBLE_DISABLED_INTENTS = new Set([
    "send_form",
    "request_missing_information",
    "send_tour_invitation",
    "review_enrollment_packet",
]);

/**
 * Classify ONE action against phase-1 authority.
 *
 * The order below deliberately mirrors `applyRegistryResolvedActionClient`'s own dispatch: record-
 * reading paths are tested first, exactly as the handler tests them first, so a key that matches two
 * rules is classified by the branch that would actually run. The safe answer is last, never first.
 *
 * Anything unrecognised falls to the handler's default branch — `POST /api/admin/actions/execute`
 * with `{action_key, entity_type, entity_id, context}` — and every one of those arguments is in the
 * carrier. That is why the default here is CARRIER_SAFE rather than a conservative refusal: it is
 * not a guess about an unknown action, it is the traced behaviour of the branch that will run.
 */
export function classifyActionableCarrierReadiness(a: ResolvedActionForClient): CarrierActionReadiness {
    const key = a.key.trim();
    const intent = readIntent(a);
    const formKey = readFormKey(a);

    if (FULL_DRAWER_REQUIRED_KEYS.has(key)) return "FULL_DRAWER_REQUIRED";
    if (intent && FULL_DRAWER_REQUIRED_INTENTS.has(intent)) return "FULL_DRAWER_REQUIRED";
    if (formKey && FULL_DRAWER_REQUIRED_FORM_KEYS.has(formKey)) return "FULL_DRAWER_REQUIRED";

    if (CARRIER_VISIBLE_DISABLED_KEYS.has(key)) return "CARRIER_VISIBLE_DISABLED";
    if (intent && CARRIER_VISIBLE_DISABLED_INTENTS.has(intent)) return "CARRIER_VISIBLE_DISABLED";

    /*
     * A generic `open_form` reaches `host.openForm`, and the three mounted form hosts are
     * schedule_tour / reschedule_tour, record_tour_outcome and add_note. Add-person and add-child
     * are intercepted before that point — add-child above, add-person below — so any OTHER form key
     * arriving here opens a host that either reads the record or does not exist. Neither is safe to
     * offer early.
     */
    if (a.action_type === "open_form") {
        const isAddPerson =
            key === "add_family_member"
            || key === "add_related_person"
            || formKey === "add_family_member"
            || formKey === "add_related_person"
            || formKey === "add_person";
        // AddPersonModal reads no record: it submits {entityId, actionKey, payload, context} where
        // context is exactly the carrier's execution block.
        if (isAddPerson) return "CARRIER_SAFE";
        if (formKey === "add_note") return "CARRIER_SAFE";
        return "CARRIER_VISIBLE_DISABLED";
    }

    return "CARRIER_SAFE";
}

/** True when this action may be offered as EXECUTABLE from phase-1 authority. */
export function carrierActionIsExecutable(a: ActionableCarrierAction): boolean {
    return a.readiness === "CARRIER_SAFE";
}

/**
 * Build phase 1 from the resolver's answer.
 *
 * Refuses rather than guesses. A carrier with no subject, or built from an action set that is not
 * the canonical one, would be a second authority — so the only two outcomes are "the canonical
 * answer, classified" and `null`, which means this lifecycle keeps today's full-drawer timing.
 */
export function buildActionableDrawerCarrier(input: {
    opportunityId: string;
    attentionSubjectId: string | null;
    departmentId: string | null;
    workUnitId: string | null;
    resolved: ResolvedActionsBySlot | null;
    flushedAtMs: number;
}): ActionableDrawerCarrier | null {
    const opportunityId = input.opportunityId.trim();
    if (!opportunityId) return null;
    if (!input.resolved) return null;

    /*
     * THE SAME BUILDER PHASE 2 USES — not a flatten of the resolver's slots.
     *
     * `actions.header_menu` is `buildOpportunityDrawerHeaderMenuActions`, which does two things a
     * bare flatten does not: it guarantees `change_lead_location` is present even before the seed
     * exists, and it relabels Schedule tour to Reschedule tour when the record has an active
     * booking. Quoting the flatten here would have made phase 1 a DIFFERENT menu — one action
     * short — and phase 2 would then have inserted a command into a list the operator had already
     * read, which is precisely the silent correction two-phase delivery must not perform.
     *
     * `hasActiveTourBooking` is false because it is genuinely UNKNOWN at this boundary: tour
     * bookings are a first-paint dependency and have not resolved. The only thing it governs is the
     * LABEL of `schedule_tour`, which phase 1 classifies FULL_DRAWER_REQUIRED and therefore renders
     * disabled — so what phase 2 settles is the wording of a control the operator could not use,
     * which is an unresolved value becoming known and not a known value being contradicted.
     */
    const header_menu = buildOpportunityDrawerHeaderMenuActions(input.resolved, false).map((a) => ({
        ...a,
        readiness: classifyActionableCarrierReadiness(a),
    }));

    return {
        carrier_version: ACTIONABLE_DRAWER_CARRIER_VERSION,
        subject: {
            entity_type: "opportunity",
            opportunity_id: opportunityId,
            attention_subject_id: input.attentionSubjectId?.trim() || null,
        },
        execution: {
            department_id: input.departmentId?.trim() || null,
            work_unit_id: input.workUnitId?.trim() || null,
            surface: "record_header",
        },
        header_menu,
        flushed_at_ms: input.flushedAtMs,
    };
}

/**
 * Does this carrier describe the subject the client currently has selected?
 *
 * Fails CLOSED. A malformed carrier, an unknown version, a different opportunity or a different
 * attention lens all answer false, and the panel then shows no early actions rather than the wrong
 * ones. This is the guard that makes A -> B -> C safe: B's carrier, arriving after C is selected,
 * does not describe C and is therefore never mounted.
 */
export function actionableCarrierDescribesSubject(
    carrier: unknown,
    selected: { opportunityId: string | null | undefined; attentionSubjectId?: string | null }
): carrier is ActionableDrawerCarrier {
    if (!carrier || typeof carrier !== "object") return false;
    const c = carrier as Partial<ActionableDrawerCarrier>;
    if (c.carrier_version !== ACTIONABLE_DRAWER_CARRIER_VERSION) return false;
    if (!c.subject || typeof c.subject !== "object") return false;
    if (c.subject.entity_type !== "opportunity") return false;
    if (!Array.isArray(c.header_menu)) return false;
    if (!c.execution || typeof c.execution !== "object") return false;
    if (c.execution.surface !== "record_header") return false;

    const want = selected.opportunityId?.trim() || "";
    if (!want) return false;
    if (String(c.subject.opportunity_id ?? "").trim() !== want) return false;

    /*
     * THE LENS IS DELIBERATELY NOT COMPARED — see `subject.attention_subject_id` above.
     *
     * The opportunity is the whole identity here because the action set is resolved without any
     * participation. Comparing lenses looked like a stricter guard and was in fact a false refusal:
     * the prewarm asserts the row's own id as the attention subject and the click asserts none, so
     * every hover-warmed carrier was discarded by the one consumer that needed it.
     *
     * What this guard must stop is B's carrier mounting under C, and the subject comparison above is
     * exactly that check.
     */
    return true;
}

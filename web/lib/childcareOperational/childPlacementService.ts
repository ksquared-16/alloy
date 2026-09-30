import type { SupabaseClient } from "@supabase/supabase-js";
import {
    isPlacementOperationalStatus,
    derivePlacementStatusFromStartDate,
} from "@/lib/childcareOperational/enrollmentOperationalStatus";
import type { ChildPlacementRow } from "@/lib/childcareOperational/enrollmentOperationalTypes";
import {
    assertValidIsoDate,
    computePriorRowCloseDate,
    isInvalidSupersedeStartDate,
    validateEndOnOrAfterStart,
} from "@/lib/childcareOperational/effectiveDating";
import { getAgreementById } from "@/lib/childcareOperational/enrollmentAgreementService";
import {
    OperationalEnrollmentServiceError,
    trimOrNull,
} from "@/lib/childcareOperational/operationalEnrollmentErrors";
import {
    applyParticipationOperationalChange,
    deriveParticipationIdempotencyKey,
} from "@/lib/childcareOperational/participationOperationalChange";
import {
    validateProgramCategoryForSite,
    validateRoomLocationUnderSite,
} from "@/lib/childcareOperational/validateChildcareLocationRefs";
import {
    emitPlacementChangedEvent,
    HANDOFF_SOURCE_KEY,
} from "@/lib/childcareOperational/operationalEnrollmentEvents";

function isOperatorEnrollmentEditSource(sourceKey: string | null | undefined): boolean {
    const k = trimOrNull(sourceKey) ?? "operator";
    return k !== HANDOFF_SOURCE_KEY;
}

async function emitOperatorPlacementChangedIfNeeded(
    input: CreateChildPlacementInput,
    placement: ChildPlacementRow,
    prior?: { id: string; closeDate?: string | null }
): Promise<void> {
    if (!isOperatorEnrollmentEditSource(input.sourceKey)) return;
    await emitPlacementChangedEvent({
        orgId: input.orgId,
        placementId: placement.id,
        enrollmentAgreementId: placement.enrollment_agreement_id,
        customerMemberId: placement.customer_member_id,
        siteLocationId: placement.site_location_id,
        startDate: placement.start_date,
        supersedesPlacementId: prior?.id ?? placement.supersedes_placement_id,
        priorPlacementCloseDate: prior?.closeDate ?? null,
        sourceKey: placement.source_key,
        ctx: { actorUserId: input.actorUserId },
    });
}

export type CreateChildPlacementInput = {
    orgId: string;
    enrollmentAgreementId: string;
    startDate: string;
    programCategoryId?: string | null;
    roomLocationId?: string | null;
    reasonKey?: string | null;
    sourceKey?: string;
    metadata?: Record<string, unknown>;
    actorUserId?: string | null;
    todayYmd: string;
};

export type SupersedeChildPlacementInput = Omit<
    CreateChildPlacementInput,
    "enrollmentAgreementId"
> & {
    enrollmentAgreementId: string;
    /**
     * Retry protection. Omitted, it is derived from the requested end state, so an operator
     * double-submit replays rather than superseding the first successor and chaining a spurious row.
     */
    idempotencyKey?: string;
    /**
     * The placement the caller believes is current. Omitted, the row this call just read is used, so
     * a concurrent edit surfaces as a conflict instead of silently branching the supersession chain.
     */
    expectedPlacementId?: string | null;
};

export async function getOperationalPlacementForAgreement(
    supabase: SupabaseClient,
    orgId: string,
    enrollmentAgreementId: string
): Promise<ChildPlacementRow | null> {
    const { data, error } = await supabase
        .from("child_placements")
        .select("*")
        .eq("org_id", orgId)
        .eq("enrollment_agreement_id", enrollmentAgreementId)
        .in("status", ["planned", "active", "ending"])
        .maybeSingle();

    if (error) {
        throw new OperationalEnrollmentServiceError("db_error", error.message);
    }
    return data ? (data as ChildPlacementRow) : null;
}

export type ListChildPlacementsFilters = {
    enrollmentAgreementId?: string;
    customerMemberId?: string;
};

export async function listChildPlacements(
    supabase: SupabaseClient,
    orgId: string,
    filters: ListChildPlacementsFilters = {}
): Promise<ChildPlacementRow[]> {
    let q = supabase.from("child_placements").select("*").eq("org_id", orgId);

    if (filters.enrollmentAgreementId) {
        q = q.eq("enrollment_agreement_id", filters.enrollmentAgreementId);
    }
    if (filters.customerMemberId) {
        q = q.eq("customer_member_id", filters.customerMemberId);
    }

    q = q.order("start_date", { ascending: false });

    const { data, error } = await q;
    if (error) {
        throw new OperationalEnrollmentServiceError("db_error", error.message);
    }
    return (data ?? []) as ChildPlacementRow[];
}

async function assertAgreementAllowsPlacement(
    supabase: SupabaseClient,
    orgId: string,
    enrollmentAgreementId: string
): Promise<{
    agreement: Awaited<ReturnType<typeof getAgreementById>>;
}> {
    const agreement = await getAgreementById(supabase, orgId, enrollmentAgreementId);
    if (!agreement) {
        throw new OperationalEnrollmentServiceError("not_found", "Enrollment agreement not found");
    }
    if (agreement.status === "canceled" || agreement.status === "ended") {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            "Cannot modify placements on a terminal agreement",
            { status: agreement.status }
        );
    }
    return { agreement };
}

async function validatePlacementLocationRefs(
    supabase: SupabaseClient,
    orgId: string,
    siteLocationId: string,
    programCategoryId: string | null,
    roomLocationId: string | null
): Promise<void> {
    if (programCategoryId) {
        const check = await validateProgramCategoryForSite(
            supabase,
            orgId,
            siteLocationId,
            programCategoryId
        );
        if (!check.ok) {
            throw new OperationalEnrollmentServiceError("validation_failed", check.error.message, {
                field: "program_category_id",
            });
        }
    }
    if (roomLocationId) {
        const check = await validateRoomLocationUnderSite(
            supabase,
            orgId,
            siteLocationId,
            roomLocationId
        );
        if (!check.ok) {
            throw new OperationalEnrollmentServiceError("validation_failed", check.error.message, {
                field: "room_location_id",
            });
        }
    }
}

export async function createInitialChildPlacement(
    supabase: SupabaseClient,
    input: CreateChildPlacementInput
): Promise<ChildPlacementRow> {
    const { agreement } = await assertAgreementAllowsPlacement(
        supabase,
        input.orgId,
        input.enrollmentAgreementId
    );

    const existing = await getOperationalPlacementForAgreement(
        supabase,
        input.orgId,
        input.enrollmentAgreementId
    );
    if (existing) {
        throw new OperationalEnrollmentServiceError(
            "conflict",
            "An operational placement already exists; use supersede",
            { placement_id: existing.id }
        );
    }

    const startDate = trimOrNull(input.startDate);
    if (!startDate) {
        throw new OperationalEnrollmentServiceError("invalid_input", "startDate is required");
    }
    assertValidIsoDate(startDate, "startDate");

    const programCategoryId = trimOrNull(input.programCategoryId);
    const roomLocationId = trimOrNull(input.roomLocationId);
    await validatePlacementLocationRefs(
        supabase,
        input.orgId,
        agreement!.site_location_id,
        programCategoryId,
        roomLocationId
    );

    const status = derivePlacementStatusFromStartDate(startDate, input.todayYmd);

    const row = {
        org_id: input.orgId,
        enrollment_agreement_id: input.enrollmentAgreementId,
        customer_member_id: agreement!.customer_member_id,
        site_location_id: agreement!.site_location_id,
        program_category_id: programCategoryId,
        room_location_id: roomLocationId,
        start_date: startDate,
        end_date: null,
        status,
        reason_key: trimOrNull(input.reasonKey) ?? "initial",
        source_key: trimOrNull(input.sourceKey) ?? "operator",
        supersedes_placement_id: null,
        metadata: input.metadata ?? {},
        created_by: trimOrNull(input.actorUserId),
        updated_by: trimOrNull(input.actorUserId),
    };

    const { data, error } = await supabase
        .from("child_placements")
        .insert(row)
        .select("*")
        .single();

    if (error || !data) {
        throw new OperationalEnrollmentServiceError("db_error", error?.message ?? "insert failed");
    }
    const placement = data as ChildPlacementRow;
    await emitOperatorPlacementChangedIfNeeded(input, placement);
    return placement;
}

/**
 * The domain decision half of a placement supersession, without the writing.
 *
 * Extracted so a COMBINED placement+assignment edit can reuse exactly this validation before making a
 * single transactional call, instead of a parallel copy that drifts. The temporal engine is not
 * duplicated by this — there is still one gateway and one SQL transaction owner.
 */
export type ResolvedPlacementSupersession = {
    prior: ChildPlacementRow;
    newStartDate: string;
    programCategoryId: string | null;
    roomLocationId: string | null;
};

export async function resolvePlacementSupersession(
    supabase: SupabaseClient,
    input: SupersedeChildPlacementInput
): Promise<ResolvedPlacementSupersession> {
    const { agreement } = await assertAgreementAllowsPlacement(
        supabase,
        input.orgId,
        input.enrollmentAgreementId
    );

    const prior = await getOperationalPlacementForAgreement(
        supabase,
        input.orgId,
        input.enrollmentAgreementId
    );
    if (!prior) {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            "No operational placement to supersede; use createInitialChildPlacement"
        );
    }

    const newStartDate = trimOrNull(input.startDate);
    if (!newStartDate) {
        throw new OperationalEnrollmentServiceError("invalid_input", "startDate is required");
    }
    assertValidIsoDate(newStartDate, "startDate");

    if (
        isInvalidSupersedeStartDate({
            priorStartDate: prior.start_date,
            priorEndDate: prior.end_date,
            newStartDate,
        })
    ) {
        throw new OperationalEnrollmentServiceError(
            "validation_failed",
            "new start_date must be after prior placement start and any prior end_date"
        );
    }

    const programCategoryId = trimOrNull(input.programCategoryId);
    const roomLocationId = trimOrNull(input.roomLocationId);
    await validatePlacementLocationRefs(
        supabase,
        input.orgId,
        agreement!.site_location_id,
        programCategoryId,
        roomLocationId
    );

    const closeDate = computePriorRowCloseDate(newStartDate);
    const rangeError = validateEndOnOrAfterStart(prior.start_date, closeDate);
    if (rangeError) {
        throw new OperationalEnrollmentServiceError("validation_failed", rangeError.message);
    }

    return { prior, newStartDate, programCategoryId, roomLocationId };
}

/** The placement payload this service sends to the one transactional persistence primitive. */
export function placementChangePayload(
    input: SupersedeChildPlacementInput,
    resolved: ResolvedPlacementSupersession
) {
    return {
        // Named explicitly, nulls included: these callers treat an absent body field as "clear this",
        // and the primitive distinguishes a named null from an absent key on purpose.
        startDate: resolved.newStartDate,
        programCategoryId: resolved.programCategoryId,
        roomLocationId: resolved.roomLocationId,
        reasonKey: trimOrNull(input.reasonKey) ?? "operator_change",
        sourceKey: trimOrNull(input.sourceKey) ?? "operator",
        metadata: input.metadata ?? {},
    };
}

/** The retry key this service uses when the caller does not supply one. */
export function placementIdempotencyKey(
    input: SupersedeChildPlacementInput,
    resolved: ResolvedPlacementSupersession
): string {
    return (
        input.idempotencyKey
        ?? deriveParticipationIdempotencyKey({
            scope: "placement",
            enrollmentAgreementId: input.enrollmentAgreementId,
            values: [resolved.newStartDate, resolved.programCategoryId, resolved.roomLocationId],
        })
    );
}

/** Reads back a committed successor row. */
export async function readPlacementById(
    supabase: SupabaseClient,
    orgId: string,
    placementId: string
): Promise<ChildPlacementRow> {
    const { data, error } = await supabase
        .from("child_placements")
        .select("*")
        .eq("org_id", orgId)
        .eq("id", placementId)
        .single();
    if (error || !data) {
        throw new OperationalEnrollmentServiceError(
            "db_error",
            error?.message ?? "placement successor not readable"
        );
    }
    return data as ChildPlacementRow;
}

/** Emits the canonical placement change event. Call only AFTER a successful commit. */
export async function emitPlacementSupersededEvent(
    input: SupersedeChildPlacementInput,
    placement: ChildPlacementRow,
    prior: { id: string; closeDate: string | null }
): Promise<void> {
    await emitOperatorPlacementChangedIfNeeded(input, placement, prior);
}

export async function supersedeChildPlacement(
    supabase: SupabaseClient,
    input: SupersedeChildPlacementInput
): Promise<ChildPlacementRow> {
    const resolved = await resolvePlacementSupersession(supabase, input);

    // PERSISTENCE IS ONE TRANSACTION, OWNED BY THE DATABASE.
    //
    // This used to be an UPDATE closing the prior row followed by an INSERT of the successor, issued
    // from here with no shared transaction. Two statements from a Supabase client cannot be atomic, so
    // a failure between them left the prior row closed with no successor - the child in no room at all.
    // It was also not retry-idempotent: a retry read its own successor as "prior" and superseded THAT,
    // chaining rows that never described anything real.
    //
    // The domain decision above is still ours, and the event below is still ours. Only the writes moved.
    const change = await applyParticipationOperationalChange(supabase, {
        orgId: input.orgId,
        enrollmentAgreementId: input.enrollmentAgreementId,
        idempotencyKey: placementIdempotencyKey(input, resolved),
        todayYmd: input.todayYmd,
        actorUserId: trimOrNull(input.actorUserId),
        // Passing the row we just read turns a concurrent edit into a conflict rather than a branch.
        expectedPlacementId: input.expectedPlacementId ?? resolved.prior.id,
        placement: placementChangePayload(input, resolved),
    });

    if (!change.placement) {
        throw new OperationalEnrollmentServiceError(
            "db_error",
            "persistence reported no placement successor"
        );
    }

    const placement = await readPlacementById(supabase, input.orgId, change.placement.successorId);
    // AFTER a successful commit, never before: a rolled-back transaction must produce no event.
    await emitPlacementSupersededEvent(input, placement, {
        id: change.placement.priorId,
        closeDate: change.placement.priorEndDate,
    });
    return placement;
}

/** Guard: operational placement rows must not be patched in place for business changes. */
export function assertNoOperationalPlacementPatch(): void {
    throw new OperationalEnrollmentServiceError(
        "invalid_input",
        "Operational placement changes must use supersedeChildPlacement, not update-in-place"
    );
}

export function isOperationalPlacementRow(row: ChildPlacementRow): boolean {
    return isPlacementOperationalStatus(row.status);
}

/**
 * Cancel a placement that should never have been effective.
 *
 * ── WHY SUPERSESSION CANNOT DO THIS ──
 *
 * `supersedeChildPlacement` requires the replacement to start strictly AFTER the prior row
 * (`isInvalidSupersedeStartDate`), and closes the prior row on the day before that start. So the
 * superseded row always asserts a NON-EMPTY interval during which it was the truth — the arithmetic
 * makes a zero-length window impossible. That is exactly right for "the child was in Room A and
 * then moved to Room B", and exactly wrong for "this placement was recorded against the wrong child
 * and was never true at all". Using `move` for the second case publishes a period of care that
 * never happened, and a partner that already synced the row has no way to tell the two apart.
 *
 * `canceled` is already the canonical word for a placement that never became operational: it is in
 * the status CHECK, it is excluded from
 * `ux_child_placements_one_operational_per_agreement` (so cancelling frees the slot for a corrected
 * row), and it is terminal. Nothing new is invented here — the state existed and had no writer.
 *
 * ── WHAT THIS IS NOT ──
 *
 * Not a delete: the row is retained, so a consumer that already read it can still resolve the id
 * and see what happened to it. Not a change: no business value is rewritten, which is why the
 * `assertNoOperationalPlacementPatch` doctrine is untouched — that guard forbids patching a row's
 * terms in place, and a terminal lifecycle transition is not a term.
 *
 * Retry converges rather than conflicting: a caller that could not confirm the first attempt is
 * told the same thing the first attempt would have told it.
 */
export async function cancelChildPlacement(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        placementId: string;
        actorUserId?: string | null;
    }
): Promise<ChildPlacementRow> {
    const { data: existing, error: readError } = await supabase
        .from("child_placements")
        .select("*")
        .eq("org_id", input.orgId)
        .eq("id", input.placementId)
        .maybeSingle();

    if (readError) {
        throw new OperationalEnrollmentServiceError("db_error", readError.message);
    }
    if (!existing) {
        throw new OperationalEnrollmentServiceError("not_found", "Placement not found");
    }

    const prior = existing as ChildPlacementRow;
    if (prior.status === "canceled") {
        return prior;
    }
    // `ended` and `superseded` are assertions that the placement WAS true for a period. Cancelling
    // them would retroactively deny care that the record says happened, and anything derived from
    // it — occupancy, ratios, invoices — would no longer reconcile. A mistake discovered after a
    // row has been closed is a different problem from this one, and it is not solved by pretending
    // the row never existed.
    if (!isPlacementOperationalStatus(prior.status)) {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            "Only an operational placement can be cancelled; this one is already closed",
            { status: prior.status }
        );
    }

    const { data, error } = await supabase
        .from("child_placements")
        .update({
            status: "canceled",
            updated_by: trimOrNull(input.actorUserId),
        })
        .eq("org_id", input.orgId)
        .eq("id", input.placementId)
        .select("*")
        .single();

    if (error || !data) {
        throw new OperationalEnrollmentServiceError("db_error", error?.message ?? "update failed");
    }
    return data as ChildPlacementRow;
}

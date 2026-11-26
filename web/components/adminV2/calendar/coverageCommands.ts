/**
 * Coverage, from the Calendar, through the registered commands and nowhere else.
 *
 * Every mutation on this surface is one POST to the canonical action runtime with
 * a `staff_coverage.*` key. There is no Calendar-private write path, no PATCH of
 * an allocation, and no direct RPC — which is what keeps the authorization, the
 * atomicity, the audit and the operator-facing conflict message identical whether
 * Coverage is authored from here or from anywhere else.
 *
 * A transport helper and nothing more: it chooses no action, decides no payload
 * and allows nothing. The registry and the actions still own all of that.
 */

export type CoverageCommandResult = {
    ok: boolean;
    /** Operator-facing. Already translated by the action; never a constraint name. */
    message: string | null;
    blockerCode: string | null;
    affectedId: string | null;
};

async function execute(body: Record<string, unknown>): Promise<CoverageCommandResult> {
    const res = await fetch("/api/admin/actions/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, confirmation: { confirmed: true } }),
    });
    const json = await res.json().catch(() => ({}));
    const ok = res.ok && json?.ok !== false;
    if (ok) {
        return {
            ok: true,
            message: null,
            blockerCode: null,
            affectedId: json?.data?.affected_id ?? json?.data?.execution_result?.affectedId ?? null,
        };
    }
    const blockers = json?.error?.details?.blockers ?? json?.blockers ?? [];
    const first = Array.isArray(blockers) && blockers.length > 0 ? blockers[0] : null;
    const message =
        first?.message ??
        (typeof json?.error === "string" ? json.error : json?.error?.message) ??
        `That did not go through (${res.status}).`;
    return { ok: false, message, blockerCode: first?.code ?? json?.error?.code ?? null, affectedId: null };
}

export type PlanCoverageInput = {
    personId: string;
    employmentId?: string | null;
    serviceDate: string;
    startTime: string;
    endTime: string;
    siteLocationId: string;
    roomLocationId: string | null;
    reasonKey?: string | null;
};

export function planCoverageCommand(input: PlanCoverageInput): Promise<CoverageCommandResult> {
    return execute({
        action_key: "staff_coverage.plan",
        entity_type: "person",
        entity_id: input.personId,
        context: { surface: "operations_calendar" },
        payload: {
            person_id: input.personId,
            ...(input.employmentId ? { employment_id: input.employmentId } : {}),
            service_date: input.serviceDate,
            start_time: input.startTime,
            end_time: input.endTime,
            site_location_id: input.siteLocationId,
            // Site-level Coverage leaves the room empty rather than naming the site.
            room_location_id: input.roomLocationId ?? "",
            ...(input.reasonKey ? { reason_key: input.reasonKey } : {}),
        },
    });
}

export type ChangeCoverageInput = {
    personId: string;
    coverageId: string;
    /** A genuine change of plan, or a correction of something recorded wrongly. */
    intent: "change" | "correct";
    serviceDate?: string;
    startTime?: string;
    endTime?: string;
    siteLocationId?: string;
    /** Pass `null` to move the allocation to site level; omit to leave the room alone. */
    roomLocationId?: string | null;
    reasonKey?: string | null;
};

export function changeCoverageCommand(input: ChangeCoverageInput): Promise<CoverageCommandResult> {
    const roomGiven = Object.prototype.hasOwnProperty.call(input, "roomLocationId");
    return execute({
        action_key: input.intent === "correct" ? "staff_coverage.correct" : "staff_coverage.change",
        entity_type: "person",
        entity_id: input.personId,
        context: { surface: "operations_calendar" },
        payload: {
            coverage_id: input.coverageId,
            ...(input.serviceDate ? { service_date: input.serviceDate } : {}),
            ...(input.startTime ? { start_time: input.startTime } : {}),
            ...(input.endTime ? { end_time: input.endTime } : {}),
            ...(input.siteLocationId ? { site_location_id: input.siteLocationId } : {}),
            ...(roomGiven ? { room_location_id: input.roomLocationId ?? "" } : {}),
            ...(input.reasonKey ? { reason_key: input.reasonKey } : {}),
        },
    });
}

export function cancelCoverageCommand(input: {
    personId: string;
    coverageId: string;
    reasonKey?: string | null;
}): Promise<CoverageCommandResult> {
    return execute({
        action_key: "staff_coverage.cancel",
        entity_type: "person",
        entity_id: input.personId,
        context: { surface: "operations_calendar" },
        payload: {
            coverage_id: input.coverageId,
            ...(input.reasonKey ? { reason_key: input.reasonKey } : {}),
        },
    });
}

/**
 * "Alex called out today."
 *
 * The truthful smallest composition, and deliberately only the first half of it:
 * an Availability exception records the fact that they cannot work that date.
 * Their existing Coverage is NOT cancelled here — cancelling someone's plan is an
 * operator decision with consequences for the rooms they were covering, and doing
 * it silently is the behaviour the Coverage authority exists to prevent. The
 * surface surfaces what they were covering so the operator can act on each one.
 *
 * No Time Off authority is invented: this is the certified Availability exception
 * command, the same one the Staff record uses.
 */
export function callOutCommand(input: {
    personId: string;
    employmentId: string;
    date: string;
    reason?: string | null;
}): Promise<CoverageCommandResult> {
    return execute({
        action_key: "staff_availability.add_exception",
        entity_type: "person",
        entity_id: input.personId,
        context: { surface: "operations_calendar" },
        payload: {
            employment_id: input.employmentId,
            exception_date: input.date,
            exception_kind: "unavailable",
            ...(input.reason ? { reason: input.reason } : {}),
        },
    });
}

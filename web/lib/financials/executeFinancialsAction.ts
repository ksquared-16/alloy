/**
 * Post one governed action and turn a refusal into a sentence an operator can act on.
 *
 * Lifted out of `SchedulingCard` so the family Discount surface can invoke the SAME certified
 * exception actions without a second copy of the error handling. It is a transport helper and
 * nothing more: it chooses no action, supplies no payload, and decides nothing about what is
 * allowed — the registry and the action still own all of that.
 */
export async function executeFinancialsAction(body: Record<string, unknown>): Promise<void> {
    const { operatorFacingAssignmentError } = await import(
        "@/lib/operationalAssignments/operatorAssignmentErrors"
    );
    const res = await fetch("/api/admin/actions/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
        const err = json?.error;
        const message =
            typeof err === "string"
                ? err
                : err && typeof err === "object" && typeof err.message === "string"
                  ? err.message
                  : `Action failed (${res.status})`;
        throw new Error(operatorFacingAssignmentError(message));
    }
}

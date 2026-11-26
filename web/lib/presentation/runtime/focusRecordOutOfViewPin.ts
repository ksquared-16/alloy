/**
 * After a stage-changing outcome, keep the Focus Panel on the same record even when it
 * leaves the active Work View's row set. Short-lived pin — not a permanent resurrection.
 */

type OutOfViewPin = {
    orgId: string;
    workUnitId: string;
    recordId: string;
    expiresAt: number;
};

let pin: OutOfViewPin | null = null;

const PIN_TTL_MS = 10 * 60_000;

export function pinFocusRecordOutOfView(params: {
    orgId: string | null | undefined;
    workUnitId: string | null | undefined;
    recordId: string | null | undefined;
}): void {
    const orgId = params.orgId?.trim() || null;
    const workUnitId = params.workUnitId?.trim() || null;
    const recordId = params.recordId?.trim() || null;
    if (!orgId || !workUnitId || !recordId) return;
    pin = {
        orgId,
        workUnitId,
        recordId,
        expiresAt: Date.now() + PIN_TTL_MS,
    };
}

export function peekFocusRecordOutOfViewPin(params: {
    orgId: string | null | undefined;
    workUnitId: string | null | undefined;
}): string | null {
    if (!pin) return null;
    if (Date.now() > pin.expiresAt) {
        pin = null;
        return null;
    }
    const orgId = params.orgId?.trim() || null;
    const workUnitId = params.workUnitId?.trim() || null;
    if (!orgId || !workUnitId) return null;
    if (pin.orgId !== orgId || pin.workUnitId !== workUnitId) return null;
    return pin.recordId;
}

export function clearFocusRecordOutOfViewPin(): void {
    pin = null;
}

import { NextResponse } from "next/server";

/**
 * Self-elevation ban (I-11, partial G3 closure).
 *
 * No principal may modify its own authority — role, access scope, or membership — through any
 * product path. This is deliberately *not* the D3-dependent delegation ceiling (the subset rule,
 * W-18): no reading of D3 permits a principal to change its own authority, so this ban is
 * unconditional and ships ahead of that decision.
 */
export const SELF_AUTHORITY_MUTATION_MESSAGE =
    "You cannot change your own access. Ask another administrator to make this change.";

/**
 * True when the caller is the subject of the authority mutation.
 *
 * Compared on the trimmed principal id from the resolved access context — never on a value taken
 * from the request body, which the caller controls.
 */
export function isSelfAuthorityMutation(params: { callerUserId: string; targetUserId: string }): boolean {
    const caller = typeof params.callerUserId === "string" ? params.callerUserId.trim() : "";
    const target = typeof params.targetUserId === "string" ? params.targetUserId.trim() : "";
    if (!caller || !target) return false;
    return caller === target;
}

/** 403 returned to a principal attempting to modify its own authority. */
export function selfAuthorityMutationResponse(): NextResponse {
    return NextResponse.json({ error: SELF_AUTHORITY_MUTATION_MESSAGE }, { status: 403 });
}

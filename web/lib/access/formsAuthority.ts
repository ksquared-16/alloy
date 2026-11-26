import { NextResponse } from "next/server";

/**
 * FORMS AUTHORITY — what a caller may do, never what they are called.
 *
 * Every Forms write used to ask `ctx.role !== "admin"`. That is job-title authority: an organization
 * could not let someone handle submissions without also calling them an administrator, and calling
 * someone an administrator granted them form DESIGN whether or not that was intended.
 *
 * ── THE THREE AUTHORITIES, AND WHY CONFIRM IS ITS OWN ──
 *
 * `FORMS_AUTHOR` is design: forms, versions, publishing, packets, public links, lifecycle coverage.
 *
 * `FORMS_SUBMISSIONS` is handling that changes records or reaches people: sending a form, submitting
 * on someone's behalf, setting a linkage by hand, generating a document.
 *
 * `FORMS_SUBMISSIONS_CONFIRM` is only confirming that a linkage the system proposed is right —
 * metadata, no CRM mutation. It exists because the product already drew that line: `ops` could
 * confirm a linkage and could not set one, and folding the two together would have handed `ops` six
 * operations it never had. Nothing implies anything else; a role that needs all three holds all three.
 */
export const FORMS_AUTHOR = "forms.author" as const;
export const FORMS_SUBMISSIONS = "forms.submissions" as const;
export const FORMS_SUBMISSIONS_CONFIRM = "forms.submissions.confirm" as const;

export type FormsCapability = typeof FORMS_AUTHOR | typeof FORMS_SUBMISSIONS | typeof FORMS_SUBMISSIONS_CONFIRM;

/** True when the caller's effective capabilities carry this Forms authority. */
export function hasFormsCapability(
    ctx: { permissionKeys?: readonly string[] | null },
    capability: FormsCapability,
): boolean {
    return (ctx.permissionKeys ?? []).includes(capability);
}

/**
 * The refusal for a Forms write the caller has no capability for.
 *
 * Returns `null` when the caller is authorized, so a handler reads as
 * `const denied = requireFormsCapability(ctx, FORMS_AUTHOR); if (denied) return denied;` — the guard
 * stays in front of the write and the capability is named at the point of use.
 */
export function requireFormsCapability(
    ctx: { permissionKeys?: readonly string[] | null },
    capability: FormsCapability,
): NextResponse | null {
    if (hasFormsCapability(ctx, capability)) return null;
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

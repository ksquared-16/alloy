import { NextResponse } from "next/server";

/**
 * WHO MAY SEE PAY.
 *
 * Compensation is the first Staff fact in this estate that is not readable by
 * anyone who can open a staff record. Every other staff route declares
 * `status: "none"` on the stated grounds that reads of a staff record's own
 * operational facts are not gated anywhere — and that sentence stops being true
 * here. Qualifications and availability are read to run a day; a salary is not.
 *
 * ── A NEW KEY, WHICH NOBODY HOLDS YET ──
 *
 * `staff.compensation.read` and `staff.compensation.write` are new, so no existing
 * role grants them and nobody sees pay until an administrator deliberately says
 * who may. That is the intended migration behaviour: fail closed, and make the
 * first grant an explicit act rather than a side effect of already being an
 * operator. Reusing `fin.read` would have been quicker and wrong — Financials
 * answers what the organization earns and owes, not what it pays an individual,
 * and one key for both would have handed every bookkeeper the payroll file.
 *
 * ── IT ANSWERS THE CAPABILITY QUESTION ONLY ──
 *
 * Scope, tenancy and existence remain the handler's, exactly as
 * `requireFinancialsCapability` documents. A capability has never been permission
 * to reach across an organization.
 */

export const COMPENSATION_READ_PERMISSION_KEY = "staff.compensation.read" as const;
export const COMPENSATION_WRITE_PERMISSION_KEY = "staff.compensation.write" as const;

const READ_DENIED = "You do not have permission to view compensation.";
const WRITE_DENIED = "You do not have permission to change compensation.";

export function requireCompensationCapability(
    ctx: { permissionKeys?: readonly string[] | null },
    capability: typeof COMPENSATION_READ_PERMISSION_KEY | typeof COMPENSATION_WRITE_PERMISSION_KEY,
): NextResponse | null {
    if ((ctx.permissionKeys ?? []).includes(capability)) return null;
    return NextResponse.json(
        {
            error: capability === COMPENSATION_WRITE_PERMISSION_KEY ? WRITE_DENIED : READ_DENIED,
            required_permission: capability,
        },
        { status: 403 },
    );
}

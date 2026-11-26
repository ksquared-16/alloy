import { NextResponse } from "next/server";

import {
    adminContextFailureResponse,
    getAdminContextCached,
    type AdminContextFailure,
} from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached, type AdminAccessContextFailure } from "@/lib/admin/getAdminAccessContext";
import { requireAdminOrOps } from "@/lib/adminAuth";

import {
    CONFIG_ASSIST_PERMISSION_APPLY,
    CONFIG_ASSIST_PERMISSION_GENERATE,
    CONFIG_ASSIST_PERMISSION_REVIEW,
    hasConfigLayoutAssistPermission,
} from "./configurationProposalAccess";
import { permissionKeyForProposalTransition } from "./configurationProposalState";
import type { ConfigLayoutAssistProposalState } from "./configurationProposalState";

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/*
 * THE KEYS, NAMED LITERALLY WHERE THE GATE IS EXPRESSED.
 *
 * The route-capability checker binds a declaration with three joins: the handler must call the
 * named helper, the helper's verdict must be returned, and THE MODULE DEFINING THE HELPER must
 * name the declared key on an executable line. These gates satisfied the first two and failed the
 * third, because the key constants live in `configurationProposalAccess.ts` and arrived here only
 * as imported identifiers — so five handlers the server has always gated could not be declared,
 * and the inventory went on understating the server.
 *
 * The annotation is the guard against the obvious hazard of writing a key twice: each is typed as
 * the constant it must equal, so a drift between the two spellings is a compile error rather than
 * a silently decorative declaration.
 */
const GENERATE_KEY: typeof CONFIG_ASSIST_PERMISSION_GENERATE = "config_assist.generate";
const REVIEW_KEY: typeof CONFIG_ASSIST_PERMISSION_REVIEW = "config_assist.review";
const APPLY_KEY: typeof CONFIG_ASSIST_PERMISSION_APPLY = "config_assist.apply";

export function isConfigLayoutAssistProposalId(id: string): boolean {
    return UUID_RE.test(id.trim());
}

export async function requireConfigLayoutAssistPortal(): Promise<NextResponse | null> {
    return requireAdminOrOps();
}

export async function loadConfigLayoutAssistAdminContext(): Promise<
    | { ok: true; orgId: string; userId: string; role: string; permissionKeys: string[]; roleKeys: string[] }
    | { ok: false; response: NextResponse }
> {
    const forbidden = await requireConfigLayoutAssistPortal();
    if (forbidden) return { ok: false, response: forbidden };

    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return { ok: false, response: adminContextFailureResponse(ctx as AdminContextFailure) };
    }

    const access = await getAdminAccessContextCached();
    if (!access.ok) {
        return { ok: false, response: adminContextFailureResponse(access as AdminAccessContextFailure) };
    }

    return {
        ok: true,
        orgId: ctx.orgId,
        userId: ctx.userId,
        role: ctx.role,
        permissionKeys: access.permissionKeys,
        roleKeys: access.roleKeys,
    };
}

export function forbidUnlessGeneratePermission(
    access: Pick<{ permissionKeys: string[]; roleKeys: string[] }, "permissionKeys" | "roleKeys">
): NextResponse | null {
    if (!hasConfigLayoutAssistPermission(access, GENERATE_KEY)) {
        return NextResponse.json(
            { ok: false, error: "FORBIDDEN", message: "config_assist.generate required." },
            { status: 403 }
        );
    }
    return null;
}

export function forbidUnlessTransitionPermission(
    access: Pick<{ permissionKeys: string[]; roleKeys: string[] }, "permissionKeys" | "roleKeys">,
    toState: ConfigLayoutAssistProposalState
): NextResponse | null {
    const key = permissionKeyForProposalTransition(toState);
    if (!hasConfigLayoutAssistPermission(access, key)) {
        return NextResponse.json(
            {
                ok: false,
                error: "FORBIDDEN",
                message: `${key} required for transition to ${toState}.`,
            },
            { status: 403 }
        );
    }
    return null;
}

export function forbidUnlessReviewPermission(
    access: Pick<{ permissionKeys: string[]; roleKeys: string[] }, "permissionKeys" | "roleKeys">
): NextResponse | null {
    if (!hasConfigLayoutAssistPermission(access, REVIEW_KEY)) {
        return NextResponse.json(
            { ok: false, error: "FORBIDDEN", message: "config_assist.review required." },
            { status: 403 }
        );
    }
    return null;
}

export function forbidUnlessApplyPermission(
    access: Pick<{ permissionKeys: string[]; roleKeys: string[] }, "permissionKeys" | "roleKeys">
): NextResponse | null {
    if (!hasConfigLayoutAssistPermission(access, APPLY_KEY)) {
        return NextResponse.json(
            { ok: false, error: "FORBIDDEN", message: "config_assist.apply required." },
            { status: 403 }
        );
    }
    return null;
}

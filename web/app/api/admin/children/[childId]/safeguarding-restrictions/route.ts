/**
 * The operator authority for child safeguarding restrictions.
 *
 * `POST` is ADD_RESTRICTION and `GET` lists what is recorded. There is deliberately no `PUT`,
 * `PATCH` or `DELETE`: a restriction is append-and-transition, and ending one is its own named
 * intent at `./[restrictionId]/end`. Editing a protective order's terms in place would leave no
 * answer to "what was in force last Tuesday", which is the question this data exists to answer.
 *
 * ── AUTHORITY IS CHECKED HERE, NOT BY RLS ──
 *
 * This route holds a service-role client, which bypasses row-level security. The table's policies
 * are the specification; `canManageSafeguarding` / `canViewSafeguarding` are the enforcement on
 * this path, and they evaluate the same `user_roles` rows those policies read.
 *
 * The role union comes from the access bundle rather than `getAdminContext`, which projects roles
 * down to a compatibility `admin`/`ops` string that cannot express `owner`.
 *
 * ── TWO GATES, AND BOTH ARE NEEDED ──
 *
 * `crm.customers.write` is the catalogued capability for changing family and person records, and it
 * is checked first so this route is governed by the same catalog every other admin route answers to.
 * It is NOT sufficient on its own: that key is held broadly (admin AND ops in every organization),
 * and authoring a protective order must not be something everyone who can edit a contact may do.
 * `canManageSafeguarding` is the floor beneath it — owner/admin only, mirroring the table's own RLS
 * write policy. The conjunction is strictly narrower than either gate alone, which is the point.
 */

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse } from "@/lib/admin/getAdminContext";
import { loadAdminAccessBundleCached } from "@/lib/admin/getAdminAccessContext";
import { logAdminAudit } from "@/lib/admin/adminAuditLog";
import {
    requireCrmPeopleCapability,
    CRM_CUSTOMERS_READ,
    CRM_CUSTOMERS_WRITE,
} from "@/lib/access/crmPeopleAuthority";
import { canManageSafeguarding, canViewSafeguarding } from "@/lib/safeguarding/safeguardingAuthority";
import {
    addChildSafeguardingRestriction,
    listChildSafeguardingRestrictions,
} from "@/lib/safeguarding/childSafeguardingRestrictionService";

type RouteParams = { params: Promise<{ childId: string }> };

const NOT_FOUND_CODES = new Set(["child_not_found", "affected_person_not_found", "restriction_not_found"]);

function statusForCode(code: string): number {
    return NOT_FOUND_CODES.has(code) ? 404 : 400;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
    const bundle = await loadAdminAccessBundleCached();
    if (!bundle.ok) return adminContextFailureResponse(bundle);
    const capDenied = requireCrmPeopleCapability(bundle, CRM_CUSTOMERS_READ);
    if (capDenied) return capDenied;
    if (!canViewSafeguarding(bundle.roleKeys)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { childId } = await params;
    const result = await listChildSafeguardingRestrictions(createAdminClient(), bundle.orgId, childId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: statusForCode(result.code) });
    return NextResponse.json({ restrictions: result.value }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
    const bundle = await loadAdminAccessBundleCached();
    if (!bundle.ok) return adminContextFailureResponse(bundle);
    const capDenied = requireCrmPeopleCapability(bundle, CRM_CUSTOMERS_WRITE);
    if (capDenied) return capDenied;
    if (!canManageSafeguarding(bundle.roleKeys)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { childId } = await params;

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "A JSON body is required." }, { status: 400 });
    }

    const str = (k: string): string | null => {
        const v = body[k];
        return typeof v === "string" && v.trim() ? v.trim() : null;
    };

    const restrictionKind = str("restriction_kind");
    const operationalEffect = str("operational_effect");
    const evidenceBasis = str("evidence_basis");
    for (const [name, value] of [
        ["restriction_kind", restrictionKind],
        ["operational_effect", operationalEffect],
        ["evidence_basis", evidenceBasis],
    ] as const) {
        if (!value) return NextResponse.json({ error: `${name} is required.` }, { status: 400 });
    }

    const result = await addChildSafeguardingRestriction(createAdminClient(), {
        orgId: bundle.orgId,
        actorUserId: bundle.userId,
        childCustomerMemberId: childId,
        // Validated against the domain vocabulary inside the service, which owns the enums.
        restrictionKind: restrictionKind as never,
        operationalEffect: operationalEffect as never,
        evidenceBasis: evidenceBasis as never,
        affectedPersonId: str("affected_person_id"),
        affectedPartyDescription: str("affected_party_description"),
        effectiveFrom: str("effective_from"),
        effectiveTo: str("effective_to"),
        evidenceDocumentId: str("evidence_document_id"),
        sourceReference: str("source_reference"),
    });

    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: statusForCode(result.code) });
    }

    // Provenance lives in the row itself (created_by, reviewed_by, reviewed_at). This is the
    // operational trace beside it, and it names no restriction terms.
    logAdminAudit({
        entity: "child_safeguarding_restriction",
        id: String(result.value.id ?? ""),
        changed_fields: ["status:active"],
        actor_user_id: bundle.userId,
        role: "safeguarding.manage",
    });

    return NextResponse.json({ restriction: result.value }, { status: 201 });
}

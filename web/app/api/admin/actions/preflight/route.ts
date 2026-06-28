import { NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { runOpportunityActionPreflight } from "@/lib/admin/actions/adminActionPreflight";
import { effectiveRequirementsToValidationResult } from "@/lib/completion/evaluateEffectiveRequirements";
import { toBosCompletionRequirementPayload } from "@/lib/completion/bosIntegration";
import { apiOk, apiError, apiZodError } from "@/lib/api/apiResponse";

/**
 * Phase 2 contract: this route emits the standard envelope
 * (`{ ok, data, correlation_id }` / `{ ok, error, correlation_id }`).
 * @see docs/api/api-response-contract.md
 */
const PreflightBodySchema = z.object({
    action_key: z.string().trim().min(1, "action_key is required"),
    entity_type: z.string().trim().min(1, "entity_type is required"),
    entity_id: z.string().trim().min(1, "entity_id is required"),
    context: z
        .object({
            department_id: z.string().nullish(),
            work_unit_id: z.string().nullish(),
        })
        .optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
});

/** POST /api/admin/actions/preflight — evaluate action execute requirements without mutating. */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return apiError("BAD_REQUEST", "Invalid JSON", undefined, undefined, { request });
    }

    const parsed = PreflightBodySchema.safeParse(raw);
    if (!parsed.success) {
        return apiZodError(parsed.error, { request });
    }
    const body = parsed.data;

    const norm = body.entity_type.toLowerCase();
    if (norm !== "opportunity" && norm !== "opportunities") {
        return apiError("BAD_REQUEST", "Only opportunity preflight is supported in v1", undefined, undefined, {
            request,
        });
    }

    const supabase = createAdminClient();
    const effective = await runOpportunityActionPreflight({
        supabase,
        orgId: ctx.orgId,
        opportunityId: body.entity_id,
        actionKey: body.action_key,
        payload: body.payload,
        departmentId: body.context?.department_id,
        workUnitId: body.context?.work_unit_id,
    });

    const validation = effectiveRequirementsToValidationResult(effective);

    return apiOk(
        {
            effective_requirements: effective,
            completion_requirements: validation,
            bos_preflight: toBosCompletionRequirementPayload(validation),
            executable: effective.ok,
        },
        { request }
    );
}

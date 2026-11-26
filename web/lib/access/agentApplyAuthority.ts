/**
 * AGENT APPLY AUTHORITY FOLLOWS THE DOMAIN MUTATION. THERE IS NO AGENT SUPERUSER.
 *
 * An Agent apply route is a writer of somebody else's business object. When
 * `agent/v2/field-visibility` changes `field_definitions.is_visible_in_form`,
 * the effect on the organization is a Field System mutation — identical to the
 * one the Fields screen performs — and it is owned by `fields.manage`. That the
 * request arrived through an Agent surface is a fact about the caller's route,
 * not about the authority the caller needs.
 *
 * WHY NO `agent.suggestion.apply`. A generic Agent apply capability was
 * documented as a future key and is deliberately NOT created. The V1 census
 * disproved the premise: the three Agent/AI apply operations write three
 * different business objects owned by three different authorities
 * (`fields.manage`, `layouts.manage`, `ops.workflows.write`), so a single key
 * spanning them could only be a shortcut around all three. A principal holding
 * it would gain field, layout and workflow mutation at once, through the one
 * door that never asked the domain owner — which is the "AI is a superuser"
 * shape, rebuilt one level up.
 *
 * WHY NOT `ai.enrichment.use` AS WELL. Compound authority is asserted only where
 * it is true. These routes do not invoke a model: `agent/v2` and `agent/v1`
 * refuse outright without a caller-supplied `structured_override` — the refusal
 * reads "structured_override is required (LLM not enabled)" — and
 * `ai/workflow-assist/apply` commits a proposal carried in the request body. An
 * apply that only commits already-generated state needs the authority to make
 * that change, not the authority to have generated it. Requiring
 * `ai.enrichment.use` here would mean a Field Manager could not accept an Agent
 * suggestion without also holding AI authority, which withholds nothing from
 * anyone and only makes the field owner's own surface harder to reach.
 *
 * The AI half is still real and still separately enforced — it governs
 * compute/propose in `lib/ai/aiEnrichmentPermissions.ts`. Suggesting and
 * applying are different powers, and this module is the second one.
 */
import { NextResponse } from "next/server";

/** Managing the organization's field definitions. Owner of Agent field-visibility apply. */
export const FIELDS_MANAGE = "fields.manage" as const;

/** Managing record layouts. Owner of Agent record-overview-layout apply. */
export const LAYOUTS_MANAGE = "layouts.manage" as const;

/** Writing workflows and their actions. Owner of Workflow Assist apply. */
export const OPS_WORKFLOWS_WRITE = "ops.workflows.write" as const;

/**
 * Every domain authority an Agent/AI apply route may require, as a closed set.
 * A lock reads this to assert the set has not silently grown a generic key.
 */
export const AGENT_APPLY_DOMAIN_AUTHORITIES = [
    FIELDS_MANAGE,
    LAYOUTS_MANAGE,
    OPS_WORKFLOWS_WRITE,
] as const;

export type AgentApplyDomainAuthority = (typeof AGENT_APPLY_DOMAIN_AUTHORITIES)[number];

/** Pure: does this resolved context carry the domain authority this apply needs? */
export function hasAgentApplyDomainAuthority(
    ctx: { permissionKeys?: readonly string[] | null },
    key: AgentApplyDomainAuthority,
): boolean {
    return (ctx.permissionKeys ?? []).includes(key);
}

/**
 * Refuse unless the caller may perform the underlying domain mutation, naming
 * the key so a denial is debuggable rather than merely forbidden.
 *
 * No role title is consulted, and no environment flag: a principal is admitted
 * by grant or not at all, and identically in every deployment.
 */
export function requireAgentApplyDomainAuthority(
    ctx: { permissionKeys?: readonly string[] | null },
    key: AgentApplyDomainAuthority,
): NextResponse | null {
    if (hasAgentApplyDomainAuthority(ctx, key)) return null;
    return NextResponse.json(
        { error: "Forbidden", required_permission: key },
        { status: 403 },
    );
}

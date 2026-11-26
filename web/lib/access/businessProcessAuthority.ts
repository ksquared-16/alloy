import { NextResponse } from "next/server";

/**
 * BUSINESS PROCESS — capability authority for lifecycle configuration and activation.
 *
 * Eight handlers under `/api/admin/departments` asked `ctx.role !== "admin"`, and the Department
 * convergence census proved none of them is a department operation. Every mounted caller of
 * `lifecycle-builder`, `lifecycle-requirements`, `lifecycle-actions-matrix` and `lifecycle-activation`
 * is a Lifecycle or Business Process surface; the generic POST is reached only by
 * `createLifecycleViaBuilderPath`, which provisions the runtime identity of a NEW Business Process;
 * and the generic PATCH's only lifecycle caller is the rename that keeps `departments.name` in step
 * with the process name. These are Business Process operations wearing a legacy namespace, so the
 * authority belongs to Business Process — not to a `departments.*` key that would re-legitimise a
 * product the platform has retired.
 *
 * Canonical doctrine already agrees: `docs/platform/core/entity-model.md` lists `departments` as
 * "ACL + metadata ownership" beside `lifecycles` and `work_units`, and gives the operator model as
 * Process → Stage → Record. `business-process-system.md` records that builder API paths keep their
 * `lifecycle-*` spelling — accepted, rename deferred. This module converges the authority without
 * moving a single route.
 *
 * ── THE SPLIT ──
 *
 * `business_process.configure`  designing the process: builder edits, stage requirements, the
 *                               actions matrix, publishing a configuration, and provisioning the
 *                               runtime identity a new process needs. Everything here changes what
 *                               a process WOULD do.
 *
 * `business_process.activate`   changing which configuration is actually live, and tearing an
 *                               activated lifecycle down. This is deliberately NOT implied by
 *                               configure: a role may be trusted to design a process without being
 *                               trusted to switch the tenant onto it. Same reasoning that kept
 *                               `layouts.lifecycle` out of `layouts.manage`.
 *
 * Neither implies the other. A role that needs both holds both.
 *
 * ── ONE WRITE SHAPE THIS MODULE DELIBERATELY DOES NOT OWN ──
 *
 * `PATCH /api/admin/departments/[departmentId]` carries two live shapes. `{ name }` is the lifecycle
 * rename sync and is Business Process configuration. `{ metadata: { opportunity_attention_rules } }`
 * is the org-wide attention/SLA settings page, and it is NOT a Business Process write — the rules
 * drive `resolveOpportunityAttention`, and the metadata catalog files them under `crm_attention`.
 *
 * The one existing key that could plausibly own it, `settings.manage`, is granted to admin AND ops
 * today, while the route it would replace is admin-only — so reusing it would hand ops an authority
 * it does not currently have. Gating that shape under `business_process.configure` instead would
 * turn a process-design key into a generic JSON metadata-write key, which is exactly the boundary
 * the Director drew. So that shape keeps its role gate, recorded as
 * ATTENTION_SLA_METADATA_AUTHORITY_DEBT, until its own owner exists. It is no more reachable than
 * it was before this slice.
 */
export const BUSINESS_PROCESS_CONFIGURE = "business_process.configure" as const;
export const BUSINESS_PROCESS_ACTIVATE = "business_process.activate" as const;

export type BusinessProcessCapability =
    | typeof BUSINESS_PROCESS_CONFIGURE
    | typeof BUSINESS_PROCESS_ACTIVATE;

/** True when the caller's effective capabilities carry this Business Process authority. */
export function hasBusinessProcessCapability(
    ctx: { permissionKeys?: readonly string[] | null },
    capability: BusinessProcessCapability,
): boolean {
    return (ctx.permissionKeys ?? []).includes(capability);
}

/**
 * The refusal for a Business Process mutation the caller has no capability for.
 *
 * Returns `null` when authorized, so a handler reads as
 * `const denied = requireBusinessProcessCapability(ctx, BUSINESS_PROCESS_ACTIVATE); if (denied) return denied;`
 */
export function requireBusinessProcessCapability(
    ctx: { permissionKeys?: readonly string[] | null },
    capability: BusinessProcessCapability,
): NextResponse | null {
    if (hasBusinessProcessCapability(ctx, capability)) return null;
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

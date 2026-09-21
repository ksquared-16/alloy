import { findFirstOrderCapability } from "@/lib/runtime/firstOrder/firstOrderCapabilityRegistry";
import {
    KPI_CAPABILITY_FAMILY, WORK_VIEW_CAPABILITY_FAMILY,
    type FirstOrderCapability, type FirstOrderPrerequisiteKey, type FirstOrderUnsupportedCapability,
} from "@/lib/runtime/firstOrder/firstOrderCapability";

/**
 * THE CONFIGURATION COMPILER.
 *
 * published surface configuration
 *   → required semantic keys (in configured order)
 *   → registered capabilities
 *   → deduplicated prerequisite set
 *   → execution plan
 *   → (composer runs it)
 *   → authoritative projection with configuration-owned geometry.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO:
 *
 *   It does not know a card key. Cards arrive as an ordered list of `{cardKey, semanticKeys}` and
 *   leave as the same identities; nothing here branches on which card it is looking at, so a
 *   Billing surface compiles through the same path as an Enrollment one with no process-specific
 *   branch and no second composer.
 *
 *   It does not evaluate authorization. Capabilities declare a REQUIREMENT; the plan records that
 *   requirement so the composer can evaluate it at request time against the caller's gate. A
 *   verdict compiled into a plan would be a cached permission, and permissions are not
 *   configuration.
 *
 *   It does not decide product importance. Which fields are first-order is decided by the
 *   configured surface (a field's `placement: "collapsed"`) or, absent configuration, by the
 *   card's own registry declaration. The compiler reads that decision; it never makes it.
 */

export type CompiledCardRequirement = {
    readonly cardKey: string;
    /** Configured semantic keys IN CONFIGURED ORDER. Order is presentation and is preserved. */
    readonly semanticKeys: readonly string[];
};

export type FirstOrderSurfaceConfiguration = {
    /** Configured cards IN ORDER, each with its configured first-order semantic keys IN ORDER. */
    readonly cards: readonly CompiledCardRequirement[];
    /**
     * Configured KPI slots IN ORDER. These are VALUES, not geometry: a KPI slot with no value is
     * not a first-order-complete frame, so each one selects a capability exactly as a card field
     * does.
     */
    readonly kpiKeys: readonly string[];
    /** Configured Work View identities IN ORDER. Also values, for the same reason. */
    readonly workViewIds: readonly string[];
    readonly siteScopeId: string | null;
};

/**
 * DYNAMIC CAPABILITY FAMILIES.
 *
 * A card field names a semantic key the platform registers once. A KPI slot and a Work View name
 * a TENANT-CONFIGURED identity, so there is no fixed list to register against — `needs_attention`
 * on one tenant and `overdue_work` on another are the same capability family with different
 * members.
 *
 * They are therefore resolved by FAMILY: the family owns the prerequisite, the authorization and
 * the projector, and the configured identity selects a member of it. That keeps one owner per
 * family rather than a registry entry per tenant value, and it is still configuration selecting
 * capabilities — nothing here knows which KPIs exist.
 */
export { KPI_CAPABILITY_FAMILY, WORK_VIEW_CAPABILITY_FAMILY } from "@/lib/runtime/firstOrder/firstOrderCapability";

export type CompiledField = {
    readonly cardKey: string;
    readonly semanticKey: string;
    readonly capability: FirstOrderCapability;
};

export type FirstOrderPlan = {
    /** Selected fields, grouped by card, in configured order. */
    readonly fields: readonly CompiledField[];
    /** Every prerequisite any selected field needs — DEDUPLICATED. This is what gets executed. */
    readonly prerequisites: ReadonlySet<FirstOrderPrerequisiteKey>;
    /** Configured keys with no registered capability. A non-empty list is a COMPILE FAILURE. */
    readonly unsupported: readonly FirstOrderUnsupportedCapability[];
    readonly ok: boolean;
};

/**
 * Prerequisites the projection contract itself needs, independent of any configured field.
 *
 * `FirstOrderWorkUnitProjection` always carries queue rows, and a queue row is the work unit's
 * population plus the viewer's own seen-state. These are not card fields and no configuration can
 * remove them, so they are stated here rather than smuggled in as a capability nobody selected.
 */
export const PROJECTION_BASE_PREREQUISITES: readonly FirstOrderPrerequisiteKey[] = ["population", "personal_seen"];

/**
 * Prerequisites that cannot start until another prerequisite has landed.
 *
 * This is the REPAIRED DAG expressed as data. The repair it preserves was worth 200ms: CRM,
 * children and personal_seen once waited on the whole of phase 1 — including `prepaid`, which none
 * of them consume — and the DAG bound at 576ms instead of 375ms. Declaring the edge means the
 * planner can only ever serialize what genuinely depends, and a future capability cannot
 * reintroduce the defect by being added to the wrong phase.
 */
export const PREREQUISITE_DEPENDENCIES: Readonly<Record<string, readonly FirstOrderPrerequisiteKey[]>> = {
    crm_projection: ["population"],
    children_projection: ["population"],
    personal_seen: ["population"],
};

export function compileFirstOrderPlan(configuration: FirstOrderSurfaceConfiguration): FirstOrderPlan {
    const fields: CompiledField[] = [];
    const unsupported: FirstOrderUnsupportedCapability[] = [];
    const prerequisites = new Set<FirstOrderPrerequisiteKey>(PROJECTION_BASE_PREREQUISITES);

    /*
     * KPI and Work View values join the SAME plan as card fields. They are not a second pass and
     * not a seed running beside the composition: one plan, one deduplicated prerequisite set, one
     * concurrent execution. A surface configuring no KPI selects no KPI capability and pays
     * nothing for it.
     */
    const valueSlots: Array<{ cardKey: string; keys: readonly string[]; family: string }> = [
        { cardKey: KPI_CAPABILITY_FAMILY, keys: configuration.kpiKeys, family: KPI_CAPABILITY_FAMILY },
        { cardKey: WORK_VIEW_CAPABILITY_FAMILY, keys: configuration.workViewIds, family: WORK_VIEW_CAPABILITY_FAMILY },
    ];
    for (const slot of valueSlots) {
        for (const identity of slot.keys) {
            const capability = findFirstOrderCapability(`${slot.family}:*`);
            if (!capability) {
                unsupported.push({
                    semanticKey: `${slot.family}:${identity}`, cardKey: slot.cardKey,
                    reason: "no_registered_capability",
                    message: `No first-order capability family is registered for "${slot.family}".`,
                });
                continue;
            }
            fields.push({ cardKey: slot.cardKey, semanticKey: `${slot.family}:${identity}`, capability });
            for (const p of capability.prerequisites) {
                prerequisites.add(p);
                for (const dep of PREREQUISITE_DEPENDENCIES[p] ?? []) prerequisites.add(dep);
            }
        }
    }

    for (const card of configuration.cards) {
        for (const semanticKey of card.semanticKeys) {
            const capability = findFirstOrderCapability(semanticKey);
            if (!capability) {
                /*
                 * UNSUPPORTED CAPABILITY IS NOT UNKNOWN.
                 *
                 * UNKNOWN means the platform tried to answer and could not. Nobody tried here:
                 * the configuration names a fact no capability implements. Rendering UNKNOWN, or
                 * zero, or an empty region, would present a missing IMPLEMENTATION as a missing
                 * VALUE, and an operator cannot tell those apart. It fails the compile instead.
                 */
                unsupported.push({
                    semanticKey, cardKey: card.cardKey, reason: "no_registered_capability",
                    message: `No first-order capability is registered for "${semanticKey}" (configured on card "${card.cardKey}"). `
                        + "Composing existing capabilities is configuration; this key names a new capability, which requires code.",
                });
                continue;
            }
            fields.push({ cardKey: card.cardKey, semanticKey, capability });
            for (const p of capability.prerequisites) {
                prerequisites.add(p);
                for (const dep of PREREQUISITE_DEPENDENCIES[p] ?? []) prerequisites.add(dep);
            }
        }
    }

    return { fields, prerequisites, unsupported, ok: unsupported.length === 0 };
}

/** The distinct authorization requirements a plan carries. Evaluated by the caller, never here. */
export function planAuthorityRequirements(plan: FirstOrderPlan): Set<string> {
    const out = new Set<string>();
    for (const f of plan.fields) if (f.capability.authorization !== "none") out.add(f.capability.authorization);
    return out;
}

/**
 * The participant packet is DERIVED from Business Process Form requirements (B1, option C).
 *
 * ```
 *   governing revision → effective stage → requirements_v1 → kind:"form" → ordered packet steps
 * ```
 *
 * ## The packet is a vehicle, not an authority
 *
 * The Forms runtime realizes participant work through a packet definition and a session, so a
 * definition has to exist. That is a transport requirement, and this module keeps it one: the
 * definition is a projection of the requirements, addressed by a key computed from them, and it is
 * never authored. Nothing here lets a packet say what Enrollment requires.
 *
 * The alternative — an operator or a setting naming a packet — was rejected by the Director
 * decision, and this module has to actively defend against it, because a derived definition is an
 * ordinary `form_packet_definitions` row that the Packet Composer UI can also edit. So the
 * definition is verified against the requirements on EVERY reuse and refuses on any divergence
 * (`packet_drift`). A step added to the packet by hand does not become an Enrollment requirement;
 * it stops the launch and says so.
 *
 * ## Why the grain is (revision, stage)
 *
 * Read off the requirement model rather than chosen: `canonicalStageRequirements(builder, stageKey,
 * processKey)` is stated per stage within one revision's payload, and D-96 pins a running journey to
 * exactly one revision. So (revision, stage) is the precise identity of the requirement set
 * governing a journey.
 *
 * The consequences fall out correctly. A republish produces a new revision id, so it produces a new
 * derived packet, and journeys pinned to the old revision keep the old one — a republish cannot
 * reach into a running Enrollment. Two families in the same stage of the same revision share one
 * definition, which is what a definition IS; their answers live in their own sessions.
 *
 * A per-revision grain would merge stages that require different forms. A per-instance grain would
 * mint a template per family, which is what a session already is.
 *
 * ## D-94 is not restated here
 *
 * Steps are created with `pinned_form_definition_version_id: null`. Version pinning happens once, at
 * SESSION realization, where `ensurePacketSessionForPublicLink` already resolves and pins the
 * current published version per step. Pinning a version onto the definition would put Form version
 * identity in the requirement projection, which the decision explicitly forbids, and would freeze
 * every future family to whatever was published the first time any family started.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { canonicalStageRequirements } from "@/lib/lifecycle/effectiveStageRequirements";
import type { LifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { StageRequirementV1 } from "@/lib/lifecycle/stageRequirementsV1";

/** One participant artifact the governing revision requires, in authored order. */
export type RequirementDerivedStep = {
    readonly requirement_id: string;
    readonly form_definition_id: string;
    readonly level: StageRequirementV1["level"];
};

export type RequirementDerivedPacketPlan = {
    readonly stage_key: string;
    readonly steps: readonly RequirementDerivedStep[];
};

export type RequirementDerivedPacketRefusal =
    /** The revision says nothing about this stage, or says it requires no Forms (D-90). */
    | { readonly code: "no_form_requirements"; readonly detail: string }
    /** A definition exists under the derived key whose steps are not the derived steps. */
    | { readonly code: "packet_drift"; readonly detail: string }
    | { readonly code: "read_failed"; readonly detail: string }
    | { readonly code: "write_failed"; readonly detail: string };

export type RequirementDerivedPacketResult =
    | {
          readonly ok: true;
          readonly packetDefinitionId: string;
          readonly plan: RequirementDerivedPacketPlan;
          readonly outcome: "created" | "reused";
      }
    | { readonly ok: false; readonly refusal: RequirementDerivedPacketRefusal };

/**
 * Project the governing revision's Form requirements for one stage into ordered packet steps.
 *
 * Pure. The authored order of `requirements_v1` is the step order — the participant meets the
 * artifacts in the order the operator wrote them, and no sort is applied on top, because any sort
 * here would be this module deciding sequence the configuration already decided.
 */
export function planRequirementDerivedPacket(input: {
    readonly builder: LifecycleBuilderV1 | null;
    readonly processKey: string;
    readonly stageKey: string;
}): RequirementDerivedPacketPlan {
    const section = canonicalStageRequirements(input.builder, input.stageKey, input.processKey);
    const steps: RequirementDerivedStep[] = [];
    for (const requirement of section?.requirements ?? []) {
        if (requirement.ref.kind !== "form") continue;
        steps.push({
            requirement_id: requirement.requirement_id,
            form_definition_id: requirement.ref.form_definition_id,
            level: requirement.level,
        });
    }
    return { stage_key: input.stageKey, steps };
}

/**
 * The address of a derived packet definition.
 *
 * Deterministic in (revision, stage) so the same requirement set resolves the same row without a
 * lookup table, and `form_packet_definitions` already enforces `UNIQUE (org_id, key)` — two
 * concurrent launches race to the same key and the loser reads the winner's row.
 *
 * Dashes are stripped from the revision id only to keep the key readable; it stays a full uuid, so
 * two revisions cannot collide.
 */
export function requirementDerivedPacketKey(revisionId: string, stageKey: string): string {
    return `bp_rev_${revisionId.replace(/-/g, "")}_${stageKey}`;
}

export const REQUIREMENT_DERIVED_PACKET_SOURCE = "business_process_requirements" as const;

type PacketItemRow = { sequence_index: number; form_definition_id: string };

function sameSteps(
    existing: readonly PacketItemRow[],
    planned: readonly RequirementDerivedStep[],
): boolean {
    if (existing.length !== planned.length) return false;
    const ordered = [...existing].sort((a, b) => a.sequence_index - b.sequence_index);
    return ordered.every(
        (row, i) => row.sequence_index === i && row.form_definition_id === planned[i].form_definition_id,
    );
}

/**
 * Resolve — creating only when absent — the packet definition that realizes these requirements.
 *
 * Refuses rather than inventing anything: no Form requirements means no packet, because a packet
 * with no steps is not a smaller Enrollment, it is a participant surface that asks for nothing while
 * claiming a journey has begun.
 */
export async function ensureRequirementDerivedPacketDefinition(
    supabase: SupabaseClient,
    input: {
        readonly orgId: string;
        readonly revisionId: string;
        readonly processKey: string;
        readonly plan: RequirementDerivedPacketPlan;
        /** Operator-facing name. Only ever a label; identity is the key. */
        readonly label?: string;
    },
): Promise<RequirementDerivedPacketResult> {
    const { orgId, revisionId, plan } = input;

    if (plan.steps.length === 0) {
        return {
            ok: false,
            refusal: {
                code: "no_form_requirements",
                detail: `Stage “${plan.stage_key}” requires no Forms of the participant, so there is nothing to send.`,
            },
        };
    }

    const key = requirementDerivedPacketKey(revisionId, plan.stage_key);

    const { data: existing, error: readErr } = await supabase
        .from("form_packet_definitions")
        .select("id")
        .eq("org_id", orgId)
        .eq("key", key)
        .maybeSingle();
    if (readErr) return { ok: false, refusal: { code: "read_failed", detail: readErr.message } };

    if (existing) {
        const packetDefinitionId = String((existing as { id: string }).id);
        const { data: items, error: itemsErr } = await supabase
            .from("form_packet_items")
            .select("sequence_index, form_definition_id")
            .eq("org_id", orgId)
            .eq("packet_definition_id", packetDefinitionId)
            .order("sequence_index", { ascending: true });
        if (itemsErr) return { ok: false, refusal: { code: "read_failed", detail: itemsErr.message } };

        // Verified on every reuse, not only at creation. The derived row is an ordinary packet
        // definition and the composer UI can edit it; without this check an edited step would
        // silently become something the platform presents as an Enrollment requirement.
        if (!sameSteps((items ?? []) as PacketItemRow[], plan.steps)) {
            return {
                ok: false,
                refusal: {
                    code: "packet_drift",
                    detail:
                        `The derived packet for stage “${plan.stage_key}” no longer matches the Business ` +
                        `Process Form requirements it was derived from. Requirements are the authority; ` +
                        `the packet was edited elsewhere and cannot be used until it agrees.`,
                },
            };
        }

        return { ok: true, packetDefinitionId, plan, outcome: "reused" };
    }

    const { data: created, error: insErr } = await supabase
        .from("form_packet_definitions")
        .insert({
            org_id: orgId,
            key,
            name: input.label ?? `Enrollment — ${plan.stage_key}`,
            description: null,
            is_active: true,
            metadata: {
                derived_from: REQUIREMENT_DERIVED_PACKET_SOURCE,
                business_process_revision_id: revisionId,
                process_key: input.processKey,
                stage_key: plan.stage_key,
                requirement_ids: plan.steps.map((s) => s.requirement_id),
                // Completing this packet must open a Processing case, the same as any other
                // participant packet — the on-ramp gates on this marker.
                pos_connected: true,
            },
        })
        .select("id")
        .maybeSingle();

    if (insErr || !created) {
        // Lost the race to a concurrent launch: the winner's row is the canonical one. Re-resolve
        // through this same function so the drift check runs against it too.
        const { data: raced } = await supabase
            .from("form_packet_definitions")
            .select("id")
            .eq("org_id", orgId)
            .eq("key", key)
            .maybeSingle();
        if (!raced) {
            return {
                ok: false,
                refusal: { code: "write_failed", detail: insErr?.message ?? "Packet definition insert failed" },
            };
        }
        return ensureRequirementDerivedPacketDefinition(supabase, input);
    }

    const packetDefinitionId = String((created as { id: string }).id);
    const { error: stepsErr } = await supabase.from("form_packet_items").insert(
        plan.steps.map((step, index) => ({
            org_id: orgId,
            packet_definition_id: packetDefinitionId,
            sequence_index: index,
            form_definition_id: step.form_definition_id,
            // D-94: the version is resolved and pinned at SESSION realization, never here.
            pinned_form_definition_version_id: null,
            metadata: { requirement_id: step.requirement_id, requirement_level: step.level },
        })),
    );
    if (stepsErr) {
        return { ok: false, refusal: { code: "write_failed", detail: stepsErr.message } };
    }

    return { ok: true, packetDefinitionId, plan, outcome: "created" };
}

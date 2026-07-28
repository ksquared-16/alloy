/**
 * Publish validation for process command_set_v1 + stage/WT references (P6.S3).
 */

import type { LifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { parseProcessCommandSetV1 } from "@/lib/lifecycle/processCommandSetV1";
import { listEnabledCommandKeys } from "@/lib/lifecycle/processCommandSetV1";
import { tryResolvePlatformCapability } from "@/lib/platform/commands/capabilityRegistry";
import { normalizeActionRefToIntentKey } from "@/lib/lifecycle/workTemplateActionIntentCatalog";

export type ProcessCommandSetPublishIssue = {
    code:
        | "invalid_command_set"
        | "unknown_capability"
        | "stage_orphan"
        | "work_template_orphan";
    processKey: string;
    stageKey?: string;
    capabilityKey?: string;
    message: string;
};

function resolveCanon(key: string): string {
    const resolved = tryResolvePlatformCapability(key);
    if (resolved.status === "known") return resolved.capability.canonicalCommandKey;
    return key.trim();
}

function selectedSet(process: {
    command_set_v1?: { commands: Array<{ capability_key: string; enabled: boolean }> };
}): Set<string> {
    const set = process.command_set_v1;
    if (!set) return new Set();
    const keys = listEnabledCommandKeys(set as never, resolveCanon);
    const out = new Set<string>();
    for (const k of keys) {
        out.add(k);
        out.add(normalizeActionRefToIntentKey(k));
    }
    return out;
}

/**
 * Validate command_set_v1 shape and that stage/WT refs ⊆ process selection when V1 present.
 * When V1 absent, skip orphan checks (legacy compatibility still active).
 */
export function validateProcessCommandSetsForPublish(
    config: LifecycleBuilderV1
): { ok: true } | { ok: false; issues: ProcessCommandSetPublishIssue[] } {
    const issues: ProcessCommandSetPublishIssue[] = [];

    for (const process of config.processes) {
        if (!process.command_set_v1) continue;

        const parsed = parseProcessCommandSetV1(process.command_set_v1);
        if (!parsed.ok) {
            issues.push({
                code: "invalid_command_set",
                processKey: process.key,
                message: parsed.issues[0]?.message ?? "Invalid command_set_v1.",
            });
            continue;
        }

        for (const entry of parsed.value.commands) {
            const resolved = tryResolvePlatformCapability(entry.capability_key);
            if (resolved.status !== "known") {
                issues.push({
                    code: "unknown_capability",
                    processKey: process.key,
                    capabilityKey: entry.capability_key,
                    message: `Unknown capability '${entry.capability_key}' in command_set_v1.`,
                });
            }
        }

        const selected = selectedSet(process);

        for (const stage of process.stages ?? []) {
            for (const row of stage.action_catalog_v1?.candidate_actions ?? []) {
                const key = row.action_key.trim();
                if (!key) continue;
                const canon = resolveCanon(key);
                const intent = normalizeActionRefToIntentKey(key);
                if (selected.has(canon) || selected.has(intent) || selected.has(key)) continue;
                issues.push({
                    code: "stage_orphan",
                    processKey: process.key,
                    stageKey: stage.key,
                    capabilityKey: key,
                    message: `Stage '${stage.key}' references '${key}' which is not process-selected.`,
                });
            }

            for (const wt of stage.stage_operating_plan_v1?.work_templates ?? []) {
                const refs = [
                    wt.primary_action?.action_ref,
                    ...(wt.helpful_actions ?? []).map((r) => r.action_ref),
                ];
                for (const ref of refs) {
                    const key = ref?.trim();
                    if (!key) continue;
                    const canon = resolveCanon(key);
                    const intent = normalizeActionRefToIntentKey(key);
                    if (selected.has(canon) || selected.has(intent) || selected.has(key)) continue;
                    issues.push({
                        code: "work_template_orphan",
                        processKey: process.key,
                        stageKey: stage.key,
                        capabilityKey: key,
                        message: `Work Template on '${stage.key}' references '${key}' which is not process-selected.`,
                    });
                }
            }
        }
    }

    if (issues.length) return { ok: false, issues };
    return { ok: true };
}

/**
 * Process-wide Command selection authority resolver (P6.S1).
 *
 * Precedence:
 *   1. command_set_v1 when present (even if empty)
 *   2. legacy_compatibility via migrateLegacyProcessCommands
 *   3. never a silent union of V1 + legacy
 */

import type { LifecycleBuilderProcessRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { LifecycleConfiguredActionRow } from "@/lib/lifecycle/lifecycleConfiguredActionRows";
import { migrateLegacyProcessCommands } from "@/lib/lifecycle/migrateLegacyProcessCommands";
import type { BusinessProcessCommandSetV1 } from "@/lib/lifecycle/processCommandSetV1";

export type BusinessProcessCommandSelectionAuthority =
    | "command_set_v1"
    | "legacy_compatibility";

export type BusinessProcessCommandSelectionResult = {
    authority: BusinessProcessCommandSelectionAuthority;
    commands: BusinessProcessCommandSetV1;
    processId: string;
    processKey: string;
    /** Present when authority is legacy_compatibility. */
    legacySources?: readonly string[];
    diagnostics: readonly BusinessProcessCommandSelectionDiagnostic[];
};

export type BusinessProcessCommandSelectionDiagnostic = {
    code:
        | "authority_command_set_v1"
        | "authority_legacy_compatibility"
        | "legacy_sources"
        | "empty_selection";
    message: string;
};

export function resolveBusinessProcessCommandSelection(input: {
    process: LifecycleBuilderProcessRecord;
    lifecycleConfiguredActions?: readonly LifecycleConfiguredActionRow[] | null;
}): BusinessProcessCommandSelectionResult {
    const processId = input.process.id;
    const processKey = input.process.key;
    const diagnostics: BusinessProcessCommandSelectionDiagnostic[] = [];

    if (input.process.command_set_v1) {
        diagnostics.push({
            code: "authority_command_set_v1",
            message: `process=${processKey} authority=command_set_v1 count=${input.process.command_set_v1.commands.length}`,
        });
        if (input.process.command_set_v1.commands.length === 0) {
            diagnostics.push({
                code: "empty_selection",
                message: `process=${processKey} command_set_v1 is empty — no process-selected Commands.`,
            });
        }
        return {
            authority: "command_set_v1",
            commands: input.process.command_set_v1,
            processId,
            processKey,
            diagnostics,
        };
    }

    const migrated = migrateLegacyProcessCommands({
        process: input.process,
        lifecycleConfiguredActions: input.lifecycleConfiguredActions,
    });
    diagnostics.push({
        code: "authority_legacy_compatibility",
        message: `process=${processKey} authority=legacy_compatibility`,
    });
    diagnostics.push({
        code: "legacy_sources",
        message: `process=${processKey} sources=${migrated.sources.join(",") || "none"}`,
    });
    if (migrated.commands.commands.length === 0) {
        diagnostics.push({
            code: "empty_selection",
            message: `process=${processKey} legacy compatibility produced no Commands.`,
        });
    }

    return {
        authority: "legacy_compatibility",
        commands: migrated.commands,
        processId,
        processKey,
        legacySources: migrated.sources,
        diagnostics,
    };
}

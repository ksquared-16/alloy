import type { RecordDrawerShellContract } from "@/lib/adminV2/shellContracts/types";
import type { CompileOpportunityRecordDrawerShellInput } from "@/lib/adminV2/shellContracts/compileOpportunityRecordDrawerShell";
import { opportunityDrawerLayoutVersion } from "@/lib/adminV2/shellContracts/compileOpportunityRecordDrawerShell";

const MAX_ENTRIES = 32;

const shellByLayoutKey = new Map<string, RecordDrawerShellContract>();

function shellCompileCacheKey(input: CompileOpportunityRecordDrawerShellInput): string | null {
    const cfg = input.config_json;
    if (!cfg) return null;
    const fieldKeys = input.field_definitions
        .map((f) => String(f.field_key ?? "").trim())
        .filter(Boolean)
        .sort()
        .join(",");
    return `${opportunityDrawerLayoutVersion(cfg)}|${fieldKeys}`;
}

export function getCachedOpportunityDrawerShell(
    input: CompileOpportunityRecordDrawerShellInput
): RecordDrawerShellContract | undefined {
    const key = shellCompileCacheKey(input);
    if (!key) return undefined;
    return shellByLayoutKey.get(key);
}

export function setCachedOpportunityDrawerShell(
    input: CompileOpportunityRecordDrawerShellInput,
    shell: RecordDrawerShellContract
): void {
    const key = shellCompileCacheKey(input);
    if (!key) return;
    if (shellByLayoutKey.size >= MAX_ENTRIES && !shellByLayoutKey.has(key)) {
        const first = shellByLayoutKey.keys().next().value;
        if (first) shellByLayoutKey.delete(first);
    }
    shellByLayoutKey.set(key, shell);
}

/** Tests and layout admin saves — clears stale structure when layout or field registry changes. */
export function clearOpportunityDrawerShellCompileCache(): void {
    shellByLayoutKey.clear();
}

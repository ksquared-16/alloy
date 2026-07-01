#!/usr/bin/env npx tsx
/**
 * Shared CLI flags for Forms QA gate scripts.
 */
export function qaScriptKeepsArtifacts(argv: string[] = process.argv.slice(2)): boolean {
    return argv.includes("--keep-artifacts");
}

export function qaScriptHelpLines(scriptName: string): string[] {
    return [
        `  cd web && npx tsx scripts/${scriptName}`,
        `  cd web && npx tsx scripts/${scriptName} --keep-artifacts   # leave rows for inspection`,
    ];
}

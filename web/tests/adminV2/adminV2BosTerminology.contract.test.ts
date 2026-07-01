import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const WEB_ROOT = join(process.cwd());

/** Operator-facing BOS surfaces (Card 21). */
const SCAN_ROOTS = [
    "app/adminV2/components/aiCommandSurface",
    "app/adminV2/components/bos",
    "app/adminV2/components/aiActivity",
    "components/admin/drawer/OperationalAttentionHeaderStrip.tsx",
    "components/admin/opportunity/OpportunityOperationalCompactStrip.tsx",
    "lib/adminV2/bos",
    "lib/adminV2/aiCommandSurface/commandSurfaceRoutingCopy.ts",
    "lib/adminV2/aiCommandSurface/commandSurfaceShellLayout.ts",
] as const;

const FORBIDDEN_UI_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
    { label: "Agent #N", pattern: /Agent\s*#\s*[0-9]/i },
    { label: "AI magic", pattern: /\bAI\s+magic\b/i },
    { label: "AI selected", pattern: /\bAI\s+selected\b/i },
    { label: "mutation denied", pattern: /mutation\s+denied/i },
    { label: "policy violation", pattern: /policy\s+violation/i },
    { label: "portal blocked", pattern: /portal\s+blocked/i },
    { label: "Future: placeholder", pattern: /Future:\s/ },
    { label: "window.prompt", pattern: /window\.prompt\s*\(/ },
    { label: "AI wrote", pattern: /\bAI\s+wrote\b/i },
    { label: "AI changed your settings", pattern: /AI\s+changed\s+your\s+settings/i },
    { label: "consumer copilot", pattern: /\bcopilot\b/i },
];

function collectSourceFiles(rootAbs: string, out: string[]): void {
    let st;
    try {
        st = statSync(rootAbs);
    } catch {
        return;
    }
    if (st.isFile()) {
        if (extname(rootAbs) === ".tsx" || extname(rootAbs) === ".ts") out.push(rootAbs);
        return;
    }
    if (!st.isDirectory()) return;
    for (const name of readdirSync(rootAbs)) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        collectSourceFiles(join(rootAbs, name), out);
    }
}

function relativePath(abs: string): string {
    return abs.startsWith(WEB_ROOT) ? abs.slice(WEB_ROOT.length + 1) : abs;
}

function stripCommentsAndDebugGates(source: string): string {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "")
        .replace(/NEXT_PUBLIC_COMMAND_SURFACE_SEARCH_DEBUG[\s\S]*?formatCandidateDebugLine/g, "");
}

describe("adminV2 BOS operator terminology (Card 21)", () => {
    const files: string[] = [];
    for (const rel of SCAN_ROOTS) {
        collectSourceFiles(join(WEB_ROOT, rel), files);
    }

    it("scans sprint-owned operator surfaces", () => {
        expect(files.length).toBeGreaterThan(10);
    });

    for (const { label, pattern } of FORBIDDEN_UI_PATTERNS) {
        it(`does not expose "${label}" in operator UI sources`, () => {
            const hits: string[] = [];
            for (const abs of files) {
                const body = stripCommentsAndDebugGates(readFileSync(abs, "utf8"));
                if (pattern.test(body)) hits.push(relativePath(abs));
            }
            expect(hits, hits.join("\n")).toEqual([]);
        });
    }

    it("shell uses Orchestrator / capability labels not legacy agent numbers", () => {
        const shell = readFileSync(
            join(WEB_ROOT, "app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx"),
            "utf8"
        );
        expect(shell).toContain('aria-label="Orchestrator assistant"');
        expect(shell).not.toMatch(/window\.prompt\s*\(/);
    });
});

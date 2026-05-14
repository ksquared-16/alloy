import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
/** Repo `web/` root (this file lives under `web/tests/agent/taskAssist/`). */
const webRoot = join(__dirname, "../../..");

const TASK_ASSIST_SOURCE_GLOBS = [
    "app/api/admin/ai/task-assist/apply/route.ts",
    "app/api/admin/ai/task-assist/propose/route.ts",
    ...[
        "taskAssistApplyMerge.ts",
        "taskAssistApplyRouteValidation.ts",
        "taskAssistDeterministicProposal.ts",
        "taskAssistOpportunityContext.ts",
        "taskAssistProposeRouteValidation.ts",
        "taskAssistSuggestionValidators.ts",
        "taskAssistV1ClientPayloads.ts",
        "taskAssistV1UiGate.ts",
        "types.ts",
        "index.ts",
    ].map((f) => join("lib/agent/taskAssist", f)),
    "components/admin/taskAssist/TaskAssistV1OpportunityPanel.tsx",
];

/** Executable references to legacy tables — comments may mention them for operators. */
const BANNED_CODE_PATTERNS = [/from\(\s*["']messages_outbox["']\s*\)/, /from\(\s*["']messages["']\s*\)/];

describe("Task Assist V1 — no legacy messages stack in source", () => {
    it.each(TASK_ASSIST_SOURCE_GLOBS)("has no legacy Supabase .from(...) targets in %s", (rel) => {
        const abs = join(webRoot, rel);
        const src = readFileSync(abs, "utf8");
        const hits = BANNED_CODE_PATTERNS.filter((re) => re.test(src));
        expect(hits.map(String), `Banned patterns in ${rel}`).toEqual([]);
    });
});

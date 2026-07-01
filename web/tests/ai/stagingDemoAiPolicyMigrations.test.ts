import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AI_ALLOWED_FEATURES } from "@/lib/ai/aiPolicy";

const MIGRATIONS_DIR = join(process.cwd(), "..", "supabase", "migrations");

describe("staging demo ai_policy migrations", () => {
    it("includes workflow_assist_draft in the follow-up migration for already-applied envs", () => {
        const sql = readFileSync(
            join(MIGRATIONS_DIR, "20260523170000_staging_demo_org_ai_policy_workflow_assist_draft.sql"),
            "utf8"
        );
        expect(sql).toContain("workflow_assist_draft");
        expect(sql).toContain("93667019-bd28-49b5-a688-acc9bb1e0a19");
        expect(sql).toMatch(/SELECT DISTINCT feat/i);
        expect(sql).not.toMatch(/DELETE FROM/i);
    });

    it("registers workflow_assist_draft as a known allowed feature", () => {
        expect(AI_ALLOWED_FEATURES).toContain("workflow_assist_draft");
    });
});

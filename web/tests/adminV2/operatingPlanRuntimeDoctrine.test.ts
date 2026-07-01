import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function readDoc(): string {
    return readFileSync(resolve(root, "../docs/system/operating-plan-runtime-doctrine.md"), "utf8");
}

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("operating plan runtime doctrine — drift prevention", () => {
    it("doctrine doc exists", () => {
        const doc = readDoc();
        expect(doc.length).toBeGreaterThan(500);
        expect(doc).toContain("# Operating Plan Runtime Doctrine");
    });

    it("defines all Operating Plan sections", () => {
        const doc = readDoc();
        for (const section of ["Purpose", "Journey", "Expected Work", "Success Criteria", "Attention"]) {
            expect(doc).toContain(`### ${section}`);
        }
    });

    it("states Expected Work becomes tasks", () => {
        const doc = readDoc();
        expect(doc).toContain("Expected Work becomes **tasks**");
        expect(doc).toContain("work_templates");
        expect(doc).toContain("operational_work");
    });

    it("states Attention drives Needs Attention and runtime signals", () => {
        const doc = readDoc();
        expect(doc).toContain("Needs Attention");
        expect(doc).toContain("Attention **drives Needs Attention");
    });

    it("references Stage Requirements as field readiness input", () => {
        const doc = readDoc();
        expect(doc).toContain("Stage Requirements");
        expect(doc).toContain("configuration-ownership-doctrine.md");
        expect(doc).toContain("readiness");
    });

    it("references Business Process as owner", () => {
        const doc = readDoc();
        expect(doc).toContain("Business Processes");
        expect(doc).toContain("stage execution contract");
    });

    it("documents enrollment stage examples including Lead", () => {
        const doc = readDoc();
        for (const stage of ["Lead", "Qualification", "Tour", "Waitlist", "Enrolling", "Enrolled"]) {
            expect(doc).toContain(`### ${stage}`);
        }
        expect(doc).toContain("Smith Family");
        expect(doc).toContain("Review new inquiry");
    });

    it("documents implementation tiers 0 through 4", () => {
        const doc = readDoc();
        for (const tier of [
            "Tier 0",
            "Tier 1",
            "Tier 2",
            "Tier 3",
            "Tier 4",
            "Honest projection",
            "Expected Work becomes tasks",
            "Attention evaluator",
        ]) {
            expect(doc).toContain(tier);
        }
    });

    it("stage operating plan schema module remains wired", () => {
        expect(read("lib/lifecycle/stageOperatingPlanV1.ts")).toContain("stage_operating_plan_v1");
        expect(read("lib/lifecycle/stageOperatingPlanV1.ts")).toContain("work_templates");
        expect(read("lib/lifecycle/stageOperatingPlanV1.ts")).toContain("attention_rules");
        expect(read("lib/lifecycle/defaultEnrollmentStageOperatingPlans.ts")).toContain(
            "ENROLLMENT_STAGE_OPERATING_DEFAULTS"
        );
    });

    it("business process system doc cross-references operating plan storage", () => {
        const bp = readFileSync(resolve(root, "../docs/platform/core/business-process-system.md"), "utf8");
        expect(bp).toContain("Stage operating plans");
        expect(bp).toContain("purpose");
    });
});

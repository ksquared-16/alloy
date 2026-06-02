#!/usr/bin/env npx tsx
/**
 * Card 6 — Forms lifecycle requirement coverage closeout gate.
 *
 * Runs logic-layer closeout checks (vitest) and live enrollment QA scripts.
 *
 * Usage:
 *   cd web && npx tsx scripts/qaFormsLifecycleRequirementCoverageCloseout.ts
 */
import { execSync } from "child_process";

const CLOSEOUT_TEST = "tests/forms/formsLifecycleRequirementCoverageCloseout.test.ts";

const SUITE = [
    "tests/forms/resolveFormsLifecycleRequirementContract.test.ts",
    "tests/forms/evaluateFormsLifecycleFieldCoverage.test.ts",
    "tests/forms/buildFormLifecycleCoveragePresentation.test.ts",
    "tests/forms/formLifecycleCoverageRoute.test.ts",
    "tests/forms/formLifecycleUsagePanel.test.tsx",
    "tests/forms/isFormLifecycleReadyForRecordCreation.test.ts",
    "tests/forms/validatePublicSubmissionLifecycleRequirements.test.ts",
    CLOSEOUT_TEST,
];

function run(cmd: string, label: string): void {
    console.log(`\n=== ${label} ===\n`);
    execSync(cmd, { stdio: "inherit", cwd: process.cwd() });
}

function main() {
    const notes: string[] = [];
    const errors: string[] = [];

    try {
        run("npx tsc --noEmit", "TypeScript");
        notes.push("tsc: pass");
    } catch {
        errors.push("tsc failed");
    }

    try {
        run(`npm run test -- ${SUITE.join(" ")}`, "Vitest suite");
        notes.push(`vitest: pass (${SUITE.length} files)`);
    } catch {
        errors.push("vitest suite failed");
    }

    for (const script of [
        "scripts/qaEnrollmentLeadOpportunityProof.ts",
        "scripts/qaEnrollmentIntakeLifecycleCoherence.ts",
    ]) {
        try {
            run(`npx tsx ${script}`, script);
            notes.push(`${script}: pass`);
        } catch {
            errors.push(`${script} failed`);
        }
    }

    const pass = errors.length === 0;
    console.log(
        JSON.stringify(
            {
                pass,
                sprint: "forms_lifecycle_requirement_coverage",
                card: "Card 6 closeout",
                notes,
                errors,
            },
            null,
            2
        )
    );
    process.exit(pass ? 0 : 1);
}

main();

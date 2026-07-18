/**
 * Card 8 — Sprint regression manifest for Settings + Record UX Parity (May 2026).
 * Documents focused test coverage; does not duplicate unit tests.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WEB_ROOT = join(process.cwd());

/** Vitest paths run in CI for this sprint closeout. */
export const SETTINGS_RECORD_UX_PARITY_TEST_PATHS = [
    "tests/adminV2/settingsSurfaceModes.test.ts",
    "tests/fields/drawerFieldPolicyAdapter.test.ts",
    "tests/fields/fieldPolicySettingsUi.test.ts",
    "tests/fields/enforceDrawerFieldPoliciesOnPatch.test.ts",
    "tests/admin/drawer/drawerSaveErrors.test.ts",
    "tests/config/layoutIntegrityPresentation.test.ts",
    "tests/config/layoutIntegrityValidator.test.ts",
    "tests/admin/actionSurfaceFeedback.test.ts",
    "tests/admin/settingsRecordUxParityAccess.test.ts",
    "tests/sprints/settingsRecordUxParityRegression.test.ts",
] as const;

/** Regression expectations mapped to test files (source-order / unit; no brittle RTL). */
export const SPRINT_REGRESSION_COVERAGE: ReadonlyArray<{
    expectation: string;
    primaryTests: string;
    notCoveredByUiTest?: string;
}> = [
    {
        expectation: "Enforceable vs deferred/never policy fields separated",
        primaryTests: "drawerFieldPolicyAdapter.test.ts, fieldPolicySettingsUi.test.ts, enforceDrawerFieldPoliciesOnPatch.test.ts",
    },
    {
        expectation: "Required/read-only violations are structured (field_key, code, message)",
        primaryTests: "enforceDrawerFieldPoliciesOnPatch.test.ts, drawerSaveErrors.test.ts",
    },
    {
        expectation: "Partial PATCH does not fail when persisted value satisfies requirement",
        primaryTests: "enforceDrawerFieldPoliciesOnPatch.test.ts",
    },
    {
        expectation: "Drawer error parser surfaces unmapped hidden-field violations",
        primaryTests: "drawerSaveErrors.test.ts",
    },
    {
        expectation: "adminv2:opportunity-updated only for mutating registry successes",
        primaryTests: "actionSurfaceFeedback.test.ts",
    },
    {
        expectation: "Layout integrity presentation is operator-facing",
        primaryTests: "layoutIntegrityPresentation.test.ts",
    },
    {
        expectation: "Scope checks run before field policy on PATCH routes",
        primaryTests: "settingsRecordUxParityAccess.test.ts (route source order)",
    },
    {
        expectation: "LayoutIntegrityReportPanel / AdminEntityDrawer full render",
        primaryTests: "—",
        notCoveredByUiTest:
            "RTL tests omitted: large fixture surface, auth/drawer hydration, and flapping timing. Helpers and API contracts are covered instead.",
    },
];

describe("settingsRecordUxParityRegression manifest", () => {
    it("all sprint test files exist on disk", () => {
        for (const rel of SETTINGS_RECORD_UX_PARITY_TEST_PATHS) {
            expect(existsSync(join(WEB_ROOT, rel)), rel).toBe(true);
        }
    });

    it("documents regression coverage expectations", () => {
        expect(SPRINT_REGRESSION_COVERAGE.length).toBeGreaterThanOrEqual(7);
        const uiGap = SPRINT_REGRESSION_COVERAGE.find((r) => r.notCoveredByUiTest);
        expect(uiGap?.expectation).toContain("LayoutIntegrityReportPanel");
    });
});

import { describe, expect, it, beforeEach } from "vitest";
import {
    EXECUTE_ADMIN_ACTION_FALLBACK_LEDGER,
    getExecuteAdminActionFallbackDisposition,
    listFallbackLedgerByDisposition,
    listIntentionalCompatibilityFallbackKeys,
} from "@/lib/platform/commands/runtime/executeAdminActionFallbackLedger";
import {
    getExecuteAdminActionFallbackCounts,
    getExecuteAdminActionFallbackTotal,
    recordExecuteAdminActionFallback,
    resetExecuteAdminActionFallbackCountsForTests,
} from "@/lib/platform/commands/runtime/executeAdminActionFallbackTelemetry";
import { isCommandRuntimeFacadeExecutionSupported } from "@/lib/platform/commands/runtime/commandRuntimeExecutionGate";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("executeAdminActionFallbackLedger", () => {
    it("has unique keys and required dispositions", () => {
        const keys = EXECUTE_ADMIN_ACTION_FALLBACK_LEDGER.map((e) => e.key);
        expect(new Set(keys).size).toBe(keys.length);
        expect(listFallbackLedgerByDisposition("migrated").length).toBeGreaterThan(10);
        expect(listIntentionalCompatibilityFallbackKeys()).toContain("mark_lost");
        expect(listIntentionalCompatibilityFallbackKeys()).toContain("schedule_tour");
        expect(getExecuteAdminActionFallbackDisposition("mark_lost").disposition).toBe(
            "direct_domain_compatibility"
        );
        expect(getExecuteAdminActionFallbackDisposition("archive_lead").disposition).toBe(
            "unsupported"
        );
        expect(getExecuteAdminActionFallbackDisposition("totally_unknown_xyz").disposition).toBe(
            "direct_domain_compatibility"
        );
    });

    it("does not classify migrated facade keys as intentional compatibility retention", () => {
        const intentional = new Set(listIntentionalCompatibilityFallbackKeys());
        expect(intentional.has("close_lead")).toBe(false);
        expect(intentional.has("add_parent_guardian")).toBe(false);
        expect(intentional.has("cancel_tour")).toBe(false);
    });
});

describe("executeAdminActionFallbackTelemetry", () => {
    beforeEach(() => {
        resetExecuteAdminActionFallbackCountsForTests();
    });

    it("records fallback counts by key with disposition", () => {
        recordExecuteAdminActionFallback("mark_lost");
        recordExecuteAdminActionFallback("mark_lost");
        recordExecuteAdminActionFallback("schedule_tour");
        expect(getExecuteAdminActionFallbackTotal()).toBe(3);
        const samples = getExecuteAdminActionFallbackCounts();
        expect(samples.find((s) => s.key === "mark_lost")).toEqual({
            key: "mark_lost",
            disposition: "direct_domain_compatibility",
            count: 2,
        });
    });
});

describe("P9 fallback gate honesty", () => {
    it("migrated exact keys are facade-supported (no route fallback)", () => {
        for (const key of [
            "close_lead",
            "waitlist_child",
            "add_parent_guardian",
            "delete_lead",
            "reschedule_tour",
            "complete_tour",
        ]) {
            expect(isCommandRuntimeFacadeExecutionSupported(key)).toBe(true);
        }
    });

    it("intentional compatibility keys are not facade-supported", () => {
        for (const key of ["mark_lost", "schedule_tour", "add_family_member", "move_to_qualification"]) {
            expect(isCommandRuntimeFacadeExecutionSupported(key)).toBe(false);
        }
    });

    it("execute route records fallback telemetry before executeAdminAction", () => {
        const source = readFileSync(
            resolve(__dirname, "../../../app/api/admin/actions/execute/route.ts"),
            "utf8"
        );
        expect(source).toContain("recordExecuteAdminActionFallback");
        expect(source).toMatch(
            /recordExecuteAdminActionFallback\(actionKey\);[\s\S]*executeAdminAction/
        );
        expect(source).toContain("After delegation, never fall through to executeAdminAction");
    });
});

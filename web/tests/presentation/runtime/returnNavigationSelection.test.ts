import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveAutoOpenRecordId } from "@/lib/presentation/runtime/workUnitPillSwitching";
import {
    clearRetainedOperatorContext,
    peekRetainedSelection,
    putRetainedSelection,
} from "@/lib/presentation/runtime/workUnitOperatorContext";

beforeEach(() => clearRetainedOperatorContext());
afterEach(() => clearRetainedOperatorContext());

describe("resolveAutoOpenRecordId — return-navigation selection precedence", () => {
    const rows = ["r1", "r2", "r3"];

    it("cold populated view (no retained) selects the first row", () => {
        expect(resolveAutoOpenRecordId(rows, null)).toBe("r1");
    });

    it("restores the retained record when it is still present in the current rows", () => {
        expect(resolveAutoOpenRecordId(rows, "r2")).toBe("r2");
    });

    it("a stale retained record not in the rows falls through to the first row", () => {
        expect(resolveAutoOpenRecordId(rows, "gone")).toBe("r1");
    });

    it("an empty view selects nothing (null) — never a fabricated record", () => {
        expect(resolveAutoOpenRecordId([], "r2")).toBeNull();
    });

    it("a mutation that removes the selected row lands on the next valid row (retained absent)", () => {
        // r2 was selected, then removed; remaining rows [r1, r3] → retained r2 absent → first row.
        expect(resolveAutoOpenRecordId(["r1", "r3"], "r2")).toBe("r1");
    });
});

describe("retained selection store — per Work Unit, org-partitioned", () => {
    it("retains and restores the selected record per (org, work unit)", () => {
        putRetainedSelection("org-1", "wu-A", { workViewId: "v1", queueKey: "q1", selectedRecordId: "rec-A" });
        putRetainedSelection("org-1", "wu-B", { workViewId: "v1", queueKey: "q1", selectedRecordId: "rec-B" });

        // A → B → A: each Work Unit restores its OWN selection.
        expect(peekRetainedSelection("org-1", "wu-A")?.selectedRecordId).toBe("rec-A");
        expect(peekRetainedSelection("org-1", "wu-B")?.selectedRecordId).toBe("rec-B");
    });

    it("org partitions the retained selection (no cross-tenant restore)", () => {
        putRetainedSelection("org-1", "wu-A", { workViewId: "v1", queueKey: "q1", selectedRecordId: "rec-A" });
        expect(peekRetainedSelection("org-2", "wu-A")).toBeNull();
    });

    it("clearRetainedOperatorContext flushes selections (org change / logout)", () => {
        putRetainedSelection("org-1", "wu-A", { workViewId: "v1", queueKey: "q1", selectedRecordId: "rec-A" });
        clearRetainedOperatorContext();
        expect(peekRetainedSelection("org-1", "wu-A")).toBeNull();
    });

    it("clearing a genuinely-empty view drops the retained record (no resurrection on return)", () => {
        putRetainedSelection("org-1", "wu-A", { workViewId: "v1", queueKey: "q1", selectedRecordId: "rec-A" });
        putRetainedSelection("org-1", "wu-A", { workViewId: "v1", queueKey: "q1", selectedRecordId: null });
        expect(peekRetainedSelection("org-1", "wu-A")?.selectedRecordId).toBeNull();
    });

    it("end-to-end precedence: retained record restored on return only when still in the view", () => {
        // Operator selected rec-2 in view v1.
        putRetainedSelection("org-1", "wu-A", { workViewId: "v1", queueKey: "q1", selectedRecordId: "rec-2" });
        const retained = peekRetainedSelection("org-1", "wu-A");
        const sameView = retained && retained.workViewId === "v1" ? retained.selectedRecordId : null;
        // Return: rows cached before mount → auto-open restores rec-2 (present), not the first row.
        expect(resolveAutoOpenRecordId(["rec-1", "rec-2", "rec-3"], sameView)).toBe("rec-2");
        // But if the retained view differs from the active view, it is ignored → first row.
        const otherView = retained && retained.workViewId === "v2" ? retained.selectedRecordId : null;
        expect(resolveAutoOpenRecordId(["rec-1", "rec-2", "rec-3"], otherView)).toBe("rec-1");
    });
});

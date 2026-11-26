import { describe, expect, it } from "vitest";

import { resolveWorkspaceTasksFetchFilter } from "@/lib/workItems/workItemQueueScope";

describe("resolveWorkspaceTasksFetchFilter", () => {
    it("prefers navigation filter from Overview deep-links", () => {
        expect(resolveWorkspaceTasksFetchFilter("mine", "open")).toBe("open");
        expect(resolveWorkspaceTasksFetchFilter("mine", "overdue")).toBe("overdue");
    });

    it("falls back to view-derived server filter when navigation filter is absent", () => {
        expect(resolveWorkspaceTasksFetchFilter("mine", null)).toBe("assigned_to_me");
        expect(resolveWorkspaceTasksFetchFilter("overdue", undefined)).toBe("overdue");
    });
});

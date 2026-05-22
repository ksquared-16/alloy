import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    readExpandedDeptIds,
    writeExpandedDeptIds,
} from "@/lib/adminV2/navigation/adminV2SidebarDeptExpanded";

describe("adminV2SidebarDeptExpanded", () => {
    const store: Record<string, string> = {};

    beforeEach(() => {
        vi.stubGlobal("sessionStorage", {
            getItem: (k: string) => store[k] ?? null,
            setItem: (k: string, v: string) => {
                store[k] = v;
            },
            removeItem: (k: string) => {
                delete store[k];
            },
        });
        vi.stubGlobal("window", { sessionStorage: globalThis.sessionStorage });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        Object.keys(store).forEach((k) => delete store[k]);
    });

    it("returns empty set when nothing stored", () => {
        expect(readExpandedDeptIds().size).toBe(0);
    });

    it("round-trips expanded department ids", () => {
        writeExpandedDeptIds(new Set(["dept-a", "dept-b"]));
        const ids = readExpandedDeptIds();
        expect(ids.has("dept-a")).toBe(true);
        expect(ids.has("dept-b")).toBe(true);
        expect(ids.size).toBe(2);
    });

    it("ignores invalid session payloads", () => {
        sessionStorage.setItem("alloy:v1:admV2:shell:deptExpanded", "not-json");
        expect(readExpandedDeptIds().size).toBe(0);
        sessionStorage.setItem("alloy:v1:admV2:shell:deptExpanded", JSON.stringify({}));
        expect(readExpandedDeptIds().size).toBe(0);
    });
});

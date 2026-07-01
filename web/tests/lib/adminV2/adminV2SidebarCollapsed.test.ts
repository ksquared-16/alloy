import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    readAdminV2SidebarCollapsed,
    writeAdminV2SidebarCollapsed,
} from "@/lib/adminV2/navigation/adminV2SidebarCollapsed";

describe("adminV2SidebarCollapsed", () => {
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

    it("persists collapsed flag", () => {
        expect(readAdminV2SidebarCollapsed()).toBeNull();
        writeAdminV2SidebarCollapsed(false);
        expect(readAdminV2SidebarCollapsed()).toBe(false);
        writeAdminV2SidebarCollapsed(true);
        expect(readAdminV2SidebarCollapsed()).toBe(true);
    });
});

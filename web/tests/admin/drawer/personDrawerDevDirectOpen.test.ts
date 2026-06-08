import { describe, expect, it, vi } from "vitest";
import { installPersonDrawerDevDirectOpen } from "@/lib/admin/drawer/personDrawerDevDirectOpen";

describe("installPersonDrawerDevDirectOpen", () => {
    it("opens type persons with the given id", () => {
        vi.stubGlobal("window", {} as Window & typeof globalThis);
        const openDrawer = vi.fn();
        const cleanup = installPersonDrawerDevDirectOpen(openDrawer);
        window.__alloyDevOpenPerson!("11111111-1111-4111-8111-111111111111");
        expect(openDrawer).toHaveBeenCalledWith({
            type: "persons",
            id: "11111111-1111-4111-8111-111111111111",
        });
        cleanup();
    });
});

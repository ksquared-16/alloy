import { describe, expect, it, vi, beforeEach } from "vitest";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

describe("applyRegistryResolvedActionClient add person", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("calls openAddPerson for add_family_member without execute", async () => {
        const openAddPerson = vi.fn();
        const action: ResolvedActionForClient = {
            key: "add_family_member",
            label: "Add person",
            description: null,
            action_type: "open_form",
            icon: null,
            style: null,
            display_style: "button",
            payload: { form_key: "add_family_member" },
            workflow_id: null,
        };

        const out = await applyRegistryResolvedActionClient(action, {
            router: { push: vi.fn(), refresh: vi.fn() },
            focusRecord: vi.fn(),
            openAddPerson,
            entityId: "opp-1",
            context: { surface: "record_section", section_key: "family_contacts" },
        });

        expect(out.ok).toBe(true);
        expect(openAddPerson).toHaveBeenCalledWith("add_family_member");
    });

    it("does not POST execute for add_related_person open_form", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        const openAddPerson = vi.fn();
        const action: ResolvedActionForClient = {
            key: "add_related_person",
            label: "Add person",
            description: null,
            action_type: "open_form",
            icon: null,
            style: null,
            display_style: "button",
            payload: { form_key: "add_related_person" },
            workflow_id: null,
        };

        await applyRegistryResolvedActionClient(action, {
            router: { push: vi.fn(), refresh: vi.fn() },
            focusRecord: vi.fn(),
            openAddPerson,
            entityId: "opp-1",
            context: { surface: "record_section", section_key: "family_contacts" },
        });

        expect(fetchSpy).not.toHaveBeenCalledWith("/api/admin/actions/execute", expect.anything());
        fetchSpy.mockRestore();
    });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

const launchContextualQuickMessage = vi.fn();
vi.mock("@/lib/admin/actions/contextualActionInvocation", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/admin/actions/contextualActionInvocation")>();
    return {
        ...actual,
        launchContextualQuickMessage: (...args: unknown[]) => launchContextualQuickMessage(...args),
        invocationFromApplyRegistryHost: () => ({
            surface: "record_drawer" as const,
            record_id: "opp-1",
            entity_type: "opportunity" as const,
            opportunity_id: "opp-1",
            person_id: "person-1",
            phone: "5551234567",
            email: "parent@example.com",
            display_name: "Parent Example",
        }),
    };
});

function host() {
    return {
        router: { push: vi.fn(), refresh: vi.fn() },
        focusRecord: vi.fn(),
        entityId: "opp-1",
        context: { surface: "record_header" },
    };
}

function action(key: string, payload: Record<string, unknown>): ResolvedActionForClient {
    return {
        key,
        label: key,
        description: null,
        action_type: "ui_intent",
        icon: null,
        style: null,
        display_style: "button",
        payload,
        workflow_id: null,
    };
}

describe("applyRegistryResolvedActionClient universal actions", () => {
    beforeEach(() => {
        launchContextualQuickMessage.mockReset();
        vi.stubGlobal("window", {
            alert: vi.fn(),
            location: { href: "" },
            dispatchEvent: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        });
    });

    it("send_email opens quick message with email channel", async () => {
        await applyRegistryResolvedActionClient(action("send_email", { intent: "send_email" }), host());
        expect(launchContextualQuickMessage).toHaveBeenCalledWith(
            expect.objectContaining({ defaultChannel: "email", opportunity_id: "opp-1" })
        );
    });

    it("send_sms opens quick message with sms channel", async () => {
        await applyRegistryResolvedActionClient(action("send_sms", { intent: "send_sms" }), host());
        expect(launchContextualQuickMessage).toHaveBeenCalledWith(
            expect.objectContaining({ defaultChannel: "sms" })
        );
    });

    it("call_parent uses tel intent when phone present", async () => {
        const out = await applyRegistryResolvedActionClient(action("call_parent", { intent: "call_parent" }), host());
        expect(out.ok).toBe(true);
        expect(window.location.href).toBe("tel:5551234567");
    });
});

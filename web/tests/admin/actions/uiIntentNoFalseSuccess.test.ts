/**
 * A command may report success only after the server said so.
 *
 * `applyRegistryResolvedActionClient`'s `ui_intent` chain used to end in a bare
 * `return { ok: true }`. Any provisioned intent without a branch therefore
 * reported success having issued NO request and validated NO server result —
 * and the Focus Panel turned that into a "completed" toast. `send_tour_invitation`
 * shipped exactly that way: operators saw completion while no invitation, no
 * message and no workflow event were created.
 *
 * The invariant is deliberately general. It is not about one action: it is that
 * an unrunnable command must fail loudly on its first click rather than lie for
 * however long it takes someone to check the database.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

vi.mock("@/lib/admin/actions/contextualActionInvocation", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/admin/actions/contextualActionInvocation")>();
    return {
        ...actual,
        launchContextualQuickMessage: vi.fn(),
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
        openDrawer: vi.fn(),
        entityId: "opp-1",
        context: { surface: "record_header" },
    };
}

/** `error` lives only on the failure arm of the result union. */
function errorOf(out: Awaited<ReturnType<typeof applyRegistryResolvedActionClient>>): string {
    return "error" in out && out.error != null ? String(out.error) : "";
}

function uiIntent(key: string, payload: Record<string, unknown> = {}): ResolvedActionForClient {
    return {
        key,
        label: key,
        description: null,
        action_type: "ui_intent",
        icon: null,
        style: null,
        display_style: "menu_item",
        payload,
        workflow_id: null,
    };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
        alert: vi.fn(),
        confirm: vi.fn(() => true),
        location: { href: "" },
        dispatchEvent: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        open: vi.fn(),
    });
});

// --- the general invariant --------------------------------------------------

describe("an unhandled ui_intent can never report success", () => {
    it.each([
        ["a provisioned key with no client branch", "some_future_command"],
        ["an unknown intent string", "not_wired_yet"],
        ["a key that only exists in config", "operator_invented_key"],
    ])("%s fails explicitly", async (_label, key) => {
        const out = await applyRegistryResolvedActionClient(uiIntent(key, { intent: key }), host());

        expect(out.ok).toBe(false);
        expect(errorOf(out)).toMatch(/not available yet/i);
    });

    it("issues no request at all when it cannot run — and still does not claim success", async () => {
        const out = await applyRegistryResolvedActionClient(
            uiIntent("some_future_command", { intent: "some_future_command" }),
            host()
        );

        expect(fetchMock).not.toHaveBeenCalled();
        expect(out.ok).toBe(false);
    });

    it("says nothing was sent, so the operator can retry safely", async () => {
        const out = await applyRegistryResolvedActionClient(uiIntent("some_future_command"), host());
        expect(errorOf(out)).toMatch(/nothing was sent/i);
    });
});

// --- success is derived from the server, per channel ------------------------

function executeResponse(body: unknown, ok = true, status = 200) {
    return { ok, status, json: async () => body };
}

// --- send_tour_invitation opens compose after prepare (never silent-sends) ------

describe("send_tour_invitation opens compose instead of silent-sending", () => {
    it("prepares a draft then launches QuickMessage compose", async () => {
        const { launchContextualQuickMessage } = await import(
            "@/lib/admin/actions/contextualActionInvocation"
        );
        fetchMock.mockResolvedValue(
            executeResponse({
                ok: true,
                data: {
                    execution_result: {
                        detail: {
                            invitation_id: "inv-9",
                            draft: {
                                invitationId: "inv-9",
                                emailSubject: "Come visit",
                                emailBody: "Hello…",
                            },
                        },
                    },
                },
            }),
        );

        const out = await applyRegistryResolvedActionClient(uiIntent("send_tour_invitation"), host());

        expect(out.ok).toBe(true);
        expect(fetchMock).toHaveBeenCalled();
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("/api/admin/actions/execute");
        const body = JSON.parse(init.body as string);
        expect(body.action_key).toBe("send_tour_invitation");
        expect(body.payload.mode).toBe("prepare");
        expect(launchContextualQuickMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                opportunity_id: "opp-1",
                defaultChannel: "email",
                draftBody: "Hello…",
                tourInvitationId: "inv-9",
            }),
        );
        expect(window.alert).not.toHaveBeenCalled();
        expect(window.confirm).not.toHaveBeenCalled();
    });

    it("still opens compose when prepare fails", async () => {
        const { launchContextualQuickMessage } = await import(
            "@/lib/admin/actions/contextualActionInvocation"
        );
        fetchMock.mockResolvedValue(
            executeResponse({ ok: false, error: { message: "No times" } }, false, 422),
        );

        const out = await applyRegistryResolvedActionClient(uiIntent("send_tour_invitation"), host());

        expect(out.ok).toBe(true);
        expect(launchContextualQuickMessage).toHaveBeenCalled();
    });

    it("does not claim invitation sent from the ui_intent open alone", async () => {
        fetchMock.mockResolvedValue(
            executeResponse({
                ok: true,
                data: {
                    execution_result: {
                        detail: {
                            invitation_id: "inv-1",
                            draft: { emailBody: "Draft" },
                            mode: "prepare",
                            sent_channels: [],
                        },
                    },
                },
            }),
        );

        await applyRegistryResolvedActionClient(uiIntent("send_tour_invitation"), host());

        expect(window.alert).not.toHaveBeenCalled();
        const said = (window.alert as unknown as ReturnType<typeof vi.fn>).mock.calls;
        expect(said).toHaveLength(0);
    });
});

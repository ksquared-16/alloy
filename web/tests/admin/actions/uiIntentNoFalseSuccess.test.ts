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
        expect(String(out.error ?? "")).toMatch(/not available yet/i);
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
        expect(String(out.error ?? "")).toMatch(/nothing was sent/i);
    });
});

// --- success is derived from the server, per channel ------------------------

function executeResponse(body: unknown, ok = true, status = 200) {
    return { ok, status, json: async () => body };
}

describe("send_tour_invitation derives its result from the server", () => {
    it("reads the runtime's FLATTENED execution_result, as the live route returns it", async () => {
        // Proven against the running app: the detail fields sit directly on
        // execution_result, not under a nested `detail`.
        fetchMock.mockResolvedValue(
            executeResponse({
                ok: true,
                data: {
                    execution_result: {
                        invitation_id: "inv-9",
                        option_count: 5,
                        sent_channels: ["email", "sms"],
                        idempotent_replay: false,
                        skipped: [],
                    },
                },
            })
        );

        const out = await applyRegistryResolvedActionClient(uiIntent("send_tour_invitation"), host());

        expect(out.ok).toBe(true);
        const said = (window.alert as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
        expect(said).toContain("Invitation created");
        expect(said).toContain("Email queued");
        expect(said).toContain("SMS queued");
    });

    it("reports per-channel truth from sent_channels and skipped", async () => {
        fetchMock.mockResolvedValue(
            executeResponse({
                ok: true,
                data: {
                    execution_result: {
                        detail: {
                            invitation_id: "inv-1",
                            sent_channels: ["email"],
                            skipped: ["sms_suppressed"],
                            idempotent_replay: false,
                        },
                    },
                },
            })
        );

        const out = await applyRegistryResolvedActionClient(
            uiIntent("send_tour_invitation", { intent: "send_tour_invitation" }),
            host()
        );

        expect(out.ok).toBe(true);
        const said = (window.alert as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
        expect(said).toContain("Email queued");
        expect(said).toContain("not sent — sms suppressed");
        expect(said).not.toContain("Invitation sent");
    });

    it("says an existing invitation was reused rather than claiming a new one", async () => {
        fetchMock.mockResolvedValue(
            executeResponse({
                ok: true,
                data: {
                    execution_result: {
                        detail: { sent_channels: ["email", "sms"], skipped: [], idempotent_replay: true },
                    },
                },
            })
        );

        await applyRegistryResolvedActionClient(uiIntent("send_tour_invitation"), host());

        const said = (window.alert as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
        expect(said).toContain("Existing invitation reused");
        expect(said).toContain("Email queued");
        expect(said).toContain("SMS queued");
    });

    it("confirms explicitly before issuing the request", async () => {
        (window.confirm as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

        const out = await applyRegistryResolvedActionClient(uiIntent("send_tour_invitation"), host());

        expect(fetchMock).not.toHaveBeenCalled();
        expect(out.ok).toBe(true); // declined, not failed — nothing happened
    });

    it("posts to the canonical execute route with the registered key and subject", async () => {
        fetchMock.mockResolvedValue(
            executeResponse({
                ok: true,
                data: { execution_result: { detail: { sent_channels: ["email"], skipped: [] } } },
            })
        );

        await applyRegistryResolvedActionClient(uiIntent("send_tour_invitation"), host());

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("/api/admin/actions/execute");
        expect(init.method).toBe("POST");
        expect(init.credentials).toBe("include");
        const body = JSON.parse(init.body as string);
        expect(body.action_key).toBe("send_tour_invitation");
        expect(body.entity_type).toBe("opportunity");
        expect(body.entity_id).toBe("opp-1");
    });

    it.each([
        ["a non-2xx response", executeResponse({ ok: false, error: { message: "Blocked by policy" } }, false, 422)],
        ["an ok:false envelope", executeResponse({ ok: false, error: "Refused" })],
    ])("%s is a failure, not a success", async (_label, response) => {
        fetchMock.mockResolvedValue(response);

        const out = await applyRegistryResolvedActionClient(uiIntent("send_tour_invitation"), host());

        expect(out.ok).toBe(false);
        expect(String(out.error ?? "").length).toBeGreaterThan(0);
    });

    it("treats an unreadable body as failure", async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => {
                throw new Error("not json");
            },
        });

        const out = await applyRegistryResolvedActionClient(uiIntent("send_tour_invitation"), host());

        expect(out.ok).toBe(false);
        expect(String(out.error ?? "")).toMatch(/could not be read/i);
    });

    it("treats a 2xx with no recognisable invitation detail as failure", async () => {
        // A success envelope carrying nothing to report is not a send. Claiming
        // "no eligible delivery channel" here would invent an outcome.
        fetchMock.mockResolvedValue(executeResponse({ ok: true, data: { execution_result: {} } }));

        const out = await applyRegistryResolvedActionClient(uiIntent("send_tour_invitation"), host());

        expect(out.ok).toBe(false);
        expect(String(out.error ?? "")).toMatch(/not confirmed/i);
    });
});

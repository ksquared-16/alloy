/**
 * A command may report success only after the server said so — and a command the
 * platform cannot resolve may not report success at all.
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
 *
 * Registered actions no longer need a hardcoded branch to be reachable — the
 * client resolves the host from the capability declaration. What is asserted here
 * is therefore two-sided: declared commands run through their declared host, and
 * undeclared ones still refuse.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import { launchContextualQuickMessage } from "@/lib/admin/actions/contextualActionInvocation";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

vi.mock("@/lib/admin/actions/contextualActionInvocation", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/admin/actions/contextualActionInvocation")>();
    return {
        ...actual,
        launchContextualQuickMessage: vi.fn(),
        // Mirrors the real helper's contract: no record selected → no invocation.
        // A stub that always yields a subject would hide every "nothing selected" path.
        invocationFromApplyRegistryHost: (h: { entityId?: string | null }) =>
            h?.entityId?.trim()
                ? {
                      surface: "record_drawer" as const,
                      record_id: "opp-1",
                      entity_type: "opportunity" as const,
                      opportunity_id: "opp-1",
                      person_id: "person-1",
                      phone: "5551234567",
                      email: "parent@example.com",
                      display_name: "Parent Example",
                  }
                : null,
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
    vi.mocked(launchContextualQuickMessage).mockClear();
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

describe("an undeclared ui_intent can never report success", () => {
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

    it("resolving an unknown key never throws — it refuses", async () => {
        // The capability registry throws on unknown keys outside production. Reaching it
        // through the non-throwing resolver is what keeps an operator-invented key a
        // refusal instead of a crashed menu click.
        await expect(
            applyRegistryResolvedActionClient(uiIntent("definitely_not_a_capability"), host())
        ).resolves.toMatchObject({ ok: false });
    });
});

// --- registered actions route generically, with no branch of their own -------

function executeResponse(body: unknown, ok = true, status = 200) {
    return { ok, status, json: async () => body };
}

describe("a registered action reaches the Actions Runtime without a hardcoded branch", () => {
    it("posts confirm_tour to the canonical execute route with its key and subject", async () => {
        // confirm_tour has no `if (actionKey === …)` branch in the client. It is
        // reachable purely because its capability declares registered_action execution.
        fetchMock.mockResolvedValue(executeResponse({ ok: true, data: { execution_result: {} } }));

        const out = await applyRegistryResolvedActionClient(
            uiIntent("confirm_tour", { intent: "confirm_tour" }),
            host()
        );

        expect(out.ok).toBe(true);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("/api/admin/actions/execute");
        expect(init.method).toBe("POST");
        expect(init.credentials).toBe("include");
        const body = JSON.parse(init.body as string);
        expect(body.action_key).toBe("confirm_tour");
        expect(body.entity_type).toBe("opportunity");
        expect(body.entity_id).toBe("opp-1");
    });

    it("refuses when no record is selected rather than posting a subjectless command", async () => {
        const out = await applyRegistryResolvedActionClient(uiIntent("confirm_tour"), {
            ...host(),
            entityId: null,
            invocationContext: null,
        });

        expect(fetchMock).not.toHaveBeenCalled();
        expect(out.ok).toBe(false);
        expect(errorOf(out)).toMatch(/entity_id required/i);
    });

    it.each([
        ["a non-2xx response", executeResponse({ ok: false, error: { message: "Blocked by policy" } }, false, 422)],
        ["an ok:false envelope", executeResponse({ ok: false, error: "Refused" })],
    ])("%s is a failure, not a success", async (_label, response) => {
        fetchMock.mockResolvedValue(response);

        const out = await applyRegistryResolvedActionClient(uiIntent("confirm_tour"), host());

        expect(out.ok).toBe(false);
        expect(errorOf(out).length).toBeGreaterThan(0);
    });

    it("keeps the runtime's own reason when the envelope carries a bare string error", async () => {
        // runRegisteredAction returns `error` as a string. Narrowing to the structured
        // shape alone would replace a real reason with a generic "Execute failed".
        fetchMock.mockResolvedValue(executeResponse({ ok: false, error: "Tour is not scheduled" }));

        const out = await applyRegistryResolvedActionClient(uiIntent("confirm_tour"), host());

        expect(errorOf(out)).toBe("Tour is not scheduled");
    });

    it("treats an unreadable body as failure", async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => {
                throw new Error("not json");
            },
        });

        const out = await applyRegistryResolvedActionClient(uiIntent("confirm_tour"), host());

        expect(out.ok).toBe(false);
        expect(errorOf(out)).toMatch(/could not be read/i);
    });

    it("requires an affirmative envelope — a 2xx alone is not a result", async () => {
        // The execute route always answers `{ ok, … }`. A 2xx without it came from
        // something else: a proxy, an auth redirect, an error page. Treating the
        // absence of `ok: false` as success is how a command reports an outcome the
        // server never gave.
        fetchMock.mockResolvedValue(executeResponse({}));

        const out = await applyRegistryResolvedActionClient(uiIntent("confirm_tour"), host());

        expect(out.ok).toBe(false);
    });
});

// --- a declared interaction host wins over direct execution ------------------

describe("send_tour_invitation is hosted by Communications compose", () => {
    it("opens compose on the declared channel instead of firing the runtime", async () => {
        // send_tour_invitation is a registered action, so direct execution would be the
        // default. Its capability declares `communications_composer`, and the declaration
        // is what decides — not the action key.
        const out = await applyRegistryResolvedActionClient(
            uiIntent("send_tour_invitation", { intent: "send_tour_invitation" }),
            host()
        );

        expect(out.ok).toBe(true);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(launchContextualQuickMessage).toHaveBeenCalledTimes(1);
        expect(vi.mocked(launchContextualQuickMessage).mock.calls[0][0]).toMatchObject({
            entity_type: "opportunity",
            opportunity_id: "opp-1",
            defaultChannel: "email",
        });
    });

    it("asks nothing through browser dialogs — the operator reviews in compose", async () => {
        await applyRegistryResolvedActionClient(uiIntent("send_tour_invitation"), host());

        expect(window.confirm).not.toHaveBeenCalled();
        expect(window.alert).not.toHaveBeenCalled();
    });

    it("refuses without a subject rather than opening an unaddressed compose", async () => {
        const out = await applyRegistryResolvedActionClient(uiIntent("send_tour_invitation"), {
            ...host(),
            entityId: null,
            invocationContext: null,
        });

        expect(launchContextualQuickMessage).not.toHaveBeenCalled();
        expect(out.ok).toBe(false);
    });
});

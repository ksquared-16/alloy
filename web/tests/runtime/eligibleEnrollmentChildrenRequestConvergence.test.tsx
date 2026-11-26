// @vitest-environment jsdom
/**
 * SLICE 15 / S8-3 — ONE OWNER FOR THE ELIGIBLE-CHILDREN REQUEST.
 *
 * Slice 8 measured the request twice on one command open; Slice 9 attributed it to two callers for
 * one logical answer — the warm cache, and the panel's own raw fetch on a peek miss. The peek misses
 * precisely in the race that matters, because the warm value lands only when the warm resolves.
 *
 * The repair is not "delete the panel's fetch". The panel needed more than the warm cache used to
 * return: the envelope's own `error.message`, distinguishable from "no eligible child" and from a
 * transport failure. So the owner returns the authoritative outcome and the panel joins it.
 *
 * These tests render the REAL panel and count real network operations, because the defect being
 * fixed is a second network operation — something no source assertion can observe.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

import CurrentWorkSubjectSelectorPanel from "@/components/admin/focusPanel/cards/CurrentWorkSubjectSelectorPanel";
import {
    clearEligibleEnrollmentChildrenWarmCacheForTests,
    loadEligibleEnrollmentChildren,
    peekEligibleEnrollmentChildren,
    prefetchEligibleEnrollmentChildren,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/eligibleEnrollmentChildrenWarmCache";
import type { CurrentWorkActionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";

const ELIGIBLE = "eligible-enrollment-children";

type Pending = { url: string; resolve: (r: Response) => void; reject: (e: unknown) => void };

let calls: string[] = [];
let pending: Pending[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
    calls = [];
    pending = [];
    clearEligibleEnrollmentChildrenWarmCacheForTests();
    globalThis.fetch = ((input: RequestInfo | URL) => {
        const url = String(input instanceof URL ? input.toString() : input);
        calls.push(url);
        return new Promise<Response>((resolve, reject) => {
            pending.push({ url, resolve, reject });
        });
    }) as typeof fetch;
});

afterEach(() => {
    globalThis.fetch = realFetch;
    clearEligibleEnrollmentChildrenWarmCacheForTests();
});

const eligibleCalls = () => calls.filter((u) => u.includes(ELIGIBLE));
const callsFor = (oid: string) => calls.filter((u) => u.includes(ELIGIBLE) && u.includes(oid));

function take(oid?: string): Pending {
    const i = pending.findIndex((p) => p.url.includes(ELIGIBLE) && (!oid || p.url.includes(oid)));
    expect(i, `no in-flight eligible-children request${oid ? ` for ${oid}` : ""}`).toBeGreaterThan(-1);
    return pending.splice(i, 1)[0]!;
}

const okBody = (subjects: { id: string; label: string }[], status = "multiple", message?: string) =>
    JSON.stringify({ ok: true, data: { status, message: message ?? null, subjects }, correlation_id: "c" });

const failBody = (code: string, message: string) =>
    JSON.stringify({ ok: false, error: { code, message }, correlation_id: "c" });

const json = (body: string, status = 200) =>
    new Response(body, { status, headers: { "Content-Type": "application/json" } });

const ACTION = { key: "waitlist_child", handlerKey: "waitlist_child" } as unknown as CurrentWorkActionVM;

function mountPanel(opportunityId: string) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const render = (oid: string) =>
        act(() => {
            root.render(
                createElement(CurrentWorkSubjectSelectorPanel, {
                    action: ACTION,
                    opportunityId: oid,
                    onClose: () => {},
                    onComplete: () => {},
                }),
            );
        });
    render(opportunityId);
    return {
        container,
        rerender: render,
        unmount: () => act(() => root.unmount()),
        state: () =>
            container
                .querySelector("[data-work-action-panel-state]")
                ?.getAttribute("data-work-action-panel-state") ?? null,
        text: () => (container.textContent ?? "").replace(/\s+/g, " ").trim(),
    };
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe("S8-3 — one request owner", () => {
    it("1. prewarm already settled: the panel opens on the warm value and issues NO new request", async () => {
        const warm = prefetchEligibleEnrollmentChildren("opp-1");
        take("opp-1").resolve(json(okBody([{ id: "ocm-a", label: "Lennon · North" }])));
        await warm;
        expect(eligibleCalls()).toHaveLength(1);

        const panel = mountPanel("opp-1");
        await flush();
        expect(panel.state()).toBe("subject-selector");
        expect(
            eligibleCalls(),
            "a settled warm inside its TTL is the answer — nothing to ask again",
        ).toHaveLength(1);
        panel.unmount();
    });

    it("2. PRIMARY S8-3: a panel opening while the prewarm is in flight joins it — ONE operation", async () => {
        void prefetchEligibleEnrollmentChildren("opp-2");
        expect(eligibleCalls()).toHaveLength(1);

        // The operator clicks before the warm settles: this is the race Slice 8 measured.
        const panel = mountPanel("opp-2");
        await flush();
        expect(
            eligibleCalls(),
            "the panel must JOIN the in-flight warm, not start a second equivalent operation",
        ).toHaveLength(1);

        await act(async () => {
            take("opp-2").resolve(json(okBody([{ id: "ocm-b", label: "Wrigley · North" }])));
            await Promise.resolve();
        });
        await flush();
        expect(panel.state()).toBe("subject-selector");
        expect(panel.container.querySelector("[data-testid='current-work-subject-option-ocm-b']")).toBeTruthy();
        expect(eligibleCalls()).toHaveLength(1);
        panel.unmount();
    });

    it("3. panel first, with no prewarm at all: one request through the same owner", async () => {
        const panel = mountPanel("opp-3");
        await flush();
        expect(eligibleCalls()).toHaveLength(1);
        await act(async () => {
            take("opp-3").resolve(json(okBody([{ id: "ocm-c", label: "Ada · South" }])));
            await Promise.resolve();
        });
        await flush();
        expect(panel.state()).toBe("subject-selector");
        expect(eligibleCalls()).toHaveLength(1);
        panel.unmount();
    });

    it("4. success with children renders the existing selection behaviour", async () => {
        const panel = mountPanel("opp-4");
        await flush();
        await act(async () => {
            take("opp-4").resolve(
                json(okBody([
                    { id: "ocm-1", label: "Lennon · North" },
                    { id: "ocm-2", label: "Wrigley · North" },
                ])),
            );
            await Promise.resolve();
        });
        await flush();
        expect(panel.state()).toBe("subject-selector");
        expect(panel.container.querySelectorAll("input[type='checkbox']")).toHaveLength(2);
        expect(panel.container.querySelector("[data-testid='current-work-subject-select-all']")).toBeTruthy();
        panel.unmount();
    });

    it("5. zero eligible children stays EMPTY, with the server's own sentence", async () => {
        const panel = mountPanel("opp-5");
        await flush();
        await act(async () => {
            take("opp-5").resolve(json(okBody([], "none", "Every child is already on the Waitlist.")));
            await Promise.resolve();
        });
        await flush();
        expect(panel.state()).toBe("subject-blocked");
        expect(panel.text()).toContain("Every child is already on the Waitlist.");
        // Empty is an ANSWER: it is cached and peekable. A failure is neither.
        expect(peekEligibleEnrollmentChildren("opp-5")?.status).toBe("none");
        panel.unmount();
    });

    it("6. THE REPAIR-SAFETY TEST: a structured API failure still reaches the operator verbatim", async () => {
        const panel = mountPanel("opp-6");
        await flush();
        await act(async () => {
            take("opp-6").resolve(
                json(failBody("FORBIDDEN", "You do not have access to this family."), 403),
            );
            await Promise.resolve();
        });
        await flush();
        expect(panel.state()).toBe("subject-blocked");
        expect(
            panel.text(),
            "collapsing the envelope's error to null is exactly what made this repair wait",
        ).toContain("You do not have access to this family.");
        // A refusal is not an answer: it is never cached, and never recorded as an empty result.
        expect(peekEligibleEnrollmentChildren("opp-6")).toBeNull();
        panel.unmount();
    });

    it("7. transport failure lands in a failure state, does not hang, and poisons nothing", async () => {
        const panel = mountPanel("opp-7");
        await flush();
        await act(async () => {
            take("opp-7").reject(new TypeError("Failed to fetch"));
            await Promise.resolve();
        });
        await flush();
        expect(panel.state(), "not still loading").toBe("subject-blocked");
        expect(panel.text()).toContain("Could not load children for this family.");
        expect(peekEligibleEnrollmentChildren("opp-7")).toBeNull();
        panel.unmount();
    });

    it("8. after a failure the next attempt RETRIES — failure is never cached as success", async () => {
        const first = loadEligibleEnrollmentChildren("opp-8");
        take("opp-8").resolve(json(failBody("INTERNAL", "Something went wrong."), 500));
        expect(await first).toMatchObject({ ok: false, failure: "api", message: "Something went wrong." });
        expect(eligibleCalls()).toHaveLength(1);

        const second = loadEligibleEnrollmentChildren("opp-8");
        expect(eligibleCalls(), "a refusal must not be replayed for the rest of the TTL").toHaveLength(2);
        take("opp-8").resolve(json(okBody([{ id: "ocm-r", label: "Retry · North" }])));
        expect(await second).toMatchObject({ ok: true });
    });

    it("9. request identity is the subject: two families never join each other's operation", async () => {
        const a = mountPanel("opp-9a");
        const b = mountPanel("opp-9b");
        await flush();
        expect(callsFor("opp-9a")).toHaveLength(1);
        expect(callsFor("opp-9b")).toHaveLength(1);

        await act(async () => {
            take("opp-9a").resolve(json(okBody([{ id: "ocm-aa", label: "Ay · North" }])));
            take("opp-9b").resolve(json(okBody([{ id: "ocm-bb", label: "Bee · South" }])));
            await Promise.resolve();
        });
        await flush();
        expect(a.container.querySelector("[data-testid='current-work-subject-option-ocm-aa']")).toBeTruthy();
        expect(a.container.querySelector("[data-testid='current-work-subject-option-ocm-bb']")).toBeNull();
        expect(b.container.querySelector("[data-testid='current-work-subject-option-ocm-bb']")).toBeTruthy();
        a.unmount();
        b.unmount();
    });

    it("10. rapid open/close/reopen makes no second operation, and no result lands on the wrong subject", async () => {
        const panel = mountPanel("opp-10");
        await flush();
        expect(callsFor("opp-10")).toHaveLength(1);

        // Reopen (a fresh mount) while the first operation is still in flight.
        panel.unmount();
        const reopened = mountPanel("opp-10");
        await flush();
        expect(callsFor("opp-10"), "the equivalent request is still in flight").toHaveLength(1);

        // Now the panel is switched to another family before the first answer arrives.
        await act(() => { reopened.rerender("opp-10b"); });
        await flush();
        await act(async () => {
            take("opp-10").resolve(json(okBody([{ id: "ocm-late", label: "Late · North" }])));
            await Promise.resolve();
        });
        await flush();
        expect(
            reopened.container.querySelector("[data-testid='current-work-subject-option-ocm-late']"),
            "a late answer for the previous subject must never paint this one",
        ).toBeNull();
        reopened.unmount();
    });
});

describe("S8-3 — the owner's result contract", () => {
    it("the outcome carries the envelope's code and message, not a collapsed null", async () => {
        const p = loadEligibleEnrollmentChildren("opp-c1");
        take("opp-c1").resolve(json(failBody("FORBIDDEN", "You do not have access to this family."), 403));
        expect(await p).toEqual({
            ok: false,
            failure: "api",
            code: "FORBIDDEN",
            message: "You do not have access to this family.",
        });
    });

    it("a transport failure is a DIFFERENT outcome from a server refusal", async () => {
        const p = loadEligibleEnrollmentChildren("opp-c2");
        take("opp-c2").reject(new TypeError("Failed to fetch"));
        expect(await p).toEqual({ ok: false, failure: "transport", code: null, message: null });
    });

    it("an unparseable body is a transport failure, NOT an empty result", async () => {
        // The old loader read `{}` and produced status "none" — an error silently becoming "no
        // eligible children" is the one confusion this panel must never show.
        const p = loadEligibleEnrollmentChildren("opp-c3");
        take("opp-c3").resolve(new Response("<html>502</html>", { status: 200 }));
        expect(await p).toMatchObject({ ok: false, failure: "transport" });
    });

    it("warm callers keep their value-or-null projection", async () => {
        const good = prefetchEligibleEnrollmentChildren("opp-c4");
        take("opp-c4").resolve(json(okBody([{ id: "ocm-p", label: "Proj · North" }])));
        expect((await good)?.subjects).toHaveLength(1);

        const bad = prefetchEligibleEnrollmentChildren("opp-c5");
        take("opp-c5").resolve(json(failBody("INTERNAL", "nope"), 500));
        expect(await bad, "a warm caller only ever asked whether there is a value").toBeNull();
    });

    it("the panel holds no fetch of its own for this answer", () => {
        // Not a substitute for the count above — a guard against the fallback growing back by hand.
        const src = readPanel();
        expect(src).not.toMatch(/fetch\(\s*\n?\s*`?\/api\/admin\/opportunities\//);
        expect(src).toContain("loadEligibleEnrollmentChildren");
    });
});

function readPanel(): string {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    return readFileSync(
        join(process.cwd(), "components/admin/focusPanel/cards/CurrentWorkSubjectSelectorPanel.tsx"),
        "utf8",
    );
}

// Keep vitest's unused-import checker quiet about `vi` if the suite stops needing it.
void vi;

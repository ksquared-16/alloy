import { afterEach, describe, expect, it, vi } from "vitest";

import {
    loadFocusPanelSummaryLayout,
    publishFocusPanelSummary,
    saveFocusPanelSummaryDraft,
    type FocusPanelSummaryLayoutState,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelSummaryLayoutService";
import { FOCUS_PANEL_SUMMARY_DEFAULT_DOC } from "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

type Call = { url: string; method: string };

function mockFetch(handler: (url: string, init?: RequestInit) => unknown): Call[] {
    const calls: Call[] = [];
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
            calls.push({ url, method: init?.method ?? "GET" });
            const body = handler(url, init);
            return { ok: true, status: 200, json: async () => body } as unknown as Response;
        }),
    );
    return calls;
}

const doc: LayoutDoc = FOCUS_PANEL_SUMMARY_DEFAULT_DOC;

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("Focus Panel Summary persistence service", () => {
    it("loads draft + published refs from the resolver endpoint", async () => {
        const calls = mockFetch(() => ({
            published: { id: "pub-1", version: 3, doc },
            draft: { id: "draft-1", version: 4, doc },
        }));
        const state = await loadFocusPanelSummaryLayout();
        expect(calls[0]!.url).toContain("/api/admin/entity-layouts/focus-panel-summary");
        expect(state.published?.id).toBe("pub-1");
        expect(state.draft?.version).toBe(4);
    });

    it("saveDraft PATCHes an existing draft in place", async () => {
        const bodies: unknown[] = [];
        const calls = mockFetch((_url, init) => {
            if (init?.body) bodies.push(JSON.parse(String(init.body)));
            return { id: "draft-1", version: 4, doc, updatedAt: "2026-07-28T12:00:00.000Z" };
        });
        const state: FocusPanelSummaryLayoutState = {
            draft: { id: "draft-1", version: 4, doc, updatedAt: "2026-07-28T11:00:00.000Z" },
            published: null,
        };
        const saved = await saveFocusPanelSummaryDraft(state, doc);
        expect(saved.id).toBe("draft-1");
        expect(calls).toHaveLength(1);
        expect(calls[0]!.method).toBe("PATCH");
        expect(calls[0]!.url).toContain("/api/admin/entity-layouts/draft-1");
        expect(bodies[0]).toMatchObject({ expectedUpdatedAt: "2026-07-28T11:00:00.000Z" });
    });

    it("saveDraft rejects when caller would send a stale expectedUpdatedAt (API contract)", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: false,
                status: 409,
                json: async () => ({
                    error: "This surface was updated elsewhere. Reload to continue — your newer edits were not overwritten.",
                    code: "STALE_LAYOUT_WRITE",
                }),
            }) as unknown as Response),
        );
        const state: FocusPanelSummaryLayoutState = {
            draft: { id: "draft-1", version: 4, doc, updatedAt: "old" },
            published: null,
        };
        await expect(saveFocusPanelSummaryDraft(state, doc)).rejects.toMatchObject({
            message: expect.stringContaining("updated elsewhere"),
            code: "STALE_LAYOUT_WRITE",
        });
    });

    it("saveDraft forks a published row to a new draft (never mutates live in place)", async () => {
        const calls = mockFetch((url) => {
            if (url.includes("/duplicate")) return { id: "draft-new", version: 5, doc };
            return { id: "draft-new", version: 5, doc };
        });
        const state: FocusPanelSummaryLayoutState = { draft: null, published: { id: "pub-1", version: 4, doc } };
        const saved = await saveFocusPanelSummaryDraft(state, doc);
        expect(saved.id).toBe("draft-new");
        expect(calls[0]!.method).toBe("POST");
        expect(calls[0]!.url).toContain("/api/admin/entity-layouts/pub-1/duplicate");
        expect(calls[1]!.method).toBe("PATCH");
        expect(calls[1]!.url).toContain("/api/admin/entity-layouts/draft-new");
    });

    it("saveDraft creates a new draft when nothing exists yet", async () => {
        const calls = mockFetch(() => ({ id: "draft-fresh", version: 1, doc }));
        const state: FocusPanelSummaryLayoutState = { draft: null, published: null };
        const saved = await saveFocusPanelSummaryDraft(state, doc);
        expect(saved.id).toBe("draft-fresh");
        expect(calls).toHaveLength(1);
        expect(calls[0]!.method).toBe("POST");
        expect(calls[0]!.url).toMatch(/\/api\/admin\/entity-layouts$/);
    });

    it("publish marks the draft published via the publish endpoint", async () => {
        const calls = mockFetch(() => ({ id: "pub-1", version: 5, doc }));
        const published = await publishFocusPanelSummary("draft-1");
        expect(published.version).toBe(5);
        expect(calls[0]!.method).toBe("POST");
        expect(calls[0]!.url).toContain("/api/admin/entity-layouts/draft-1/publish");
    });
});

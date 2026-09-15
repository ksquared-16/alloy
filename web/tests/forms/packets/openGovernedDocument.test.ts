import { afterEach, describe, expect, it, vi } from "vitest";

import { openGovernedDocument } from "@/lib/forms/packets/openGovernedDocument";

/**
 * "View document" did nothing when a person clicked it.
 *
 * The endpoint answers `{ ok, signedUrl }`; two call sites read `body.url ?? body.data?.url`, which
 * is always undefined, so the open never happened and nothing was reported. A silent no-op is only
 * ever found by someone clicking it, which is exactly how this was found.
 */

const originalOpen = globalThis.window?.open;

afterEach(() => {
    vi.restoreAllMocks();
    if (globalThis.window && originalOpen) globalThis.window.open = originalOpen;
});

const withWindow = (open: () => unknown) => {
    (globalThis as { window?: unknown }).window = { open } as unknown as Window;
};

describe("openGovernedDocument", () => {
    it("reads signedUrl — the key the endpoint actually returns", async () => {
        const tab = { location: { href: "" }, close: vi.fn() };
        withWindow(() => tab);
        vi.stubGlobal("fetch", vi.fn(async () => ({
            ok: true,
            json: async () => ({ ok: true, signedUrl: "https://example.test/doc.pdf" }),
        })));

        const result = await openGovernedDocument("doc-1");

        expect(result).toEqual({ ok: true });
        expect(tab.location.href).toBe("https://example.test/doc.pdf");
    });

    it("opens the tab BEFORE awaiting, so a popup blocker does not eat it", async () => {
        const order: string[] = [];
        withWindow(() => {
            order.push("open");
            return { location: { href: "" }, close: vi.fn() };
        });
        vi.stubGlobal("fetch", vi.fn(async () => {
            order.push("fetch");
            return { ok: true, json: async () => ({ ok: true, signedUrl: "https://example.test/d.pdf" }) };
        }));

        await openGovernedDocument("doc-1");

        expect(order).toEqual(["open", "fetch"]);
    });

    it("reports the endpoint's error instead of failing silently", async () => {
        const tab = { location: { href: "" }, close: vi.fn() };
        withWindow(() => tab);
        vi.stubGlobal("fetch", vi.fn(async () => ({
            ok: false,
            json: async () => ({ ok: false, error: "Document not found" }),
        })));

        const result = await openGovernedDocument("doc-1");

        expect(result).toEqual({ ok: false, message: "Document not found" });
        expect(tab.close).toHaveBeenCalled();
    });

    it("says so when the browser refuses the tab", async () => {
        withWindow(() => null);
        vi.stubGlobal("fetch", vi.fn(async () => ({
            ok: true,
            json: async () => ({ ok: true, signedUrl: "https://example.test/d.pdf" }),
        })));

        const result = await openGovernedDocument("doc-1");

        expect(result.ok).toBe(false);
        expect((result as { message: string }).message).toMatch(/blocked the new tab/i);
    });

    it("refuses a step with no document rather than calling the API", async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);

        const result = await openGovernedDocument("   ");

        expect(result.ok).toBe(false);
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});

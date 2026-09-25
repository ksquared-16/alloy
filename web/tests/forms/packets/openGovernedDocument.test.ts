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

    /*
     * THE REASON THE FIRST FIX DID NOT WORK, BOUND AS A TEST.
     *
     * Every test above stubs `window.open` and therefore chooses its own return value — which is
     * precisely why a defect in the ARGUMENTS survived them. `noopener` makes the real
     * `window.open` return null by specification, so opening with "noopener,noreferrer" meant the
     * handle was always null, the tab was never navigated, and the person was told their browser
     * had blocked a popup that it had in fact opened. Measured in Chromium: with the flag -> null,
     * without it -> a handle.
     */
    it("keeps the tab handle — it must not ask for noopener", async () => {
        const tab = { location: { href: "" }, close: vi.fn(), opener: {} as unknown };
        const open = vi.fn((..._args: unknown[]) => tab);
        withWindow(open);
        vi.stubGlobal("fetch", vi.fn(async () => ({
            ok: true,
            json: async () => ({ ok: true, signedUrl: "https://example.test/d.pdf" }),
        })));

        const result = await openGovernedDocument("doc-1");

        expect(result).toEqual({ ok: true });
        const features = String(open.mock.calls[0]?.[2] ?? "");
        expect(features).not.toMatch(/noopener/i);
        expect(tab.location.href).toBe("https://example.test/d.pdf");
        // The protection noopener was there for, applied once the handle has done its job.
        expect(tab.opener).toBeNull();
    });

    it("refuses a step with no document rather than calling the API", async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);

        const result = await openGovernedDocument("   ");

        expect(result.ok).toBe(false);
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});

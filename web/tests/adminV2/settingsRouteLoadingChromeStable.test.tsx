import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SETTINGS_PAGE_SHELL_CLASS } from "@/lib/adminV2/settingsPageLayout";

/**
 * Runtime convergence — Slice A (settings skeleton-morph).
 *
 * `web/app/adminV2/settings/loading.tsx` is the Next.js streaming fallback for the
 * settings index AND every subpage that lacks its own `loading.tsx` (none do).
 * It must NOT paint the index hub's tile grid, or every subpage morphs its
 * skeleton structure on entry (tile grid -> real page), which the locked runtime
 * doctrine forbids ("Do not add skeletons that morph page structure" —
 * docs/system/adminv2-runtime-performance-doctrine.md).
 */
describe("AdminV2 settings route loading fallback", () => {
    it("renders a chrome-stable reserve at stable page width (busy)", async () => {
        const Loading = (await import("@/app/adminV2/settings/loading")).default;
        const html = renderToStaticMarkup(<Loading />);
        expect(html).toContain('data-testid="settings-route-loading"');
        expect(html).toContain('aria-busy="true"');
        // Same stable page shell every settings page commits into — chrome does not shift.
        expect(html).toContain(SETTINGS_PAGE_SHELL_CLASS);
    });

    it("does NOT mirror the index hub tile grid (no structural morph on subpages)", async () => {
        const Loading = (await import("@/app/adminV2/settings/loading")).default;
        const html = renderToStaticMarkup(<Loading />);
        // The index hub paints a multi-column tile grid; the shared loading must not
        // reproduce that structure or subpages rearrange layout after the fallback.
        expect(html).not.toContain("grid-cols-3");
        expect(html).not.toContain("min-h-[4.75rem]"); // legacy index tile placeholder shape
    });

    it("index hub does render a tile grid — confirming the loading must stay neutral", () => {
        // Asymmetry guard: if the index ever stops being grid-shaped this test should be
        // revisited. We read source (not render) to avoid the hub's client-only deps.
        const hubSource = readFileSync(
            path.resolve(__dirname, "../../app/adminV2/settings/SettingsConfigurationHub.tsx"),
            "utf8",
        );
        expect(hubSource).toMatch(/grid-cols-3/);
    });
});

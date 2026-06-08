/**
 * Hard cutover: the drawer body must NEVER show the legacy VM overview as the
 * normal output. When the layout can't render, a visible error panel is shown.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DrawerLayoutRuntimeOverviewBody from "@/components/admin/vmDrawer/DrawerLayoutRuntimeOverviewBody";
import type { UseDrawerLayoutRuntimeBodyResult } from "@/lib/layout/runtime/useDrawerLayoutRuntimeBody";

const VM_MARKER = "LEGACY_VM_OVERVIEW_BODY";
const vmFallback = <div>{VM_MARKER}</div>;

function fallbackPhaseBody(): UseDrawerLayoutRuntimeBodyResult {
    return {
        cutoverEnabled: true,
        phase: "fallback",
        presentation: "vm",
        useVmFallback: true,
        showHold: false,
        bodyReady: false,
        doc: null,
        record: null,
        layoutSource: "org",
        layoutKey: "default",
        layoutRecordId: null,
        layoutVersion: null,
        lastError: "layout_fetch_timeout",
    };
}

describe("drawer hard cutover — no VM fallback", () => {
    const env = { ...process.env };
    beforeEach(() => {
        // Hard cutover active = runtime enabled (default) + no emergency fallback.
        delete process.env.LAYOUT_RUNTIME_ENABLED;
        delete process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_ENABLED;
        delete process.env.LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK;
        delete process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK;
    });
    afterEach(() => {
        process.env = { ...env };
    });

    it("renders a visible error panel, not the legacy VM body, on fallback phase", () => {
        const html = renderToStaticMarkup(
            <DrawerLayoutRuntimeOverviewBody
                layoutBody={fallbackPhaseBody()}
                vmFallback={vmFallback}
                entityId="opp-1"
                surface="opportunity_drawer_overview"
            />,
        );
        expect(html).toContain("data-layout-runtime-error-panel");
        expect(html).not.toContain(VM_MARKER);
    });

    it("DOES use the VM fallback when the emergency kill switch is on (cutover inactive)", () => {
        process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK = "1";
        const html = renderToStaticMarkup(
            <DrawerLayoutRuntimeOverviewBody
                layoutBody={fallbackPhaseBody()}
                vmFallback={vmFallback}
                entityId="opp-1"
                surface="opportunity_drawer_overview"
            />,
        );
        expect(html).toContain(VM_MARKER);
        expect(html).not.toContain("data-layout-runtime-error-panel");
    });
});

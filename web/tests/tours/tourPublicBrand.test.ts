/**
 * S4-B — the public tour page shows the school's brand, resolved for the LINK's own org and location.
 * The resolver itself is certified live (tests/branding/live/publicBrand.live.test.ts); this pins the
 * wiring and that no hardcoded platform identity remains where the school's should be.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (rel: string) =>
    readFileSync(resolve(__dirname, "../..", rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("public tour page brand", () => {
    const route = read("app/api/public/tour-booking/[token]/resolve/route.ts");
    const page = read("app/tour-booking/[token]/TourBookingPublicClient.tsx");

    it("is resolved server-side from the authorized link's org and location only", () => {
        expect(route).toContain("resolveLocationPublicBrand(supabase, { orgId: auth.link.org_id, locationId: auth.link.location_id })");
        // A brand failure falls back to the platform; it can never break an invitation link.
        expect(route).toMatch(/catch\s*\{\s*effective = resolveEffectivePublicBrand\(\{\}\);/);
        expect(route).toContain("tourPublicJson({ ok: true, view, brand })");
    });

    it("the page paints the school's accent with contrast-safe text and shows its identity", () => {
        expect(page).toContain("participantBrandStyle(");
        expect(page).toContain("brand?.displayName ?? \"Alloy\"");
        expect(page).not.toMatch(/alloy-bend-pine|#007d68|#00A283/i);
        for (const cls of page.match(/"[^"]*\bbg-participant-accent\b(?!\/)[^"]*"/g) ?? []) {
            expect(cls).not.toMatch(/\btext-white\b/);
        }
    });
});

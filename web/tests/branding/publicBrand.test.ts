/**
 * S4 — shared public brand: precedence, the form layer's legacy default, sanitising, and the
 * 4.5:1 contrast floor.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
    BRAND_INK_BLACK,
    BRAND_INK_DARK,
    BRAND_INK_LIGHT,
    brandAccentInk,
    brandOnAccent,
    contrastRatio,
    formBrandLayer,
    readPublicBrandValues,
    resolveEffectivePublicBrand,
    snapshotFormBrand,
    validatePublicBrandInput,
    type PublicBrandValues,
} from "@/lib/branding/publicBrand";
import { participantBrandStyle } from "@/lib/public/forms/participantBrandTheme";

const ORG: PublicBrandValues = { display_name: "Sunrise Early Learning", accent_color: "#1F6FEB", logo_url: "https://cdn.example.com/sunrise.png" };
const LOC: PublicBrandValues = { display_name: null, accent_color: "#B91C1C", logo_url: null };

describe("precedence: form → location → organization → platform, per field", () => {
    it("the organization default applies to every inheriting location", () => {
        const b = resolveEffectivePublicBrand({ organization: ORG, location: { display_name: null, accent_color: null, logo_url: null } });
        expect(b).toMatchObject({ displayName: ORG.display_name, accentColor: ORG.accent_color, logoUrl: ORG.logo_url });
        expect(b.sources).toEqual({ displayName: "organization", accentColor: "organization", logoUrl: "organization", tourCtaLabel: "platform" });
    });

    it("a location override wins for the fields it sets, and only those", () => {
        const b = resolveEffectivePublicBrand({ organization: ORG, location: LOC });
        expect(b.accentColor).toBe("#B91C1C");
        expect(b.sources.accentColor).toBe("location");
        expect(b.displayName).toBe(ORG.display_name);
        expect(b.sources.displayName).toBe("organization");
    });

    it("a form-specific override wins over the location", () => {
        const form = formBrandLayer({ brand_source: "form", accent_color: "#7C3AED", brand_name: "Summer Camp" });
        const b = resolveEffectivePublicBrand({ form, organization: ORG, location: LOC });
        expect(b).toMatchObject({ accentColor: "#7C3AED", displayName: "Summer Camp", logoUrl: ORG.logo_url });
        expect(b.sources).toEqual({ displayName: "form", accentColor: "form", logoUrl: "organization", tourCtaLabel: "platform" });
    });

    it("nothing configured anywhere is the platform default, unchanged from today", () => {
        expect(resolveEffectivePublicBrand({})).toMatchObject({ displayName: null, accentColor: "#00A283", logoUrl: null });
    });
});

describe("the form layer", () => {
    it("the builder's auto-saved Bend Pine on a legacy form is not an override", () => {
        expect(formBrandLayer({ accent_color: "#00A283", brand_name: "" })).toEqual({ display_name: null, accent_color: null, logo_url: null, tour_cta_label: null });
        // So the school's colour shows...
        expect(resolveEffectivePublicBrand({ form: formBrandLayer({ accent_color: "#00A283" }), organization: ORG }).accentColor).toBe("#1F6FEB");
        // ...and with no school brand it is Bend Pine again: no unbranded form changes.
        expect(resolveEffectivePublicBrand({ form: formBrandLayer({ accent_color: "#00A283" }) }).accentColor).toBe("#00A283");
    });

    it("a legacy form that chose another colour keeps it", () => {
        expect(formBrandLayer({ accent_color: "#7c3aed" })?.accent_color).toBe("#7C3AED");
    });

    it("an explicit form override may choose Bend Pine", () => {
        expect(formBrandLayer({ brand_source: "form", accent_color: "#00A283" })?.accent_color).toBe("#00A283");
    });

    it("'use the school's branding' ignores the form's values entirely", () => {
        expect(formBrandLayer({ brand_source: "inherit", accent_color: "#7C3AED", brand_name: "X" })).toBeNull();
    });

    it("the publish snapshot freezes exactly the brand fields", () => {
        const snap = snapshotFormBrand({ brand_source: "form", brand_name: "Camp", accent_color: "#7C3AED", logo_url: null, field_count: 9 });
        expect(Object.keys(snap).sort()).toEqual(["accent_color", "brand_name", "brand_source", "captured_at", "logo_url"]);
        expect(formBrandLayer(snap)?.accent_color).toBe("#7C3AED");
    });
});

describe("nothing unsafe reaches a public page", () => {
    it("stored values are sanitised on read", () => {
        const read = readPublicBrandValues({
            public_brand_v1: { display_name: "  A   B ", accent_color: "red;background:url(x)", logo_url: "javascript:alert(1)" },
        });
        expect(read).toEqual({ display_name: "A B", accent_color: null, logo_url: null, tour_cta_label: null });
        expect(readPublicBrandValues({ public_brand_v1: { logo_url: "http://insecure.example.com/x.png" } }).logo_url).toBeNull();
        expect(readPublicBrandValues(null)).toEqual({ display_name: null, accent_color: null, logo_url: null, tour_cta_label: null });
    });

    it("writes refuse malformed values instead of silently dropping them", () => {
        expect(validatePublicBrandInput({ accent_color: "blue" }).ok).toBe(false);
        expect(validatePublicBrandInput({ logo_url: "http://x.example.com/l.png" }).ok).toBe(false);
        expect(validatePublicBrandInput({ evil: 1 }).ok).toBe(false);
        expect(validatePublicBrandInput({ accent_color: "#abc", display_name: "", logo_url: null })).toEqual({
            ok: true,
            values: { display_name: null, accent_color: "#AABBCC", logo_url: null, tour_cta_label: null },
        });
    });
});

describe("S4-D — accessible presentation", () => {
    const all3 = Array.from({ length: 4096 }, (_, i) => `#${i.toString(16).padStart(3, "0")}`);

    it("button text on any accent is at least 4.5:1", () => {
        for (const hex of all3) expect(contrastRatio(hex, brandOnAccent(hex)), hex).toBeGreaterThanOrEqual(4.5);
    });

    it("the accent used as text on white is at least 4.5:1, in the same hue when possible", () => {
        for (const hex of all3) expect(contrastRatio(brandAccentInk(hex), BRAND_INK_LIGHT), hex).toBeGreaterThanOrEqual(4.5);
        expect(brandAccentInk("#7C3AED")).toBe("#7C3AED");
    });

    it("white that would fail is not kept: Bend Pine carries dark ink", () => {
        expect(contrastRatio("#00A283", BRAND_INK_LIGHT)).toBeLessThan(4.5);
        expect(brandOnAccent("#00A283")).toBe(BRAND_INK_DARK);
        expect(brandOnAccent("#1F6FEB")).toBe(BRAND_INK_LIGHT);
        expect(brandOnAccent("#FDE68A")).toBe(BRAND_INK_DARK);
        expect([BRAND_INK_LIGHT, BRAND_INK_DARK, BRAND_INK_BLACK]).toContain(brandOnAccent("#777777"));
    });

    it("the CSS fallbacks equal what the resolver computes for the platform default", () => {
        const css = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");
        const style = participantBrandStyle({ accentColor: "#00A283", logoUrl: null, brandName: null });
        expect(css).toContain(`var(--participant-accent, ${style["--participant-accent"]})`);
        expect(css).toContain(`var(--participant-on-accent, ${style["--participant-on-accent"]})`);
        expect(css).toContain(`var(--participant-accent-ink, ${style["--participant-accent-ink"]})`);
    });

    it("errors and warnings keep their own semantic colours in the public runtime", () => {
        const shell = readFileSync(resolve(__dirname, "../../app/forms/embed/[token]/ParentIntakeShell.tsx"), "utf8");
        expect(shell).toContain("bg-rose-50/80");
        expect(shell).toContain("bg-amber-50");
    });

    it("focus indication uses the contrast-safe ink, not the raw accent", () => {
        const composer = readFileSync(resolve(__dirname, "../../app/forms/embed/[token]/ParticipantComposer.tsx"), "utf8");
        expect(composer).toContain("focus-visible:outline-participant-accent-ink");
        expect(composer).not.toMatch(/outline-participant-accent(?!-ink)/);
    });
});

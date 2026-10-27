/**
 * Tours, Calendar & Forms — S2: public form branding and submit button (F01–F03, D-F2).
 *
 * F01  the tenant's accent reaches the public runtime (it was set as a CSS variable nothing read),
 *      with contrast-chosen text and one default shared with the builder.
 * F02  an optional, versioned submit label in the form schema.
 * F03  the primary action is full-width on mobile and content-width from `sm` up.
 * D-F2 a failed branding/details write is reported instead of silently dropped.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { renderToString } from "react-dom/server";

import { DEFAULT_FORM_ACCENT } from "@/lib/forms/processingFormBranding";
import { FORM_SUBMIT_LABEL_MAX, formSchemaV1Schema, formSubmitLabel } from "@/lib/forms/schema";
import {
    contrastRatio,
    participantBrandStyle,
    participantOnAccent,
    PARTICIPANT_ON_ACCENT_DARK,
    PARTICIPANT_ON_ACCENT_LIGHT,
    resolveParticipantBrand,
} from "@/lib/public/forms/participantBrandTheme";
import { IntakeFooter } from "@/app/forms/embed/[token]/ParentIntakeShell";
import { useProcessingFormApi } from "@/app/adminV2/pos/useProcessingFormApi";

const WEB = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
/** Source without comments: a file explaining why it no longer hardcodes a colour names the colour. */
const code = (rel: string) =>
    read(rel)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");

const RUNTIME_DIR = "app/forms/embed/[token]";

describe("F01 — the tenant accent paints the public runtime", () => {
    it("the shell publishes the accent, a contrast-chosen text colour and the accent ink", () => {
        expect(participantBrandStyle(resolveParticipantBrand({ accent_color: "#B91C1C" }))).toEqual({
            "--participant-accent": "#B91C1C",
            "--participant-on-accent": PARTICIPANT_ON_ACCENT_LIGHT,
            "--participant-accent-ink": "#B91C1C",
        });
    });

    it("a pale accent gets dark text, never near-invisible white", () => {
        for (const pale of ["#FDE68A", "#BAE6FD", "#FFFFFF", "#FFF"]) {
            expect(participantOnAccent(pale), pale).toBe(PARTICIPANT_ON_ACCENT_DARK);
            expect(contrastRatio(pale, PARTICIPANT_ON_ACCENT_DARK), pale).toBeGreaterThanOrEqual(4.5);
        }
    });

    it("S4-D: the platform default no longer keeps a failing white label", () => {
        // White on Bend Pine is about 3.2:1 — under the Director's 4.5:1 floor — so it carries dark ink.
        expect(contrastRatio(DEFAULT_FORM_ACCENT, PARTICIPANT_ON_ACCENT_LIGHT)).toBeLessThan(4.5);
        expect(participantOnAccent(DEFAULT_FORM_ACCENT)).toBe(PARTICIPANT_ON_ACCENT_DARK);
    });

    it("whatever the accent, the chosen text never falls under 4.5:1", () => {
        for (let i = 0; i < 4096; i += 7) {
            const hex = `#${i.toString(16).padStart(3, "0")}`;
            expect(contrastRatio(hex, participantOnAccent(hex)), hex).toBeGreaterThanOrEqual(4.5);
        }
    });

    it("the accent utilities read the shell's variable, not a value frozen on :root", () => {
        const css = read("app/globals.css");
        const inline = css.match(/@theme inline\s*\{([^}]*)\}/)?.[1] ?? "";
        expect(inline).toMatch(/--color-participant-accent:\s*var\(--participant-accent,\s*#00A283\)/);
        expect(inline).toMatch(/--color-participant-on-accent:\s*var\(--participant-on-accent,/);
        expect(inline).toMatch(/--color-participant-accent-ink:\s*var\(--participant-accent-ink,/);
        // Native checkboxes and radios follow the tenant too.
        expect(css).toMatch(/accent-color:\s*var\(--participant-accent/);
    });

    it("no runtime surface hardcodes the platform accent any more", () => {
        const files = readdirSync(join(WEB, RUNTIME_DIR)).filter((f) => f.endsWith(".tsx"));
        expect(files.length).toBeGreaterThan(5);
        for (const file of files) {
            let src = code(`${RUNTIME_DIR}/${file}`);
            // Alloy's own mark (shown when a tenant has no logo) is the platform's identity, not the accent.
            if (file === "ParentIntakeShell.tsx") src = src.replace(/function BrandMark[\s\S]*?\n}\n/, "");
            expect(src, file).not.toMatch(/alloy-(?:bend-pine|juniper)|#00A283|#009276/i);
            // A solid accent surface never pairs with a fixed white label.
            for (const cls of src.match(/"[^"]*\bbg-participant-accent\b(?!\/)[^"]*"/g) ?? []) {
                expect(cls, `${file}: ${cls}`).not.toMatch(/(?<!disabled:)\btext-white\b/);
            }
        }
    });

    it("the builder preview paints the same contrast-chosen label as the runtime", () => {
        const builder = code("app/adminV2/pos/ProcessingFormBuilder.tsx");
        expect(builder).toContain("color: participantOnAccent(accent)");
    });
});

describe("F02 — a versioned submit label", () => {
    const base = { schema_version: 1 as const, title: "Tour request", sections: [], fields: [] };

    it("the schema accepts it, trimmed, and still rejects unknown keys", () => {
        const parsed = formSchemaV1Schema.safeParse({ ...base, submit_label: "  Request a tour  " });
        expect(parsed.success).toBe(true);
        expect(parsed.success && parsed.data.submit_label).toBe("Request a tour");
        expect(formSchemaV1Schema.safeParse({ ...base, submitLabel: "x" }).success).toBe(false);
    });

    it("refuses an empty or over-long label instead of rendering a blank button", () => {
        expect(formSchemaV1Schema.safeParse({ ...base, submit_label: "   " }).success).toBe(false);
        expect(formSchemaV1Schema.safeParse({ ...base, submit_label: "x".repeat(FORM_SUBMIT_LABEL_MAX + 1) }).success).toBe(false);
        expect(formSchemaV1Schema.safeParse(base).success).toBe(true);
    });

    it("resolves to null when absent, so the runtime keeps its own wording", () => {
        expect(formSubmitLabel(null)).toBeNull();
        expect(formSubmitLabel({})).toBeNull();
        expect(formSubmitLabel({ submit_label: "  " })).toBeNull();
        expect(formSubmitLabel({ submit_label: " Send " })).toBe("Send");
    });

    it("the runtime uses it for the final submit only — signing keeps its platform wording", () => {
        const client = code(`${RUNTIME_DIR}/FormEmbedClient.tsx`);
        expect(client).toContain("formSubmitLabel(schema)");
        expect(client.match(/authoredSubmitLabel \?\? "Confirm & submit"/g)?.length).toBe(2);
        expect(client).toContain('authoredSubmitLabel ?? "Submit"');
        expect(client).not.toMatch(/authoredSubmitLabel \?\? "Sign and finish"/);
    });

    it("it lives in the schema (published versions), not in live form metadata", () => {
        expect(code("lib/forms/processingFormBranding.ts")).not.toContain("submit_label");
        expect(code("app/adminV2/pos/ProcessingFormBuilder.tsx")).toContain("submit_label: value");
    });
});

describe("F03 — primary action width", () => {
    it("full width on mobile, content width from sm up", () => {
        const html = renderToString(<IntakeFooter primaryLabel="Request a tour" onPrimary={() => undefined} />);
        const button = html.match(/<button[^>]*>Request a tour<\/button>/)?.[0] ?? "";
        expect(button).toContain("flex-1");
        expect(button).toContain("sm:flex-none");
        expect(button).toContain("bg-participant-accent");
        expect(button).toContain("text-participant-on-accent");
    });
});

describe("D-F2 — a failed branding save is reported, not swallowed", () => {
    afterEach(() => vi.unstubAllGlobals());

    function captureApi() {
        let api: ReturnType<typeof useProcessingFormApi> | null = null;
        function Probe() {
            api = useProcessingFormApi();
            return null;
        }
        renderToString(<Probe />);
        if (!api) throw new Error("hook did not render");
        return api as ReturnType<typeof useProcessingFormApi>;
    }

    const schema = { schema_version: 1 as const, title: "Intake", sections: [], fields: [] };
    const branding = { brand_name: "Lil' Sunshine", accent_color: "#7C3AED", logo_url: null, description: "" };

    it("saveDraft throws when the form-row PATCH fails after the version saved", async () => {
        const calls: string[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) => {
                calls.push(url);
                if (url.includes("/versions/")) return new Response(JSON.stringify({ ok: true }), { status: 200 });
                return new Response(JSON.stringify({ error: "metadata rejected" }), { status: 500 });
            })
        );
        const api = captureApi();
        await expect(api.saveDraft("form-1", "ver-1", schema, { branding })).rejects.toThrow(
            /Questions saved, but branding and form details were not: metadata rejected/
        );
        expect(calls).toEqual(["/api/admin/forms/form-1/versions/ver-1", "/api/admin/forms/form-1"]);
    });

    it("saveDraft resolves when both writes succeed", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
        await expect(captureApi().saveDraft("form-1", "ver-1", schema, { branding })).resolves.toBeUndefined();
    });

    it("patchFormBranding throws on a refused write", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 })));
        await expect(captureApi().patchFormBranding("form-1", branding)).rejects.toThrow(/forbidden/);
    });
});

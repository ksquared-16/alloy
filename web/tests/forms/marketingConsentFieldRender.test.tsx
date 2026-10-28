/**
 * Human QA V2 — the Marketing consent question renders through the one form renderer used by the
 * public form, the tour calendar's step two and Forms Studio Preview: in place, with the author's
 * wording, one unchecked box per offered channel, and no value in `values`.
 */
import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { FormEngineRenderer } from "@/components/forms/engine/FormEngineRenderer";
import { resolveMarketingConsentLanguage } from "@/lib/communications/preferences/intakeMarketingConsentRecord";
import { validateFormSchema } from "@/lib/forms/schema";

const schema = validateFormSchema({
    schema_version: 1,
    title: "Inquiry",
    sections: [{ id: "s1", field_ids: ["first", "consent", "last"] }],
    fields: [
        { id: "first", type: "text", label: "First name", required: true },
        {
            id: "consent",
            type: "marketing_consent",
            label: "Hear from Firefly Academy",
            description: "Optional.",
            consent: { channels: { email: true, sms: false }, wording: { email: "Email me Firefly news." } },
        },
        { id: "last", type: "text", label: "Last name", required: true },
    ],
});

const render = (mode: "edit" | "readonly", consent?: { email: boolean; sms: boolean }) =>
    renderToStaticMarkup(
        <FormEngineRenderer
            schema={schema}
            payload={{ values: {} }}
            onChange={() => {}}
            mode={mode}
            {...(consent ? { marketingConsent: { value: consent, onChange: () => {} } } : {})}
        />,
    );

describe("Marketing consent question — rendering", () => {
    it("renders in place, between the questions it was placed between, with the author's wording", () => {
        const html = render("edit");
        const at = (s: string) => html.indexOf(s);
        expect(at("First name")).toBeLessThan(at("Hear from Firefly Academy"));
        expect(at("Hear from Firefly Academy")).toBeLessThan(at("Last name"));
        expect(html).toContain("Email me Firefly news.");
        expect(html).toContain(`data-consent-language-version="${resolveMarketingConsentLanguage(schema.fields[1] as never).version}"`);
    });

    it("shows only the offered channel, unchecked by default", () => {
        const html = render("edit");
        expect(html).toContain('data-testid="public-marketing-consent-email"');
        expect(html).not.toContain('data-testid="public-marketing-consent-sms"');
        expect(html).not.toMatch(/public-marketing-consent-email"[^>]*checked/);
        expect(html).not.toMatch(/checked=""[^>]*public-marketing-consent-email/);
    });

    it("reflects the owner's answer when one is given (the public form's state)", () => {
        const html = render("edit", { email: true, sms: false });
        expect(html).toMatch(/checked=""[^>]*data-testid="public-marketing-consent-email"|data-testid="public-marketing-consent-email"[^>]*checked=""/);
    });

    it("read-only review explains where the answer lives instead of inventing a value", () => {
        const html = render("readonly");
        expect(html).toContain("recorded on the Processing case");
        expect(html).not.toContain('type="checkbox"');
    });
});

// @vitest-environment jsdom
/**
 * Tours & Public Forms P1-close — the Director's two findings and the bounded follow-ups.
 *
 * D1  Booking experience said "Shown to families" for the location layer while the published form's own
 *     brand won on the tour page. It now resolves exactly what the public page resolves: the published
 *     calendar link's form (same embed resolver, same publish-time snapshot) → location → organization.
 * D2  A public-form case read "Ready to create" with Approve enabled, then approval refused with 422
 *     "Create Lead is not configured for this process/location." The review now asks the same placement
 *     resolver approval uses, under the same condition, and blocks Approve before the click.
 * D5  A form's own "Email opt-in" / "SMS opt-in" person fields rendered beside the intake's consent
 *     control. Where the link offers that control, it is the only one shown, required or stored.
 * D8  The public renderer's labels were not associated with their controls.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const embedMock = vi.hoisted(() => ({ resolvePublicFormEmbedContext: vi.fn() }));
vi.mock("@/lib/public/forms/resolvePublicFormEmbedContext", () => embedMock);
const placementMock = vi.hoisted(() => ({ resolveCreateLeadPlacement: vi.fn() }));
vi.mock("@/lib/lifecycle/resolveCreateLeadPlacement", async (orig) => ({
    ...(await orig<typeof import("@/lib/lifecycle/resolveCreateLeadPlacement")>()),
    resolveCreateLeadPlacement: placementMock.resolveCreateLeadPlacement,
}));

import { loadPublishedFormBrandLayer } from "@/lib/branding/loadPublicBrand";
import { resolveEffectivePublicBrand, type PublicBrandValues } from "@/lib/branding/publicBrand";
import {
    loadPublishedTourCalendarForm,
    pickPublishedTourCalendarLink,
    tokenFromShareEmbedPath,
} from "@/lib/tours/publicCalendar/publishedTourCalendarBrand";
import {
    caseLeadPlacementInput,
    caseResolvesOwnLeadPlacement,
    evaluateCaseLeadPlacement,
} from "@/lib/pos/processingIdentity/operator/operatorReviewService";
import { LeadPlacementBlockedNotice, leadPlacementBlock, type RecommendationView } from "@/app/adminV2/processing/ReviewDecideCard";
import {
    isCompetingMarketingConsentField,
    withoutCompetingMarketingConsentFields,
} from "@/lib/communications/preferences/intakeMarketingConsentRecord";
import { FormEngineRenderer, emptyPayload } from "@/components/forms/engine/FormEngineRenderer";
import { formSchemaV1Schema, type FormSchemaV1 } from "@/lib/forms/schema";

const web = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");

const ORG = "11111111-1111-4111-8111-111111111111";
const LOC = "22222222-2222-4222-8222-222222222222";
const OTHER_LOC = "33333333-3333-4333-8333-333333333333";
const VERSION = "44444444-4444-4444-8444-444444444444";

/** A read-only Supabase fake: `from(table)` answers the table's rows, whatever the filters. */
function fakeSupabase(tables: Record<string, unknown>) {
    const builder = (table: string) => {
        const rows = tables[table];
        const b: Record<string, unknown> = {};
        for (const m of ["select", "eq", "neq", "in", "order", "limit"]) b[m] = () => b;
        b.maybeSingle = async () => ({ data: Array.isArray(rows) ? rows[0] ?? null : rows ?? null, error: null });
        b.then = (res: (v: unknown) => unknown) => res({ data: Array.isArray(rows) ? rows : rows ? [rows] : [], error: null });
        return b;
    };
    return { from: builder } as never;
}

const publishedLink = (over: Partial<{ id: string; loc: string; active: boolean; expires: string | null; published: boolean }> = {}) => ({
    id: over.id ?? "link-1",
    form_definition_id: "form-1",
    is_active: over.active ?? true,
    expires_at: over.expires ?? null,
    metadata: {
        default_location_id: over.loc ?? LOC,
        share_embed_path: "/forms/embed/tok_abc",
        tour_calendar_v1: over.published === false ? { enabled: false } : { enabled: true, enabled_at: "2026-10-28T00:00:00Z" },
    },
});

// ── D1 ──────────────────────────────────────────────────────────────────────────────────────────────

describe("D1 — which form the location's tour calendar opens into", () => {
    it("picks the usable link that carries this location's published calendar", () => {
        const rows = [
            publishedLink({ id: "other-location", loc: OTHER_LOC }),
            publishedLink({ id: "withdrawn", published: false }),
            publishedLink({ id: "inactive", active: false }),
            publishedLink({ id: "expired", expires: "2020-01-01T00:00:00Z" }),
            publishedLink({ id: "live" }),
        ];
        expect(pickPublishedTourCalendarLink(rows, LOC)?.id).toBe("live");
        expect(pickPublishedTourCalendarLink(rows.slice(0, 4), LOC)).toBeNull();
    });

    it("recovers the token from the stored share path only", () => {
        expect(tokenFromShareEmbedPath("/forms/embed/tok_abc")).toBe("tok_abc");
        expect(tokenFromShareEmbedPath("/forms/embed/tok%20x?x=1")).toBe("tok x");
        expect(tokenFromShareEmbedPath("/tours/tok_abc")).toBeNull();
        expect(tokenFromShareEmbedPath(null)).toBeNull();
    });
});

describe("D1 — effective identity = published form → location → organization → platform", () => {
    const organization: PublicBrandValues = { display_name: "Northwind Early Learning Org", accent_color: "#1F6FEB", logo_url: null, tour_cta_label: null };
    const location: PublicBrandValues = { display_name: "Riverside QA", accent_color: null, logo_url: null, tour_cta_label: "Book a Campus Visit" };

    beforeEach(() => embedMock.resolvePublicFormEmbedContext.mockReset());

    it("a form that sets its own name wins over the location, and says so per field", async () => {
        embedMock.resolvePublicFormEmbedContext.mockResolvedValue({
            ok: true,
            value: { orgId: ORG, formDefinitionVersionId: VERSION, formMetadata: {}, formName: "Northwind Tour Inquiry" },
        });
        const supabase = fakeSupabase({
            form_public_links: [publishedLink()],
            form_definition_versions: { metadata: { brand_snapshot_v1: { brand_source: "form", brand_name: "Northwind Early Learning", accent_color: "#7C3AED" } } },
        });
        const form = await loadPublishedTourCalendarForm(supabase, { orgId: ORG, locationId: LOC });
        expect(form?.formTitle).toBe("Northwind Tour Inquiry");
        expect(form?.formLayerSource).toBe("published_snapshot");
        const eff = resolveEffectivePublicBrand({ form: form!.formLayer, location, organization });
        expect(eff.displayName).toBe("Northwind Early Learning");
        expect(eff.sources.displayName).toBe("form");
        expect(eff.accentColor).toBe("#7C3AED");
        expect(eff.sources.accentColor).toBe("form");
        // The CTA is never a form setting: it stays the location's.
        expect(eff.tourCtaLabel).toBe("Book a Campus Visit");
        expect(eff.sources.tourCtaLabel).toBe("location");
    });

    it("a form that inherits shows the location's identity — what Booking experience edits", async () => {
        embedMock.resolvePublicFormEmbedContext.mockResolvedValue({
            ok: true,
            value: { orgId: ORG, formDefinitionVersionId: VERSION, formMetadata: {}, formName: "Inherits" },
        });
        const supabase = fakeSupabase({
            form_public_links: [publishedLink()],
            form_definition_versions: { metadata: { brand_snapshot_v1: { brand_source: "inherit", brand_name: "Ignored" } } },
        });
        const form = await loadPublishedTourCalendarForm(supabase, { orgId: ORG, locationId: LOC });
        expect(form?.formLayer).toBeNull();
        const eff = resolveEffectivePublicBrand({ form: form!.formLayer, location, organization });
        expect(eff.displayName).toBe("Riverside QA");
        expect(eff.sources.displayName).toBe("location");
        expect(eff.sources.accentColor).toBe("organization");
    });

    it("reads the PUBLISHED snapshot, not a draft edit to the form", async () => {
        const supabase = fakeSupabase({
            form_definition_versions: { metadata: { brand_snapshot_v1: { brand_source: "form", brand_name: "Published name" } } },
        });
        const { form } = await loadPublishedFormBrandLayer(supabase, {
            orgId: ORG,
            formDefinitionVersionId: VERSION,
            formMetadata: { brand_source: "form", brand_name: "Draft name" },
        });
        expect(form?.display_name).toBe("Published name");
    });

    it("no published calendar, a foreign org or an unresolvable link → no form layer", async () => {
        expect(await loadPublishedTourCalendarForm(fakeSupabase({ form_public_links: [] }), { orgId: ORG, locationId: LOC })).toBeNull();
        embedMock.resolvePublicFormEmbedContext.mockResolvedValue({ ok: true, value: { orgId: "someone-else", formDefinitionVersionId: VERSION, formMetadata: {}, formName: "x" } });
        expect(await loadPublishedTourCalendarForm(fakeSupabase({ form_public_links: [publishedLink()] }), { orgId: ORG, locationId: LOC })).toBeNull();
        embedMock.resolvePublicFormEmbedContext.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "x" } });
        expect(await loadPublishedTourCalendarForm(fakeSupabase({ form_public_links: [publishedLink()] }), { orgId: ORG, locationId: LOC })).toBeNull();
    });

    it("the public page and the settings read go through the same loaders (no second precedence)", () => {
        const loader = web("lib/branding/loadPublicBrand.ts");
        expect(loader).toMatch(/resolvePublicFormBrand[\s\S]*loadPublishedFormBrandLayer\(supabase, params\)/);
        const route = web("app/api/admin/public-brand/route.ts");
        expect(route).toContain("loadPublishedTourCalendarForm(supabase, { orgId: ctx.orgId, locationId })");
        expect(route).toContain("effective: resolveEffectivePublicBrand({ form: publishedForm?.formLayer ?? null, ...layers })");
        const panel = web("app/adminV2/settings/tours/availability/TourPublicBrandPanel.tsx");
        expect(panel).toContain("form: publishedForm?.formLayer ?? null, location: cleaned(draft)");
        expect(panel).toContain('data-testid={`tours-brand-${key}-form-wins`}');
        expect(panel).toContain('data-testid="tours-brand-published-form"');
        const share = web("app/adminV2/settings/tours/availability/TourShareSection.tsx");
        expect(share).toContain('data-testid="tours-share-effective-brand"');
        // Each part of the identity names its own source (the form may set the name but not the colour).
        expect(share).toContain("brandSourcePhrase(brand.sources.displayName, link.formTitle)");
        expect(share).toContain("brandSourcePhrase(brand.sources.accentColor, link.formTitle)");
    });

    it("D4 — a link named like its form is not listed twice", () => {
        const share = web("app/adminV2/settings/tours/availability/TourShareSection.tsx");
        expect(share).not.toMatch(/link\.linkLabel \?/);
        expect(share).toMatch(/function distinctLabel[\s\S]*toLowerCase\(\) !== link\.formTitle\.trim\(\)\.toLowerCase\(\)/);
    });

    it("D3 — the organization-scope time-zone hint no longer says 'this location'", () => {
        const client = web("app/adminV2/settings/tours/availability/TourAvailabilitySettingsClient.tsx");
        expect(client).toContain("No time zone is configured for the organization");
    });
});

// ── D2 ──────────────────────────────────────────────────────────────────────────────────────────────

describe("D2 — approval readiness asks the resolver approval uses", () => {
    beforeEach(() => placementMock.resolveCreateLeadPlacement.mockReset());

    it("only a public-form case without a BOS Create Lead intake places its own lead", () => {
        expect(caseResolvesOwnLeadPlacement({ source_adapter: "public_form_v1" })).toBe(true);
        expect(caseResolvesOwnLeadPlacement({ source_adapter: "public_form_v1", create_lead_intake: { work_unit_id: "wu" } })).toBe(false);
        expect(caseResolvesOwnLeadPlacement({ source_adapter: "document_upload" })).toBe(false);
        expect(caseResolvesOwnLeadPlacement(null)).toBe(false);
    });

    it("unconfigured placement → blocked, with approval's own message", async () => {
        placementMock.resolveCreateLeadPlacement.mockResolvedValue({
            ok: false,
            reason: "unconfigured",
            message: "Create Lead is not configured for this process/location.",
        });
        const r = await evaluateCaseLeadPlacement(fakeSupabase({ processing_cases: { metadata: { source_adapter: "public_form_v1" } } }), ORG, "case-1");
        expect(r).toEqual({ applies: true, ok: false, reason: "unconfigured", message: "Create Lead is not configured for this process/location." });
        expect(placementMock.resolveCreateLeadPlacement).toHaveBeenCalledWith(expect.anything(), ORG, {});
    });

    it("configured placement → ready; a case that does not place its own lead is never asked", async () => {
        placementMock.resolveCreateLeadPlacement.mockResolvedValue({ ok: true, workUnitId: "wu-1", statusKey: "new_inquiry" });
        expect(await evaluateCaseLeadPlacement(fakeSupabase({ processing_cases: { metadata: { source_adapter: "public_form_v1" } } }), ORG, "c")).toEqual({ applies: true, ok: true });
        placementMock.resolveCreateLeadPlacement.mockClear();
        expect(await evaluateCaseLeadPlacement(fakeSupabase({ processing_cases: { metadata: { create_lead_intake: { work_unit_id: "wu" }, source_adapter: "public_form_v1" } } }), ORG, "c")).toEqual({ applies: false });
        expect(placementMock.resolveCreateLeadPlacement).not.toHaveBeenCalled();
    });

    it("the case's routed department reaches the resolver (the approval blocker, P1 unblock)", async () => {
        const DEPT = "00000000-0000-4000-8000-000000000020";
        expect(caseLeadPlacementInput({ link_metadata: { default_department_id: DEPT } })).toEqual({ departmentId: DEPT });
        expect(caseLeadPlacementInput({ link_metadata: { intake_outcome: { default_department_id: DEPT } } })).toEqual({ departmentId: DEPT });
        expect(caseLeadPlacementInput({ link_metadata: { default_department_id: "not-a-uuid" } })).toEqual({});
        expect(caseLeadPlacementInput({ link_metadata: {} })).toEqual({});
        expect(caseLeadPlacementInput(null)).toEqual({});

        placementMock.resolveCreateLeadPlacement.mockResolvedValue({ ok: true, workUnitId: "wu-pipeline", statusKey: "new_inquiry" });
        const supabase = fakeSupabase({
            processing_cases: { metadata: { source_adapter: "public_form_v1", link_metadata: { default_department_id: DEPT, default_work_unit_id: "ignored" } } },
        });
        expect(await evaluateCaseLeadPlacement(supabase, ORG, "c")).toEqual({ applies: true, ok: true });
        // Only the department: the canonical resolver still decides the work unit and status.
        expect(placementMock.resolveCreateLeadPlacement).toHaveBeenCalledWith(expect.anything(), ORG, { departmentId: DEPT });
    });

    it("approval and readiness ask with the same input", () => {
        const svc = web("lib/pos/processingIdentity/operator/operatorReviewService.ts");
        expect(svc.match(/resolveCreateLeadPlacement\([^)]*caseLeadPlacementInput\(metadata\)\)/g)?.length).toBe(2);
        expect(svc).not.toMatch(/resolveCreateLeadPlacement\([^)]*, \{\}\)/);
    });

    it("blocks Approve only when a NEW lead would be placed and cannot be", () => {
        const blocked = { applies: true, ok: false, reason: "unconfigured", message: "Create Lead is not configured for this process/location." } as const;
        const view = (over: Partial<RecommendationView>): RecommendationView => ({ supported: true, ...over });
        expect(leadPlacementBlock(view({ leadPlacement: blocked, leadPlan: "create" }))).toBe(blocked.message);
        expect(leadPlacementBlock(view({ leadPlacement: blocked, leadPlan: null }))).toBe(blocked.message);
        expect(leadPlacementBlock(view({ leadPlacement: blocked, leadPlan: "reuse" }))).toBeNull();
        expect(leadPlacementBlock(view({ leadPlacement: { applies: true, ok: true } }))).toBeNull();
        expect(leadPlacementBlock(view({ leadPlacement: { applies: false } }))).toBeNull();
        expect(leadPlacementBlock(view({}))).toBeNull();
        expect(leadPlacementBlock(null)).toBeNull();
    });

    it("the blocked state says what is wrong and who fixes it", () => {
        const html = renderToStaticMarkup(<LeadPlacementBlockedNotice message="Create Lead is not configured for this process/location." />);
        expect(html).toContain('data-testid="processing-lead-placement-blocked"');
        expect(html).toContain("Can&#x27;t create the enrollment lead yet");
        expect(html).toContain("Organization › Processes");
    });

    it("one condition, one resolver: approval keeps failing closed; both Approve controls honour the block", () => {
        const svc = web("lib/pos/processingIdentity/operator/operatorReviewService.ts");
        expect(svc).toContain('if (caseResolvesOwnLeadPlacement(metadata) && leadSubject.decision === "create")');
        expect(svc).toContain('throw new OperatorServiceError("lead_placement_unresolved", placement.message)');
        expect(svc).not.toContain('metadata?.source_adapter === "public_form_v1"');
        const route = web("app/api/admin/processing/cases/[caseId]/recommendation/route.ts");
        expect(route).toContain("evaluateCaseLeadPlacement(supabase, ctx.orgId, caseId)");
        const rail = web("app/adminV2/pos/PosCaseDecisionColumn.tsx");
        expect(rail).toContain("disabled={approving || reviewRequired || Boolean(placementBlocked)}");
        const detail = web("app/adminV2/processing/ProcessingCaseDetailContent.tsx");
        expect(detail).toContain("disabled={approving || Boolean(leadPlacementBlock(rec))}");
    });
});

// ── D5 ──────────────────────────────────────────────────────────────────────────────────────────────

describe("D5 — one consent control on a public intake", () => {
    const schema = {
        schema_version: 1,
        title: "Inquiry",
        sections: [{ id: "s", title: "S", field_ids: ["first", "email_opt_in", "sms_opt_in", "kids"] }],
        fields: [
            { id: "first", type: "text", label: "First", field_source: { entity_type: "person", field_key: "first_name" } },
            { id: "email_opt_in", type: "boolean", label: "Email opt-in", required: true, field_source: { entity_type: "person", field_key: "email_opt_in" } },
            { id: "sms_opt_in", type: "boolean", label: "SMS opt-in", field_source: { entity_type: "person", field_key: "sms_opt_in" } },
            {
                id: "kids",
                type: "group",
                label: "Kids",
                fields: [{ id: "kid_sms", type: "boolean", label: "SMS", field_source: { entity_type: "person", field_key: "sms_opt_in" } }],
            },
        ],
    };

    it("drops the person opt-in fields and their section references, including inside groups", () => {
        const out = withoutCompetingMarketingConsentFields(schema);
        expect(out.fields.map((f) => f.id)).toEqual(["first", "kids"]);
        expect(out.fields[1]!.fields).toEqual([]);
        expect(out.sections[0]!.field_ids).toEqual(["first", "kids"]);
    });

    it("leaves every other field alone and returns the same schema when there is nothing to drop", () => {
        expect(isCompetingMarketingConsentField({ id: "x", field_source: { entity_type: "person", field_key: "communication_opt_out" } })).toBe(false);
        expect(isCompetingMarketingConsentField({ id: "x", field_source: { entity_type: "household", field_key: "email_opt_in" } })).toBe(false);
        const plain = { fields: [schema.fields[0]!], sections: [{ field_ids: ["first"] }] };
        expect(withoutCompetingMarketingConsentFields(plain)).toBe(plain);
    });

    it("applies only where the link offers the consent control — in the browser AND on submit", () => {
        const client = web("app/forms/embed/[token]/FormEmbedClient.tsx");
        // Offered → competing person opt-ins go; not offered → an authored consent question is hidden too
        // (Human QA V2: boxes no Processing case could hold are never shown).
        expect(client).toMatch(
            /marketing_consent_offered === true\s*\?\s*withoutCompetingMarketingConsentFields\(authored\)\s*:\s*withoutMarketingConsentFields\(authored\)/,
        );
        const submit = web("app/api/public/forms/[token]/submissions/[submissionId]/submit/route.ts");
        expect(submit).toMatch(/if \(marketingConsent\) \{[\s\S]*withoutCompetingMarketingConsentFields\(schema\)/);
        expect(submit).toMatch(/for \(const id of competingConsentFieldIds\) delete values\[id\]/);
    });
});

// ── D8 ──────────────────────────────────────────────────────────────────────────────────────────────

describe("D8 — the public renderer names each control with its label", () => {
    const formSchema = formSchemaV1Schema.parse({
        schema_version: 1,
        title: "Inquiry",
        sections: [{ id: "s", title: "S", field_ids: ["first", "email", "phone", "age", "start", "program"] }],
        fields: [
            { id: "first", type: "text", label: "First name", required: true },
            { id: "email", type: "text", label: "Email" },
            { id: "phone", type: "text", label: "Phone", field_source: { entity_type: "person", field_key: "phone" } },
            { id: "age", type: "number", label: "Age" },
            { id: "start", type: "date", label: "Start" },
            { id: "program", type: "select", label: "Program", static_options: [{ value: "infant", label: "Infant" }, { value: "toddler", label: "Toddler" }] },
        ],
    }) as FormSchemaV1;

    it("every editable text, phone, number, date and select control is labelled by its own <label for>", () => {
        const html = renderToStaticMarkup(
            <FormEngineRenderer schema={formSchema} payload={emptyPayload()} onChange={() => {}} mode="edit" variant="embed" />
        );
        const doc = new DOMParser().parseFromString(html, "text/html");
        const named: Record<string, string> = {};
        for (const label of Array.from(doc.querySelectorAll("label[for]"))) {
            const control = doc.getElementById(label.getAttribute("for")!);
            expect(control, `label "${label.textContent}" points at a control`).not.toBeNull();
            named[label.textContent!.replace("*", "").trim()] = control!.tagName.toLowerCase();
        }
        expect(named).toEqual({ "First name": "input", Email: "input", Phone: "input", Age: "input", Start: "input", Program: "select" });
        const ids = Array.from(doc.querySelectorAll("[id]")).map((e) => e.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("read-only display has no dangling label target", () => {
        const html = renderToStaticMarkup(
            <FormEngineRenderer schema={formSchema} payload={emptyPayload()} onChange={() => {}} mode="readonly" variant="embed" />
        );
        expect(html).not.toContain(' for="');
    });
});

// ── UX-04 / T1 ──────────────────────────────────────────────────────────────────────────────────────

describe("UX-04 — an anonymous inquiry page no longer logs 409s; T1 copy", () => {
    it("NO_SESSION on the read-only participant probes answers ok:false without an error status", () => {
        for (const route of ["app/api/public/forms/[token]/enrollment-objective/route.ts", "app/api/public/forms/[token]/enrollment-artifact/route.ts"]) {
            const src = web(route);
            expect(src).toContain('access.error.code === "INVALID_LINK" ? 404 : access.error.code === "NO_SESSION" ? 200 : 409');
        }
        // Every consumer reads `ok` / `data`, so ok:false still leaves the objective and artifact unset.
        expect(web("app/forms/embed/[token]/FormEmbedClient.tsx")).toContain("if (!cancelled && json?.ok && json.data)");
        expect(web("app/forms/embed/[token]/EnrollmentConversationCard.tsx")).toContain("if (json.ok && json.data)");
    });

    it("the overriding fields read as a sentence", () => {
        expect(web("app/adminV2/settings/tours/availability/TourPublicBrandPanel.tsx")).toContain("listInWords(formWins.map((k) => FIELD_NOUN[k]))");
    });
});

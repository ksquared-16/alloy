import { describe, expect, it } from "vitest";
import {
    detectJobOverviewIntentFlags,
    normalizeJobOverviewRequestText,
    planJobOverviewLayoutRequest,
    resolveCatalogCapabilityGapsInText,
    resolveCatalogFieldsInText,
} from "@/lib/agent/planner/planJobOverviewLayoutRequest";
import { JOB_OVERVIEW_RESOLUTION_CATALOG } from "@/lib/agent/planner/jobOverviewResolutionCatalog";
import {
    getOverviewLayoutConfigStoredVersion,
    parseOverviewLayoutConfigStrict,
} from "@/lib/rrs/overview/overviewLayoutConfigStrict";
import { getDefaultOverviewLayoutConfig } from "@/lib/rrs/overview/overviewLayoutV0";

function storedConfig(version: number, layout = getDefaultOverviewLayoutConfig()) {
    return {
        version,
        header_keys: layout.header_keys,
        bands: layout.bands.map((b) => ({
            band_key: b.band_key,
            enabled: b.enabled,
            items: b.items.map((it) => ({ kind: it.kind, key: it.key })),
        })),
        ...(layout.relationship_group_keys?.length
            ? { relationship_group_keys: layout.relationship_group_keys }
            : {}),
    };
}

describe("job overview semantic planner — intent flags", () => {
    it("detects hide financial and service-higher phrasing", () => {
        expect(
            detectJobOverviewIntentFlags(normalizeJobOverviewRequestText("hide the financial band"))
                .hide_financial
        ).toBe(true);
        expect(
            detectJobOverviewIntentFlags(
                normalizeJobOverviewRequestText("put service details higher")
            ).service_details_higher
        ).toBe(true);
    });

    it("detects job-scoped customer focus and contact-higher phrasing", () => {
        const i = detectJobOverviewIntentFlags(
            normalizeJobOverviewRequestText("make the job more customer-focused")
        );
        expect(i.customer_focused).toBe(true);
        expect(
            detectJobOverviewIntentFlags(
                normalizeJobOverviewRequestText("show contact details higher")
            ).contact_details_higher
        ).toBe(true);
    });
});

describe("job overview semantic planner — phrase resolution", () => {
    it("resolves longest synonym per field (main contact → _primary_person_name)", () => {
        const t = normalizeJobOverviewRequestText("Show the main contact on the overview");
        const r = resolveCatalogFieldsInText(t, JOB_OVERVIEW_RESOLUTION_CATALOG);
        const hit = r.find((x) => x.field_key === "_primary_person_name");
        expect(hit?.phrase_matched).toBe("main contact");
    });

    it("maps address and next service phrases", () => {
        const t = normalizeJobOverviewRequestText(
            "Please show address and next service date for the job"
        );
        const r = resolveCatalogFieldsInText(t, JOB_OVERVIEW_RESOLUTION_CATALOG);
        expect(r.map((x) => x.field_key).sort()).toEqual(
            ["_location_label", "_next_schedule"].sort()
        );
    });

    it("does not match partial words for synonyms", () => {
        const t = normalizeJobOverviewRequestText("financialization is unrelated");
        const r = resolveCatalogFieldsInText(t, JOB_OVERVIEW_RESOLUTION_CATALOG);
        expect(r.some((x) => x.field_key === "display_total_cents")).toBe(false);
    });

    it("resolves capability gaps for phone and email (no field keys)", () => {
        const t = normalizeJobOverviewRequestText("show phone and email on overview");
        const g = resolveCatalogCapabilityGapsInText(t, JOB_OVERVIEW_RESOLUTION_CATALOG);
        expect(g.map((x) => x.concept_id).sort()).toEqual(["email", "phone"].sort());
    });
});

describe("job overview semantic planner — ambiguity", () => {
    it("fails when hide and show financial both apply", () => {
        const r = planJobOverviewLayoutRequest(
            "Hide the financial band but turn financial on",
            storedConfig(2)
        );
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.ambiguity?.some((a) => a.code === "financial_hide_show_conflict")).toBe(true);
        }
    });
});

describe("job overview semantic planner — proposal assembly", () => {
    it("disables financial band and bumps version", () => {
        const cur = storedConfig(3);
        const r = planJobOverviewLayoutRequest("Hide the financial band", cur);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.expected_config_version).toBe(3);
        expect(r.config.version).toBe(4);
        const bands = r.config.bands as { band_key: string; enabled: boolean }[];
        expect(bands.find((b) => b.band_key === "financial")?.enabled).toBe(false);
    });

    it("enables financial when asked to show pricing", () => {
        const layout = getDefaultOverviewLayoutConfig();
        const fin = layout.bands.find((b) => b.band_key === "financial");
        if (fin) fin.enabled = false;
        const r = planJobOverviewLayoutRequest("Show financial information", storedConfig(1, layout));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const bands = r.config.bands as { band_key: string; enabled: boolean }[];
        expect(bands.find((b) => b.band_key === "financial")?.enabled).toBe(true);
    });

    it("moves service_property immediately after summary", () => {
        const r = planJobOverviewLayoutRequest(
            "Put service details higher on the overview",
            storedConfig(0)
        );
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const order = (r.config.bands as { band_key: string }[]).map((b) => b.band_key);
        const si = order.indexOf("summary");
        const pi = order.indexOf("service_property");
        expect(si).toBeGreaterThanOrEqual(0);
        expect(pi).toBe(si + 1);
        const sp = (r.config.bands as { band_key: string; enabled: boolean }[]).find(
            (b) => b.band_key === "service_property"
        );
        expect(sp?.enabled).toBe(true);
    });

    it("adds address and next schedule items to summary", () => {
        const r = planJobOverviewLayoutRequest(
            "Show address and next service date",
            storedConfig(2)
        );
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const summary = (r.config.bands as { band_key: string; items: { key: string }[] }[]).find(
            (b) => b.band_key === "summary"
        );
        const keys = summary?.items.map((i) => i.key) ?? [];
        expect(keys).toContain("_location_label");
        expect(keys).toContain("_next_schedule");
    });

    it("customer-focused enables relationships and sets relationship_group_keys", () => {
        const r = planJobOverviewLayoutRequest(
            "Make the overview more customer-focused",
            storedConfig(1)
        );
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.config.relationship_group_keys).toEqual([
            "primary_customer_person",
            "customer_account",
        ]);
        const bands = r.config.bands as { band_key: string; enabled: boolean }[];
        expect(bands.find((b) => b.band_key === "relationships")?.enabled).toBe(true);
        expect(bands.find((b) => b.band_key === "people")?.enabled).toBe(true);
    });

    it("composite: contact, phone/email gaps, address, service line, next service", () => {
        const utterance =
            "Show the main contact, their phone, email, address, what service they got, and next service date";
        const r = planJobOverviewLayoutRequest(utterance, storedConfig(1));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const ids = r.resolution.unresolved_targets.map((u) => u.concept_id).sort();
        expect(ids).toEqual(["email", "phone"]);
        const summary = (r.config.bands as { band_key: string; items: { key: string }[] }[]).find(
            (b) => b.band_key === "summary"
        );
        const keys = summary?.items.map((i) => i.key) ?? [];
        expect(keys).toContain("_location_label");
        expect(keys).toContain("_next_schedule");
        expect(keys).toContain("service_key");
        expect(r.resolution.resolved_outcomes.some((o) => o.field_key === "service_key")).toBe(true);
        expect(r.effective_layout_change).toBe(true);
    });

    it("show contact details and next service date", () => {
        const r = planJobOverviewLayoutRequest(
            "Show contact details and next service date",
            storedConfig(2)
        );
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.parsed_intent.show_next_service).toBe(true);
        expect(r.parsed_intent.show_main_contact).toBe(true);
        const summary = (r.config.bands as { band_key: string; items: { key: string }[] }[]).find(
            (b) => b.band_key === "summary"
        );
        expect(summary?.items.map((i) => i.key)).toContain("_next_schedule");
    });

    it("no effective layout change when only unsupported channels are requested", () => {
        const r = planJobOverviewLayoutRequest("Please show phone and email", storedConfig(3));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.effective_layout_change).toBe(false);
        expect(r.resolution.unresolved_targets.length).toBeGreaterThanOrEqual(1);
        expect(r.rationale.some((line) => /No layout keys changed|Unresolved/i.test(line))).toBe(true);
    });

    it("unsupported phrase alone does not invent fields", () => {
        const r = planJobOverviewLayoutRequest("enable fax and pager on overview", storedConfig(1));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.error).toMatch(/No supported/);
    });
});

describe("job overview semantic planner — strict validation (fixtures)", () => {
    it("accepts planner output", () => {
        const r = planJobOverviewLayoutRequest(
            "Hide financial and show main contact",
            storedConfig(4)
        );
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const strict = parseOverviewLayoutConfigStrict(r.config);
        expect(strict.ok).toBe(true);
    });

    it("rejects version < 1", () => {
        const strict = parseOverviewLayoutConfigStrict({
            version: 0,
            header_keys: ["title"],
            bands: [
                {
                    band_key: "summary",
                    enabled: true,
                    items: [{ kind: "system_field", key: "scheduled_at" }],
                },
            ],
        });
        expect(strict.ok).toBe(false);
    });

    it("rejects duplicate band_key", () => {
        const strict = parseOverviewLayoutConfigStrict({
            version: 1,
            header_keys: ["title"],
            bands: [
                { band_key: "summary", enabled: true, items: [] },
                { band_key: "summary", enabled: false, items: [] },
            ],
        });
        expect(strict.ok).toBe(false);
    });

    it("rejects unknown top-level key", () => {
        const strict = parseOverviewLayoutConfigStrict({
            version: 1,
            header_keys: ["title"],
            bands: [],
            extra:1,
        } as unknown as Record<string, unknown>);
        expect(strict.ok).toBe(false);
    });

    it("rejects invalid relationship_group_keys entry", () => {
        const strict = parseOverviewLayoutConfigStrict({
            version: 1,
            header_keys: ["title"],
            bands: [
                { band_key: "summary", enabled: true, items: [{ kind: "system_field", key: "title" }] },
            ],
            relationship_group_keys: ["not_a_group"],
        });
        expect(strict.ok).toBe(false);
    });
});

describe("job overview semantic planner — golden utterances", () => {
    const cases: { utterance: string; assert: (r: ReturnType<typeof planJobOverviewLayoutRequest>) => void }[] =
        [
            {
                utterance: "Hide the money section",
                assert: (r) => {
                    expect(r.ok).toBe(true);
                    if (!r.ok) return;
                    const fin = (r.config.bands as { band_key: string; enabled: boolean }[]).find(
                        (b) => b.band_key === "financial"
                    );
                    expect(fin?.enabled).toBe(false);
                },
            },
            {
                utterance: "Customer-centric layout please",
                assert: (r) => {
                    expect(r.ok).toBe(true);
                    if (!r.ok) return;
                    expect(r.parsed_intent.customer_focused).toBe(true);
                },
            },
            {
                utterance: "Move service property higher",
                assert: (r) => {
                    expect(r.ok).toBe(true);
                    if (!r.ok) return;
                    const order = (r.config.bands as { band_key: string }[]).map((b) => b.band_key);
                    expect(order.indexOf("service_property")).toBe(order.indexOf("summary") + 1);
                },
            },
            {
                utterance: "I want to see the primary person name",
                assert: (r) => {
                    expect(r.ok).toBe(true);
                    if (!r.ok) return;
                    const people = (r.config.bands as { band_key: string; items: { key: string }[] }[]).find(
                        (b) => b.band_key === "people"
                    );
                    expect(people?.items.map((i) => i.key)).toContain("_primary_person_name");
                    expect((r.config.header_keys as string[]).includes("_primary_person_name")).toBe(false);
                },
            },
        ];

    it.each(cases)("golden: $utterance", ({ utterance, assert }) => {
        const r = planJobOverviewLayoutRequest(utterance, storedConfig(2));
        assert(r);
    });
});

describe("job overview semantic planner — editorial policy (target requests)", () => {
    const strictOk = (config: unknown) => expect(parseOverviewLayoutConfigStrict(config).ok).toBe(true);

    it("show the main contact, their phone, email, address, what service they got, and next service date", () => {
        const utterance =
            "Show the main contact, their phone, email, address, what service they got, and next service date";
        const r = planJobOverviewLayoutRequest(utterance, storedConfig(1));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        strictOk(r.config);
        expect(r.resolution.unresolved_targets.map((u) => u.concept_id).sort()).toEqual(["email", "phone"]);
        const hk = r.config.header_keys as string[];
        expect(hk.includes("_location_label")).toBe(false);
        expect(hk.includes("_next_schedule")).toBe(false);
        expect(hk.includes("service_key")).toBe(false);
        expect(hk.includes("_primary_person_name")).toBe(false);
        const summary = (r.config.bands as { band_key: string; items: { key: string }[] }[]).find(
            (b) => b.band_key === "summary"
        );
        expect(summary?.items.map((i) => i.key)).toEqual(
            expect.arrayContaining(["_location_label", "_next_schedule", "service_key"])
        );
        const people = (r.config.bands as { band_key: string; items: { key: string }[] }[]).find(
            (b) => b.band_key === "people"
        );
        expect(people?.items.map((i) => i.key)).toContain("_primary_person_name");
        expect(r.diff_summary.header_keys?.after.map((k) => k).includes("_primary_person_name")).toBe(false);
    });

    it("make the overview more customer-focused", () => {
        const r = planJobOverviewLayoutRequest("make the overview more customer-focused", storedConfig(1));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        strictOk(r.config);
        expect(r.parsed_intent.customer_focused).toBe(true);
        const hk = r.config.header_keys as string[];
        expect(hk.indexOf("title")).toBe(0);
        expect(hk.includes("_customer_name")).toBe(true);
        expect(hk.includes("_primary_person_name")).toBe(true);
        expect(r.config.relationship_group_keys).toEqual(["primary_customer_person", "customer_account"]);
    });

    it("show contact details higher", () => {
        const r = planJobOverviewLayoutRequest("show contact details higher", storedConfig(2));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        strictOk(r.config);
        expect(r.parsed_intent.contact_details_higher).toBe(true);
        const order = (r.config.bands as { band_key: string }[]).map((b) => b.band_key);
        expect(order.indexOf("people")).toBe(order.indexOf("summary") + 1);
        expect((r.config.header_keys as string[]).includes("_primary_person_name")).toBe(false);
    });

    it("put service details higher", () => {
        const r = planJobOverviewLayoutRequest("put service details higher", storedConfig(1));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        strictOk(r.config);
        expect(r.parsed_intent.service_details_higher).toBe(true);
        const order = (r.config.bands as { band_key: string }[]).map((b) => b.band_key);
        expect(order.indexOf("service_property")).toBe(order.indexOf("summary") + 1);
        expect((r.config.header_keys as string[]).includes("service_key")).toBe(false);
    });
});

describe("job overview semantic planner — unsupported / edge", () => {
    it("returns error when no intent matches", () => {
        const r = planJobOverviewLayoutRequest("Reorder the entire database schema", storedConfig(1));
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toMatch(/No supported/);
    });

    it("passthrough expected_config_version from stored config", () => {
        const raw = { ...storedConfig(7) };
        expect(getOverviewLayoutConfigStoredVersion(raw)).toBe(7);
        const r = planJobOverviewLayoutRequest("Show next visit", raw);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.expected_config_version).toBe(7);
        expect(r.config.version).toBe(8);
    });
});

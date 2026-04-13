import { describe, expect, it } from "vitest";
import {
    detectJobOverviewIntentFlags,
    normalizeJobOverviewRequestText,
    planJobOverviewLayoutRequest,
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
                    expect((r.config.header_keys as string[]).includes("_primary_person_name")).toBe(true);
                },
            },
        ];

    it.each(cases)("golden: $utterance", ({ utterance, assert }) => {
        const r = planJobOverviewLayoutRequest(utterance, storedConfig(2));
        assert(r);
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

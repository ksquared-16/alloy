import { describe, expect, it } from "vitest";
import {
    compatibleWeightingsForPopulation,
    formatWeightingTable,
    mapPublishedPopulations,
    mapPublishedWeightings,
} from "@/lib/organizationCalculations/definitionCatalog";
import {
    compactSymbolicDefinition,
    plainLanguageDefinitionSummary,
} from "@/lib/organizationCalculations/definitionSummary";
import {
    roomUtilizationFtePivotDraft,
    roomUtilizationPivotDraft,
} from "@/lib/organizationCalculations/pivotBuilder";
import { compilePivotBuilderDraft } from "@/lib/organizationCalculations/pivotBuilder";
import { listProductCatalogQuestions } from "@/lib/operationalQuestions/catalog";
import {
    EQUIVALENT_CHILD_COUNT_QUESTION_KEY,
    ROOM_UTILIZATION_FTE_QUESTION_KEY,
    ROOM_UTILIZATION_QUESTION_KEY,
    FUTURE_ROOM_CAPACITY_QUESTION_KEY,
} from "@/lib/operationalQuestions/catalog";

describe("definitionCatalog", () => {
    const populations = [
        {
            id: "pop-1",
            name: "Children expected in the room",
            lifecycle: "published",
            published_version_id: "pop-v1",
            versions: [
                {
                    id: "pop-v1",
                    version_number: 1,
                    immutable: true,
                    predicate: "expected_in_room_on_date",
                    membership_summary: "Active enrollment + room + schedule",
                },
                {
                    id: "pop-draft",
                    version_number: 2,
                    immutable: false,
                    predicate: "expected_in_room_on_date",
                    membership_summary: "draft",
                },
            ],
        },
        {
            id: "pop-archived",
            name: "Archived",
            lifecycle: "archived",
            published_version_id: "pop-arch-v1",
            versions: [
                {
                    id: "pop-arch-v1",
                    version_number: 1,
                    immutable: true,
                    predicate: "expected_in_room_on_date",
                    membership_summary: "x",
                },
            ],
        },
        {
            id: "pop-other-org-shape",
            name: "Draft only",
            lifecycle: "draft",
            published_version_id: null,
            versions: [],
        },
    ];

    const weightings = [
        {
            id: "wgt-1",
            name: "Days-per-week equivalent",
            lifecycle: "published",
            published_version_id: "wgt-v1",
            versions: [
                {
                    id: "wgt-v1",
                    version_number: 1,
                    immutable: true,
                    scheme: "days_per_week" as const,
                    factors: { "5": 1, "4": 0.8, "3": 0.6, "2": 0.4, "1": 0.2 },
                    full_time_days: 5,
                    full_time_hours: null,
                    session_basis: "days_per_week" as const,
                    summary: "FTE",
                },
            ],
        },
        {
            id: "wgt-2",
            name: "Each child as 1",
            lifecycle: "published",
            published_version_id: "wgt-v2",
            versions: [
                {
                    id: "wgt-v2",
                    version_number: 1,
                    immutable: true,
                    scheme: "unweighted" as const,
                    factors: {},
                    full_time_days: 5,
                    full_time_hours: null,
                    session_basis: null,
                    summary: "1.0",
                },
            ],
        },
    ];

    it("maps only published exact versions", () => {
        const opts = mapPublishedPopulations(populations);
        expect(opts).toHaveLength(1);
        expect(opts[0]?.versionId).toBe("pop-v1");
        expect(opts[0]?.label).toContain("v1");
    });

    it("maps published weightings with exact version identity", () => {
        const opts = mapPublishedWeightings(weightings);
        expect(opts.map((w) => w.versionId).sort()).toEqual(["wgt-v1", "wgt-v2"]);
    });

    it("returns empty catalog when nothing published", () => {
        expect(mapPublishedPopulations([])).toEqual([]);
        expect(mapPublishedWeightings([])).toEqual([]);
    });

    it("keeps selection identity across remapping (rerender persistence)", () => {
        const first = mapPublishedPopulations(populations);
        const second = mapPublishedPopulations(populations);
        expect(first[0]?.versionId).toBe(second[0]?.versionId);
        expect(first[0]?.populationId).toBe(second[0]?.populationId);
    });

    it("lists compatible weightings for a population", () => {
        const wgts = mapPublishedWeightings(weightings);
        const compatible = compatibleWeightingsForPopulation(wgts, "pop-v1");
        expect(compatible).toHaveLength(2);
    });

    it("formats weighting table for days-per-week", () => {
        const wgt = mapPublishedWeightings(weightings)[0]!;
        const rows = formatWeightingTable(wgt);
        expect(rows[0]).toEqual({ schedule: "5 days", value: "1" });
        expect(rows.find((r) => r.schedule.startsWith("3"))?.value).toBe("0.6");
    });

    it("compiles exact-version payload for FTE draft", () => {
        const draft = roomUtilizationFtePivotDraft({
            name: "FTE",
            populationVersionId: "pop-v1",
            weightingVersionId: "wgt-v1",
        });
        const ast = compilePivotBuilderDraft(draft) as {
            op?: string;
            args?: Array<{ op?: string; population_version_id?: string; weighting_version_id?: string }>;
        };
        const eq = JSON.stringify(ast);
        expect(eq).toContain("pop-v1");
        expect(eq).toContain("wgt-v1");
        expect(eq).toContain("equivalent_count");
    });
});

describe("definitionSummary", () => {
    it("writes plain-language utilization summary", () => {
        const population = {
            populationId: "p",
            versionId: "pop-v1",
            versionNumber: 1,
            name: "Children expected in the room",
            predicate: "expected_in_room_on_date",
            membershipSummary: "x",
            label: "Children · v1",
        };
        const weighting = {
            equivalencyId: "w",
            weightingId: "w",
            versionId: "wgt-v1",
            versionNumber: 1,
            name: "Days-per-week equivalent",
            scheme: "days_per_week" as const,
            factors: { "5": 1 },
            fullTimeDays: 5,
            fullTimeHours: null,
            sessionBasis: "days_per_week" as const,
            summary: "fte",
            label: "FTE · v1",
            strategyLabel: "Days or sessions",
        };
        const draft = roomUtilizationFtePivotDraft({
            populationVersionId: "pop-v1",
            weightingVersionId: "wgt-v1",
        });
        const plain = plainLanguageDefinitionSummary({ draft, population, weighting });
        expect(plain).toMatch(/full-time equivalents|converting|percentage/i);
        const compact = compactSymbolicDefinition({ draft, population, weighting });
        expect(compact).toContain("÷");
        expect(compact).toContain("× 100");
    });

    it("summarizes headcount utilization without AST jargon", () => {
        const draft = roomUtilizationPivotDraft("Room utilization");
        const plain = plainLanguageDefinitionSummary({
            draft,
            population: null,
            weighting: null,
        });
        expect(plain.toLowerCase()).not.toContain("ast");
        expect(plain.toLowerCase()).not.toContain("equivalent_count");
    });
});

describe("product question catalog", () => {
    it("shows Future Room Capacity and Room Utilization only", () => {
        const keys = listProductCatalogQuestions().map((q) => q.key);
        expect(keys).toEqual([FUTURE_ROOM_CAPACITY_QUESTION_KEY, ROOM_UTILIZATION_QUESTION_KEY]);
        expect(keys).not.toContain(ROOM_UTILIZATION_FTE_QUESTION_KEY);
        expect(keys).not.toContain(EQUIVALENT_CHILD_COUNT_QUESTION_KEY);
    });
});

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { createLeadParserSpec } from "@/lib/admin/actions/createLeadPlatformGather";
import { resolveCreateLeadPostCreateRecommendations } from "@/lib/admin/actions/resolveCreateLeadPostCreateRecommendations";
import {
    CREATE_LEAD_PLATFORM_REQUIRES_LOCATION,
    isCreateLeadLocationRequired,
    resolveCreateLeadLocationRequired,
} from "@/lib/admin/actions/createLead/resolveCreateLeadLocationPolicy";
import { resolveCreateLeadRequiredChecklist } from "@/lib/admin/actions/createLead/resolveCreateLeadRequiredChecklist";
import { buildCreateLeadCommitSelection } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { extractFactsFromText } from "@/lib/intake/extract/extractFactsFromText";
import { mapFactsToActionIntake } from "@/lib/intake/map/mapFactsToActionIntake";
import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import type { IntakeHouseholdCandidate } from "@/lib/intake/types";

const WEB_ROOT = join(process.cwd());

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry === ".next") continue;
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
            collectSourceFiles(full, acc);
        } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
            acc.push(full);
        }
    }
    return acc;
}

const HOUSEHOLD: IntakeHouseholdCandidate = {
    household_id: "household-1",
    parents_guardians: [],
    parents: [
        {
            candidate_id: "p1",
            role: "parent",
            first_name: "Molly",
            last_name: "Wright",
            emails: ["molly@test.com"],
            phones: [],
            dob: null,
            age_years: null,
            calculated_age: null,
            program_interest: null,
            source_fact_ids: [],
            confidence: "high",
            validation_state: "valid",
        },
    ],
    household_contacts: [],
    children: [
        {
            candidate_id: "c1",
            role: "child",
            first_name: "Mckenzie",
            last_name: "Wright",
            emails: [],
            phones: [],
            dob: "2018-01-01",
            age_years: null,
            calculated_age: null,
            program_interest: null,
            source_fact_ids: [],
            confidence: "high",
            validation_state: "valid",
        },
    ],
    address: null,
    location: null,
    source: null,
    notes: null,
    program_interest: null,
    desired_start_date: null,
    relationships: [],
    unassigned_fact_ids: [],
    unmapped_facts: [],
    review_warnings: [],
    commit_limited_to_primary: false,
};

function specWithRequired(payloadKeys: readonly string[], withContactConstraint = false): ActionIntakeSpec {
    const base = createLeadParserSpec("dept-1");
    const keys = new Set(payloadKeys);
    return {
        ...base,
        required: base.required.filter((field) => keys.has(field.payload_key)),
        constraints: withContactConstraint ?
            [
                {
                    kind: "at_least_one" as const,
                    rule_ids: ["person:email", "person:phone"],
                    message: "Email or phone required",
                },
            ]
        :   [],
    };
}

describe("Create Lead boundary cleanup — commit module ownership", () => {
    it("does not import Create Lead commit modules from generic intake/commit", () => {
        const offenders: string[] = [];
        for (const file of collectSourceFiles(WEB_ROOT)) {
            const rel = relative(WEB_ROOT, file);
            if (rel.includes("lib/admin/actions/createLead/commit")) continue;
            const content = readFileSync(file, "utf8");
            if (content.includes("@/lib/intake/commit/")) {
                offenders.push(rel);
            }
        }
        expect(offenders).toEqual([]);
    });
});

describe("Create Lead boundary cleanup — mapFactsToActionIntake dispatch", () => {
    it("routes create_lead through the Create Lead adapter", () => {
        const extraction = extractFactsFromText({ text: "Ravi Almead\nravi@test.com\nNorth Campus" });
        const spec = createLeadParserSpec("dept-1");
        const mapped = mapFactsToActionIntake({
            extraction,
            spec,
            field_options: { location_id: [{ value: "site-1", label: "North Campus" }] },
        });
        expect(mapped.candidates.length).toBeGreaterThan(0);
        expect(mapped.action_key).toBe("create_lead");
    });

    it("returns unsupported empty mapping for unknown action keys", () => {
        const extraction = extractFactsFromText({ text: "Sample text" });
        const spec = { ...createLeadParserSpec("dept-1"), action_key: "pos_checkout" } as unknown as ActionIntakeSpec;
        const mapped = mapFactsToActionIntake({ extraction, spec });
        expect(mapped.action_key).toBe("pos_checkout");
        expect(mapped.candidates).toEqual([]);
        expect(mapped.household).toBeUndefined();
        expect(mapped.review_warnings).toEqual([]);
    });
});

describe("Create Lead boundary cleanup — location requiredness", () => {
    it("requires location when platform policy mandates it", () => {
        expect(CREATE_LEAD_PLATFORM_REQUIRES_LOCATION).toBe(true);
        expect(
            resolveCreateLeadLocationRequired({
                platformRequiresLocation: true,
                specRequiredPayloadKeys: [],
            }),
        ).toBe(true);
        expect(isCreateLeadLocationRequired({ requiredPayloadKeys: [] })).toBe(true);
    });

    it("requires location when spec includes location_id even if platform policy is off", () => {
        expect(
            resolveCreateLeadLocationRequired({
                platformRequiresLocation: false,
                specRequiredPayloadKeys: ["first_name", "location_id"],
            }),
        ).toBe(true);
        expect(
            isCreateLeadLocationRequired({
                intakeSpec: specWithRequired(["first_name", "location_id"]),
                requiredPayloadKeys: ["first_name", "location_id"],
            }),
        ).toBe(true);
    });

    it("does not require location when neither platform nor spec require it", () => {
        expect(
            resolveCreateLeadLocationRequired({
                platformRequiresLocation: false,
                specRequiredPayloadKeys: ["first_name", "last_name"],
            }),
        ).toBe(false);
    });
});

describe("Create Lead boundary cleanup — spec-driven checklist", () => {
    it("derives rows from spec required fields and constraints", () => {
        const selection = buildCreateLeadCommitSelection(HOUSEHOLD);
        const withLocation = resolveCreateLeadRequiredChecklist({
            selection,
            values: { location_id: "site-1" },
            intakeSpec: specWithRequired(
                ["first_name", "last_name", "location_id", "child_first_name"],
                true,
            ),
            requiredPayloadKeys: ["first_name", "last_name", "location_id", "child_first_name"],
            household: HOUSEHOLD,
        });
        expect(withLocation.map((item) => item.key)).toEqual([
            "primary-guardian",
            "valid-contact",
            "location",
            "included-children",
        ]);

        const withoutLocation = resolveCreateLeadRequiredChecklist({
            selection,
            values: {},
            intakeSpec: specWithRequired(["first_name", "last_name"]),
            requiredPayloadKeys: ["first_name", "last_name"],
            household: { ...HOUSEHOLD, children: [] },
        });
        expect(withoutLocation.some((item) => item.key === "location")).toBe(
            CREATE_LEAD_PLATFORM_REQUIRES_LOCATION,
        );
        expect(withoutLocation.some((item) => item.key === "included-children")).toBe(false);
    });

    it("shows advisory included-children row when household has children but spec does not require them", () => {
        const selection = buildCreateLeadCommitSelection(HOUSEHOLD);
        const items = resolveCreateLeadRequiredChecklist({
            selection,
            values: {},
            intakeSpec: specWithRequired(["first_name", "last_name"]),
            requiredPayloadKeys: ["first_name", "last_name"],
            household: HOUSEHOLD,
        });
        const childRow = items.find((item) => item.key === "included-children");
        expect(childRow?.status).toBe("ok");
    });
});

describe("Create Lead boundary cleanup — post-create recommendations", () => {
    it("does not surface unconfigured header actions", () => {
        const recommendations = resolveCreateLeadPostCreateRecommendations(
            { child_first_name: "Kai", child_program: "Toddler", location_id: "site-1" },
            { availableActionKeys: [] },
        );
        expect(recommendations.some((rec) => rec.actionKey === "schedule_tour")).toBe(false);
        expect(recommendations.some((rec) => rec.actionKey === "send_welcome_email")).toBe(false);
    });

    it("includes configured actions only", () => {
        const recommendations = resolveCreateLeadPostCreateRecommendations(
            { child_first_name: "Kai" },
            { availableActionKeys: ["schedule_tour", "send_welcome_email"] },
        );
        expect(recommendations.some((rec) => rec.actionKey === "schedule_tour")).toBe(true);
        expect(recommendations.some((rec) => rec.actionKey === "send_welcome_email")).toBe(true);
    });
});

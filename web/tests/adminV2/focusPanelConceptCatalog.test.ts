/**
 * Focus Panel Concept Catalog — CONCEPT_TREE coverage and resolver contract.
 *
 * Covers:
 *   - CONCEPT_TREE branches and leaves: named, non-abstract
 *   - Primary Contact: includes address fields (surface parity correction)
 *   - Stage & Status branch: new in Surface Builder Parity Correction sprint
 *   - Program branch: extended with Desired Start, Room, Location
 *   - resolveConceptValue: known branches return values from flat record fields
 *   - resolveConceptValue: new Primary Contact address fields resolve correctly
 *   - resolveConceptValue: Stage & Status resolves from opportunity/queue_row fields
 *   - allConceptPaths: includes all branches and no duplicates
 *   - buildConceptPath / parseConceptPath: round-trip
 */

import { describe, expect, it } from "vitest";
import {
    CONCEPT_TREE,
    CONCEPT_ROOT,
    buildConceptPath,
    parseConceptPath,
    allConceptPaths,
    resolveConceptValue,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelConceptCatalog";

// ── CONCEPT_TREE structure ────────────────────────────────────────────────────

describe("CONCEPT_TREE structure", () => {
    it("has at least 9 branches (original) + Stage & Status", () => {
        expect(CONCEPT_TREE.length).toBeGreaterThanOrEqual(10);
    });

    it("every branch has a non-empty label", () => {
        for (const branch of CONCEPT_TREE) {
            expect(branch.label.trim()).not.toBe("");
        }
    });

    it("every branch has at least one leaf", () => {
        for (const branch of CONCEPT_TREE) {
            expect(branch.leaves.length).toBeGreaterThan(0);
        }
    });

    it("every leaf has a non-empty label", () => {
        for (const branch of CONCEPT_TREE) {
            for (const leaf of branch.leaves) {
                expect(leaf.label.trim()).not.toBe("");
            }
        }
    });

    it("no abstract branch labels (no 'Branch N', 'Group N')", () => {
        for (const branch of CONCEPT_TREE) {
            expect(branch.label).not.toMatch(/^(Branch|Group|Category|Section) \d+$/i);
        }
    });
});

// ── Primary Contact branch ────────────────────────────────────────────────────

describe("Primary Contact branch — includes address fields", () => {
    const branch = CONCEPT_TREE.find((b) => b.label === "Primary Contact");

    it("Primary Contact branch exists", () => {
        expect(branch).toBeDefined();
    });

    it("includes core contact leaves: Name, Phone, Email", () => {
        const leafLabels = branch!.leaves.map((l) => l.label);
        expect(leafLabels).toContain("Name");
        expect(leafLabels).toContain("Phone");
        expect(leafLabels).toContain("Email");
    });

    it("includes address leaves: Address, City, State, ZIP", () => {
        const leafLabels = branch!.leaves.map((l) => l.label);
        expect(leafLabels).toContain("Address");
        expect(leafLabels).toContain("City");
        expect(leafLabels).toContain("State");
        expect(leafLabels).toContain("ZIP");
    });
});

// ── Stage & Status branch (new) ───────────────────────────────────────────────

describe("Stage & Status branch — new in parity correction sprint", () => {
    const branch = CONCEPT_TREE.find((b) => b.label === "Stage & Status");

    it("Stage & Status branch exists", () => {
        expect(branch).toBeDefined();
    });

    it("has Stage, Status, Location leaves", () => {
        const leafLabels = branch!.leaves.map((l) => l.label);
        expect(leafLabels).toContain("Stage");
        expect(leafLabels).toContain("Status");
        expect(leafLabels).toContain("Location");
    });
});

// ── Program branch — extended ─────────────────────────────────────────────────

describe("Program branch — extended with placement fields", () => {
    const branch = CONCEPT_TREE.find((b) => b.label === "Program");

    it("Program branch exists", () => {
        expect(branch).toBeDefined();
    });

    it("includes Desired Start, Room, Location in addition to Name and Schedule", () => {
        const leafLabels = branch!.leaves.map((l) => l.label);
        expect(leafLabels).toContain("Name");
        expect(leafLabels).toContain("Schedule");
        expect(leafLabels).toContain("Desired Start");
        expect(leafLabels).toContain("Room");
        expect(leafLabels).toContain("Location");
    });
});

// ── allConceptPaths ───────────────────────────────────────────────────────────

describe("allConceptPaths", () => {
    it("returns an array of strings in format 'Enrollment → Branch → Leaf'", () => {
        const paths = allConceptPaths();
        for (const path of paths) {
            expect(path).toMatch(new RegExp(`^${CONCEPT_ROOT} → .+ → .+$`));
        }
    });

    it("contains Primary Contact address paths", () => {
        const paths = allConceptPaths();
        expect(paths).toContain("Enrollment → Primary Contact → Address");
        expect(paths).toContain("Enrollment → Primary Contact → City");
        expect(paths).toContain("Enrollment → Primary Contact → State");
        expect(paths).toContain("Enrollment → Primary Contact → ZIP");
    });

    it("contains Stage & Status paths", () => {
        const paths = allConceptPaths();
        expect(paths).toContain("Enrollment → Stage & Status → Stage");
        expect(paths).toContain("Enrollment → Stage & Status → Status");
    });

    it("has no duplicate paths", () => {
        const paths = allConceptPaths();
        expect(new Set(paths).size).toBe(paths.length);
    });
});

// ── buildConceptPath / parseConceptPath ───────────────────────────────────────

describe("buildConceptPath / parseConceptPath", () => {
    it("round-trips a path correctly", () => {
        const path = buildConceptPath("Primary Contact", "Phone");
        const parsed = parseConceptPath(path);
        expect(parsed.root).toBe(CONCEPT_ROOT);
        expect(parsed.branch).toBe("Primary Contact");
        expect(parsed.leaf).toBe("Phone");
    });

    it("builds the expected path string", () => {
        expect(buildConceptPath("Stage & Status", "Stage")).toBe("Enrollment → Stage & Status → Stage");
    });
});

// ── resolveConceptValue — Primary Contact addresses ───────────────────────────

describe("resolveConceptValue — Primary Contact address fields", () => {
    const record = {
        "person.primary_contact_name": "Sarah Smith",
        "person.primary_phone": "(555) 000-1234",
        "person.primary_email": "sarah@example.com",
        "person.primary_address_line1": "123 Oak Street",
        "person.primary_address_city": "Austin",
        "person.primary_address_state": "TX",
        "person.primary_address_postal_code": "78701",
    };

    it("resolves Primary Contact → Name", () => {
        const path = buildConceptPath("Primary Contact", "Name");
        expect(resolveConceptValue(path, record)).toBe("Sarah Smith");
    });

    it("resolves Primary Contact → Address", () => {
        const path = buildConceptPath("Primary Contact", "Address");
        expect(resolveConceptValue(path, record)).toBe("123 Oak Street");
    });

    it("resolves Primary Contact → City", () => {
        const path = buildConceptPath("Primary Contact", "City");
        expect(resolveConceptValue(path, record)).toBe("Austin");
    });

    it("resolves Primary Contact → State", () => {
        const path = buildConceptPath("Primary Contact", "State");
        expect(resolveConceptValue(path, record)).toBe("TX");
    });

    it("resolves Primary Contact → ZIP", () => {
        const path = buildConceptPath("Primary Contact", "ZIP");
        expect(resolveConceptValue(path, record)).toBe("78701");
    });

    it("returns null when address field is absent", () => {
        const path = buildConceptPath("Primary Contact", "City");
        expect(resolveConceptValue(path, {})).toBeNull();
    });
});

// ── resolveConceptValue — Stage & Status ─────────────────────────────────────

describe("resolveConceptValue — Stage & Status branch", () => {
    const record = {
        "queue_row.stage_label": "Tour Scheduled",
        "opportunity.status_label": "Active",
        "opportunity.location": "Downtown Campus",
    };

    it("resolves Stage & Status → Stage", () => {
        const path = buildConceptPath("Stage & Status", "Stage");
        expect(resolveConceptValue(path, record)).toBe("Tour Scheduled");
    });

    it("resolves Stage & Status → Status", () => {
        const path = buildConceptPath("Stage & Status", "Status");
        expect(resolveConceptValue(path, record)).toBe("Active");
    });

    it("resolves Stage & Status → Location", () => {
        const path = buildConceptPath("Stage & Status", "Location");
        expect(resolveConceptValue(path, record)).toBe("Downtown Campus");
    });

    it("returns null for Stage & Status fields when record is empty", () => {
        const path = buildConceptPath("Stage & Status", "Stage");
        expect(resolveConceptValue(path, {})).toBeNull();
    });
});

// ── resolveConceptValue — Program branch extended ────────────────────────────

describe("resolveConceptValue — Program branch extended leaves", () => {
    const record = {
        "program.name": "Full Day",
        "program.schedule": "M-F 7am-6pm",
        "child.desired_start_date": "2026-09-01",
        "child.room": "Sunflower Room",
        "opportunity.location": "Main Campus",
    };

    it("resolves Program → Desired Start", () => {
        const path = buildConceptPath("Program", "Desired Start");
        expect(resolveConceptValue(path, record)).toBe("2026-09-01");
    });

    it("resolves Program → Room", () => {
        const path = buildConceptPath("Program", "Room");
        expect(resolveConceptValue(path, record)).toBe("Sunflower Room");
    });

    it("resolves Program → Location", () => {
        const path = buildConceptPath("Program", "Location");
        expect(resolveConceptValue(path, record)).toBe("Main Campus");
    });
});

// ── resolveConceptValue — empty string handling ───────────────────────────────

describe("resolveConceptValue — empty string returns null", () => {
    it("empty string value returns null (not empty string)", () => {
        const path = buildConceptPath("Primary Contact", "City");
        expect(resolveConceptValue(path, { "person.primary_address_city": "" })).toBeNull();
    });

    it("whitespace-only value returns null", () => {
        const path = buildConceptPath("Stage & Status", "Stage");
        expect(resolveConceptValue(path, { "queue_row.stage_label": "   " })).toBeNull();
    });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    appendLegacyPersonStatusOption,
    buildPersonStatusApplicabilityMetadata,
    filterPersonStatusDefinitionsForProfile,
    PERSON_CHILD_LIFECYCLE_STATUS_KEYS,
    PERSON_CHILD_ONLY_STATUS_KEYS,
    PERSON_STATUS_PROFILE_CHILD_LIFECYCLE,
    PERSON_STATUS_PROFILE_GENERIC,
    personStatusAppliesToProfile,
    resolvePersonDrawerStatusProfile,
} from "@/lib/admin/person/personStatusApplicability";

const childLifecycleRows = PERSON_CHILD_LIFECYCLE_STATUS_KEYS.map((status_key) => ({
    status_key,
    metadata: PERSON_CHILD_ONLY_STATUS_KEYS.has(status_key)
        ? buildPersonStatusApplicabilityMetadata("child_lifecycle")
        : buildPersonStatusApplicabilityMetadata("both"),
}));

describe("personStatusApplicability", () => {
    it("child drawer profile includes full child lifecycle set", () => {
        const filtered = filterPersonStatusDefinitionsForProfile(
            childLifecycleRows,
            PERSON_STATUS_PROFILE_CHILD_LIFECYCLE
        );
        expect(filtered.map((r) => r.status_key).sort()).toEqual(
            [...PERSON_CHILD_LIFECYCLE_STATUS_KEYS].sort()
        );
    });

    it("parent/guardian profile excludes withdrawn and graduated", () => {
        const filtered = filterPersonStatusDefinitionsForProfile(
            childLifecycleRows,
            PERSON_STATUS_PROFILE_GENERIC
        );
        expect(filtered.map((r) => r.status_key).sort()).toEqual(["active", "archived", "inactive"]);
        expect(filtered.some((r) => r.status_key === "withdrawn")).toBe(false);
        expect(filtered.some((r) => r.status_key === "graduated")).toBe(false);
        expect(filtered.some((r) => r.status_key === "future_start")).toBe(false);
    });

    it("metadata child_lifecycle mode applies only to child profile", () => {
        const row = {
            status_key: "custom_child",
            metadata: buildPersonStatusApplicabilityMetadata("child_lifecycle"),
        };
        expect(personStatusAppliesToProfile(row, PERSON_STATUS_PROFILE_CHILD_LIFECYCLE)).toBe(true);
        expect(personStatusAppliesToProfile(row, PERSON_STATUS_PROFILE_GENERIC)).toBe(false);
    });

    it("appendLegacyPersonStatusOption preserves current key with legacy label", () => {
        const next = appendLegacyPersonStatusOption<{ status_key: string; status_label: string }>(
            [],
            "withdrawn",
            "Withdrawn"
        );
        expect(next).toHaveLength(1);
        expect(next[0]?.status_key).toBe("withdrawn");
        expect(next[0]?.status_label).toContain("legacy");
    });

    it("resolvePersonDrawerStatusProfile maps child vs parent profiles", () => {
        expect(
            resolvePersonDrawerStatusProfile({ profiles: ["child"], display: "child" }, { childChrome: true })
        ).toBe(PERSON_STATUS_PROFILE_CHILD_LIFECYCLE);
        expect(
            resolvePersonDrawerStatusProfile({ profiles: ["parent"], display: "parent" })
        ).toBe(PERSON_STATUS_PROFILE_GENERIC);
        expect(
            resolvePersonDrawerStatusProfile({ profiles: ["emergency_contact"], display: "emergency_contact" })
        ).toBeNull();
    });
});

describe("person drawer status wiring", () => {
    it("child drawer fetches persons status options with child_lifecycle profile", () => {
        const drawer = readFileSync(join(process.cwd(), "components/admin/AdminEntityDrawer.tsx"), "utf8");
        expect(drawer).toContain("status_profile=${encodeURIComponent(personDrawerStatusProfile)}");
        expect(drawer).toContain("personDrawerStatusProfile");
        expect(drawer).toContain("appendLegacyPersonStatusOption");
    });

    it("parent drawer header status excludes child-only fetch path duplication", () => {
        const drawer = readFileSync(join(process.cwd(), "components/admin/AdminEntityDrawer.tsx"), "utf8");
        expect(drawer).toContain("personDrawerParentHeaderStatus");
        expect(drawer).toContain('data-person-drawer-parent-header-status="true"');
    });

    it("status-options API filters persons by status_profile", () => {
        const route = readFileSync(join(process.cwd(), "app/api/admin/status-options/route.ts"), "utf8");
        expect(route).toContain("filterPersonStatusDefinitionsForProfile");
        expect(route).toContain("status_profile");
    });

    it("settings can create People status with child applicability metadata", () => {
        const settings = readFileSync(
            join(process.cwd(), "app/admin/system/statuses/StatusesClient.tsx"),
            "utf8"
        );
        expect(settings).toContain("buildPersonStatusApplicabilityMetadata");
        expect(settings).toContain("Applicability / profile");
        expect(settings).toContain('entity_type: modalEntityType');
    });

    it("status key auto-generates from label in settings", () => {
        const settings = readFileSync(
            join(process.cwd(), "app/admin/system/statuses/StatusesClient.tsx"),
            "utf8"
        );
        expect(settings).toContain("uniqueStatusKey(label, reserved)");
        expect(settings).toContain("modalPreviewStatusKey");
    });

    it("child status persists via persons PATCH — not customer_members", () => {
        const drawer = readFileSync(join(process.cwd(), "components/admin/AdminEntityDrawer.tsx"), "utf8");
        expect(drawer).toContain('fetch(`/api/admin/persons/${encodeURIComponent(drawer.id)}`');
        expect(drawer).toContain("status_key: nextKey");
        expect(drawer).not.toContain("opportunity_customer_members");
    });

    it("opportunity entity types are not used for person drawer status fetch", () => {
        const drawer = readFileSync(join(process.cwd(), "components/admin/AdminEntityDrawer.tsx"), "utf8");
        expect(drawer).toContain("PERSON_DRAWER_CHILD_STATUS_ENTITY_TYPE");
        const entityType = readFileSync(
            join(process.cwd(), "lib/admin/person/personDrawerChildStatusEntityType.ts"),
            "utf8"
        );
        expect(entityType).toContain('"persons"');
        expect(entityType).not.toContain("opportunity");
    });
});

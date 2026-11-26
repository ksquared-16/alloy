/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { adminFieldEntitySingularLabel } from "@/lib/admin/adminFieldEntityDisplayLabel";
import {
    deriveFieldCapability,
    derivePlatformFieldAvailability,
    deriveRegistryFieldAvailability,
} from "@/lib/fields/fieldCapabilityEngine";
import {
    canSurfaceResolveField,
    buildCanonicalQueueBuilderFields,
    SURFACE_RESOLVER_OWNERSHIP,
} from "@/lib/fields/fieldResolverRegistry";
import {
    platformFieldsForEntity,
    platformFieldsForEntityExcludingRegistry,
    isPlatformNativeField,
} from "@/lib/fields/platformFieldCatalog";
import { canonicalQueueBuilderFields } from "@/lib/fields/canonicalBuilderFieldLibrary";
import { availableFieldsForZone } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import { buildFormSystemFieldPicker } from "@/lib/fields/formFieldRegistryPicker";
import { isValidatorAllowedQueueRecordFieldRefKey } from "@/lib/layout/queueRecordValidatorAllowList";
import {
    resolveFieldSurfaceAvailability,
    type FieldConsumerSurface,
} from "@/lib/fields/fieldSurfaceAvailability";
import { computedFieldByRefKey } from "@/lib/fields/computedFieldCatalog";

describe("platform field catalog", () => {
    it("includes person native columns as platform fields", () => {
        const fields = platformFieldsForEntity("person");
        expect(fields.some((f) => f.field_key === "first_name")).toBe(true);
        expect(fields.some((f) => f.field_key === "email")).toBe(true);
        expect(fields.some((f) => f.field_key === "status_key")).toBe(true);
    });

    it("excludes platform fields already in field_definitions registry", () => {
        const existing = new Set(["first_name", "email"]);
        const filtered = platformFieldsForEntityExcludingRegistry("person", existing);
        expect(filtered.some((f) => f.field_key === "first_name")).toBe(false);
        expect(filtered.some((f) => f.field_key === "phone")).toBe(true);
    });

    it("marks customer_member dob as platform native", () => {
        expect(isPlatformNativeField("customer_member", "dob")).toBe(true);
        const genderInRegistry = new Set(["gender"]);
        const platform = platformFieldsForEntityExcludingRegistry("customer_member", genderInRegistry);
        expect(platform.some((f) => f.field_key === "dob")).toBe(true);
    });
});

describe("resolver registry", () => {
    it("declares ownership for all consumer surfaces", () => {
        const surfaces = SURFACE_RESOLVER_OWNERSHIP.map((o) => o.surface);
        expect(surfaces).toContain("drawer");
        expect(surfaces).toContain("queue_row");
        expect(surfaces).toContain("forms");
        expect(surfaces).toContain("focus_panel");
        expect(surfaces).toContain("business_process");
    });

    it("person.first_name resolves on drawer and forms", () => {
        const input = {
            entity_type: "person",
            field_key: "first_name",
            is_platform_native: true,
            is_active: true,
            is_visible_in_form: true,
            is_visible_in_drawer: true,
        };
        expect(canSurfaceResolveField("drawer", input).supported).toBe(true);
        expect(canSurfaceResolveField("forms", input).supported).toBe(true);
        expect(canSurfaceResolveField("queue_row", input).supported).toBe(false);
    });

    it("gender resolves on drawer, forms, and queue rows", () => {
        const input = {
            entity_type: "customer_member",
            field_key: "gender",
            refKey: "child.gender",
            field_type: "select",
            is_system: true,
            is_active: true,
            is_visible_in_form: true,
            is_visible_in_drawer: true,
        };
        expect(canSurfaceResolveField("drawer", input).supported).toBe(true);
        expect(canSurfaceResolveField("forms", input).supported).toBe(true);
        expect(canSurfaceResolveField("queue_row", input).supported).toBe(true);
    });

    it("queue builder fields are resolver-backed (validator or computed alias)", () => {
        for (const field of buildCanonicalQueueBuilderFields(false)) {
            const onValidator = isValidatorAllowedQueueRecordFieldRefKey(field.key, false);
            const computed = computedFieldByRefKey(field.key);
            const aliasOnValidator =
                computed?.resolver_ref_keys.some((alias) =>
                    isValidatorAllowedQueueRecordFieldRefKey(alias, false),
                ) ?? false;
            expect(onValidator || aliasOnValidator).toBe(true);
        }
    });

    it("child.gender is available in canonical queue builder fields", () => {
        const keys = buildCanonicalQueueBuilderFields(false).map((f) => f.key);
        expect(keys).toContain("child.gender");
    });
});

describe("capability engine — derived availability", () => {
    it("derives gender queue_row available from resolver layer", () => {
        const cap = deriveFieldCapability("queue_row", {
            entity_type: "customer_member",
            field_key: "gender",
            refKey: "child.gender",
            is_system: true,
            is_active: true,
            is_visible_in_form: true,
            is_visible_in_drawer: true,
        });
        expect(cap.status).toBe("available");
        expect(cap.layers.find((l) => l.layer === "resolver")?.passed).toBe(true);
    });

    it("platform field availability derives from capability engine", () => {
        const platform = platformFieldsForEntity("person").find((f) => f.field_key === "first_name");
        expect(platform).toBeDefined();
        const rows = derivePlatformFieldAvailability(platform!);
        expect(rows.find((r) => r.surface === "drawer")?.status).toBe("available");
    });

    it("registry availability matches resolveFieldSurfaceAvailability", () => {
        const input = {
            entity_type: "customer_member",
            field_key: "gender",
            field_type: "select",
            is_system: true,
            is_active: true,
            is_visible_in_form: true,
            is_visible_in_drawer: true,
        };
        const derived = deriveRegistryFieldAvailability(input);
        const resolved = resolveFieldSurfaceAvailability(input);
        expect(derived).toEqual(resolved);
    });

    it("removing resolver support is no longer required — gender remains available on queue_row", () => {
        const cap = deriveFieldCapability("queue_row", {
            entity_type: "customer_member",
            field_key: "gender",
            refKey: "child.gender",
            is_system: true,
        });
        expect(cap.status).toBe("available");
    });
});

describe("builder library unification", () => {
    it("canonical queue builder matches composition adapter zone fields", () => {
        const canonical = canonicalQueueBuilderFields(false).map((f) => f.key);
        const zoneFields = availableFieldsForZone("primary", false).map((f) => f.key);
        for (const key of zoneFields) {
            if (isValidatorAllowedQueueRecordFieldRefKey(key, false)) {
                expect(canonical.includes(key) || key.startsWith("waitlist.") || key.startsWith("sibling.")).toBe(true);
            }
        }
    });

    it("forms builder consumes registry for customer_member gender", () => {
        const picker = buildFormSystemFieldPicker([
            {
                entity_type: "customer_member",
                field_key: "gender",
                field_type: "select",
                label: "Gender",
                is_system: true,
                is_active: true,
            },
        ]);
        expect(picker.length).toBeGreaterThan(0);
    });
});

describe("operator labels", () => {
    it("never shows Inquiry child", () => {
        expect(adminFieldEntitySingularLabel({}, "inquiry_child")).toBe("Child");
    });
});

describe("representative field runtime hops", () => {
    const hops: Array<{
        label: string;
        input: Parameters<typeof deriveFieldCapability>[1];
        expectAvailable: FieldConsumerSurface[];
        expectUnavailable: FieldConsumerSurface[];
    }> = [
        {
            label: "Person First Name",
            input: { entity_type: "person", field_key: "first_name", is_platform_native: true },
            expectAvailable: ["drawer", "forms"],
            expectUnavailable: ["queue_row"],
        },
        {
            label: "Person Email",
            input: { entity_type: "person", field_key: "email", is_platform_native: true },
            expectAvailable: ["drawer", "forms", "queue_row"],
            expectUnavailable: [],
        },
        {
            label: "Child DOB",
            input: {
                entity_type: "customer_member",
                field_key: "dob",
                refKey: "child.date_of_birth",
                is_platform_native: true,
            },
            expectAvailable: ["drawer", "forms", "queue_row", "focus_panel"],
            expectUnavailable: [],
        },
        {
            label: "Child Gender",
            input: {
                entity_type: "customer_member",
                field_key: "gender",
                refKey: "child.gender",
                is_system: true,
                is_active: true,
                is_visible_in_form: true,
                is_visible_in_drawer: true,
            },
            expectAvailable: ["drawer", "forms", "focus_panel", "business_process", "queue_row"],
            expectUnavailable: [],
        },
        {
            label: "Lead Status",
            input: { entity_type: "opportunity", field_key: "status_key", is_platform_native: true },
            expectAvailable: ["drawer", "table"],
            expectUnavailable: ["forms"],
        },
        {
            label: "Family Name",
            input: { entity_type: "customer", field_key: "name", is_platform_native: true },
            expectAvailable: ["drawer", "queue_row"],
            expectUnavailable: [],
        },
        {
            label: "Location Site Name",
            input: { entity_type: "location", field_key: "label", is_platform_native: true },
            expectAvailable: ["drawer"],
            expectUnavailable: ["queue_row"],
        },
    ];

    for (const hop of hops) {
        it(`${hop.label} — availability matches resolver-backed surfaces`, () => {
            for (const surface of hop.expectAvailable) {
                const cap = deriveFieldCapability(surface, hop.input);
                expect(cap.status, `${hop.label} on ${surface}`).toBe("available");
            }
            for (const surface of hop.expectUnavailable) {
                const cap = deriveFieldCapability(surface, hop.input);
                expect(cap.status, `${hop.label} on ${surface}`).toBe("unavailable");
            }
        });
    }
});

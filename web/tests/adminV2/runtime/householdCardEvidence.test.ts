import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildHouseholdCardEvidence } from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";
import {
    defaultNestedSurfaceConfig,
    HOUSEHOLD_SURFACE_ID,
    reconcileNestedSurfaceConfig,
    setNestedGroupEnabled,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { moveSectionInNestedConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceSectionOrder";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

/** Minimal Operational Context wrapper for the pure evidence assembly. */
function ctx(truth: Record<string, unknown>, label = "Household"): OperationalContext {
    return {
        grain: "case",
        subject: { type: "opportunity", id: String(truth.id ?? "opp"), label },
        businessProcess: { key: null, label: null, stageKey: null },
        perspective: null,
        truth,
        signals: {
            work: { primary: null, items: [], openCount: 0, overdueCount: 0, nextActionLabel: null },
            attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
            tour: { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null },
            communications: { scheduledSendCount: 0, nextFollowUpAt: null, hasOutreach: false, nextScheduledSendId: null },
            billing: { billingConfigured: false, billingContactName: null, billingContactEmail: null, tuitionRateLabel: null, feeBalanceCents: null },
        },
        capabilities: { canMutate: true, maskedChannels: false },
        status: "ready",
    };
}

function baseRecord(): Record<string, unknown> {
    return {
        id: "opp-1",
        customer_id: "cust-1",
        updated_at: "2026-06-20T10:00:00Z",
        _customer_name: "Johnson Household",
        "person.primary_contact_name": "Sarah Johnson",
        "person.primary_phone": "555-123-4567",
        "person.primary_email": "sarah@example.com",
        "opportunity.primary_person_id": "p-sarah",
        _opportunity_persons: [
            { person_id: "p-sarah", role_type: "primary_contact", name: "Sarah Johnson", phone: "555-123-4567", email: "sarah@example.com" },
            { person_id: "p-mike", role_type: "parent", name: "Michael Johnson", phone: "555-111-2222" },
            { person_id: "p-gran", role_type: "emergency_contact", name: "Grandma Mary", phone: "555-333-4444" },
            { person_id: "p-tom", role_type: "authorized_pickup", name: "Uncle Tom" },
            { person_id: "p-pay", role_type: "billing_contact", name: "Sarah Johnson" },
        ],
        _inquiry_children: [
            { id: "c1", display_name: "Emma Johnson", age: "6", outcome_status_label: "Enrolled" },
            { id: "c2", display_name: "Liam Johnson", age: "4" },
        ],
    };
}

describe("buildHouseholdCardEvidence", () => {
    it("assembles the operational answer from loaded record fields (no fetch)", () => {
        const ev = buildHouseholdCardEvidence(ctx(baseRecord(), "Johnson Household"));

        expect(ev.householdLabel).toBe("Johnson Household");
        expect(ev.primaryContact?.name).toBe("Sarah Johnson");
        expect(ev.primaryPhone).toBe("(555) 123-4567"); // display-formatted (QA #1)
        expect(ev.primaryEmail).toBe("sarah@example.com");
        expect(ev.childCount).toBe(2);
        expect(ev.answerLine).toContain("Sarah Johnson");
        expect(ev.answerLine).toContain("2 children");
        expect(ev.missingCriticalWarning).toBeNull();
    });

    it("carries profile photo URLs on contacts and children when present", () => {
        const record = baseRecord();
        (record._opportunity_persons as Record<string, unknown>[])[0]!.photo_url =
            "https://cdn.example/sarah.jpg";
        (record._opportunity_persons as Record<string, unknown>[])[1]!.photo_url =
            "https://cdn.example/mike.jpg";
        (record._inquiry_children as Record<string, unknown>[])[0]!.photo_url =
            "https://cdn.example/emma.jpg";

        const ev = buildHouseholdCardEvidence(ctx(record));
        expect(ev.primaryContact?.imageUrl).toBe("https://cdn.example/sarah.jpg");
        const otherParent = ev.groups.find((g) => g.key === "other_parent_guardian");
        expect(otherParent?.contacts[0]?.imageUrl).toBe("https://cdn.example/mike.jpg");
        const children = ev.groups.find((g) => g.key === "children");
        expect(children?.children[0]?.imageUrl).toBe("https://cdn.example/emma.jpg");
        expect(children?.children[1]?.imageUrl ?? null).toBeNull();
    });

    it("classifies evidence groups by relationship role", () => {
        const ev = buildHouseholdCardEvidence(ctx(baseRecord()));
        const keys = ev.groups.map((g) => g.key);

        expect(keys).toContain("primary_contact");
        expect(keys).toContain("other_parent_guardian");
        expect(keys).toContain("children");
        expect(keys).toContain("emergency_contacts");
        expect(keys).toContain("authorized_pickups");
        expect(keys).toContain("billing_contact");

        expect(ev.emergencyContactCount).toBe(1);
        expect(ev.authorizedPickupCount).toBe(1);
        expect(ev.otherParentGuardianCount).toBe(1);

        const otherParent = ev.groups.find((g) => g.key === "other_parent_guardian");
        expect(otherParent?.contacts.map((c) => c.name)).toEqual(["Michael Johnson"]);

        const children = ev.groups.find((g) => g.key === "children");
        expect(children?.children.map((c) => c.name)).toEqual(["Emma Johnson", "Liam Johnson"]);
    });

    it("surfaces a second parent with role=parent even when a primary contact is resolved", () => {
        // The drawer projection filter excludes role=parent when primary exists;
        // Household must read raw family rows so Michael is never hidden.
        const ev = buildHouseholdCardEvidence(ctx(baseRecord()));
        const otherParent = ev.groups.find((g) => g.key === "other_parent_guardian");
        expect(otherParent?.contacts.some((c) => c.name === "Michael Johnson")).toBe(true);
        // Primary must not appear in other parent group.
        expect(otherParent?.contacts.some((c) => c.name === "Sarah Johnson")).toBe(false);
    });

    it("surfaces create-lead family_member secondary as Other Parent (not Additional)", () => {
        const record = baseRecord();
        record._opportunity_persons = [
            {
                person_id: "p-sarah",
                role_type: "primary_contact",
                name: "Sarah Johnson",
                phone: "555-123-4567",
                email: "sarah@example.com",
            },
            {
                person_id: "p-mike",
                role_type: "family_member",
                name: "Michael Johnson",
                phone: "555-111-2222",
            },
        ];
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        // Stale Additional criteria that historically claimed family_member via "member".
        config = {
            ...config,
            groups: config.groups.map((group) => {
                if (group.key === "other_parent_guardian") {
                    return {
                        ...group,
                        relationshipCriteria: {
                            roleKeys: ["parent", "guardian"],
                            excludeRoleKeys: ["emergency", "pickup", "billing"],
                        },
                    };
                }
                if (group.key === "household_members") {
                    return {
                        ...group,
                        enabled: true,
                        relationshipCriteria: {
                            roleKeys: ["additional", "contact", "member"],
                        },
                    };
                }
                return group;
            }),
        };
        const ev = buildHouseholdCardEvidence(ctx(record), { nestedConfig: config });
        const otherParent = ev.groups.find((g) => g.key === "other_parent_guardian");
        const additional = ev.groups.find((g) => g.key === "household_members");
        expect(otherParent?.contacts.map((c) => c.name)).toEqual(["Michael Johnson"]);
        expect(additional?.contacts.some((c) => c.name === "Michael Johnson") ?? false).toBe(false);
    });

    it("does not duplicate the primary person in Other Parent / Guardian", () => {
        const record = baseRecord();
        record._opportunity_persons = [
            { person_id: "p-sarah", role_type: "primary_contact", name: "Sarah Johnson" },
            { person_id: "p-sarah", role_type: "parent", name: "Sarah Johnson" },
            { person_id: "p-mike", role_type: "parent", name: "Michael Johnson" },
        ];
        const ev = buildHouseholdCardEvidence(ctx(record));
        const otherParent = ev.groups.find((g) => g.key === "other_parent_guardian");
        expect(otherParent?.contacts.map((c) => c.name)).toEqual(["Michael Johnson"]);
        expect(ev.primaryContact?.name).toBe("Sarah Johnson");
    });

    it("treats children as belonging-only — names/count, no child operational fields", () => {
        const record = baseRecord();
        record._inquiry_children = [
            {
                id: "c1",
                display_name: "Emma Johnson",
                age: "6",
                desired_program_label: "Preschool",
                outcome_status_label: "Enrolled",
            },
        ];
        const ev = buildHouseholdCardEvidence(ctx(record));
        const children = ev.groups.find((g) => g.key === "children");

        expect(children?.count).toBe(1);
        const child = children?.children[0];
        expect(child?.name).toBe("Emma Johnson");
        // Belonging-only: name (+ optional identity photo). No operational child fields.
        expect(Object.keys(child ?? {}).sort()).toEqual(["id", "imageUrl", "name"]);
        expect(child?.imageUrl ?? null).toBeNull();
        const serialized = JSON.stringify(ev.groups);
        expect(serialized).not.toContain("Age 6");
        expect(serialized).not.toContain("Preschool");
        expect(serialized).not.toContain("Enrolled");
    });

    it("includes address as a distinct evidence group when real address fields are present", () => {
        expect(buildHouseholdCardEvidence(ctx(baseRecord())).address).toBeNull();
        const keysWithout = buildHouseholdCardEvidence(ctx(baseRecord())).groups.map((g) => g.key);
        expect(keysWithout).not.toContain("address");

        const withAddress = baseRecord();
        withAddress["person.primary_address_line1"] = "742 Evergreen Terrace";
        withAddress["person.primary_address_city"] = "Springfield";
        withAddress["person.primary_address_state"] = "OR";
        withAddress["person.primary_address_postal_code"] = "97403";
        const ev = buildHouseholdCardEvidence(ctx(withAddress));
        expect(ev.address).toContain("742 Evergreen Terrace");
        expect(ev.address).toContain("Springfield");

        const addressGroup = ev.groups.find((g) => g.key === "address");
        expect(addressGroup?.title).toBe("Address");
        expect(addressGroup?.addressLine).toContain("742 Evergreen Terrace");
    });

    it("warns when no primary contact is on file", () => {
        const ev = buildHouseholdCardEvidence(ctx({ id: "opp-2", _inquiry_children: [] }));
        expect(ev.primaryContact).toBeNull();
        expect(ev.missingCriticalWarning).toBe("No primary contact on file");
    });

    it("warns when a primary exists but no emergency contact is present", () => {
        const record = baseRecord();
        record._opportunity_persons = [
            { person_id: "p-sarah", role_type: "primary_contact", name: "Sarah Johnson" },
        ];
        const ev = buildHouseholdCardEvidence(ctx(record));
        expect(ev.primaryContact?.name).toBe("Sarah Johnson");
        expect(ev.emergencyContactCount).toBe(0);
        expect(ev.missingCriticalWarning).toBe("No emergency contact on file");
    });

    it("reports preferred contact method only when present (documented gap otherwise)", () => {
        const withPref = baseRecord();
        withPref["person.preferred_contact_method"] = "Text";
        expect(buildHouseholdCardEvidence(ctx(withPref)).preferredContactMethod).toBe("Text");
        expect(buildHouseholdCardEvidence(ctx(baseRecord())).preferredContactMethod).toBeNull();
    });

    it("keeps required household sections when only emergency is enabled in published config", () => {
        const loaded = {
            surfaceId: HOUSEHOLD_SURFACE_ID,
            groups: [
                {
                    key: "emergency_contacts",
                    selectedFieldKeys: ["person.phone"],
                    enabled: true,
                },
            ],
        };
        const config = reconcileNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID, loaded);
        const ev = buildHouseholdCardEvidence(ctx(baseRecord()), { nestedConfig: config });
        const keys = ev.groups.map((g) => g.key);
        expect(keys).toContain("primary_contact");
        expect(keys).toContain("other_parent_guardian");
        expect(keys).toContain("children");
        expect(keys).toContain("emergency_contacts");
        expect(keys.indexOf("other_parent_guardian")).toBeGreaterThan(keys.indexOf("primary_contact"));
    });

    it("projects secondary parent from scalar contact fields when family rows omit them", () => {
        const record = baseRecord();
        record._opportunity_persons = [
            { person_id: "p-sarah", role_type: "primary_contact", name: "Sarah Johnson", phone: "555-123-4567", email: "sarah@example.com" },
        ];
        record["person.secondary_contact_name"] = "Michael Johnson";
        record["person.secondary_phone"] = "555-111-2222";
        record["person.secondary_email"] = "mike@example.com";

        const ev = buildHouseholdCardEvidence(ctx(record));
        const otherParent = ev.groups.find((g) => g.key === "other_parent_guardian");
        expect(otherParent?.count).toBe(1);
        expect(otherParent?.contacts[0]?.name).toBe("Michael Johnson");
        expect(otherParent?.contacts[0]?.phone).toBe("(555) 111-2222");
    });

    it("orders children before emergency when published config says so", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = setNestedGroupEnabled(config, "emergency_contacts", true);
        const childrenIdx = config.groups.findIndex((g) => g.key === "children");
        const emergencyIdx = config.groups.findIndex((g) => g.key === "emergency_contacts");
        expect(childrenIdx).toBeGreaterThan(emergencyIdx);
        config = moveSectionInNestedConfig(config, "children", emergencyIdx - childrenIdx);
        const ev = buildHouseholdCardEvidence(ctx(baseRecord()), { nestedConfig: config });
        const keys = ev.groups.map((g) => g.key);
        expect(keys.indexOf("children")).toBeLessThan(keys.indexOf("emergency_contacts"));
    });
});

describe("HouseholdCard component — Operational Context boundary purity", () => {
    const source = readFileSync(
        path.resolve(__dirname, "../../../components/admin/focusPanel/cards/HouseholdCard.tsx"),
        "utf8",
    );

    it("consumes only the Operational Context boundary — no drawer/record/LayoutDoc concepts", () => {
        expect(source).toContain("OperationalContext");
        const forbidden = [
            "displayVm",
            "OpportunityDrawerViewModel",
            "OperationalSubjectViewModel",
            "drawerId",
            "DrawerTabKey",
            "LayoutDoc",
            "vmDrawer",
            "FocusPanelCardCompat",
        ];
        for (const token of forbidden) {
            expect(source, `HouseholdCard must not reference "${token}"`).not.toContain(token);
        }
        // Allow identity VM prop types; forbid drawer-style record object literals.
        const withoutIdentityVmProps = source.replace(/record:\s*IdentityRecordVM/g, "");
        expect(withoutIdentityVmProps).not.toMatch(/record\s*:/);
    });
});

describe("Household card lastUpdatedLabel presentation", () => {
    it("formats updated_at with Focus Panel display doctrine (not ISO YYYY-MM-DD)", () => {
        const src = readFileSync(
            path.join(process.cwd(), "lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence.ts"),
            "utf8",
        );
        expect(src).toContain("formatFocusPanelDate");
        expect(src).toContain("`Updated ${formatted}`");
        expect(src).not.toContain("updated.slice(0, 10)");
    });
});

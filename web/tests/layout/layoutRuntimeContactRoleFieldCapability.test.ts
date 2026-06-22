/**
 * Role-scoped contact field capability map regression tests.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { contactRoleFieldRefs } from "@/lib/layout/layoutEditorContactRoles";
import {
    buildLayoutContactPersonIds,
    buildLayoutContactRefPersonIdMap,
    contactRoleFieldCapabilityReadOnlyReasonForRecord,
    isAnyContactRefKey,
    isLayoutRuntimeRoleContactEditableRefKey,
    layoutRuntimeContactFieldBuilderReadOnlyReason,
    layoutRuntimeContactFieldHasSaveTarget,
    layoutRuntimeContactRoleFieldInlineEditable,
    layoutRuntimeContactRoleFieldReadOnlyReason,
    resolvePersonIdForContactRoleRef,
} from "@/lib/layout/runtime/layoutRuntimeContactRoleFieldCapability";
import {
    groupLayoutRuntimePersonContactDraftByPersonId,
    isLayoutRuntimePersonContactRefKey,
} from "@/lib/layout/runtime/layoutRuntimePersonContactEdit";
import { isLayoutRuntimeEditableRefKeySupported } from "@/lib/layout/runtime/layoutRuntimeFieldEditability";
import { layoutRuntimeFieldReadOnlyReason } from "@/lib/layout/runtime/layoutRuntimeFieldReadOnlyReason";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { validateLayoutDocForSurface } from "@/lib/layout/validateLayoutDocForSurface";
import { resolveLayoutEditorContactBlockPerson } from "@/lib/layout/runtime/resolveLayoutEditorContactBlockRecord";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

function familyRecord(input: {
    primaryId: string;
    secondaryId?: string;
    parentId?: string;
    billingId?: string;
    emergencyId?: string;
    rows?: Array<{ person_id: string; role_type: string; email?: string; phone?: string; name?: string }>;
}): ProofRuntimeRecord {
    const rows =
        input.rows ?? [
            { person_id: input.primaryId, role_type: "primary_contact", name: "Primary", email: "p@x.com", phone: "111" },
            ...(input.secondaryId ?
                [{ person_id: input.secondaryId, role_type: "secondary_contact", name: "Secondary", email: "s@x.com", phone: "222" }]
            :   []),
            ...(input.parentId ?
                [{ person_id: input.parentId, role_type: "guardian", name: "Parent", email: "g@x.com", phone: "333" }]
            :   []),
            ...(input.billingId ?
                [{ person_id: input.billingId, role_type: "billing_contact", name: "Billing", email: "b@x.com", phone: "444" }]
            :   []),
            ...(input.emergencyId ?
                [{ person_id: input.emergencyId, role_type: "emergency_contact", name: "Emergency", email: "e@x.com", phone: "555" }]
            :   []),
        ];
    return {
        "person.id": input.primaryId,
        _opportunity_persons: rows,
        _layout_contact_person_ids: {
            primary: input.primaryId,
            parents: input.secondaryId ?? input.parentId ?? null,
            billing: input.billingId ?? null,
            emergency: input.emergencyId ?? null,
        },
    } as ProofRuntimeRecord;
}

describe("layoutRuntimeContactRoleFieldCapability", () => {
    it("exposes inline editable capability for billing and emergency phone/email", () => {
        const emergency = contactRoleFieldRefs("emergency");
        const billing = contactRoleFieldRefs("billing");

        expect(isLayoutRuntimeRoleContactEditableRefKey(emergency.email)).toBe(true);
        expect(isLayoutRuntimeRoleContactEditableRefKey(emergency.phone)).toBe(true);
        expect(isLayoutRuntimeRoleContactEditableRefKey(billing.email)).toBe(true);
        expect(isLayoutRuntimeRoleContactEditableRefKey(billing.phone)).toBe(true);
        expect(isLayoutRuntimeEditableRefKeySupported(billing.phone)).toBe(true);
    });

    it("requires contact block role context for secondary/parents refs in builder and flat runtime", () => {
        const secondary = contactRoleFieldRefs("parents");

        expect(layoutRuntimeContactRoleFieldInlineEditable(secondary.phone)).toBe(false);
        expect(layoutRuntimeContactRoleFieldInlineEditable(secondary.phone, "secondary")).toBe(true);
        expect(layoutRuntimeContactRoleFieldInlineEditable(secondary.phone, "parents")).toBe(true);
        expect(layoutRuntimeContactFieldBuilderReadOnlyReason(secondary.phone)).toContain("contact block");
    });

    it("marks any-contact refs read-only and never editable in builder", () => {
        const anyRefs = contactRoleFieldRefs("any");
        expect(isAnyContactRefKey(anyRefs.email)).toBe(true);
        expect(isLayoutRuntimeRoleContactEditableRefKey(anyRefs.email)).toBe(false);
        expect(layoutRuntimeContactRoleFieldInlineEditable(anyRefs.phone)).toBe(false);
        expect(layoutRuntimeContactFieldBuilderReadOnlyReason(anyRefs.email)).toContain("display-only");
    });

    it("keeps contact name and address role fields read-only with reasons", () => {
        const secondary = contactRoleFieldRefs("parents");
        expect(isLayoutRuntimeRoleContactEditableRefKey(secondary.name)).toBe(false);
        expect(layoutRuntimeContactRoleFieldReadOnlyReason(secondary.name)).toContain("derived");
        expect(layoutRuntimeContactRoleFieldReadOnlyReason(secondary.addressLine1)).toContain("read-only");
        expect(layoutRuntimeFieldReadOnlyReason(secondary.addressLine1)).toContain("read-only");
    });

    it("recognizes all role contact ref keys including secondary email", () => {
        expect(isLayoutRuntimePersonContactRefKey("person.secondary_email")).toBe(true);
        expect(isLayoutRuntimePersonContactRefKey("person.emergency_contact_phone")).toBe(true);
        expect(isLayoutRuntimePersonContactRefKey("person.billing_contact_email")).toBe(true);
        expect(isLayoutRuntimePersonContactRefKey("person.contact_email")).toBe(true);
    });

    it("resolvePersonIdForContactRoleRef routes primary, billing, and emergency without block context", () => {
        const record = {
            _layout_contact_person_ids: {
                primary: "person-primary",
                parents: "person-secondary",
                billing: "person-billing",
                emergency: "person-emergency",
            },
            _layout_contact_ref_person_id: buildLayoutContactRefPersonIdMap(
                buildLayoutContactPersonIds({
                    primaryPersonId: "person-primary",
                    secondaryPersonId: "person-secondary",
                    billingPersonId: "person-billing",
                    emergencyPersonId: "person-emergency",
                }),
            ),
        };

        expect(resolvePersonIdForContactRoleRef(record, "person.primary_email")).toBe("person-primary");
        expect(resolvePersonIdForContactRoleRef(record, "person.emergency_contact_email")).toBe("person-emergency");
        expect(resolvePersonIdForContactRoleRef(record, "person.billing_contact_phone")).toBe("person-billing");
    });

    it("does not resolve ambiguous secondary refs without contact block role context", () => {
        const record = {
            _layout_contact_person_ids: { primary: "person-primary", parents: "person-secondary" },
            _layout_contact_ref_person_id: buildLayoutContactRefPersonIdMap(
                buildLayoutContactPersonIds({
                    primaryPersonId: "person-primary",
                    secondaryPersonId: "person-secondary",
                }),
            ),
        };

        expect(resolvePersonIdForContactRoleRef(record, "person.secondary_email")).toBeNull();
        expect(resolvePersonIdForContactRoleRef(record, "person.secondary_phone")).toBeNull();
    });

    it("never resolves any-contact refs to primary and never allows save", () => {
        const anyRefs = contactRoleFieldRefs("any");
        const record = {
            "person.id": "person-primary",
            _layout_contact_person_ids: {
                primary: "person-primary",
                any: "person-other",
            },
            _layout_contact_ref_person_id: buildLayoutContactRefPersonIdMap(
                buildLayoutContactPersonIds({
                    primaryPersonId: "person-primary",
                    anyPersonId: "person-other",
                }),
            ),
        };

        expect(resolvePersonIdForContactRoleRef(record, anyRefs.email)).toBeNull();
        expect(resolvePersonIdForContactRoleRef(record, anyRefs.phone)).toBeNull();
        expect(
            layoutRuntimeContactFieldHasSaveTarget({ record, refKey: anyRefs.email }),
        ).toBe(false);
    });

    it("secondary contact block edit resolves to secondary person, not primary", () => {
        const record = familyRecord({
            primaryId: "person-primary",
            secondaryId: "person-secondary",
            parentId: "person-parent",
        });

        const secondaryPersonId = resolveLayoutEditorContactBlockPerson(record, "secondary")?.personId;
        expect(secondaryPersonId).toBe("person-secondary");

        expect(
            resolvePersonIdForContactRoleRef(record, "person.secondary_phone", undefined, "secondary"),
        ).toBe("person-secondary");
        expect(
            resolvePersonIdForContactRoleRef(record, "person.secondary_phone", undefined, "secondary"),
        ).not.toBe("person-primary");
    });

    it("additional parent block edit resolves to parent/guardian person, not primary", () => {
        const record = familyRecord({
            primaryId: "person-primary",
            parentId: "person-parent",
        });

        expect(
            resolvePersonIdForContactRoleRef(record, "person.secondary_email", undefined, "parents"),
        ).toBe("person-parent");
        expect(
            resolvePersonIdForContactRoleRef(record, "person.secondary_email", undefined, "parents"),
        ).not.toBe("person-primary");
    });

    it("groupLayoutRuntimePersonContactDraftByPersonId keeps secondary block edits off primary", () => {
        const record = familyRecord({
            primaryId: "person-primary",
            secondaryId: "person-secondary",
        });

        const grouped = groupLayoutRuntimePersonContactDraftByPersonId({
            record,
            baseline: {
                "person.primary_phone": "5551111111",
                "person.secondary_phone": "5552222222",
            },
            draft: {
                "person.primary_phone": "5551111111",
                "person.secondary_phone": "5559999999",
            },
            contactRefRoleOverrides: { "person.secondary_phone": "secondary" },
        });

        expect(grouped.get("person-primary")?.draft["person.primary_phone"]).toBeUndefined();
        expect(grouped.get("person-secondary")?.draft["person.secondary_phone"]).toBe("5559999999");
        expect(grouped.has("person-primary")).toBe(false);
    });

    it("flat secondary phone without role context does not group into any save bucket", () => {
        const grouped = groupLayoutRuntimePersonContactDraftByPersonId({
            record: {
                _layout_contact_person_ids: {
                    primary: "person-primary",
                    parents: "person-secondary",
                },
            },
            baseline: { "person.secondary_phone": "5552222222" },
            draft: { "person.secondary_phone": "5559999999" },
        });

        expect(grouped.size).toBe(0);
    });

    it("contact block override without role context is ignored for ambiguous secondary refs", () => {
        const record = {
            _layout_contact_person_ids: {
                primary: "person-primary",
                parents: "person-secondary-default",
            },
        };
        expect(
            resolvePersonIdForContactRoleRef(record, "person.secondary_email", {
                "person.secondary_email": "person-parent-block",
            }),
        ).toBeNull();
    });

    it("flat ambiguous secondary field reports read-only reason at runtime", () => {
        const reason = contactRoleFieldCapabilityReadOnlyReasonForRecord(
            "person.secondary_phone",
            { _layout_contact_person_ids: { primary: "p1", parents: "p2" } },
        );
        expect(reason).toContain("contact block");
    });

    it("default opportunity drawer doc still validates", () => {
        expect(validateLayoutDocForSurface(buildLeadDrawerDefaultDoc()).ok).toBe(true);
    });
});

describe("saveLayoutRuntimePersonContactEdits routing", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it("patches secondary person_id when secondary phone changes inside secondary block context", async () => {
        const patchSpy = vi.fn().mockResolvedValue({ ok: true });
        vi.doMock("@/lib/admin/drawer/linkedRecordFieldEditing", () => ({
            patchLinkedPersonFromOpportunityDrawer: patchSpy,
            primaryPersonIdFromOpportunityRecord: () => "person-primary",
        }));

        const { saveLayoutRuntimePersonContactEdits } = await import(
            "@/lib/layout/runtime/layoutRuntimePersonContactEdit"
        );

        await saveLayoutRuntimePersonContactEdits({
            record: familyRecord({
                primaryId: "person-primary",
                secondaryId: "person-secondary",
            }),
            baseline: { "person.secondary_phone": "5552222222" },
            draft: { "person.secondary_phone": "5559999999" },
            contactRefRoleOverrides: { "person.secondary_phone": "secondary" },
        });

        expect(patchSpy).toHaveBeenCalledTimes(1);
        expect(patchSpy).toHaveBeenCalledWith({
            personId: "person-secondary",
            body: { phone: "5559999999" },
        });
    });

    it("does not patch primary when any-contact phone draft changes", async () => {
        const patchSpy = vi.fn().mockResolvedValue({ ok: true });
        vi.doMock("@/lib/admin/drawer/linkedRecordFieldEditing", () => ({
            patchLinkedPersonFromOpportunityDrawer: patchSpy,
            primaryPersonIdFromOpportunityRecord: () => "person-primary",
        }));

        const { saveLayoutRuntimePersonContactEdits } = await import(
            "@/lib/layout/runtime/layoutRuntimePersonContactEdit"
        );
        const anyRefs = contactRoleFieldRefs("any");

        await saveLayoutRuntimePersonContactEdits({
            record: {
                "person.id": "person-primary",
                _layout_contact_person_ids: { primary: "person-primary", any: "person-other" },
            },
            baseline: { [anyRefs.phone]: "5551111111" },
            draft: { [anyRefs.phone]: "5559999999" },
        });

        expect(patchSpy).not.toHaveBeenCalled();
    });
});

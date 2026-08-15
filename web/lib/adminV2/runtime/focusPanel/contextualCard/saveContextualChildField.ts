/**
 * EDITING A CONFIGURED CHILD FIELD — one write authority, reachable from either host.
 *
 * The authorities were never the coupling. `PATCH /api/admin/persons/{id}` and
 * `PATCH /api/admin/customer-members/{id}` take no opportunity and never did; a child's name, date
 * of birth and profile scalars are child facts. What required a case was the ORCHESTRATOR:
 * `buildOpportunityFocusPanelMutation` takes an `opportunityId`, threads an OCM-shaped
 * `InquiryChildRow`, and dispatches opportunity-scoped refresh events on both success and rollback.
 *
 * So this extracts the smallest orchestration that a case-free host needs, and it extracts it by
 * CALLING THE SAME FUNCTIONS — `patchInquiryChildIdentityFromDrawer` for identity,
 * `patchCustomerMemberFromInquiryChild` for profile scalars. Not a second write path; the same one,
 * without the parts that only a case has.
 *
 * ── WHY SOME CONFIGURED FIELDS ARE NOT EDITABLE HERE ──
 *
 * A configured Child card legitimately contains ENROLLMENT projections — program, room, schedule
 * type, start date. Those are participation facts on the opportunity-customer-member row, and a host
 * that has not committed to a participation has nothing to write them to. `writeTargetForField`
 * answers `participation` for them and the host does not offer an edit.
 *
 * That is the honest shape, and it is not a gap to be closed by writing them anyway: a durable host
 * inventing an OCM row would create participation as a side effect of an edit, which is exactly the
 * coupling the durable grain removed. The field still RENDERS, still carries its configured label
 * and order — it simply is not editable from here.
 */

import {
    buildIdentityInlineChildSavePatch,
    isIdentityFieldInlineSaveSupported,
} from "@/lib/adminV2/runtime/focusPanel/identity/identityInlineChildSave";
import {
    patchCustomerMemberFromInquiryChild,
    patchInquiryChildIdentityFromDrawer,
    type InquiryChildIdentityPatch,
} from "@/lib/admin/drawer/inquiryChildFieldEdit";
import {
    childFocusMutationValueKeyForRef,
    isEnrollmentOcmMutationValueKey,
} from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldMutationBinding";
import type { InquiryChildRow } from "@/components/admin/entity/OpportunityInquiryChildrenSection";
import { reconcileLegacyChildEnrollmentAlias } from "@/lib/fields/canonicalFieldProjection";
import type { DurableChildSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableChildSubjectModel";

/** Where a configured field's value actually lives. */
export type ContextualChildWriteTarget =
    /** The child record itself (`persons` when linked, else `customer_members`). Case-free. */
    | "child_record"
    /** The participation row (OCM). Requires a committed case; not writable from a durable host. */
    | "participation"
    /** Derived or unsupported — not writable anywhere. */
    | null;

/**
 * Where a configured field's value lives — DERIVED from the domain's own mutation bindings.
 *
 * Deliberately not a list maintained here. `identityFieldMutationBinding` already declares which
 * refs map to which canonical mutation and which of those target participation
 * (`isEnrollmentOcmMutationValueKey`); restating that would be a second opinion about the same
 * question, and the two would drift the first time a field moved.
 *
 * The order matters: a ref that binds to an ENROLLMENT mutation is participation-owned even if it
 * also happens to be inline-editable, because where the value lives is what decides whether a
 * case-free host can write it.
 */
export function writeTargetForField(fieldKey: string): ContextualChildWriteTarget {
    const normalized = reconcileLegacyChildEnrollmentAlias(fieldKey.trim());
    if (!normalized) return null;

    const mutationKey = childFocusMutationValueKeyForRef(normalized);
    if (mutationKey) {
        return isEnrollmentOcmMutationValueKey(mutationKey) ? "participation" : "child_record";
    }

    // Participation NOTES bind to no value key but are still OCM-owned.
    if (normalized.startsWith("inquiry_child.")) return "participation";

    // Everything else the child record can accept inline: name parts and profile scalars.
    return isIdentityFieldInlineSaveSupported(normalized) ? "child_record" : null;
}

export type SaveContextualChildFieldResult =
    | { ok: true; writeTarget: "person" | "customer_member" | "profile" }
    | { ok: false; error: string };

/**
 * Save one configured field on a durable child.
 *
 * Returns a REFUSAL rather than throwing for a field this host cannot write. A host that has to
 * catch an exception to discover a field is not editable will eventually stop catching it.
 */
export async function saveContextualChildField(input: {
    subject: DurableChildSubject;
    fieldKey: string;
    value: string;
}): Promise<SaveContextualChildFieldResult> {
    const target = writeTargetForField(input.fieldKey);
    if (target !== "child_record") {
        return {
            ok: false,
            error:
                target === "participation"
                    ? "This field belongs to an enrollment and is edited there."
                    : "This field is not editable.",
        };
    }

    const truth = input.subject.truth ?? {};
    const str = (key: string): string => {
        const raw = truth[key];
        return raw == null ? "" : String(raw).trim();
    };

    // The baseline the canonical patch builders diff against — the child's own current facts.
    const identityBaseline: InquiryChildIdentityPatch = {
        first_name: str("first_name"),
        last_name: str("last_name"),
        dob: input.subject.dateOfBirth ?? "",
    };

    /**
     * The row shape the shared builders read.
     *
     * Only `customer_member_id`, `person_id` and `notes` are consulted for the fields this host can
     * write, so the remainder is stated as the empty truth it is. A cast would compile and then read
     * `undefined` for whichever field a future builder starts consulting.
     */
    const row = {
        customer_member_id: input.subject.memberId,
        person_id: input.subject.personId,
        notes: str("notes") || null,
    } as Pick<InquiryChildRow, "customer_member_id" | "person_id" | "notes">;

    const patch = buildIdentityInlineChildSavePatch({
        fieldRef: input.fieldKey,
        value: input.value,
        row: row as InquiryChildRow,
        identityBaseline,
    });
    if (!patch) return { ok: false, error: "This field is not editable." };

    try {
        // Identity (name, date of birth) — the SAME authority the case host calls, which routes to
        // `persons` when the child has one and `customer_members` when it does not.
        if (patch.identityPatch && Object.keys(patch.identityPatch).length > 0) {
            const result = await patchInquiryChildIdentityFromDrawer({
                row: { customer_member_id: input.subject.memberId, person_id: input.subject.personId },
                draft: { ...identityBaseline, ...patch.identityPatch },
                baseline: identityBaseline,
            });
            return { ok: true, writeTarget: result.writeTarget };
        }

        // Profile scalars (preferred name, gender, allergies, medical notes, instructions) — always
        // the member row. `gender_label` is Focus Panel display only and is not a column.
        if (patch.profilePatch && Object.keys(patch.profilePatch).length > 0) {
            const { gender_label: _genderLabel, ...apiProfile } = patch.profilePatch;
            if (Object.keys(apiProfile).length > 0) {
                await patchCustomerMemberFromInquiryChild(input.subject.memberId, apiProfile);
            }
            return { ok: true, writeTarget: "profile" };
        }

        // Nothing to send: the operator retyped the same value. Reporting success is honest —
        // the record already says what they asked it to say.
        return { ok: true, writeTarget: "customer_member" };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Save failed" };
    }
}

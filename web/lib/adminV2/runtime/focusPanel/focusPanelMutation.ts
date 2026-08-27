/**
 * Focus Panel mutation seam (Household V1 live editing).
 *
 * A SEPARATE injected capability — the same pattern as `coordination`. It is NOT a
 * method on `OperationalContext` (the context stays read-only truth; cards observe
 * it, never write to it). A truth card receives a `FocusPanelMutation` and calls it
 * to propose a change; the adapter persists through the EXISTING person PATCH path
 * (which owns permissions + validation) and broadcasts the EXISTING record-patch
 * events so the host re-merges the VM and `buildOperationalContext` recomposes — the
 * card then reflects saved truth with no manual refresh.
 *
 * This introduces NO new mutation path: persistence is `patchLinkedPersonFromOpportunityDrawer`
 * → `PATCH /api/admin/persons/[id]`, identical to the drawer's linked-person edit.
 *
 * Audit parity: the person PATCH route does not write an audit row today; reusing it
 * preserves exactly that behavior — nothing is added, nothing is bypassed.
 *
 * @see docs/sprints/archive/06_2026/focus_panel_live_editing_plan.md
 * @see docs/platform/operator/operational-context-boundary.md (truth is read-only)
 */

import {
    applyPersonPatchToOpportunityHydration,
    patchLinkedPersonFromOpportunityDrawer,
} from "@/lib/admin/drawer/linkedRecordFieldEditing";
import { applyPersonPatchToOpportunityInquiryChildren } from "@/lib/admin/person/applyPersonPatchToOpportunityInquiryChildren";
import {
    patchChildParticipation,
    patchCustomerMemberFromInquiryChild,
    patchInquiryChildIdentityFromDrawer,
    type InquiryChildIdentityPatch,
    type InquiryChildOcmPatch,
} from "@/lib/admin/drawer/inquiryChildFieldEdit";
import type { ChildFocusSavePatch } from "@/lib/adminV2/runtime/focusPanel/children/childFocusEditState";
import { setChildAvatarSessionPreview } from "@/lib/adminV2/runtime/focusPanel/children/childAvatarSessionPreview";
import type { InquiryChildRow } from "@/components/admin/entity/OpportunityInquiryChildrenSection";
import { dispatchOpportunityDrawerRecordPatch } from "@/lib/admin/opportunityDrawerTargetedRefresh";
import { dispatchOpportunityQueueUpdated } from "@/lib/admin/opportunityQueueRefreshEvent";
import { dispatchDrawerLayoutRuntimeBodyRecordPatch } from "@/lib/layout/runtime/drawerLayoutRuntimeBodyRecordPatch";
import { resolveLeadSummaryPrimaryPersonId } from "@/lib/admin/drawer/opportunityFamilyContactsOrdering";
import { patchHouseholdPrimaryContact } from "@/lib/admin/person/patchHouseholdPrimaryContact";
import { applyLeadPrimaryContactToOpportunityRecord } from "@/lib/admin/person/applyLeadPrimaryContactToOpportunityRecord";
import { RESOLVED_PHOTO_URL_KEY } from "@/lib/adminV2/runtime/focusPanel/resolveIdentityPhotoUrl";
import {
    dispatchOpportunityTourUpdated,
    ADMINV2_OPEN_TOUR_SCHEDULE_MODAL,
    postTourBookingAction,
} from "@/lib/tours/actions/tourBookingActionClient";
import { dispatchOpenRelationshipActionModal } from "@/lib/admin/relationship/relationshipActionClient";
import {
    PERSON_ADDRESS_VALUE_KEYS,
    type PersonAddressValueKey,
} from "@/lib/layout/personDrawerAddressLayoutRefs";
import {
    mergePersonChildRelationshipIntoFocusPanelTruth,
    patchPersonChildRelationshipFromFocusPanel,
    applyEmergencyRoleRemovalToTruth,
    removePersonChildRelationshipRoleFromFocusPanel,
    type PersonChildRelationshipPatchBody,
} from "@/lib/adminV2/runtime/focusPanel/emergencyContacts/focusPanelPersonChildRelationshipMutation";

/** Primary-contact/person fields editable on the Household card (V1). */
export type PersonContactValues = {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
};

/** Only the changed fields, normalized (empty → null) for the PATCH body. */
export type PersonContactPatch = Partial<Record<keyof PersonContactValues, string | null>>;

export type FocusPanelSaveResult =
    | { ok: true }
    | { ok: false; status: number; error: string };

export type FocusPanelPhotoSaveResult =
    | { ok: true; photoUrl: string | null }
    | { ok: false; status: number; error: string };

/** Tour status actions (action-only card — no inline form). */
export type FocusPanelTourMutation = {
    cancelTour: (bookingId: string) => Promise<FocusPanelSaveResult>;
    confirmTour: (bookingId: string) => Promise<FocusPanelSaveResult>;
    openTourScheduleModal: (opts: { opportunityId: string; actionKey?: "schedule_tour" | "reschedule_tour" }) => void;
    dispatchTourUpdated: (opportunityId: string, actionKey: string) => void;
};

/** Communications actions (action-only — no inline message composer). */
export type FocusPanelCommunicationsMutation = {
    cancelScheduledSend: (sendId: string) => Promise<FocusPanelSaveResult>;
};

/** The injected mutation capability a truth card uses to propose a change. */
export type FocusPanelMutation = {
    /** Whether the operator may edit truth on this subject (mirrors `capabilities.canMutate`). */
    canEdit: boolean;
    /** Persist primary-contact field edits via the existing person PATCH route + refresh. */
    savePersonContact: (personId: string, patch: PersonContactPatch) => Promise<FocusPanelSaveResult>;
    /** Persist inquiry-child placement/identity edits via existing inquiry-child save paths. */
    saveInquiryChild: (args: {
        childId: string;
        row: Pick<InquiryChildRow, "id" | "customer_member_id" | "person_id">;
        patch: ChildFocusSavePatch;
        identityBaseline: InquiryChildIdentityPatch;
    }) => Promise<FocusPanelSaveResult>;
    /**
     * Mark a just-uploaded document (existing documents-upload path) as a child's
     * canonical profile photo — persists `persons.metadata.profile_photo_document_id`
     * (+ a cached signed URL) and refreshes Focus Panel truth so every card sharing this
     * child's evidence (Children, Assignments/Scheduling) shows the same image.
     */
    savePersonChildPhoto: (args: {
        childId: string;
        personId: string;
        documentId: string;
    }) => Promise<FocusPanelPhotoSaveResult>;
    /** Clear canonical profile photo — initials fallback. */
    clearPersonChildPhoto: (args: {
        childId: string;
        personId: string;
    }) => Promise<FocusPanelPhotoSaveResult>;
    /** Open the existing add-emergency-contact relationship modal. */
    openAddEmergencyContact: () => void;
    /** Child-scoped add emergency contact (focused child drill-in). */
    openAddEmergencyContactForChild: (args: {
        customerMemberId: string;
        childPersonId?: string | null;
    }) => void;
    /** Open the add-authorized-pickup relationship modal (household scope). */
    openAddAuthorizedPickup: () => void;
    /**
     * Designate a linked household person as the exclusive primary contact.
     * Uses canonical PATCH + `household.primary_contact_changed` (same writer as person drawer).
     */
    makeHouseholdPrimaryContact: (args: {
        customerId: string;
        personId: string;
    }) => Promise<FocusPanelSaveResult>;
    /** Patch canonical relationship fields (not Person-owned fields). */
    savePersonChildRelationship: (
        relationshipId: string,
        customerMemberId: string,
        patch: PersonChildRelationshipPatchBody,
    ) => Promise<FocusPanelSaveResult>;
    /** Remove emergency_contact role; preserves other roles on the edge. */
    removeEmergencyContactRole: (args: {
        relationshipId: string;
        customerMemberId: string;
    }) => Promise<FocusPanelSaveResult>;
    /** Tour status actions — present whenever a tour booking row exists and can be acted on. */
    tour: FocusPanelTourMutation;
    /** Communications actions — present for all opportunities. */
    communications: FocusPanelCommunicationsMutation;
};

/** The subset of a persons PATCH response this seam reads back. */
type SavedPerson = {
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
};

function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

const PRIMARY_ADDRESS_TRUTH_KEYS: Record<PersonAddressValueKey, [primary: string, bare: string]> = {
    address_line1: ["person.primary_address_line1", "person.address_line1"],
    address_line2: ["person.primary_address_line2", "person.address_line2"],
    city: ["person.primary_address_city", "person.city"],
    state: ["person.primary_address_state", "person.state"],
    postal_code: ["person.primary_address_postal_code", "person.postal_code"],
};

function addressComponentsFromSaved(saved: SavedPerson): Partial<Record<PersonAddressValueKey, string | null>> {
    const out: Partial<Record<PersonAddressValueKey, string | null>> = {};
    for (const key of PERSON_ADDRESS_VALUE_KEYS) {
        if (saved[key] !== undefined) out[key] = trimOrNull(saved[key]);
    }
    return out;
}

function mergePersonAddressSnapshot(
    merged: Record<string, unknown>,
    personId: string,
    components: Partial<Record<PersonAddressValueKey, string | null>>,
): void {
    if (Object.keys(components).length === 0) return;
    const snapshotsRaw = merged._person_address_by_id;
    const snapshots =
        snapshotsRaw && typeof snapshotsRaw === "object" && !Array.isArray(snapshotsRaw)
            ? { ...(snapshotsRaw as Record<string, Record<string, unknown>>) }
            : {};
    const row = { ...(snapshots[personId] ?? {}) };
    for (const key of PERSON_ADDRESS_VALUE_KEYS) {
        if (components[key] === undefined) continue;
        row[key] = components[key];
        row[`person.${key}`] = components[key];
    }
    snapshots[personId] = row;
    merged._person_address_by_id = snapshots;
}

function fullNameFrom(person: SavedPerson): string | null {
    return (
        trimOrNull(person.full_name) ??
        ([trimOrNull(person.first_name), trimOrNull(person.last_name)].filter(Boolean).join(" ").trim() || null)
    );
}

/** Update the matching person's row (by `person_id`) inside a contact array. */
function updateContactArray(value: unknown, personId: string, saved: SavedPerson): unknown {
    if (!Array.isArray(value)) return value;
    const fullName = fullNameFrom(saved);
    return value.map((row) => {
        if (!row || typeof row !== "object") return row;
        const r = row as Record<string, unknown>;
        if (trimOrNull(r.person_id) !== personId) return row;
        const next: Record<string, unknown> = { ...r };
        if (fullName) next.name = fullName;
        if (saved.email !== undefined) next.email = trimOrNull(saved.email);
        if (saved.phone !== undefined) next.phone = trimOrNull(saved.phone);
        if (saved.address_line1 !== undefined) {
            next.address_line1 = trimOrNull(saved.address_line1);
            next.addressLine1 = trimOrNull(saved.address_line1);
        }
        if (saved.address_line2 !== undefined) {
            next.address_line2 = trimOrNull(saved.address_line2);
            next.addressLine2 = trimOrNull(saved.address_line2);
        }
        if (saved.city !== undefined) next.city = trimOrNull(saved.city);
        if (saved.state !== undefined) next.state = trimOrNull(saved.state);
        if (saved.postal_code !== undefined) {
            next.postal_code = trimOrNull(saved.postal_code);
            next.postalCode = trimOrNull(saved.postal_code);
        }
        return next;
    });
}

/**
 * Merge a saved person back into the Focus Panel subject truth so the Household card
 * recomposes to the new values for THAT person. Pure — returns a NEW record.
 *
 * Updates the edited person wherever they appear:
 *   - their row in the contact arrays (`_opportunity_persons` / `_customer_persons`),
 *     keyed by `person_id` — so ANY contact row recomposes, not just the primary; and
 *   - when the edited person is the PRIMARY contact, also the namespaced primary keys
 *     (`person.primary_contact_name` / `_email` / `_phone`), generic hydration, and
 *     `_identity.primary_person.label` (the card's headline channel).
 */
export function mergePersonContactIntoFocusPanelTruth(
    truth: Record<string, unknown>,
    personId: string,
    saved: SavedPerson,
): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...truth };
    merged._opportunity_persons = updateContactArray(merged._opportunity_persons, personId, saved);
    merged._customer_persons = updateContactArray(merged._customer_persons, personId, saved);

    const addressComponents = addressComponentsFromSaved(saved);
    mergePersonAddressSnapshot(merged, personId, addressComponents);

    if (personId === resolveLeadSummaryPrimaryPersonId(truth)) {
        applyPersonPatchToOpportunityHydration(merged, saved);
        const fullName = fullNameFrom(saved);
        if (fullName) merged["person.primary_contact_name"] = fullName;
        if (saved.email !== undefined) merged["person.primary_email"] = trimOrNull(saved.email);
        if (saved.phone !== undefined) merged["person.primary_phone"] = trimOrNull(saved.phone);
        for (const key of PERSON_ADDRESS_VALUE_KEYS) {
            if (saved[key] === undefined) continue;
            const value = trimOrNull(saved[key]);
            const [primaryKey, bareKey] = PRIMARY_ADDRESS_TRUTH_KEYS[key];
            merged[primaryKey] = value;
            merged[bareKey] = value;
        }
        const identity = merged._identity as { primary_person?: { id?: unknown; label?: unknown } } | null | undefined;
        if (fullName && identity && typeof identity === "object" && identity.primary_person) {
            merged._identity = {
                ...identity,
                primary_person: { ...identity.primary_person, label: fullName },
            };
        }
    }

    return merged;
}

function trimId(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

function inquiryChildRowMatchesTarget(r: Record<string, unknown>, targetId: string): boolean {
    const rowId = trimId(r.id);
    const rowPersonId = trimId(r.person_id);
    const rowMemberId = trimId(r.customer_member_id);
    if (rowId === targetId || rowPersonId === targetId || rowMemberId === targetId) return true;
    // Synthetic unlinked ids: `unlinked:{customer_member_id}`
    if (targetId.startsWith("unlinked:")) {
        const memberFromTarget = targetId.slice("unlinked:".length).trim();
        if (memberFromTarget && rowMemberId === memberFromTarget) return true;
    }
    return false;
}

/**
 * Merge saved inquiry-child edits back into Focus Panel subject truth. Pure.
 * Updates the matching `_inquiry_children` row by child id / person id.
 */
export function mergeInquiryChildIntoFocusPanelTruth(
    truth: Record<string, unknown>,
    args: {
        childId: string;
        row: Pick<InquiryChildRow, "person_id">;
        patch: ChildFocusSavePatch;
        savedPerson?: Record<string, unknown> | null;
    },
): Record<string, unknown> {
    const targetId = args.childId.trim();
    const rows = truth._inquiry_children;
    if (!Array.isArray(rows) || !targetId) return truth;

    const identity = args.patch.identityPatch;
    const ocm = args.patch.ocmPatch;
    const personId = trimId(args.row.person_id);

    let matchedByTarget = false;
    const applyRowPatch = (r: Record<string, unknown>): Record<string, unknown> => {
        const next: Record<string, unknown> = { ...r };
        // Keep person_id on the inquiry row when a photo bind supplies it — needed for
        // subsequent avatar edit/remove without re-resolving.
        if (personId) next.person_id = personId;
        if (identity.first_name !== undefined) next.first_name = identity.first_name;
        if (identity.last_name !== undefined) next.last_name = identity.last_name;
        if (identity.dob !== undefined) {
            next.dob = identity.dob ? String(identity.dob).slice(0, 10) : null;
        }
        if (ocm.program_category_id !== undefined) next.program_category_id = ocm.program_category_id;
        if (ocm.schedule_type !== undefined) next.schedule_type = ocm.schedule_type;
        if (ocm.program_room_cohort_key !== undefined) {
            next.program_room_cohort_key = ocm.program_room_cohort_key;
        }
        if (ocm.location_id !== undefined) next.location_id = ocm.location_id;
        if (ocm.start_date !== undefined) next.start_date = ocm.start_date;
        if (ocm.notes !== undefined) next.notes = ocm.notes;
        const display = args.patch.displayPatch;
        if (display?.desired_program_label !== undefined) {
            next.desired_program_label = display.desired_program_label;
        } else if (ocm.program_category_id !== undefined && !ocm.program_category_id) {
            // Cleared program FK — drop the stale display label so evidence does not keep
            // a prior Program name after the operator empties the field.
            next.desired_program_label = null;
        }
        if (display?.location_label !== undefined) {
            next.location_label = display.location_label;
        }
        if (args.patch.profilePatch) {
            for (const [key, value] of Object.entries(args.patch.profilePatch)) {
                next[key] = value;
            }
        }
        return next;
    };

    let nextRows = rows.map((raw) => {
        if (!raw || typeof raw !== "object") return raw;
        const r = raw as Record<string, unknown>;
        if (!inquiryChildRowMatchesTarget(r, targetId)) return raw;
        matchedByTarget = true;
        return applyRowPatch(r);
    });

    // Photo / ensure-person path: childId may be a synthetic evidence id — fall back to a
    // unique person_id match so photo_url still lands on the inquiry row.
    if (!matchedByTarget && personId) {
        const personMatchIndexes: number[] = [];
        nextRows.forEach((raw, index) => {
            if (!raw || typeof raw !== "object") return;
            if (trimId((raw as Record<string, unknown>).person_id) === personId) {
                personMatchIndexes.push(index);
            }
        });
        if (personMatchIndexes.length === 1) {
            const only = personMatchIndexes[0]!;
            nextRows = nextRows.map((raw, index) => {
                if (index !== only || !raw || typeof raw !== "object") return raw;
                return applyRowPatch(raw as Record<string, unknown>);
            });
        }
    }

    let merged: Record<string, unknown> = { ...truth, _inquiry_children: nextRows };
    if (personId && (identity.dob !== undefined || identity.first_name !== undefined || identity.last_name !== undefined)) {
        const personPatch: Record<string, unknown> = {};
        if (identity.first_name !== undefined) personPatch.first_name = identity.first_name;
        if (identity.last_name !== undefined) personPatch.last_name = identity.last_name;
        if (identity.dob !== undefined) {
            personPatch.date_of_birth = identity.dob ? String(identity.dob).slice(0, 10) : null;
        }
        merged = applyPersonPatchToOpportunityInquiryChildren(merged, personId, personPatch, args.savedPerson ?? null);
    }
    return merged;
}

export type BuildFocusPanelMutationInput = {
    canMutate: boolean;
    /** The opportunity (subject) id — keys the record-patch refresh events. */
    opportunityId: string;
    /** Current observed subject truth (read-only) used to build the merged refresh record. */
    truth: Record<string, unknown>;
    /** Latest truth at save time — avoids stale-closure merges after async PATCH. */
    getTruth?: () => Record<string, unknown>;
    /** Test seam. */
    fetchFn?: typeof fetch;
};

/**
 * Mutations always key the family opportunity (Record of Truth), never the Attention subject.
 *
 * Child Attention overlays rewrite `model.subject.id` to the child / process-instance id.
 * PATCH merges + drawer refresh events must still target `child.family_opportunity_id`
 * (or settlement `truth.id`) so saves stick and the Work Unit Focus Panel re-merges.
 *
 * Child commit-critical truth often sets `truth.id` to the process_instance id (same as
 * subjectId). In that shape only `child.family_opportunity_id` identifies the family case.
 */
export function resolveFocusPanelMutationOpportunityId(args: {
    subjectId: string;
    grain?: string | null;
    truth: Record<string, unknown> | null | undefined;
}): string {
    const subjectId = args.subjectId.trim();
    const familyFromTruth =
        typeof args.truth?.["child.family_opportunity_id"] === "string"
            ? String(args.truth["child.family_opportunity_id"]).trim()
            : "";
    const processInstanceFromTruth =
        typeof args.truth?.["child.process_instance_id"] === "string"
            ? String(args.truth["child.process_instance_id"]).trim()
            : "";
    const truthId =
        typeof args.truth?.id === "string" ? String(args.truth.id).trim() : "";

    // Family opportunity binding wins whenever present — including when grain was
    // still reported as "case" while Attention subject is the child participation.
    if (familyFromTruth) return familyFromTruth;

    if (args.grain === "child") {
        // Settlement truth id is the family opportunity; Attention subject is the child.
        // Commit-critical child truth sets truth.id to the process instance — ignore that.
        if (
            truthId
            && truthId !== subjectId
            && truthId !== processInstanceFromTruth
        ) {
            return truthId;
        }
    }

    return subjectId;
}

/**
 * Build the opportunity Focus Panel mutation adapter. Wires:
 *  - Household contact save (existing person PATCH path)
 *  - Tour status actions (existing tour booking API)
 *  - Communications scheduled-send cancel (existing scheduled-sends PATCH)
 */
export function buildOpportunityFocusPanelMutation(input: BuildFocusPanelMutationInput): FocusPanelMutation {
    const { canMutate, opportunityId, truth, getTruth, fetchFn } = input;
    const f = fetchFn ?? fetch;
    return {
        canEdit: canMutate,
        savePersonContact: async (personId, patch) => {
            const id = personId.trim();
            if (!id) return { ok: false, status: 400, error: "No person to edit" };

            const res = await patchLinkedPersonFromOpportunityDrawer({ personId: id, body: patch, fetchFn });
            if (!res.ok) return { ok: false, status: res.status, error: res.error };

            const savedPerson: SavedPerson = { ...(res.json as SavedPerson) };
            for (const [key, value] of Object.entries(patch)) {
                if (
                    key === "address_line1"
                    || key === "address_line2"
                    || key === "city"
                    || key === "state"
                    || key === "postal_code"
                ) {
                    (savedPerson as Record<string, unknown>)[key] = value;
                }
            }
            const merged = mergePersonContactIntoFocusPanelTruth(getTruth?.() ?? truth, id, savedPerson);
            dispatchOpportunityDrawerRecordPatch(opportunityId, merged);
            dispatchDrawerLayoutRuntimeBodyRecordPatch({
                entityType: "opportunities",
                entityId: opportunityId,
                record: merged,
            });
            return { ok: true };
        },
        saveInquiryChild: async ({ childId, row, patch, identityBaseline }) => {
            const cmId = trimId(row.customer_member_id);
            if (!cmId) return { ok: false, status: 400, error: "No child record to edit" };

            // Predictive merge: update Focus Panel / summary surfaces immediately, then confirm.
            const baselineTruth = getTruth?.() ?? truth;
            const optimisticMerged = mergeInquiryChildIntoFocusPanelTruth(baselineTruth, {
                childId,
                row,
                patch,
            });
            dispatchOpportunityDrawerRecordPatch(opportunityId, optimisticMerged);
            dispatchDrawerLayoutRuntimeBodyRecordPatch({
                entityType: "opportunities",
                entityId: opportunityId,
                record: optimisticMerged,
            });

            let savedPerson: Record<string, unknown> | undefined;
            try {
                if (Object.keys(patch.identityPatch).length > 0) {
                    const identityDraft = { ...identityBaseline, ...patch.identityPatch };
                    const identityWrite = await patchInquiryChildIdentityFromDrawer({
                        row: { customer_member_id: cmId, person_id: row.person_id },
                        draft: identityDraft,
                        baseline: identityBaseline,
                        fetchFn: f,
                    });
                    savedPerson = identityWrite.person;
                }
                if (Object.keys(patch.ocmPatch).length > 0) {
                    await patchChildParticipation({
                        customerMemberId: cmId,
                        opportunityId,
                        patch: patch.ocmPatch,
                        fetchFn: f,
                    });
                    const affectsWaitlist = Object.keys(patch.ocmPatch).some((k) =>
                        ["location_id", "program_room_cohort_key", "program_category_id", "outcome_status_key"].includes(
                            k,
                        ),
                    );
                    if (affectsWaitlist && typeof window !== "undefined") {
                        window.dispatchEvent(
                            new CustomEvent("adminv2:opportunity-updated", {
                                detail: {
                                    id: opportunityId,
                                    action_key: "inquiry_child_placement_scope",
                                    affects_waitlist: true,
                                },
                            }),
                        );
                    }
                }
                if (patch.profilePatch && Object.keys(patch.profilePatch).length > 0) {
                    // gender_label is Focus Panel display-only (not a customer_member column).
                    const { gender_label: _genderLabel, ...apiProfile } = patch.profilePatch;
                    if (Object.keys(apiProfile).length > 0) {
                        await patchCustomerMemberFromInquiryChild(cmId, apiProfile);
                    }
                }
            } catch (e) {
                dispatchOpportunityDrawerRecordPatch(opportunityId, baselineTruth);
                dispatchDrawerLayoutRuntimeBodyRecordPatch({
                    entityType: "opportunities",
                    entityId: opportunityId,
                    record: baselineTruth,
                });
                return {
                    ok: false,
                    status: 500,
                    error: e instanceof Error ? e.message : "Save failed",
                };
            }

            const merged = mergeInquiryChildIntoFocusPanelTruth(getTruth?.() ?? truth, {
                childId,
                row,
                patch,
                savedPerson,
            });
            dispatchOpportunityDrawerRecordPatch(opportunityId, merged);
            dispatchDrawerLayoutRuntimeBodyRecordPatch({
                entityType: "opportunities",
                entityId: opportunityId,
                record: merged,
            });
            /*
             * IDENTITY IS DISPLAYED OUTSIDE THE CARD THAT EDITS IT.
             *
             * The record patch above converges the Focus Panel's own record, which is why a child
             * rename updated the Children card and nothing else — the queue row, the Assignments card
             * on the same panel and Records all kept the old name until the operator reloaded the
             * browser. A name needs the canonical queue signal; a PROFILE-only save
             * (special instructions, allergies, medical notes) is displayed nowhere else and stays the
             * one-request IMMEDIATE_LOCAL save it was measured to be. The condition is what keeps the
             * blast radius honest — this is not "signal on every save".
             */
            if (Object.keys(patch.identityPatch).length > 0) {
                dispatchOpportunityQueueUpdated(opportunityId, "inquiry_child_identity");
            }
            return { ok: true };
        },
        savePersonChildPhoto: async ({ childId, personId, documentId }) => {
            const pid = personId.trim();
            const docId = documentId.trim();
            if (!pid || !docId) return { ok: false, status: 400, error: "Missing person or document" };

            try {
                const res = await f(`/api/admin/persons/${encodeURIComponent(pid)}/profile-photo`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ document_id: docId }),
                });
                const json = (await res.json().catch(() => ({}))) as { photoUrl?: string; error?: string };
                if (!res.ok || !json.photoUrl) {
                    return { ok: false, status: res.status, error: json.error ?? "Could not save photo" };
                }

                // Session preview for immediate chrome; merge uses resolved_photo_url so
                // evidence adapters accept the actor-scoped URL (signed photo_url alone is dropped).
                setChildAvatarSessionPreview(childId, json.photoUrl);

                const merged = mergeInquiryChildIntoFocusPanelTruth(getTruth?.() ?? truth, {
                    childId,
                    row: { person_id: pid },
                    patch: {
                        identityPatch: {},
                        ocmPatch: {},
                        profilePatch: { [RESOLVED_PHOTO_URL_KEY]: json.photoUrl },
                    },
                });
                dispatchOpportunityDrawerRecordPatch(opportunityId, merged);
                dispatchDrawerLayoutRuntimeBodyRecordPatch({
                    entityType: "opportunities",
                    entityId: opportunityId,
                    record: merged,
                });
                return { ok: true, photoUrl: json.photoUrl };
            } catch (e) {
                return { ok: false, status: 500, error: e instanceof Error ? e.message : "Could not save photo" };
            }
        },
        clearPersonChildPhoto: async ({ childId, personId }) => {
            const pid = personId.trim();
            if (!pid) return { ok: false, status: 400, error: "Missing person" };
            try {
                const res = await f(`/api/admin/persons/${encodeURIComponent(pid)}/profile-photo`, {
                    method: "DELETE",
                    credentials: "include",
                });
                if (!res.ok) {
                    const json = (await res.json().catch(() => ({}))) as { error?: string };
                    return { ok: false, status: res.status, error: json.error ?? "Could not remove photo" };
                }
                setChildAvatarSessionPreview(childId, null);

                const merged = mergeInquiryChildIntoFocusPanelTruth(getTruth?.() ?? truth, {
                    childId,
                    row: { person_id: pid },
                    patch: {
                        identityPatch: {},
                        ocmPatch: {},
                        profilePatch: { [RESOLVED_PHOTO_URL_KEY]: null, photo_url: null },
                    },
                });
                dispatchOpportunityDrawerRecordPatch(opportunityId, merged);
                dispatchDrawerLayoutRuntimeBodyRecordPatch({
                    entityType: "opportunities",
                    entityId: opportunityId,
                    record: merged,
                });
                return { ok: true, photoUrl: null };
            } catch (e) {
                return { ok: false, status: 500, error: e instanceof Error ? e.message : "Could not remove photo" };
            }
        },
        openAddEmergencyContact: () => {
            // Household Focus Panel — one-surface identity-resolved flow (not the
            // legacy four-step wizard). Default scope = all children in household.
            const customerId =
                typeof truth.customer_id === "string" ? truth.customer_id.trim() : "";
            dispatchOpenRelationshipActionModal({
                action_key: "add_emergency_contact",
                opportunity_id: opportunityId,
                source_surface: "opportunity_drawer",
                initial_proposal: {
                    actionKey: "add_emergency_contact",
                    sourceSurface: "opportunity_drawer",
                    sourceRecordId: opportunityId,
                    sourceEntityType: "opportunity",
                    sourceOpportunityId: opportunityId,
                    sourceCustomerId: customerId,
                    scope: "all_children_in_household",
                    confirmationRequired: true,
                },
            });
        },
        openAddEmergencyContactForChild: ({ customerMemberId, childPersonId }) => {
            const customerId = trimOrNull(truth.customer_id);
            dispatchOpenRelationshipActionModal({
                action_key: "add_emergency_contact",
                opportunity_id: opportunityId,
                source_surface: "child_drawer",
                initial_proposal: {
                    actionKey: "add_emergency_contact",
                    sourceSurface: "child_drawer",
                    sourceRecordId: childPersonId?.trim() || customerMemberId.trim(),
                    sourceEntityType: "child",
                    sourceOpportunityId: opportunityId,
                    sourceChildPersonId: childPersonId?.trim() || null,
                    sourceCustomerId: customerId ?? "",
                    anchorCustomerMemberId: customerMemberId.trim(),
                    scope: "this_child",
                    selectedChildCustomerMemberIds: [customerMemberId.trim()],
                },
            });
        },
        openAddAuthorizedPickup: () => {
            const customerId =
                typeof truth.customer_id === "string" ? truth.customer_id.trim() : "";
            dispatchOpenRelationshipActionModal({
                action_key: "add_authorized_pickup",
                opportunity_id: opportunityId,
                source_surface: "opportunity_drawer",
                initial_proposal: {
                    actionKey: "add_authorized_pickup",
                    sourceSurface: "opportunity_drawer",
                    sourceRecordId: opportunityId,
                    sourceEntityType: "opportunity",
                    sourceOpportunityId: opportunityId,
                    sourceCustomerId: customerId,
                    scope: "all_children_in_household",
                    confirmationRequired: true,
                },
            });
        },
        makeHouseholdPrimaryContact: async ({ customerId, personId }) => {
            const cid = customerId.trim();
            const pid = personId.trim();
            if (!cid || !pid) return { ok: false, status: 400, error: "Customer and person required" };
            try {
                await patchHouseholdPrimaryContact(cid, pid);
                const baseline = getTruth?.() ?? truth;
                const merged = applyLeadPrimaryContactToOpportunityRecord(baseline, cid, pid);
                dispatchOpportunityDrawerRecordPatch(opportunityId, merged);
                dispatchDrawerLayoutRuntimeBodyRecordPatch({
                    entityType: "opportunities",
                    entityId: opportunityId,
                    record: merged,
                });
                return { ok: true };
            } catch (e) {
                return {
                    ok: false,
                    status: 500,
                    error: e instanceof Error ? e.message : "Make primary failed",
                };
            }
        },
        savePersonChildRelationship: async (relationshipId, customerMemberId, patch) => {
            const res = await patchPersonChildRelationshipFromFocusPanel({
                relationshipId,
                body: patch,
                fetchFn: f,
            });
            if (!res.ok) return res;
            if (res.relationship) {
                const merged = mergePersonChildRelationshipIntoFocusPanelTruth(truth, res.relationship);
                dispatchOpportunityDrawerRecordPatch(opportunityId, merged);
                dispatchDrawerLayoutRuntimeBodyRecordPatch({
                    entityType: "opportunities",
                    entityId: opportunityId,
                    record: merged,
                });
            }
            return { ok: true };
        },
        removeEmergencyContactRole: async ({ relationshipId, customerMemberId }) => {
            const res = await removePersonChildRelationshipRoleFromFocusPanel({
                relationshipId,
                roleKey: "emergency_contact",
                fetchFn: f,
            });
            if (!res.ok) return res;
            const merged = applyEmergencyRoleRemovalToTruth(truth, {
                relationshipId,
                customerMemberId,
            });
            dispatchOpportunityDrawerRecordPatch(opportunityId, merged);
            dispatchDrawerLayoutRuntimeBodyRecordPatch({
                entityType: "opportunities",
                entityId: opportunityId,
                record: merged,
            });
            return { ok: true };
        },
                tour: {
            cancelTour: async (bookingId) => {
                try {
                    await postTourBookingAction(bookingId, "/cancel");
                    dispatchOpportunityTourUpdated(opportunityId, "cancel_tour");
                    return { ok: true };
                } catch (e) {
                    return { ok: false, status: 500, error: e instanceof Error ? e.message : "Cancel failed" };
                }
            },
            confirmTour: async (bookingId) => {
                try {
                    await postTourBookingAction(bookingId, "/confirm");
                    dispatchOpportunityTourUpdated(opportunityId, "confirm_tour");
                    return { ok: true };
                } catch (e) {
                    return { ok: false, status: 500, error: e instanceof Error ? e.message : "Confirm failed" };
                }
            },
            openTourScheduleModal: ({ opportunityId: oppId, actionKey = "schedule_tour" }) => {
                if (typeof window === "undefined") return;
                window.dispatchEvent(
                    new CustomEvent(ADMINV2_OPEN_TOUR_SCHEDULE_MODAL, {
                        detail: { opportunity_id: oppId, action_key: actionKey },
                    }),
                );
            },
            dispatchTourUpdated: (oppId, actionKey) => dispatchOpportunityTourUpdated(oppId, actionKey),
        },
        communications: {
            cancelScheduledSend: async (sendId) => {
                try {
                    const res = await f(`/api/admin/communication-scheduled-sends/${encodeURIComponent(sendId)}`, {
                        method: "PATCH",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: "canceled" }),
                    });
                    const json = (await res.json().catch(() => ({}))) as { error?: string };
                    if (!res.ok) return { ok: false, status: res.status, error: json.error ?? "Cancel failed" };
                    return { ok: true };
                } catch (e) {
                    return { ok: false, status: 500, error: e instanceof Error ? e.message : "Cancel failed" };
                }
            },
        },
    };
}

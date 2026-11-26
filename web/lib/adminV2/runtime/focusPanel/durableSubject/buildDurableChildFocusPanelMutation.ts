"use client";

/**
 * THE MUTATION SEAM FOR A DURABLE CHILD — the same authorities, without the case.
 *
 * The canonical Children card is editable because a host injects a `FocusPanelMutation`. Give it
 * none and it renders read-only, which is how a hosted card quietly becomes a different card: same
 * fields, same labels, same order, and no way to change anything. The convergence rule is that a
 * card keeps its ACTIONS across hosts, so a durable host has to supply this rather than omit it.
 *
 * ── IT IS NOT A SECOND WRITE PATH ──
 *
 * Every write here calls the function `buildOpportunityFocusPanelMutation` calls:
 * `patchInquiryChildIdentityFromDrawer` for name and date of birth,
 * `patchCustomerMemberFromInquiryChild` for the profile scalars, and the person profile-photo route
 * for the avatar. None of them takes an opportunity and none ever did — a child's identity is a
 * child fact. What required a case was the ORCHESTRATION around them: an OCM-shaped row, an
 * optimistic merge into opportunity truth, and refresh events addressed to a drawer.
 *
 * So this is that orchestration minus the parts only a case has. Instead of dispatching
 * opportunity-scoped record patches it calls `onSaved`, and the durable host reloads the record it
 * already knows how to load.
 *
 * ── PARTICIPATION IS REFUSED, OUT LOUD ──
 *
 * Program, room, schedule type and start date live on the opportunity-customer-member row. A durable
 * host has no participation to write them to, and creating one so an edit could land would make
 * enrollment a side effect of typing in a field. Those fields still RENDER, configured and in order;
 * an attempt to save one comes back as a refusal that says where they are edited instead.
 *
 * The same rule governs what is absent below. A capability this host cannot honestly perform returns
 * a refusal rather than `{ok:true}`, because a save that reports success and writes nothing is the
 * one failure an operator cannot detect.
 */

import {
    patchCustomerMemberFromInquiryChild,
    patchInquiryChildIdentityFromDrawer,
} from "@/lib/admin/drawer/inquiryChildFieldEdit";
import { setChildAvatarSessionPreview } from "@/lib/adminV2/runtime/focusPanel/children/childAvatarSessionPreview";
import { broadcastWorkspaceMutation } from "@/lib/adminV2/workspaceRefreshBroadcast";
import {
    patchPersonChildRelationshipFromFocusPanel,
    removePersonChildRelationshipRoleFromFocusPanel,
} from "@/lib/adminV2/runtime/focusPanel/emergencyContacts/focusPanelPersonChildRelationshipMutation";
import type {
    FocusPanelMutation,
    FocusPanelSaveResult,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import type { DurableChildSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableChildSubjectModel";

/** What a durable host cannot do, said once so every branch below says it identically. */
const NOT_ON_A_RECORD_HOST: FocusPanelSaveResult = {
    ok: false,
    status: 501,
    error: "This action belongs to a case and is not available from the record.",
};

const PARTICIPATION_ELSEWHERE: FocusPanelSaveResult = {
    ok: false,
    status: 409,
    error: "This field belongs to an enrollment and is edited there.",
};

export function buildDurableChildFocusPanelMutation(input: {
    subject: DurableChildSubject;
    canMutate: boolean;
    /** Fired after a successful write so the host can reload the record it composed. */
    onSaved?: () => void;
    fetchFn?: typeof fetch;
}): FocusPanelMutation {
    const { subject, canMutate, onSaved } = input;
    const f = input.fetchFn ?? fetch;

    return {
        canEdit: canMutate,

        saveInquiryChild: async ({ childId, row, patch, identityBaseline }) => {
            const memberId = (row.customer_member_id ?? "").trim() || subject.memberId;
            if (!memberId) return { ok: false, status: 400, error: "No child record to edit" };
            if (Object.keys(patch.ocmPatch ?? {}).length > 0) return PARTICIPATION_ELSEWHERE;

            const personId = (row.person_id ?? "") || subject.personId;

            try {
                if (Object.keys(patch.identityPatch).length > 0) {
                    // Routes to `persons` when the child has one and `customer_members` when it does
                    // not — the branch lives in the shared authority, not here.
                    await patchInquiryChildIdentityFromDrawer({
                        row: { customer_member_id: memberId, person_id: personId },
                        draft: { ...identityBaseline, ...patch.identityPatch },
                        baseline: identityBaseline,
                        fetchFn: f,
                    });
                }
                if (patch.profilePatch && Object.keys(patch.profilePatch).length > 0) {
                    // `gender_label` is Focus Panel display only and is not a column.
                    const { gender_label: _genderLabel, ...apiProfile } = patch.profilePatch;
                    if (Object.keys(apiProfile).length > 0) {
                        await patchCustomerMemberFromInquiryChild(memberId, apiProfile);
                    }
                }
            } catch (e) {
                return { ok: false, status: 500, error: e instanceof Error ? e.message : "Save failed" };
            }

            void childId;
            /*
             * ONE CONTRACT, BOTH HOSTS. The case-grain owner emits the identity signal for exactly
             * this reason; a durable-child host editing the SAME name must not converge less. There is
             * no opportunity to name here — the subject is a durable child — so this is the
             * surface-neutral broadcast, which is the honest signal: every mounted projection re-reads
             * because none of them can be matched by a row id.
             */
            if (Object.keys(patch.identityPatch).length > 0) {
                broadcastWorkspaceMutation("inquiry_child_identity");
            }
            onSaved?.();
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
                setChildAvatarSessionPreview(childId, json.photoUrl);
                onSaved?.();
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
                onSaved?.();
                return { ok: true, photoUrl: null };
            } catch (e) {
                return { ok: false, status: 500, error: e instanceof Error ? e.message : "Could not remove photo" };
            }
        },

        // Relationship edits address the edge by its own id and take no case — the same authority the
        // case host calls, reachable here for the same reason child identity is.
        savePersonChildRelationship: async (relationshipId, _customerMemberId, patch) => {
            const result = await patchPersonChildRelationshipFromFocusPanel({
                relationshipId,
                body: patch,
                fetchFn: f,
            });
            if (result.ok) onSaved?.();
            return result.ok ? { ok: true } : result;
        },
        removeEmergencyContactRole: async ({ relationshipId }) => {
            const result = await removePersonChildRelationshipRoleFromFocusPanel({
                relationshipId,
                roleKey: "emergency_contact",
                fetchFn: f,
            });
            if (result.ok) onSaved?.();
            return result.ok ? { ok: true } : result;
        },

        // ── CASE-SCOPED, AND SO REFUSED HERE ────────────────────────────────────────────────────
        //
        // The relationship modals are opened with an `opportunity_id` and compose their proposal
        // around it; the household writes are about a family, not this child. None of them is a
        // capability this slice removes — they are simply not reachable from a child's record, and
        // saying so is more useful than a control that opens nothing.
        savePersonContact: async () => NOT_ON_A_RECORD_HOST,
        makeHouseholdPrimaryContact: async () => NOT_ON_A_RECORD_HOST,
        openAddEmergencyContact: () => {},
        openAddEmergencyContactForChild: () => {},
        openAddAuthorizedPickup: () => {},
        tour: {
            cancelTour: async () => NOT_ON_A_RECORD_HOST,
            confirmTour: async () => NOT_ON_A_RECORD_HOST,
            openTourScheduleModal: () => {},
            dispatchTourUpdated: () => {},
        },
        communications: {
            cancelScheduledSend: async () => NOT_ON_A_RECORD_HOST,
        },
    };
}

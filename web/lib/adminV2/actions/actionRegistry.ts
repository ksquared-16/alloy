/**
 * Action Registry (Phase 2) — the authoritative set of executable action capabilities.
 *
 * - A **registered action** has code-owned handlers (validate / eligibility / preview /
 *   execute). These are the actions the runtime can execute directly.
 * - A **known action key** is either a registered action OR a key present in the
 *   canonical metadata catalog (`CANONICAL_ACTION_REGISTRY`). Config may only reference
 *   known keys; see {@link assertRegisteredActionKey} and config validation.
 *
 * Config (action_definitions / placements) decides *where/when/how* an action shows.
 * The registry decides *what an action is and how it runs*. Config can never invent
 * executable behavior.
 */

import { canonicalActionDefinition } from "@/lib/admin/actions/canonicalActionRegistry";
import type { RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { updateStatusAction } from "@/lib/adminV2/actions/definitions/updateStatusAction";
import { createLeadAction } from "@/lib/adminV2/actions/definitions/createLeadAction";
import { confirmTourAction } from "@/lib/adminV2/actions/definitions/confirmTourAction";
import { scheduleCreateAction } from "@/lib/adminV2/actions/definitions/scheduleCreateAction";
import { assignmentSetPrimaryAction } from "@/lib/adminV2/actions/definitions/assignmentSetPrimaryAction";
import { assignmentCreateAction } from "@/lib/adminV2/actions/definitions/assignmentCreateAction";
import { assignmentPromoteProposedAction } from "@/lib/adminV2/actions/definitions/assignmentPromoteProposedAction";
import { assignmentArchiveAction } from "@/lib/adminV2/actions/definitions/assignmentArchiveAction";
import { assignmentDeleteProposedAction } from "@/lib/adminV2/actions/definitions/assignmentDeleteProposedAction";
import { assignmentChangeRoomAction } from "@/lib/adminV2/actions/definitions/assignmentChangeRoomAction";
import { sendTourInvitationAction } from "@/lib/adminV2/actions/definitions/sendTourInvitationAction";
import { staffAddAction } from "@/lib/adminV2/actions/definitions/staffAddAction";
import { childAddAction } from "@/lib/adminV2/actions/definitions/childAddAction";
import {
    enrollmentDirectAction,
    enrollmentStartAction,
} from "@/lib/adminV2/actions/definitions/enrollmentActions";
import {
    employmentEndAction,
    employmentUpdateAction,
} from "@/lib/adminV2/actions/definitions/employmentEndAction";
import {
    staffPresenceCorrectAction,
    staffPresenceRecordAction,
} from "@/lib/adminV2/actions/definitions/staffPresenceActions";
import { childAttendanceActions } from "@/lib/adminV2/actions/definitions/childAttendanceActions";

/** Actions with fully code-owned, executable handlers. */
const REGISTERED_ACTION_LIST: RegisteredAction[] = [
    updateStatusAction,
    createLeadAction,
    confirmTourAction,
    sendTourInvitationAction,
    scheduleCreateAction,
    assignmentSetPrimaryAction,
    assignmentCreateAction,
    assignmentPromoteProposedAction,
    assignmentArchiveAction,
    assignmentDeleteProposedAction,
    assignmentChangeRoomAction,
    staffAddAction,
    childAddAction,
    enrollmentStartAction,
    enrollmentDirectAction,
    employmentUpdateAction,
    employmentEndAction,
    staffPresenceRecordAction,
    staffPresenceCorrectAction,
    // Child attendance: five operator intents over the existing invariant-owning services.
    ...childAttendanceActions,
];

const REGISTERED_ACTIONS: Map<string, RegisteredAction> = new Map(
    REGISTERED_ACTION_LIST.map((a) => [a.actionKey, a])
);

/** Return the executable action for a key, or null when no handler is registered. */
export function getRegisteredAction(actionKey: string): RegisteredAction | null {
    return REGISTERED_ACTIONS.get((actionKey ?? "").trim()) ?? null;
}

/** True when a key has a code-owned executable handler. */
export function hasRegisteredHandler(actionKey: string): boolean {
    return REGISTERED_ACTIONS.has((actionKey ?? "").trim());
}

/** All keys with executable handlers. */
export function listRegisteredActionKeys(): string[] {
    return [...REGISTERED_ACTIONS.keys()];
}

/**
 * A key is "known" if it has an executable handler OR exists in the canonical metadata
 * catalog (relationship/lifecycle/library). Config may only reference known keys.
 */
export function isKnownActionKey(actionKey: string): boolean {
    const key = (actionKey ?? "").trim();
    if (!key) return false;
    if (REGISTERED_ACTIONS.has(key)) return true;
    return canonicalActionDefinition(key) != null;
}

export type ActionKeyResolution =
    | { status: "registered"; action: RegisteredAction }
    | { status: "known_metadata_only" }
    | { status: "unknown" };

/** Classify a key for diagnostics, config validation, and UI gating. */
export function resolveActionKey(actionKey: string): ActionKeyResolution {
    const action = getRegisteredAction(actionKey);
    if (action) return { status: "registered", action };
    if (isKnownActionKey(actionKey)) return { status: "known_metadata_only" };
    return { status: "unknown" };
}

/**
 * Assert a key is known to the platform. Throws on unknown keys — used by config
 * validation to fail loudly in dev/test when a configured action references an
 * unregistered key.
 */
export function assertRegisteredActionKey(actionKey: string): void {
    if (!isKnownActionKey(actionKey)) {
        throw new Error(
            `Unknown action key "${actionKey}". Configured actions must reference a registered action key. ` +
                `Register a handler in web/lib/adminV2/actions/ or add it to the canonical catalog.`
        );
    }
}

export { REGISTERED_ACTION_LIST };

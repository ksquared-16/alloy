/**
 * THE CONTEXTUAL CHILD CARD — resolved from the tenant's published composition, for ANY host.
 *
 * This is the load-bearing module of the convergence. The invariant it exists to make mechanical:
 *
 *   same subject + same business context + same stage/state
 *     ⇒ the same effective configured card, whichever host renders it.
 *
 * ── HOW IT HOLDS, RATHER THAN HOW IT IS HOPED FOR ──
 *
 * It holds because there is nothing here to disagree with. The configuration is read by the SAME two
 * functions the native Children card reads it with:
 *
 *     effectiveChildrenNestedConfig(doc)          published config, else the platform default
 *     childrenFocusRowsFromNestedConfig(config)   field keys, labels, order, visibility, editability
 *
 * and the `doc` is the SAME `entity_layouts` row, because both hosts resolve it from the same
 * addressing tuple — `(businessProcessKey, workViewId, stageKey, statusKey)` — through the same
 * endpoint and the same `resolveSurfaceVariant`. No configuration is copied, nothing is
 * re-published, and there is no Roster layout: a second copy is what this module exists to avoid,
 * not a shortcut it takes.
 *
 * The host may render these rows flatter or denser. It may not change which rows exist, what they
 * are called, what order they are in, or which of them may be edited — none of which is decided
 * here either. This module only asks.
 *
 * ── VALUES ARE NOT CONFIGURATION ──
 *
 * The equality contract covers field keys, labels, ordering, visibility and editability. Values are
 * data, and the durable host reads them from the subject's own canonical truth.
 *
 * One consequence is worth stating plainly rather than hiding: ENROLLMENT PROJECTIONS (program,
 * room, schedule type, start date, requested days) live on the opportunity-customer-member row, not
 * on the child. A durable host that has not loaded participation shows them as unset. The rows are
 * still present, still configured, still in the configured order — the card is the same card, with
 * facts this host has not fetched. Fabricating them from the child record would be inventing
 * participation, which is exactly the coupling the durable grain removed.
 */

import type { LayoutDoc } from "@/lib/layout/layoutV2";
import type { ChildrenEvidenceChild } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import {
    childrenFocusRowsFromNestedConfig,
    effectiveChildrenNestedConfig,
    type ChildrenFocusFieldRow,
} from "@/lib/adminV2/runtime/focusPanel/children/childrenNestedSurfaceConfig";
import { resolveIdentityFieldValue } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompose";
import { CHILDREN_SURFACE_ID } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { DurableChildSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableChildSubjectModel";

/** A configured row, plus the value this host could resolve for it. */
export type ContextualChildCardRow = ChildrenFocusFieldRow & {
    /** Null means "not set here" — never "not configured", which is `displayed: false`. */
    value: string | null;
};

export type ContextualChildCard = {
    /** The nested surface the configuration came from. Part of the equality contract. */
    nestedSurfaceId: string;
    /** True when a tenant publication was resolved; false means the platform default is in force. */
    fromPublishedDoc: boolean;
    rows: ContextualChildCardRow[];
};

/**
 * The CONFIGURATION half, on its own.
 *
 * Exported separately because it is what equality is asserted on — it takes only the doc, so a test
 * can prove two hosts resolve identical rows without either of them composing a subject at all.
 */
export function contextualChildCardRows(doc: LayoutDoc | null): ChildrenFocusFieldRow[] {
    return childrenFocusRowsFromNestedConfig(effectiveChildrenNestedConfig(doc));
}

/**
 * Map a durable child onto the evidence shape the canonical value resolvers read.
 *
 * ANNOTATED, NEVER CAST. `as ChildrenEvidenceChild` over a partial object would compile and then
 * resolve `undefined` for every field the type requires — a card of empty rows with no error. The
 * annotation forces every required field to be stated, which is also what makes the unset
 * enrollment projections below explicit rather than accidental.
 */
export function childEvidenceFromDurableSubject(subject: DurableChildSubject): ChildrenEvidenceChild {
    const truth = subject.truth ?? {};
    const str = (key: string): string | null => {
        const raw = truth[key];
        if (raw == null) return null;
        const text = String(raw).trim();
        return text || null;
    };

    return {
        id: subject.memberId,
        name: subject.label,
        customerMemberId: subject.memberId,
        personId: subject.personId,
        firstName: str("first_name"),
        lastName: str("last_name"),
        preferredName: str("preferred_name"),
        dob: subject.dateOfBirth,
        gender: str("gender"),
        allergies: str("allergies"),
        medicalNotes: str("medical_notes"),
        specialInstructions: str("special_instructions"),
        initial: (subject.label.trim()[0] ?? "?").toUpperCase(),
        imageUrl: str("resolved_photo_url") ?? str("photo_url"),
        dobAge: null,
        // ── OCM / participation facts. Unset on a durable host by construction, not by omission. ──
        program: null,
        room: null,
        schedule: null,
        teacher: null,
        startDate: null,
        status: str("status_key"),
        statusTone: "neutral",
        needsAttention: false,
        detailLine: null,
        missingLine: null,
        flags: [],
    };
}

/**
 * The full contextual card for a durable child: configured rows, with values where this host has them.
 */
export function resolveContextualChildCard(
    doc: LayoutDoc | null,
    subject: DurableChildSubject,
    options: { fromPublishedDoc: boolean },
): ContextualChildCard {
    const evidence = childEvidenceFromDurableSubject(subject);
    const rows = contextualChildCardRows(doc).map((row) => ({
        ...row,
        value: resolveIdentityFieldValue({ kind: "child", value: evidence }, row.fieldKey),
    }));

    return {
        nestedSurfaceId: CHILDREN_SURFACE_ID,
        fromPublishedDoc: options.fromPublishedDoc,
        rows,
    };
}

/**
 * A stable, comparable fingerprint of the EFFECTIVE CONFIGURATION.
 *
 * This is what the certification asserts equality on across hosts, and it deliberately excludes
 * values: two hosts showing the same card must agree on which fields exist, what they are called,
 * what order they are in, whether they are shown and whether they may be edited. Whether one of
 * them has fetched a participation fact is not a configuration difference.
 *
 * Stated as one string so a browser assertion can compare a single DOM attribute rather than
 * reconstructing an object — a comparison that reconstructs is a comparison that can drift.
 */
export function contextualCardConfigurationFingerprint(rows: readonly ChildrenFocusFieldRow[]): string {
    return rows
        .map((r) =>
            [r.fieldKey, r.label, r.groupKey, r.displayed ? "1" : "0", r.editable ? "1" : "0", r.layoutWidth].join(
                "~",
            ),
        )
        .join("|");
}

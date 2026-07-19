/**
 * Children card evidence (Collection archetype).
 *
 * Operational question: "What is true for each child right now?" — program, room,
 * schedule, enrollment status, desired start. This is the operational truth that
 * does NOT belong in Household (Household is belonging-only: names + count).
 *
 * Derives entirely from the Operational Context (`context.truth._inquiry_children`).
 * No drawer VM, no fetch, no fabricated values — fields render only when present.
 *
 * @see docs/platform/operator/universal-universal-card-archetypes.md (Collection)
 * @see docs/platform/operator/household-reference-card.md (Children vs Household)
 */

import { normalizeFocusPanelChildrenRowsFromTruth } from "@/lib/adminV2/runtime/focusPanel/collections/focusPanelCollectionPresentation";
import { resolveChildPhotoUrlFromRaw } from "@/lib/adminV2/runtime/focusPanel/children/resolveChildPhotoUrl";
import { humanizeStatusKey } from "@/lib/admin/status/humanizeStatusKey";
import { canonicalNewLeadStatusLabel } from "@/lib/lifecycle/enrollmentLeadStageStatusAliases";
import { resolveChildProcessStageLabel } from "@/lib/lifecycle/childEnrollmentProcessStageLabel";
import {
    formatFocusPanelDate,
    formatFocusPanelDobAgeLine,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelDateDisplay";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

export type ChildStatusTone = "positive" | "work" | "risk" | "neutral";

export type ChildEvidenceFlag = {
    label: string;
    tone: "positive" | "risk" | "neutral";
};

export type ChildrenEvidenceChild = {
    id: string;
    name: string;
    /** Canonical household member id for child-scoped relationship evidence. */
    customerMemberId?: string | null;
    personId?: string | null;
    /** Optional identity parts for composed display (Surface Composer identity group). */
    firstName?: string | null;
    lastName?: string | null;
    preferredName?: string | null;
    nickname?: string | null;
    /** ISO date-only when present; display via dobAge. */
    dob?: string | null;
    age?: string | null;
    initial: string;
    /** Identity profile image (evidence model); null → initials fallback. */
    imageUrl: string | null;
    dobAge: string | null;
    program: string | null;
    room: string | null;
    schedule: string | null;
    /** Placement evidence — assigned teacher (no source yet → null → "Not set"). */
    teacher: string | null;
    /** Human-readable start date (Focus Panel date doctrine). */
    startDate: string | null;
    status: string | null;
    statusTone: ChildStatusTone;
    /** Missing operational essentials (program / schedule / start) for this child. */
    needsAttention: boolean;
    /**
     * One operational sentence of present facts — "Preschool · North Room · M–F ·
     * starts Aug 2026" — answer-first evidence, NOT a labeled field grid. Null when
     * nothing operational is set yet.
     */
    detailLine: string | null;
    /** Short "what's missing" sentence for attention children, null when complete. */
    missingLine: string | null;
    /** Real flags only (medical/document); empty when none present. */
    flags: ChildEvidenceFlag[];
};

export type ChildrenCardEvidence = {
    children: ChildrenEvidenceChild[];
    count: number;
    enrolledCount: number;
    waitlistedCount: number;
    attentionCount: number;
    /** Primary answer line. */
    answerLine: string;
    /** Secondary line (attention summary), null when clean. */
    supportingLine: string | null;
    hasAttention: boolean;
};

function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

function statusTone(statusKey: string | null): ChildStatusTone {
    if (!statusKey) return "neutral";
    const key = statusKey.toLowerCase();
    if (key.includes("enroll")) return "positive";
    if (key.includes("declin") || key.includes("withdraw") || key.includes("lost")) return "risk";
    if (key.includes("wait") || key.includes("pending") || key.includes("progress")) return "work";
    return "neutral";
}

function childName(row: {
    display_name: string | null;
    first_name?: string | null;
    last_name?: string | null;
}): string {
    const display = trimOrNull(row.display_name);
    if (display) return display;
    const composed = [trimOrNull(row.first_name), trimOrNull(row.last_name)]
        .filter(Boolean)
        .join(" ");
    return composed || "Child";
}

/**
 * Options for the children evidence build. `childDetailFieldKeys` comes from the
 * PUBLISHED Children Surface config (metadata.nestedSurfaces["children_surface"]) and
 * controls which operational facts appear in each child's detail line, and their order.
 * Absent/empty → the card's default field order (back-compat). Keys not mapped to a
 * detail fact are ignored (e.g. child.name / child.status render elsewhere).
 */
export type BuildChildrenCardEvidenceOptions = {
    childDetailFieldKeys?: readonly string[];
};

export function buildChildrenCardEvidence(
    context: Pick<OperationalContext, "truth">,
    options: BuildChildrenCardEvidenceOptions = {},
): ChildrenCardEvidence {
    const { rows, rawRows } = normalizeFocusPanelChildrenRowsFromTruth(context.truth);

    const children: ChildrenEvidenceChild[] = rows.map((row, index) => {
        const name = childName(row);
        const program = trimOrNull(row.desired_program_label);
        const room = trimOrNull(row.program_room_cohort_label) ?? trimOrNull(row.location_label);
        const schedule = trimOrNull(row.desired_schedule_label);
        const teacher = trimOrNull((row as { teacher_label?: unknown }).teacher_label);
        const startDateIso = trimOrNull(row.start_date)?.slice(0, 10) ?? null;
        const startDate = formatFocusPanelDate(startDateIso);
        const dobAge = formatFocusPanelDobAgeLine(row.dob, row.age);
        // Operator-facing value is the child's PROCESS STAGE (the retired "Participation Status" is
        // gone). Sourced from stage_key where present, else mapped from the stage-equivalent
        // disposition. `statusKey` is retained ONLY to drive tone + the declined attention gate.
        const statusKey = trimOrNull(row.outcome_status_key);
        const processStageLabel = resolveChildProcessStageLabel({
            stageKey: trimOrNull((row as { stage_key?: unknown }).stage_key),
            dispositionKey: statusKey,
        });
        const declined = statusKey?.toLowerCase().includes("declin") ?? false;
        // Active children need the enrollment essentials; declined children do not.
        const needsAttention = !declined && (!program || !schedule || !startDateIso);

        // Answer-first evidence sentence (present facts only, no labels). When the
        // published Children Surface config names an explicit field order, honor it;
        // otherwise use the default program · room · schedule · start order.
        const startsLabel = startDate ? `starts ${startDate}` : null;
        const detailValueByKey: Record<string, string | null> = {
            "inquiry_child.program": program,
            "child.room": room,
            "inquiry_child.schedule_type": schedule,
            "inquiry_child.desired_schedule_type": schedule,
            "child.start_date": startsLabel,
            "child.desired_start_date": startsLabel,
            "child.date_of_birth": dobAge,
        };
        const configuredKeys = (options.childDetailFieldKeys ?? []).filter(
            (k) => k in detailValueByKey,
        );
        const detailParts = (
            configuredKeys.length > 0
                ? configuredKeys.map((k) => detailValueByKey[k])
                : [program, room, schedule, startsLabel]
        ).filter(Boolean) as string[];
        const detailLine = detailParts.length > 0 ? detailParts.join(" · ") : null;

        // "What's still needed" diagnosis for attention children.
        const missing = [
            !program ? "program" : null,
            !schedule ? "schedule" : null,
            !startDateIso ? "start date" : null,
        ].filter(Boolean) as string[];
        const missingLine =
            !declined && missing.length > 0
                ? `Needs ${
                      missing.length === 1
                          ? missing[0]
                          : `${missing.slice(0, -1).join(", ")} & ${missing[missing.length - 1]}`
                  }`
                : null;

        return {
            id: trimOrNull(row.id) ?? trimOrNull(row.person_id) ?? `child-${index}`,
            name,
            customerMemberId: trimOrNull((row as { customer_member_id?: unknown }).customer_member_id),
            personId: trimOrNull(row.person_id),
            firstName: trimOrNull(row.first_name),
            lastName: trimOrNull(row.last_name),
            preferredName: trimOrNull((row as { preferred_name?: unknown }).preferred_name),
            nickname: trimOrNull((row as { nickname?: unknown }).nickname),
            dob: trimOrNull(row.dob)?.slice(0, 10) ?? null,
            age: trimOrNull(row.age),
            initial: name.charAt(0).toUpperCase(),
            imageUrl: resolveChildPhotoUrlFromRaw(rawRows[index] ?? {}),
            dobAge,
            program,
            room,
            schedule,
            teacher,
            startDate,
            // The child's PROCESS STAGE (replaces the retired Participation Status). Falls back to
            // the canonical New Lead label, then humanize; null key → null → badge suppressed.
            status: processStageLabel ?? canonicalNewLeadStatusLabel(statusKey) ?? humanizeStatusKey(statusKey),
            statusTone: statusTone(statusKey),
            needsAttention,
            detailLine,
            missingLine,
            flags: [],
        };
    });

    const count = children.length;
    const enrolledCount = children.filter((c) => c.statusTone === "positive").length;
    const waitlistedCount = children.filter((c) => c.statusTone === "work").length;
    const attentionCount = children.filter((c) => c.needsAttention).length;

    let answerLine: string;
    if (count === 0) {
        answerLine = "No children on this record";
    } else {
        const noun = count === 1 ? "1 child" : `${count} children`;
        const parts: string[] = [];
        if (enrolledCount > 0) parts.push(`${enrolledCount} enrolled`);
        if (waitlistedCount > 0) parts.push(`${waitlistedCount} waitlisted`);
        answerLine = parts.length > 0 ? `${noun} · ${parts.join(", ")}` : noun;
    }

    let supportingLine: string | null = null;
    if (count === 0) {
        supportingLine = "Add a child to begin";
    } else if (attentionCount > 0) {
        const subject =
            attentionCount === 1
                ? children.find((c) => c.needsAttention)?.name ?? "1 child"
                : `${attentionCount} children`;
        supportingLine = `${subject} ${attentionCount === 1 ? "needs" : "need"} program & schedule`;
    }

    return {
        children,
        count,
        enrolledCount,
        waitlistedCount,
        attentionCount,
        answerLine,
        supportingLine,
        hasAttention: attentionCount > 0,
    };
}

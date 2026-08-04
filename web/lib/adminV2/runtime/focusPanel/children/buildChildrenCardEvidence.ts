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
import {
    projectCompactScheduleForIdentity,
    readSchedulingProjectionByMemberId,
} from "@/lib/scheduling/projection/projectCompactScheduleForIdentity";
import { humanizeStatusKey } from "@/lib/admin/status/humanizeStatusKey";
import { canonicalNewLeadStatusLabel } from "@/lib/lifecycle/enrollmentLeadStageStatusAliases";
import { resolveChildProcessStageLabel } from "@/lib/lifecycle/childEnrollmentProcessStageLabel";
import {
    formatFocusPanelDate,
    formatFocusPanelDobAgeLine,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelDateDisplay";
import { resolveInquiryChildGenderLabelFromRaw } from "@/lib/admin/drawer/inquiryChildrenHydration";
import { personDrawerGenderDisplayLabel } from "@/lib/admin/person/personDrawerGenderField";
import { primaryAssignmentFromScheduling } from "@/lib/adminV2/runtime/focusPanel/identity/assignmentProgramRoomGating";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import {
    resolvePreferredWeekdays,
    resolveRequestedDaysPerWeek,
    resolveRequestedStart,
} from "@/lib/enrollment/effectiveDateAuthority";
import { formatWeekdays } from "@/lib/scheduling/projection/buildSchedulingProjection";

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
    /** Person gender label when present on the child row (display only unless write contract exists). */
    gender?: string | null;
    allergies?: string | null;
    medicalNotes?: string | null;
    specialInstructions?: string | null;
    /** Age band label when present on the child row (computed / projected — read-only). */
    ageBand?: string | null;
    /**
     * Site / school location display label (never the raw `location_id` UUID).
     * Child-owned label when set; otherwise inherits the lead/opportunity site label.
     */
    location?: string | null;
    /**
     * Effective site id for Program options + Location selects:
     * child-owned `location_id`, else lead/opportunity site.
     */
    locationId?: string | null;
    /** Child-owned site id only (null when unset — display may still inherit lead). */
    locationOwnedId?: string | null;
    /** True when display/effective site comes from the lead because the child has none. */
    locationInherited?: boolean;
    /** Stored program category FK — used when editing Program (select value). */
    programCategoryId?: string | null;
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
    /**
     * Family Requested Start when distinct from OCM display — same grain as startDate
     * when participation metadata owns the preferred date.
     * Optional on the evidence type so fixtures and partial projections remain valid
     * when request fields are not configured on Children.
     */
    requestedStart?: string | null;
    /** Requested days/week label (e.g. "3 days per week"); null when unset. */
    requestedDaysPerWeek?: string | null;
    /** Preferred weekdays label (e.g. "Mon, Wed, Fri"); null when unset. */
    preferredWeekdays?: string | null;
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
    /** OCM participation notes when present. */
    notes?: string | null;
    /** Primary assignment owns Program/Room when true — inquiry Program is read-only. */
    hasCommittedPrimaryAssignment?: boolean;
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

/** Match drawer row → raw `_inquiry_children` entry (policy may reorder vs raw index). */
function rawInquiryChildForRow(
    row: { id?: string | null; person_id?: string | null; customer_member_id?: string | null },
    rawRows: readonly Record<string, unknown>[],
): Record<string, unknown> {
    const id = trimOrNull(row.id);
    const personId = trimOrNull(row.person_id);
    const memberId = trimOrNull(row.customer_member_id);
    return (
        rawRows.find((raw) => {
            const rid = trimOrNull(raw.id);
            const rpid = trimOrNull(raw.person_id);
            const rcm = trimOrNull(raw.customer_member_id);
            if (id && (rid === id || rcm === id || rpid === id)) return true;
            if (memberId && (rcm === memberId || rid === memberId)) return true;
            if (personId && rpid === personId) return true;
            return false;
        }) ?? {}
    );
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

function participationMetaForMember(
    truth: Record<string, unknown>,
    memberId: string | null,
    row: Record<string, unknown>,
    raw: Record<string, unknown>,
): Record<string, unknown> {
    const bag = truth._enrollment_participation_by_member;
    if (memberId && bag && typeof bag === "object" && !Array.isArray(bag)) {
        const fromBag = (bag as Record<string, unknown>)[memberId];
        if (fromBag && typeof fromBag === "object" && !Array.isArray(fromBag)) {
            return fromBag as Record<string, unknown>;
        }
    }
    const nested = row.participation_metadata ?? raw.participation_metadata;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
        return nested as Record<string, unknown>;
    }
    const meta: Record<string, unknown> = {};
    for (const key of ["start_date", "requested_days_per_week", "weekdays"] as const) {
        if (row[key] !== undefined) meta[key] = row[key];
        else if (raw[key] !== undefined) meta[key] = raw[key];
    }
    return meta;
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
    const schedulingByMember = readSchedulingProjectionByMemberId(context.truth);
    // Lead/opportunity site — Create Lead writes here even when child participation
    // location_id is still empty; Program options and Location display inherit it.
    const opportunitySiteId =
        trimOrNull(context.truth.location_id)
        ?? trimOrNull(context.truth._location_id);
    const opportunitySiteLabel =
        trimOrNull(context.truth._location_label)
        ?? trimOrNull(context.truth._location_name)
        ?? trimOrNull(context.truth["opportunity.location"]);

    const children: ChildrenEvidenceChild[] = rows.map((row, index) => {
        const raw = rawInquiryChildForRow(row, rawRows);
        const name = childName(row);
        const memberId =
            trimOrNull((row as { customer_member_id?: unknown }).customer_member_id)
            ?? trimOrNull(row.id)
            ?? trimOrNull(row.person_id);
        const schedulingProjection = memberId ? schedulingByMember[memberId] ?? null : null;
        const scheduleCompact = projectCompactScheduleForIdentity(schedulingProjection);
        // Canonical gate (shared with the Identity surface's Program/Room fields):
        // once a committed Primary Assignment exists, it — not the inquiry's desired
        // Program/Room — is operational truth.
        const primaryAssignment = primaryAssignmentFromScheduling(schedulingProjection);
        const hasCommittedPrimaryAssignment = primaryAssignment != null;
        const program =
            primaryAssignment?.program
            ?? trimOrNull(schedulingProjection?.child?.program)
            ?? trimOrNull(row.desired_program_label)
            ?? trimOrNull((raw as { desired_program_label?: unknown }).desired_program_label);
        const childLocationId =
            trimOrNull(row.location_id)
            ?? trimOrNull((raw as { location_id?: unknown }).location_id)
            ?? trimOrNull(schedulingProjection?.child?.siteId);
        // Site name for Location fields — never expose the UUID storage key as display truth.
        const location =
            trimOrNull(row.location_label)
            ?? trimOrNull((raw as { location_label?: unknown }).location_label)
            ?? trimOrNull(schedulingProjection?.child?.siteName)
            ?? (childLocationId && opportunitySiteId && childLocationId === opportunitySiteId
                ? opportunitySiteLabel
                : null)
            ?? (!childLocationId ? opportunitySiteLabel : null);
        const room =
            primaryAssignment?.room
            ?? scheduleCompact.roomLabel
            ?? trimOrNull(row.program_room_cohort_label);
        const schedule = scheduleCompact.scheduleLabel ?? trimOrNull(row.desired_schedule_label);
        const teacher = trimOrNull((row as { teacher_label?: unknown }).teacher_label);
        const startDateIso = trimOrNull(row.start_date)?.slice(0, 10) ?? null;
        const startDate = formatFocusPanelDate(startDateIso);
        const participationMeta = participationMetaForMember(
            context.truth as Record<string, unknown>,
            memberId,
            row as unknown as Record<string, unknown>,
            raw,
        );
        const requestedStartIso = resolveRequestedStart({
            processInstanceMetadata: participationMeta,
            ocmStartDate: startDateIso,
            opportunityDesiredStartDate: null,
        });
        const requestedStart = formatFocusPanelDate(requestedStartIso);
        const requestedDaysN = resolveRequestedDaysPerWeek(participationMeta);
        const requestedDaysPerWeek =
            requestedDaysN != null
                ? `${requestedDaysN} day${requestedDaysN === 1 ? "" : "s"} per week`
                : null;
        const preferredDays = resolvePreferredWeekdays(participationMeta);
        const preferredWeekdays =
            preferredDays.length > 0 ? formatWeekdays(preferredDays) : null;
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
            "inquiry_child.location_id": location,
            "child.location": location,
            "child.room": room,
            "inquiry_child.schedule_type": schedule,
            "inquiry_child.desired_schedule_type": schedule,
            "child.start_date": startsLabel,
            "child.desired_start_date": startsLabel,
            "inquiry_child.start_date": requestedStart ? `starts ${requestedStart}` : startsLabel,
            "inquiry_child.requested_days_per_week": requestedDaysPerWeek,
            "inquiry_child.weekdays": preferredWeekdays,
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
            id:
                trimOrNull(row.id)
                ?? trimOrNull((row as { customer_member_id?: unknown }).customer_member_id)
                ?? trimOrNull(row.person_id)
                ?? trimOrNull(raw.customer_member_id)
                ?? trimOrNull(raw.person_id)
                ?? `child-${index}`,
            name,
            customerMemberId:
                trimOrNull((row as { customer_member_id?: unknown }).customer_member_id)
                ?? trimOrNull(raw.customer_member_id),
            personId: trimOrNull(row.person_id) ?? trimOrNull(raw.person_id),
            firstName: trimOrNull(row.first_name),
            lastName: trimOrNull(row.last_name),
            preferredName: trimOrNull((row as { preferred_name?: unknown }).preferred_name),
            nickname: trimOrNull((row as { nickname?: unknown }).nickname),
            dob: trimOrNull(row.dob)?.slice(0, 10) ?? null,
            age: trimOrNull(row.age),
            // Drawer-row mapping strips profile fields — gender lives on raw inquiry rows
            // (and after inline save merge into `_inquiry_children`). Prefer display labels.
            gender:
                personDrawerGenderDisplayLabel(raw)
                ?? trimOrNull((raw as { gender_label?: unknown }).gender_label)
                ?? resolveInquiryChildGenderLabelFromRaw(raw)
                ?? trimOrNull((row as { gender_label?: unknown }).gender_label)
                ?? trimOrNull((row as { gender?: unknown }).gender),
            allergies:
                trimOrNull((raw as { allergies?: unknown }).allergies)
                ?? trimOrNull((row as { allergies?: unknown }).allergies),
            medicalNotes:
                trimOrNull((raw as { medical_notes?: unknown }).medical_notes)
                ?? trimOrNull((row as { medical_notes?: unknown }).medical_notes),
            specialInstructions:
                trimOrNull((raw as { special_instructions?: unknown }).special_instructions)
                ?? trimOrNull((row as { special_instructions?: unknown }).special_instructions),
            ageBand:
                trimOrNull((row as { age_band?: unknown }).age_band)
                ?? trimOrNull((row as { age_band_label?: unknown }).age_band_label)
                ?? trimOrNull((raw as { age_band?: unknown }).age_band)
                ?? trimOrNull((raw as { age_band_label?: unknown }).age_band_label),
            initial: name.charAt(0).toUpperCase(),
            imageUrl:
                resolveChildPhotoUrlFromRaw(raw)
                ?? resolveChildPhotoUrlFromRaw(row as unknown as Record<string, unknown>),
            dobAge,
            program,
            location,
            locationId: childLocationId ?? opportunitySiteId,
            locationOwnedId: childLocationId,
            locationInherited: !childLocationId && Boolean(opportunitySiteId),
            programCategoryId:
                trimOrNull(row.program_category_id)
                ?? trimOrNull((raw as { program_category_id?: unknown }).program_category_id),
            room,
            schedule,
            teacher,
            startDate,
            requestedStart,
            requestedDaysPerWeek,
            preferredWeekdays,
            // The child's PROCESS STAGE (replaces the retired Participation Status). Falls back to
            // the canonical New Lead label, then humanize; null key → null → badge suppressed.
            status: processStageLabel ?? canonicalNewLeadStatusLabel(statusKey) ?? humanizeStatusKey(statusKey),
            statusTone: statusTone(statusKey),
            needsAttention,
            detailLine,
            missingLine,
            flags: [],
            notes: trimOrNull((row as { notes?: unknown }).notes),
            hasCommittedPrimaryAssignment,
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

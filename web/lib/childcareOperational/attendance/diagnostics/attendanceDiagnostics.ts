/**
 * "Why isn't Attendance working?" — answered from canonical facts, in operator
 * language.
 *
 * Pure and deterministic. Every fact it needs is handed in; it opens nothing.
 * That is deliberate and it is the same shape `kioskChildEligibility` uses: a
 * diagnostic that does its own reads would be a fourth place that can disagree
 * with the runtime about who may capture.
 *
 * ── ONLY REASONS THE DATA CAN ACTUALLY SUPPORT ──
 *
 * Every code below corresponds to a fact somebody wrote down. There is no
 * "probably a network issue", no "check your configuration", and nothing derived
 * from `last_seen_at`, which nothing writes. A diagnostic that guesses is worse
 * than no diagnostic: it sends an administrator to fix the wrong thing, and it is
 * believed because it appeared in a panel labelled diagnostics.
 *
 * ── REASON CODES UNDERNEATH, OPERATOR COPY ABOVE ──
 *
 * The code is stable and machine-readable, for tests and support. The copy names
 * no table, no permission key, no producer key and no enum. An administrator
 * reading "attendance_capture_scope is unset on user_access_profiles" learns
 * nothing they can act on; "nobody has said whose attendance this person can
 * record" tells them what to do, and the link takes them there.
 *
 * ── ABSENCE IS NOT A FAULT ──
 *
 * A subject with nothing wrong yields an empty list, never a reassuring "all
 * good" entry. The panel is meant to be empty most of the time.
 */

export type AttendanceDiagnosticCode =
    | "user_not_linked_to_person"
    | "capture_scope_unset"
    | "assigned_capture_without_assignment"
    | "kiosk_revoked"
    | "kiosk_site_mismatch"
    | "producer_revoked"
    | "producer_missing_site_grant"
    | "producer_mapping_unresolved"
    | "pickup_authority_absent"
    | "safeguarding_unresolved"
    | "child_without_committed_placement"
    | "location_hierarchy_unresolvable";

/**
 * `blocking` — attendance cannot be recorded until this is fixed.
 * `attention` — attendance works, but something is not as an operator expects.
 */
export type DiagnosticSeverity = "blocking" | "attention";

export type AttendanceDiagnostic = {
    code: AttendanceDiagnosticCode;
    severity: DiagnosticSeverity;
    /** One short operator-facing sentence. Never names an implementation noun. */
    title: string;
    /** What to do about it, in the same register. */
    detail: string;
    /** Where to go and fix it, when a surface owns it. */
    settingsHref: string | null;
};

/* ------------------------------------------------------------------ */
/* Staff capture                                                       */
/* ------------------------------------------------------------------ */

export type StaffCaptureFacts = {
    /** Whether the signed-in user resolves to a canonical Person. */
    linkedToPerson: boolean;
    /**
     * The stored capture scope, or null when no access profile exists at all.
     * `null` is NOT "site": an unasked question is not a permissive answer.
     */
    captureScope: "site" | "assigned" | null;
    /** How many current room/group assignments this person holds. */
    assignmentCount: number;
};

export function diagnoseStaffCapture(facts: StaffCaptureFacts): AttendanceDiagnostic[] {
    const out: AttendanceDiagnostic[] = [];

    if (!facts.linkedToPerson) {
        out.push({
            code: "user_not_linked_to_person",
            severity: "blocking",
            title: "This login is not connected to a person record",
            detail:
                "Attendance is recorded by a person, not by a login. Connect this account to the staff member it belongs to.",
            settingsHref: "/adminV2/settings/users-roles",
        });
    }

    if (facts.captureScope === null) {
        out.push({
            code: "capture_scope_unset",
            severity: "blocking",
            title: "Nobody has said whose attendance this person can record",
            detail:
                "Choose whether they can record for any child at their locations, or only for the rooms and groups they are assigned to.",
            settingsHref: "/adminV2/settings/users-roles",
        });
    }

    // Only meaningful once the scope actually depends on assignments. Raising it
    // for a site-scoped person would send an administrator to fix a setting that
    // has no bearing on what they can do.
    if (facts.captureScope === "assigned" && facts.assignmentCount === 0) {
        out.push({
            code: "assigned_capture_without_assignment",
            severity: "blocking",
            title: "This person can only record for rooms they are assigned to, and they have none",
            detail:
                "Either assign them to the rooms or groups they work in, or let them record for any child at their locations.",
            settingsHref: "/adminV2/settings/users-roles",
        });
    }

    return out;
}

/* ------------------------------------------------------------------ */
/* Devices                                                             */
/* ------------------------------------------------------------------ */

export type DeviceFacts = {
    status: "active" | "revoked";
    deviceSiteLocationId: string;
    /** The site whose attendance the operator expected this device to record. */
    expectedSiteLocationId: string | null;
};

export function diagnoseDevice(facts: DeviceFacts): AttendanceDiagnostic[] {
    const out: AttendanceDiagnostic[] = [];

    if (facts.status === "revoked") {
        out.push({
            code: "kiosk_revoked",
            severity: "blocking",
            title: "This device has been revoked",
            detail: "It can no longer record attendance. Add a new device to replace it.",
            settingsHref: "/adminV2/settings/attendance-devices",
        });
        // A revoked device's site binding is not the operator's problem, and
        // reporting both would suggest two things need fixing.
        return out;
    }

    if (
        facts.expectedSiteLocationId &&
        facts.expectedSiteLocationId !== facts.deviceSiteLocationId
    ) {
        out.push({
            code: "kiosk_site_mismatch",
            severity: "blocking",
            title: "This device belongs to a different site",
            detail:
                "A device records attendance for one site only. Add a device for this site instead of moving this one.",
            settingsHref: "/adminV2/settings/attendance-devices",
        });
    }

    return out;
}

/* ------------------------------------------------------------------ */
/* External producers                                                  */
/* ------------------------------------------------------------------ */

export type ProducerFacts = {
    status: "active" | "revoked";
    grantedSiteLocationIds: readonly string[];
    /** The site the operator expected this system to be recording for. */
    expectedSiteLocationId: string | null;
    /** Events that arrived and could not be matched to a child or room. */
    unresolvedMappingCount: number;
};

export function diagnoseProducer(facts: ProducerFacts): AttendanceDiagnostic[] {
    const out: AttendanceDiagnostic[] = [];

    if (facts.status === "revoked") {
        out.push({
            code: "producer_revoked",
            severity: "blocking",
            title: "This system has been revoked",
            detail: "It can no longer record attendance. Nothing it sends will be accepted.",
            settingsHref: "/adminV2/settings/attendance-integrations",
        });
        return out;
    }

    if (
        facts.expectedSiteLocationId &&
        !facts.grantedSiteLocationIds.includes(facts.expectedSiteLocationId)
    ) {
        out.push({
            code: "producer_missing_site_grant",
            severity: "blocking",
            title: "This system is not allowed to record for this site",
            detail: "Add the site to the list of places this system may record attendance for.",
            settingsHref: "/adminV2/settings/attendance-integrations",
        });
    }

    if (facts.unresolvedMappingCount > 0) {
        out.push({
            code: "producer_mapping_unresolved",
            severity: "attention",
            title:
                facts.unresolvedMappingCount === 1 ?
                    "One record arrived that could not be matched to a child or room"
                :   `${facts.unresolvedMappingCount} records arrived that could not be matched to a child or room`,
            detail:
                "The system sent attendance for someone Alloy could not identify. Matching them will let those records be applied.",
            settingsHref: "/adminV2/settings/attendance-integrations",
        });
    }

    return out;
}

/* ------------------------------------------------------------------ */
/* One child                                                           */
/* ------------------------------------------------------------------ */

export type ChildAttendanceFacts = {
    /** Whether the child has an active committed placement anywhere. */
    hasCommittedPlacement: boolean;
    /** Whether safeguarding has ever been ASKED for this child. */
    safeguardingScreened: boolean;
    /** How many adults may currently collect this child. */
    authorizedPickupCount: number;
    /** True when the child's room could not be resolved to a site by ancestry. */
    locationHierarchyUnresolvable: boolean;
};

export function diagnoseChild(facts: ChildAttendanceFacts): AttendanceDiagnostic[] {
    const out: AttendanceDiagnostic[] = [];

    if (!facts.hasCommittedPlacement) {
        out.push({
            code: "child_without_committed_placement",
            severity: "blocking",
            title: "This child is not enrolled in a room or group",
            detail:
                "Attendance is recorded against a child's place in a group. Add their placement to start recording.",
            settingsHref: null,
        });
    }

    if (facts.locationHierarchyUnresolvable) {
        out.push({
            code: "location_hierarchy_unresolvable",
            severity: "blocking",
            title: "This child's room does not belong to a site",
            detail:
                "A room has to sit under a site, on its own or inside a larger space. Check where this room sits.",
            settingsHref: "/adminV2/settings/locations",
        });
    }

    if (!facts.safeguardingScreened) {
        // Unscreened blocks COLLECTION, not attendance generally, and the copy
        // says so: an administrator told "attendance is broken" would go looking
        // in the wrong place entirely.
        out.push({
            code: "safeguarding_unresolved",
            severity: "attention",
            title: "Nobody has recorded whether there are safeguarding arrangements for this child",
            detail:
                "Until that question is answered, no adult can be confirmed to collect this child at a device. Staff can still release them in person.",
            settingsHref: null,
        });
    } else if (facts.authorizedPickupCount === 0) {
        out.push({
            code: "pickup_authority_absent",
            severity: "attention",
            title: "No adult is listed as able to collect this child",
            detail:
                "Add the adults the family has authorized to collect them. Being a parent on the record is not the same as being authorized to collect.",
            settingsHref: null,
        });
    }

    return out;
}

/** Blocking first, then attention; stable within a severity. */
export function sortDiagnostics(diagnostics: readonly AttendanceDiagnostic[]): AttendanceDiagnostic[] {
    const rank: Record<DiagnosticSeverity, number> = { blocking: 0, attention: 1 };
    return [...diagnostics].sort((a, b) => rank[a.severity] - rank[b.severity]);
}

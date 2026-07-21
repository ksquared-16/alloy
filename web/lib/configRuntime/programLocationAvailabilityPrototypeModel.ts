/**
 * Stage 1 — Programs → Locations availability prototype.
 * Non-mutating adapter + operator vocabulary. Production wiring is Stage 3.
 */

export const PROGRAM_LOCATION_AVAILABILITY_STAGE = "prototype" as const;

export function isProgramLocationAvailabilityPrototype(): boolean {
    return PROGRAM_LOCATION_AVAILABILITY_STAGE === "prototype";
}

/** Operator-facing status vocabulary (Programs domain). */
export const PROGRAM_LOCATION_STATUS_LABEL = {
    organizationDefinition: "Organization definition",
    availableAtLocation: "Available at Location",
    inheritsOrganization: "Inherits Organization",
    locallyConfigured: "Locally configured",
    notAvailable: "Not available",
    blocked: "Blocked",
    restoreOrganizationDefault: "Restore Organization default",
} as const;

export type ProgramLocationAvailabilityStatus =
    | "eligible_new"
    | "already_associated_inherits"
    | "already_associated_local"
    | "blocked"
    | "not_available";

export type PrototypeLocationRow = {
    id: string;
    label: string;
    status: ProgramLocationAvailabilityStatus;
    blockReason?: string;
};

export type PrototypePreviewResult = {
    programLabel: string;
    selectedCount: number;
    newAssociations: readonly PrototypeLocationRow[];
    existingAssociations: readonly PrototypeLocationRow[];
    unchangedLocal: readonly PrototypeLocationRow[];
    inheritsOrganization: readonly PrototypeLocationRow[];
    blocked: readonly PrototypeLocationRow[];
    confirmationCopy: string;
    refreshExpectation: string;
};

export type PrototypeApplyResult = {
    status: "committed" | "partial" | "blocked";
    programId: string;
    programLabel: string;
    createdProgram: boolean;
    associatedLocationIds: string[];
    unchangedLocationIds: string[];
    blocked: Array<{ locationId: string; label: string; reason: string }>;
    successCopy: string;
};

const SESSION_KEY = "alloy.programLocationAvailability.prototype.v1";

type SessionState = {
    /** programId → locationIds made available in this browser session (fixture apply). */
    applied: Record<string, string[]>;
    /** locationId → programIds with simulated local configuration. */
    locallyConfigured: Record<string, string[]>;
    /** Simulated org definition edits (impact counts only). */
    orgDefinitionEditCount: number;
};

/** In-memory fallback when sessionStorage is unavailable (SSR / Vitest node). */
let memorySession: SessionState = {
    applied: {},
    locallyConfigured: {},
    orgDefinitionEditCount: 0,
};

function emptySession(): SessionState {
    return { applied: {}, locallyConfigured: {}, orgDefinitionEditCount: 0 };
}

function readSession(): SessionState {
    if (typeof window === "undefined" || typeof sessionStorage === "undefined") {
        return {
            applied: { ...memorySession.applied },
            locallyConfigured: { ...memorySession.locallyConfigured },
            orgDefinitionEditCount: memorySession.orgDefinitionEditCount,
        };
    }
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return emptySession();
        const parsed = JSON.parse(raw) as SessionState;
        return {
            applied: parsed.applied ?? {},
            locallyConfigured: parsed.locallyConfigured ?? {},
            orgDefinitionEditCount: parsed.orgDefinitionEditCount ?? 0,
        };
    } catch {
        return emptySession();
    }
}

function writeSession(next: SessionState): void {
    memorySession = {
        applied: { ...next.applied },
        locallyConfigured: { ...next.locallyConfigured },
        orgDefinitionEditCount: next.orgDefinitionEditCount,
    };
    if (typeof window === "undefined" || typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
}

export function resetProgramLocationAvailabilityPrototypeSession(): void {
    memorySession = emptySession();
    if (typeof window === "undefined" || typeof sessionStorage === "undefined") return;
    sessionStorage.removeItem(SESSION_KEY);
}

/** Deterministic fixture: every Nth location is blocked for prototype demos. */
export function isPrototypeBlockedLocation(locationId: string, index: number): boolean {
    // Stable: block ~5% by index, plus any id containing "archive" / "inactive"
    const lower = locationId.toLowerCase();
    if (lower.includes("archive") || lower.includes("inactive") || lower.includes("closed")) {
        return true;
    }
    return index > 0 && index % 17 === 0;
}

export function resolvePrototypeLocationRows(input: {
    locations: readonly { id: string; label: string }[];
    programId: string | null;
    /** Real associations from live data. */
    alreadyAssociatedIds: ReadonlySet<string>;
    /** Optional: locations that already have local description override in live data. */
    locallyConfiguredIds?: ReadonlySet<string>;
}): PrototypeLocationRow[] {
    const session = readSession();
    const applied =
        input.programId != null ? new Set(session.applied[input.programId] ?? []) : new Set<string>();
    const localFromSession = new Set(
        Object.entries(session.locallyConfigured)
            .filter(([, programIds]) => input.programId != null && programIds.includes(input.programId))
            .map(([locationId]) => locationId),
    );

    return input.locations.map((location, index) => {
        if (isPrototypeBlockedLocation(location.id, index)) {
            return {
                id: location.id,
                label: location.label,
                status: "blocked" as const,
                blockReason: "Location is not eligible for Program availability (prototype fixture).",
            };
        }
        const associated =
            input.alreadyAssociatedIds.has(location.id) || applied.has(location.id);
        if (!associated) {
            return { id: location.id, label: location.label, status: "eligible_new" };
        }
        const local =
            input.locallyConfiguredIds?.has(location.id)
            || localFromSession.has(location.id);
        return {
            id: location.id,
            label: location.label,
            status: local ? "already_associated_local" : "already_associated_inherits",
        };
    });
}

export function buildPrototypePreview(input: {
    programLabel: string;
    rows: readonly PrototypeLocationRow[];
    selectedIds: ReadonlySet<string>;
}): PrototypePreviewResult {
    const selected = input.rows.filter((row) => input.selectedIds.has(row.id));
    const newAssociations = selected.filter((row) => row.status === "eligible_new");
    const existingAssociations = selected.filter(
        (row) =>
            row.status === "already_associated_inherits"
            || row.status === "already_associated_local",
    );
    const unchangedLocal = selected.filter((row) => row.status === "already_associated_local");
    const inheritsOrganization = selected.filter(
        (row) =>
            row.status === "eligible_new" || row.status === "already_associated_inherits",
    );
    const blocked = selected.filter((row) => row.status === "blocked");
    const willBecomeAvailable = newAssociations.length + existingAssociations.length;
    const confirmationCopy =
        `${input.programLabel} will be made available at ${willBecomeAvailable} Location${
            willBecomeAvailable === 1 ? "" : "s"
        }.`;

    return {
        programLabel: input.programLabel,
        selectedCount: selected.length,
        newAssociations,
        existingAssociations,
        unchangedLocal,
        inheritsOrganization,
        blocked,
        confirmationCopy,
        refreshExpectation:
            "Programs and Locations collections refresh for selected targets. Originating selection is retained.",
    };
}

export function applyPrototypeAvailability(input: {
    programId: string;
    programLabel: string;
    createdProgram: boolean;
    rows: readonly PrototypeLocationRow[];
    selectedIds: ReadonlySet<string>;
}): PrototypeApplyResult {
    const preview = buildPrototypePreview({
        programLabel: input.programLabel,
        rows: input.rows,
        selectedIds: input.selectedIds,
    });

    const session = readSession();
    const prior = new Set(session.applied[input.programId] ?? []);
    for (const row of preview.newAssociations) {
        prior.add(row.id);
    }
    session.applied[input.programId] = [...prior];
    writeSession(session);

    const associatedLocationIds = [
        ...preview.newAssociations.map((row) => row.id),
        ...preview.existingAssociations.map((row) => row.id),
    ];
    const blocked = preview.blocked.map((row) => ({
        locationId: row.id,
        label: row.label,
        reason: row.blockReason ?? "Blocked",
    }));
    const availableCount = associatedLocationIds.length;
    const status =
        blocked.length > 0 && availableCount === 0 ? "blocked"
        : blocked.length > 0 ? "partial"
        : "committed";

    return {
        status,
        programId: input.programId,
        programLabel: input.programLabel,
        createdProgram: input.createdProgram,
        associatedLocationIds,
        unchangedLocationIds: preview.unchangedLocal.map((row) => row.id),
        blocked,
        successCopy: `${input.programLabel} is now available at ${availableCount} Location${
            availableCount === 1 ? "" : "s"
        }.`,
    };
}

export function markPrototypeLocalConfiguration(programId: string, locationId: string): void {
    const session = readSession();
    const current = new Set(session.locallyConfigured[locationId] ?? []);
    current.add(programId);
    session.locallyConfigured[locationId] = [...current];
    writeSession(session);
}

export function clearPrototypeLocalConfiguration(programId: string, locationId: string): void {
    const session = readSession();
    const current = (session.locallyConfigured[locationId] ?? []).filter((id) => id !== programId);
    if (current.length === 0) delete session.locallyConfigured[locationId];
    else session.locallyConfigured[locationId] = current;
    writeSession(session);
}

export function recordPrototypeOrganizationDefinitionEdit(): {
    inheritingCount: number;
    locallyConfiguredCount: number;
} {
    const session = readSession();
    session.orgDefinitionEditCount += 1;
    writeSession(session);
    // Fixture impact numbers for the prototype gate (stable, readable).
    return { inheritingCount: 32, locallyConfiguredCount: 3 };
}

export function statusLabelForRow(status: ProgramLocationAvailabilityStatus): string {
    switch (status) {
        case "eligible_new":
            return PROGRAM_LOCATION_STATUS_LABEL.notAvailable;
        case "already_associated_inherits":
            return PROGRAM_LOCATION_STATUS_LABEL.inheritsOrganization;
        case "already_associated_local":
            return PROGRAM_LOCATION_STATUS_LABEL.locallyConfigured;
        case "blocked":
            return PROGRAM_LOCATION_STATUS_LABEL.blocked;
        case "not_available":
            return PROGRAM_LOCATION_STATUS_LABEL.notAvailable;
        default:
            return status;
    }
}

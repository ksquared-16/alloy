/**
 * Client helpers for Location-context Program create / assign via the
 * Organization Programs publication API (no duplicate local Program identity).
 */

export const PROGRAMS_CONFIGURATION_ENDPOINT = "/api/admin/configuration/programs";

export type ProgramCatalogSnapshotProgram = {
    id: string;
    key: string;
    lifecycleStatus?: string;
    draft?: { label?: string | null } | null;
    latestPublication?: {
        id: string;
        revision?: { id?: string; label?: string | null; programKey?: string | null } | null;
    } | null;
};

export type ProgramCatalogSnapshot = {
    programs?: ProgramCatalogSnapshotProgram[];
    locations?: { id: string; label: string }[];
    error?: unknown;
};

export type ProgramActionResult = {
    ok?: boolean;
    programId?: string;
    result?: {
        publication?: { id?: string };
        revision?: { id?: string };
        run?: { id?: string };
    };
    preview?: unknown;
    errors?: string[];
    error?: unknown;
};

function issueMessage(error: unknown, fallback: string): string {
    if (typeof error === "string" && error.trim()) return error.trim();
    if (error != null && typeof error === "object") {
        const record = error as Record<string, unknown>;
        if (typeof record.message === "string" && record.message.trim()) return record.message.trim();
        if (typeof record.operatorMessage === "string" && record.operatorMessage.trim()) {
            return record.operatorMessage.trim();
        }
    }
    return fallback;
}

export async function fetchProgramCatalogSnapshot(): Promise<ProgramCatalogSnapshot> {
    const res = await fetch(PROGRAMS_CONFIGURATION_ENDPOINT, { credentials: "include" });
    const json = (await res.json().catch(() => ({}))) as ProgramCatalogSnapshot;
    if (!res.ok) {
        throw new Error(issueMessage(json.error, `Programs catalog failed (${res.status})`));
    }
    return json;
}

export async function postProgramConfigurationAction(
    body: Record<string, unknown>,
): Promise<ProgramActionResult> {
    const res = await fetch(PROGRAMS_CONFIGURATION_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as ProgramActionResult;
    if (!res.ok) {
        throw new Error(issueMessage(json.error, `Programs action failed (${res.status})`));
    }
    return json;
}

export function slugifyProgramKey(label: string): string {
    return label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 64);
}

export function publishedProgramsForAssignment(
    programs: readonly ProgramCatalogSnapshotProgram[],
): Array<{
    id: string;
    key: string;
    label: string;
    publicationId: string;
}> {
    const out: Array<{ id: string; key: string; label: string; publicationId: string }> = [];
    for (const program of programs) {
        const publicationId = String(program.latestPublication?.id ?? "").trim();
        if (!publicationId) continue;
        if (program.lifecycleStatus === "retired") continue;
        const label =
            String(program.latestPublication?.revision?.label ?? "").trim()
            || String(program.draft?.label ?? "").trim()
            || program.key;
        out.push({
            id: program.id,
            key: program.key,
            label,
            publicationId,
        });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Create Organization Program → validate → publish → assign to Locations.
 * Returns the Organization programId and publicationId used for assignment.
 */
export async function createPublishAndAssignProgram(input: {
    label: string;
    key: string;
    targetLocationIds: readonly string[];
}): Promise<{ programId: string; publicationId: string }> {
    const label = input.label.trim();
    const key = input.key.trim() || slugifyProgramKey(label);
    if (!label) throw new Error("Program name is required.");
    if (!/^[a-z0-9_]{2,64}$/.test(key)) {
        throw new Error("Program key must contain 2–64 lowercase letters, numbers, or underscores.");
    }
    if (input.targetLocationIds.length === 0) {
        throw new Error("Choose at least one Location.");
    }

    const created = await postProgramConfigurationAction({
        action: "create_draft",
        label,
        key,
    });
    const programId = String(created.programId ?? "").trim();
    if (!programId) throw new Error("Program creation did not return an id.");

    try {
        const validation = await postProgramConfigurationAction({
            action: "validate_draft",
            programId,
        });
        if (validation.ok === false) {
            const errors = Array.isArray(validation.errors) ? validation.errors.join(" ") : "";
            throw new Error(errors || "Program draft failed validation.");
        }

        await postProgramConfigurationAction({
            action: "publish",
            programId,
        });

        // Publication id is authoritative on the catalog after publish (RPC payload shape varies).
        const snapshot = await fetchProgramCatalogSnapshot();
        const match = (snapshot.programs ?? []).find((row) => row.id === programId);
        const publicationId = String(match?.latestPublication?.id ?? "").trim();
        if (!publicationId) throw new Error("Publication id missing after publish.");

        await postProgramConfigurationAction({
            action: "assign",
            publicationId,
            targetIds: [...input.targetLocationIds],
        });
        return { programId, publicationId };
    } catch (error) {
        // Leave the draft in place for recovery; surface the failure.
        throw error instanceof Error ? error : new Error("Create and assign failed.");
    }
}

export async function assignExistingProgramPublication(input: {
    publicationId: string;
    targetLocationIds: readonly string[];
}): Promise<void> {
    if (!input.publicationId.trim()) throw new Error("Publication is required.");
    if (input.targetLocationIds.length === 0) throw new Error("Choose at least one Location.");
    await postProgramConfigurationAction({
        action: "assign",
        publicationId: input.publicationId.trim(),
        targetIds: [...input.targetLocationIds],
    });
}

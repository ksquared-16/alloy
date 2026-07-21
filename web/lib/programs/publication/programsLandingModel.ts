/**
 * Programs landing rollup — Checkpoint D1.
 *
 * Pure derivation from ProgramPublicationSnapshot via buildProgramPublicationViewModel.
 * Does not invent publication/assignment truth.
 */

import type { ConfigurationRuntimeAttentionItem } from "@/lib/configPublication/runtimeModel";
import type { ProgramPublicationSnapshot } from "@/lib/programs/publication/programPublicationService";
import type { ProgramConfigurationSection } from "@/lib/programs/programConfigurationSections";
import { normalizeProgramConfigurationSection } from "@/lib/programs/programConfigurationSections";
import { buildProgramPublicationViewModel } from "@/lib/programs/publication/programPublicationViewModel";

export type ProgramLandingAttentionReason =
    | "publication-missing"
    | "unpublished-changes"
    | "distribution-failed"
    | "assignment-drift"
    | "setup-missing"
    | "no-assignments"
    | "incomplete-definition"
    | "no-delivery-options";

export type ProgramLandingRow = {
    id: string;
    key: string;
    displayName: string;
    description: string | null;
    audienceLabel: string | null;
    lifecycleStatus: "active" | "retired";
    isActive: boolean;
    publicationLabel: string;
    hasPublishedRevision: boolean;
    assignmentLabel: string;
    assignedCount: number;
    deliveryOptionCount: number;
    readinessPercent: number;
    readyForLocationUse: boolean;
    topAttention: ConfigurationRuntimeAttentionItem | null;
    criticalCount: number;
    improveCount: number;
};

export type ProgramLandingAttentionItem = {
    programId: string;
    programName: string;
    reason: ProgramLandingAttentionReason;
    item: ConfigurationRuntimeAttentionItem;
    section: ProgramConfigurationSection;
};

export type ProgramsLandingViewModel = {
    summary: {
        totalPrograms: number;
        activePrograms: number;
        retiredPrograms: number;
        readyPrograms: number;
        attentionPrograms: number;
        publishedPrograms: number;
        assignedPrograms: number;
        deliveryOptionCount: number;
        averageReadinessPercent: number;
    };
    programs: ProgramLandingRow[];
    attention: ProgramLandingAttentionItem[];
    permissions: {
        canCreateProgram: boolean;
        canEditProgram: boolean;
        canPublishProgram: boolean;
    };
};

function audienceLabel(program: ProgramPublicationSnapshot["programs"][number]): string | null {
    const minimum =
        typeof program.draft.audience.minimumAge === "number" ? program.draft.audience.minimumAge : null;
    const maximum =
        typeof program.draft.audience.maximumAge === "number" ? program.draft.audience.maximumAge : null;
    if (minimum != null && maximum != null) return `Ages ${minimum}–${maximum}`;
    if (minimum != null) return `Age ${minimum}+`;
    if (maximum != null) return `Up to age ${maximum}`;
    return null;
}

function mapAttentionSection(section: string | undefined): ProgramConfigurationSection {
    if (section === "draft") return "definition";
    if (section === "distribution") return "assignment";
    return normalizeProgramConfigurationSection(section);
}

function reasonFromAttentionKey(key: string): ProgramLandingAttentionReason {
    if (key === "publication-missing") return "publication-missing";
    if (key === "unpublished-changes") return "unpublished-changes";
    if (key === "distribution-failed") return "distribution-failed";
    if (key === "assignment-drift") return "assignment-drift";
    if (key === "setup-missing") return "setup-missing";
    return "setup-missing";
}

/**
 * Ready for Location use — deterministic, grounded in snapshot evidence:
 * identity present, published revision exists, assigned to ≥1 Location.
 * Delivery Options / pricing remain improve-path (not blocking "ready").
 */
export function isProgramReadyForLocationUse(input: {
    hasIdentity: boolean;
    hasPublishedRevision: boolean;
    assignedCount: number;
}): boolean {
    return input.hasIdentity && input.hasPublishedRevision && input.assignedCount > 0;
}

function compareAttention(
    a: ConfigurationRuntimeAttentionItem,
    b: ConfigurationRuntimeAttentionItem,
): number {
    const grade = (item: ConfigurationRuntimeAttentionItem) =>
        item.grade === "fix" ? 0
        : item.grade === "improve" ? 1
        : 2;
    const delta = grade(a) - grade(b);
    if (delta !== 0) return delta;
    return a.key.localeCompare(b.key);
}

export function buildProgramsLandingViewModel(
    snapshot: ProgramPublicationSnapshot,
): ProgramsLandingViewModel {
    const canManage = snapshot.capabilities.canManage;
    const rows: ProgramLandingRow[] = snapshot.programs.map((program) => {
        const viewModel = buildProgramPublicationViewModel(program, snapshot);
        const offerings = snapshot.offerings.filter((offering) => offering.program_key === program.key);
        const hasIdentity = Boolean(program.key.trim() && program.draft.label.trim());
        const assignedCount = viewModel.runtime.assignment.assignedCount;
        const readyForLocationUse = isProgramReadyForLocationUse({
            hasIdentity,
            hasPublishedRevision: program.latestPublication != null,
            assignedCount,
        });
        const actionable = viewModel.runtime.attention.filter((item) => item.grade !== "good");
        const topAttention = [...actionable].sort(compareAttention)[0] ?? null;
        const description = program.draft.description?.trim() || null;

        return {
            id: program.id,
            key: program.key,
            displayName: program.draft.label.trim() || program.key,
            description,
            audienceLabel: audienceLabel(program),
            lifecycleStatus: program.lifecycleStatus === "retired" ? "retired" : "active",
            isActive: program.lifecycleStatus !== "retired",
            publicationLabel: viewModel.runtime.publication.label,
            hasPublishedRevision: program.latestPublication != null,
            assignmentLabel: viewModel.runtime.assignment.label,
            assignedCount,
            deliveryOptionCount: offerings.length,
            readinessPercent: viewModel.runtime.readiness.percent,
            readyForLocationUse,
            topAttention,
            criticalCount: actionable.filter((item) => item.grade === "fix").length,
            improveCount: actionable.filter((item) => item.grade === "improve").length,
        };
    });

    rows.sort((a, b) => {
        if (a.criticalCount !== b.criticalCount) return b.criticalCount - a.criticalCount;
        if (a.improveCount !== b.improveCount) return b.improveCount - a.improveCount;
        if (a.readinessPercent !== b.readinessPercent) return a.readinessPercent - b.readinessPercent;
        return a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id);
    });

    const seen = new Set<string>();
    const attention: ProgramLandingAttentionItem[] = rows
        .flatMap((row) => {
            const program = snapshot.programs.find((item) => item.id === row.id);
            if (!program) return [];
            const viewModel = buildProgramPublicationViewModel(program, snapshot);
            return viewModel.runtime.attention
                .filter((item) => item.grade !== "good")
                .map((item) => ({
                    programId: row.id,
                    programName: row.displayName,
                    reason: reasonFromAttentionKey(item.key),
                    item,
                    section: mapAttentionSection(item.section),
                }));
        })
        .filter((highlight) => {
            const identity = `${highlight.programId}:${highlight.item.key}`;
            if (seen.has(identity)) return false;
            seen.add(identity);
            return true;
        })
        .sort((a, b) => {
            const issueDelta = compareAttention(a.item, b.item);
            if (issueDelta !== 0) return issueDelta;
            return a.programName.localeCompare(b.programName);
        });

    const activePrograms = rows.filter((row) => row.isActive).length;
    const readinessValues = rows.map((row) => row.readinessPercent);
    const averageReadinessPercent =
        readinessValues.length === 0 ?
            0
        :   Math.round(readinessValues.reduce((sum, value) => sum + value, 0) / readinessValues.length);

    return {
        summary: {
            totalPrograms: rows.length,
            activePrograms,
            retiredPrograms: rows.length - activePrograms,
            readyPrograms: rows.filter((row) => row.readyForLocationUse).length,
            attentionPrograms: rows.filter((row) => row.criticalCount > 0 || row.improveCount > 0).length,
            publishedPrograms: rows.filter((row) => row.hasPublishedRevision).length,
            assignedPrograms: rows.filter((row) => row.assignedCount > 0).length,
            deliveryOptionCount: rows.reduce((sum, row) => sum + row.deliveryOptionCount, 0),
            averageReadinessPercent,
        },
        programs: rows,
        attention,
        permissions: {
            canCreateProgram: canManage,
            canEditProgram: canManage,
            canPublishProgram: canManage,
        },
    };
}

/** Performance Sprint Patch 4 — optimistic Save All coordinator. */

import { perfSave } from "@/lib/perf/perfNamespaceLog";

export type DrawerOperatingSaveSectionOptions = {
    /** Server confirm after optimistic apply (Save All). */
    confirmOnly?: boolean;
};

export type DrawerOperatingEditSection = {
    isDirty: () => boolean;
    save: (options?: DrawerOperatingSaveSectionOptions) => Promise<void>;
    revert?: () => void;
    /** Patch local VM/display/draft before server confirm. */
    applyOptimistic?: () => void;
    /** Restore pre-optimistic state after a failed section save. */
    rollbackOptimistic?: () => void;
    /** Lower runs earlier within a parallel batch. Default 0. */
    saveOrder?: number;
};

const sections = new Map<string, DrawerOperatingEditSection>();

export function registerDrawerOperatingEditSection(id: string, section: DrawerOperatingEditSection | null): void {
    if (!section) {
        sections.delete(id);
        return;
    }
    sections.set(id, section);
}

export function drawerOperatingIsDirty(): boolean {
    for (const section of sections.values()) {
        if (section.isDirty()) return true;
    }
    return false;
}

function nowMs(): number {
    return typeof performance !== "undefined" ? performance.now() : 0;
}

export async function drawerOperatingSaveAll(): Promise<void> {
    const dirty = [...sections.entries()].filter(([, s]) => s.isDirty());
    if (dirty.length === 0) return;

    const t0 = nowMs();
    perfSave("mutation_start", {
        section_count: dirty.length,
        optimistic: true,
        rollback_required: false,
        source: "drawer_operating",
    });

    for (const [sectionId, section] of dirty) {
        section.applyOptimistic?.();
        perfSave("optimistic_applied", {
            section: sectionId,
            optimistic: true,
            rollback_required: false,
        });
    }

    const sorted = [...dirty].sort((a, b) => (a[1].saveOrder ?? 0) - (b[1].saveOrder ?? 0));

    const results = await Promise.all(
        sorted.map(async ([sectionId, section]) => {
            const sectionT0 = nowMs();
            perfSave("section_start", {
                section: sectionId,
                optimistic: true,
                rollback_required: false,
            });
            try {
                await section.save({ confirmOnly: true });
                perfSave("section_confirm", {
                    section: sectionId,
                    duration_ms: Math.round(nowMs() - sectionT0),
                    optimistic: true,
                    rollback_required: false,
                    source: "server",
                });
                return { sectionId, ok: true as const };
            } catch (error) {
                perfSave("section_error", {
                    section: sectionId,
                    duration_ms: Math.round(nowMs() - sectionT0),
                    optimistic: true,
                    rollback_required: true,
                    error: error instanceof Error ? error.message : "save_failed",
                    source: "server",
                });
                return { sectionId, ok: false as const, error, section };
            }
        }),
    );

    const failures = results.filter((r): r is Extract<(typeof results)[number], { ok: false }> => !r.ok);
    for (const failure of failures) {
        failure.section.rollbackOptimistic?.();
        perfSave("rollback", {
            section: failure.sectionId,
            optimistic: true,
            rollback_required: true,
        });
    }

    if (failures.length > 0) {
        perfSave("mutation_error", {
            section_count: dirty.length,
            failed_sections: failures.map((f) => f.sectionId),
            duration_ms: Math.round(nowMs() - t0),
            optimistic: true,
            rollback_required: true,
            error: failures[0]!.error instanceof Error ? failures[0]!.error.message : "save_failed",
            source: "server",
        });
        throw failures[0]!.error;
    }

    perfSave("mutation_confirm", {
        section_count: dirty.length,
        duration_ms: Math.round(nowMs() - t0),
        optimistic: true,
        rollback_required: false,
        source: "server",
    });
}

export function drawerOperatingRevertAll(): void {
    for (const section of sections.values()) {
        section.revert?.();
    }
}

/** @internal test helper */
export function clearDrawerOperatingEditSectionsForTests(): void {
    sections.clear();
}

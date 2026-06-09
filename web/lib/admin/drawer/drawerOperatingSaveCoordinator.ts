/** Drawer-level dirty/save — one header save action (person operating + opportunity inquiry children). */

import { perfSave } from "@/lib/perf/perfNamespaceLog";

export type DrawerOperatingEditSection = {
    isDirty: () => boolean;
    save: () => Promise<void>;
    revert?: () => void;
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

export async function drawerOperatingSaveAll(): Promise<void> {
    const dirty = [...sections.entries()].filter(([, s]) => s.isDirty());
    if (dirty.length === 0) return;
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    perfSave("mutation_start", { section_count: dirty.length, source: "drawer_operating" });
    try {
        for (const [sectionId, section] of dirty) {
            const sectionT0 = typeof performance !== "undefined" ? performance.now() : 0;
            await section.save();
            perfSave("section_confirm", {
                section_id: sectionId,
                duration_ms:
                    typeof performance !== "undefined" ? Math.round(performance.now() - sectionT0) : undefined,
                source: "server",
            });
        }
        perfSave("mutation_confirm", {
            section_count: dirty.length,
            duration_ms: typeof performance !== "undefined" ? Math.round(performance.now() - t0) : undefined,
            source: "server",
        });
    } catch (error) {
        perfSave("mutation_error", {
            section_count: dirty.length,
            duration_ms: typeof performance !== "undefined" ? Math.round(performance.now() - t0) : undefined,
            error: error instanceof Error ? error.message : "save_failed",
            source: "server",
        });
        throw error;
    }
}

export function drawerOperatingRevertAll(): void {
    for (const section of sections.values()) {
        section.revert?.();
    }
}

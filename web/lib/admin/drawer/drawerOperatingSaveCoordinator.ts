/** Drawer-level dirty/save — one header save action (person operating + opportunity inquiry children). */

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
    for (const [, section] of dirty) {
        await section.save();
    }
}

export function drawerOperatingRevertAll(): void {
    for (const section of sections.values()) {
        section.revert?.();
    }
}

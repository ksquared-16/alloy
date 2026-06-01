/** Entity types supported by drawer communications APIs (threads, send, recipients). */
export const DRAWER_COMMUNICATIONS_ENTITY_TYPES = ["opportunities", "jobs", "persons", "customers"] as const;

export type DrawerCommunicationsEntityType = (typeof DRAWER_COMMUNICATIONS_ENTITY_TYPES)[number];

export function normalizeDrawerCommunicationsEntityType(raw: string): DrawerCommunicationsEntityType | null {
    const s = raw.trim().toLowerCase();
    if (s === "opportunity") return "opportunities";
    if (s === "job") return "jobs";
    if (s === "person") return "persons";
    if (s === "customer") return "customers";
    if ((DRAWER_COMMUNICATIONS_ENTITY_TYPES as readonly string[]).includes(s)) {
        return s as DrawerCommunicationsEntityType;
    }
    return null;
}

export function drawerTypeToCommunicationsEntityType(drawerType: string): DrawerCommunicationsEntityType | null {
    if (drawerType === "opportunities") return "opportunities";
    if (drawerType === "jobs") return "jobs";
    if (drawerType === "persons") return "persons";
    if (drawerType === "customers") return "customers";
    return null;
}

export function supportsDrawerCommunicationsComposer(entityType: DrawerCommunicationsEntityType | null): boolean {
    return entityType === "opportunities" || entityType === "jobs" || entityType === "persons";
}

import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";

const UUID_RE = /^[0-9a-f-]{36}$/i;

const INBOX_DRAWER_ENTITY_TYPES = new Set<AdminDrawerEntityType>([
    "opportunities",
    "persons",
    "jobs",
    "customers",
]);

export type InboxEntityDrawerTarget = {
    drawerType: AdminDrawerEntityType;
    entityId: string;
};

/** Map inbox thread primary entity → Admin V2 drawer open target (null when unsupported). */
export function resolveInboxEntityDrawerTarget(
    entityType: string | null | undefined,
    entityId: string | null | undefined
): InboxEntityDrawerTarget | null {
    const type = String(entityType ?? "")
        .trim()
        .toLowerCase();
    const id = String(entityId ?? "").trim();
    if (!type || !UUID_RE.test(id)) return null;
    if (type === "opportunity") return { drawerType: "opportunities", entityId: id };
    if (type === "person") return { drawerType: "persons", entityId: id };
    if (type === "job") return { drawerType: "jobs", entityId: id };
    if (type === "customer") return { drawerType: "customers", entityId: id };
    if (INBOX_DRAWER_ENTITY_TYPES.has(type as AdminDrawerEntityType)) {
        return { drawerType: type as AdminDrawerEntityType, entityId: id };
    }
    return null;
}

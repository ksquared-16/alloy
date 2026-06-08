import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";

type OpenPersonDrawerFn = (params: { type: AdminDrawerEntityType; id: string }) => void;

declare global {
    interface Window {
        /** Dev smoke: `__alloyDevOpenPerson("<person-uuid>")` */
        __alloyDevOpenPerson?: (personId: string) => void;
    }
}

/** Dev console helper — direct `openDrawer({ type: "persons", id })` without opportunity host. */
export function installPersonDrawerDevDirectOpen(openDrawer: OpenPersonDrawerFn): () => void {
    if (process.env.NODE_ENV !== "development" && process.env.VITEST !== "true") {
        return () => {};
    }
    const fn = (personId: string) => {
        const id = personId.trim();
        if (!id) {
            console.warn("[dev-open-person] missing person id");
            return;
        }
        console.info("[dev-open-person]", { type: "persons", id });
        openDrawer({ type: "persons", id });
    };
    if (typeof window !== "undefined") {
        window.__alloyDevOpenPerson = fn;
    }
    return () => {
        if (typeof window !== "undefined" && window.__alloyDevOpenPerson === fn) {
            delete window.__alloyDevOpenPerson;
        }
    };
}

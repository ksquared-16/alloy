/**
 * Invalidate cached layout-runtime drawer body payloads after record mutations.
 */

export const ADMINV2_LAYOUT_RUNTIME_BODY_INVALIDATE = "adminv2:layout-runtime-body-invalidate" as const;

export type DrawerLayoutRuntimeBodyInvalidateDetail = {
    entityType: "opportunities" | "persons" | "child";
    entityId: string;
};

export function dispatchDrawerLayoutRuntimeBodyInvalidate(
    detail: DrawerLayoutRuntimeBodyInvalidateDetail,
): void {
    if (typeof window === "undefined") return;
    const entityId = detail.entityId.trim();
    if (!entityId) return;
    window.dispatchEvent(
        new CustomEvent<DrawerLayoutRuntimeBodyInvalidateDetail>(ADMINV2_LAYOUT_RUNTIME_BODY_INVALIDATE, {
            detail: { entityType: detail.entityType, entityId },
        }),
    );
}

export function parseDrawerLayoutRuntimeBodyInvalidateDetail(
    ev: Event,
): DrawerLayoutRuntimeBodyInvalidateDetail | null {
    if (!(ev instanceof CustomEvent)) return null;
    const raw = ev.detail;
    if (!raw || typeof raw !== "object") return null;
    const entityId =
        typeof (raw as DrawerLayoutRuntimeBodyInvalidateDetail).entityId === "string"
            ? (raw as DrawerLayoutRuntimeBodyInvalidateDetail).entityId.trim()
            : "";
    const entityType = (raw as DrawerLayoutRuntimeBodyInvalidateDetail).entityType;
    if (!entityId || (entityType !== "opportunities" && entityType !== "persons" && entityType !== "child")) {
        return null;
    }
    return { entityType, entityId };
}

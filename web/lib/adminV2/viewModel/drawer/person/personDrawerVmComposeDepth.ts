import type { PersonDrawerVisibilityScope } from "@/lib/admin/person/attachPersonDrawerVisibility";

export type PersonDrawerVmComposeDepth = "first_paint" | "full";

export function parsePersonDrawerVmComposeDepth(raw: string | null | undefined): PersonDrawerVmComposeDepth {
    const v = String(raw ?? "").trim().toLowerCase();
    return v === "full" ? "full" : "first_paint";
}

export function visibilityScopeForComposeDepth(depth: PersonDrawerVmComposeDepth): PersonDrawerVisibilityScope {
    return depth === "full" ? "full" : "first_paint";
}

export function personDrawerRecordComposeDepthMarker(depth: PersonDrawerVmComposeDepth): string {
    return depth;
}

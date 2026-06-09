import type { LayoutItem } from "../layoutV2";
import { countLayoutRuntimeChildrenBySource } from "./normalizeLayoutRuntimeChildRow";
import type { ProofRuntimeRecord } from "./proofRecordContext";
import { readLayoutRuntimeRepeaterRows } from "./readLayoutRuntimeRepeaterRows";
import { readLayoutRuntimeRepeaterFieldRaw } from "./resolveLayoutRuntimeRepeaterFieldValue";

/** Dev-only repeater binding diagnostics (`NEXT_PUBLIC_LAYOUT_RUNTIME_STAGING_DEBUG=1`). */
export function logLayoutRuntimeChildrenRenderDebug(
    surface: "drawer" | "queue",
    record: ProofRuntimeRecord,
    item: LayoutItem,
    columnRefKeys: string[],
): void {
    if (typeof window === "undefined") return;
    if (process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_STAGING_DEBUG !== "1") return;

    const resolved = readLayoutRuntimeRepeaterRows(record, item);
    const columnSamples = Object.fromEntries(
        columnRefKeys.map((refKey) => [refKey, readLayoutRuntimeRepeaterFieldRaw(resolved[0] ?? {}, refKey) ?? null]),
    );
    console.info("[layout.children.render_debug]", {
        surface,
        refKey: item.refKey,
        source: item.source ?? item.refKey,
        displayMode: item.displayMode ?? "table",
        recordKeys: Object.keys(record).filter((k) => k.includes("child") || k.startsWith("_inquiry")),
        countsBySource: countLayoutRuntimeChildrenBySource(record as Record<string, unknown>),
        resolvedRowCount: resolved.length,
        firstResolvedRow: resolved[0] ?? null,
        columnRefKeys,
        columnSamples,
    });
}

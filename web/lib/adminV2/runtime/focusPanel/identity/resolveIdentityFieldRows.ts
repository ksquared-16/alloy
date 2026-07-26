/**
 * Shared identity field row layout — one resolver for Household, Children, Person, etc.
 */

import type { NestedSurfaceFieldLayoutWidth } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldLayout";
import {
    chunkNestedSurfaceFieldsForHalfRowLayout,
    isNestedSurfaceFieldHalfWidth,
    isNestedSurfaceFieldThirdWidth,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldLayout";
import type { IdentityFieldCellVM, IdentityFieldRowVM, IdentityFieldPlacement } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";

export type IdentityFieldRowInput = {
    placement: IdentityFieldPlacement;
    label: string;
    value: string | null;
    icon?: string;
    policy: IdentityFieldCellVM["policy"];
    editable: boolean;
    linked?: boolean;
    linkLabel?: string | null;
    linkDestination?: IdentityFieldCellVM["linkDestination"];
    linkTarget?: IdentityFieldCellVM["linkTarget"];
    editControl?: IdentityFieldCellVM["editControl"];
};

/** Build row VMs from ordered placements (summary or expanded tier). */
export function resolveIdentityFieldRows(
    inputs: readonly IdentityFieldRowInput[],
): IdentityFieldRowVM[] {
    const visible = inputs.filter((input) => {
        if (input.placement.hideWhenEmpty && !input.value?.trim()) return false;
        return input.policy !== "hidden";
    });
    if (visible.length === 0) return [];

    const ordered = [...visible].sort((a, b) => {
        if (a.placement.row !== b.placement.row) return a.placement.row - b.placement.row;
        return a.placement.column - b.placement.column;
    });

    const keys = ordered.map((input) => input.placement.fieldRef);
    const layoutFor = (fieldRef: string): NestedSurfaceFieldLayoutWidth => {
        const input = ordered.find((row) => row.placement.fieldRef === fieldRef);
        return input?.placement.width ?? "full";
    };
    const chunks = chunkNestedSurfaceFieldsForHalfRowLayout(keys, layoutFor);

    return chunks.map((chunk, rowIndex) => ({
        row: ordered.find((input) => input.placement.fieldRef === chunk[0])?.placement.row ?? rowIndex + 1,
        cells: chunk.map((fieldRef, columnIndex) => {
            const input = ordered.find((row) => row.placement.fieldRef === fieldRef)!;
            const width = layoutFor(fieldRef);
            return {
                fieldRef,
                label: input.label,
                value: input.value,
                icon: input.icon,
                labelMode: input.placement.labelMode ?? "visible",
                policy: input.policy,
                editable: input.editable,
                linked: input.linked ?? false,
                linkLabel: input.linkLabel ?? null,
                linkDestination: input.linkDestination ?? null,
                linkTarget: input.linkTarget ?? null,
                hideWhenEmpty: input.placement.hideWhenEmpty ?? false,
                width,
                editControl: input.editControl,
                column: (columnIndex + 1) as 1 | 2 | 3,
            } satisfies IdentityFieldCellVM & { column?: 1 | 2 | 3 };
        }),
    }));
}

/** Infer default width from consecutive half pairing when placements lack explicit width. */
export function defaultWidthForPlacement(
    fieldRef: string,
    layoutWidths: Record<string, NestedSurfaceFieldLayoutWidth> | undefined,
): NestedSurfaceFieldLayoutWidth {
    const stored = layoutWidths?.[fieldRef];
    if (stored) return stored;
    return "full";
}

/** Whether two fields share a row under half-width pairing rules. */
export function identityFieldsShareRow(
    left: IdentityFieldPlacement,
    right: IdentityFieldPlacement,
): boolean {
    return left.row === right.row && left.row === right.row && left.width !== "full" && right.width !== "full";
}

/**
 * @vitest-environment jsdom
 *
 * Sprint 5.18U — inline edit mode for configured layout sections/cards/lists.
 */

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
    LayoutRuntimeBlockEditProvider,
    layoutRuntimeBlockAllowsFieldEdit,
    useLayoutRuntimeBlockEdit,
} from "@/components/layout/LayoutRuntimeBlockEditContext";
import {
    readLayoutEditorBlockConfig,
    resolveLayoutRuntimeBlockEditMode,
} from "@/lib/layout/layoutEditorBlockConfig";
import {
    layoutRuntimeCollectionColumnIsInlineEditable,
    layoutRuntimeFieldIsEditable,
} from "@/lib/layout/runtime/layoutRuntimeFieldEditability";
import {
    dispatchLayoutRuntimeDrawerReverted,
    dispatchLayoutRuntimeDrawerSaved,
} from "@/lib/layout/runtime/layoutRuntimeDrawerBlockEditEvents";
import type { LayoutItem } from "@/lib/layout/layoutV2";

function enrollmentDetailsCard(overrides?: {
    locationEditable?: boolean;
    createdEditable?: boolean;
}): LayoutItem {
    const locationEditable = overrides?.locationEditable ?? true;
    const createdEditable = overrides?.createdEditable ?? false;
    return {
        id: "card-enrollment-details",
        kind: "field_group",
        refKey: "layout_block_enrollment",
        label: "Enrollment Details",
        metadata: {
            layoutEditorBlockConfig: {
                blockType: "custom_layout_block",
                showTitle: true,
                editMode: "display_only",
            },
        },
        rows: [
            {
                id: "row-1",
                columns: [
                    {
                        id: "col-1",
                        width: 12,
                        items: [
                            {
                                id: "field-location",
                                kind: "field",
                                refKey: "opportunity.location_id",
                                label: "Location",
                                editable: locationEditable,
                            },
                            {
                                id: "field-created",
                                kind: "field",
                                refKey: "opportunity.created_at",
                                label: "Lead Created Date",
                                editable: createdEditable,
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

function childrenRelatedList(): LayoutItem {
    return {
        id: "rl-children",
        kind: "related_list",
        refKey: "enrollment_children",
        source: "enrollment_children",
        displayMode: "table",
        metadata: {
            layoutEditorBlockConfig: {
                editMode: "display_only",
            },
        },
        columns: [
            { refKey: "child.name", label: "Child name" },
            { refKey: "inquiry_child.location_id", label: "School", editable: true },
            { refKey: "inquiry_child.outcome_status_key", label: "Enrollment status", editable: true },
            { refKey: "child.dob_age", label: "Age" },
        ],
    };
}

function BlockEditToggleProbe({ itemId }: { itemId: string }) {
    const blockEdit = useLayoutRuntimeBlockEdit();
    return (
        <button
            type="button"
            data-testid={`layout-runtime-block-edit-${itemId}`}
            data-block-editing={blockEdit?.blockEditing ? "true" : "false"}
            onClick={() => blockEdit?.setBlockEditing(true)}
        >
            Edit
        </button>
    );
}

function BlockEditStateProbe({ onChange }: { onChange: (editing: boolean) => void }) {
    const blockEdit = useLayoutRuntimeBlockEdit();
    useEffect(() => {
        onChange(Boolean(blockEdit?.blockEditing));
    }, [blockEdit?.blockEditing, onChange]);
    return null;
}

describe("layoutBuilderRuntimeParity 5.18U", () => {
    describe("resolveLayoutRuntimeBlockEditMode", () => {
        it("inline-editable field causes parent card to resolve edit_button even when block metadata is display_only", () => {
            const item = enrollmentDetailsCard();
            const blockConfig = readLayoutEditorBlockConfig(item.metadata);
            expect(blockConfig.editMode).toBe("display_only");
            expect(resolveLayoutRuntimeBlockEditMode(item, blockConfig)).toBe("edit_button");
        });

        it("display-only fields do not cause parent card to resolve edit_button", () => {
            const item = enrollmentDetailsCard({ locationEditable: false, createdEditable: false });
            expect(resolveLayoutRuntimeBlockEditMode(item, readLayoutEditorBlockConfig(item.metadata))).toBe(
                "display_only",
            );
        });

        it("related-list column inline editable causes related-list header edit_button", () => {
            const item = childrenRelatedList();
            expect(resolveLayoutRuntimeBlockEditMode(item, readLayoutEditorBlockConfig(item.metadata))).toBe(
                "edit_button",
            );
        });

        it("unsupported editable refKey does not cause edit_button", () => {
            const item = enrollmentDetailsCard({ locationEditable: false });
            item.rows![0]!.columns[0]!.items.push({
                id: "field-unsupported",
                kind: "field",
                refKey: "opportunity.created_at",
                label: "Created",
                editable: true,
            });
            expect(resolveLayoutRuntimeBlockEditMode(item, readLayoutEditorBlockConfig(item.metadata))).toBe(
                "display_only",
            );
        });
    });

    describe("field edit gating", () => {
        it("clicking Edit enables only inline-editable fields with supported save adapters", () => {
            expect(
                layoutRuntimeFieldIsEditable(
                    { refKey: "opportunity.location_id", editable: true },
                    "production",
                ),
            ).toBe(true);
            expect(
                layoutRuntimeFieldIsEditable(
                    { refKey: "opportunity.created_at", editable: true },
                    "production",
                ),
            ).toBe(false);
        });

        it("non-editable fields remain read-only when block is editing", () => {
            expect(
                layoutRuntimeFieldIsEditable(
                    { refKey: "opportunity.location_id", editable: false },
                    "production",
                ),
            ).toBe(false);
            expect(
                layoutRuntimeBlockAllowsFieldEdit({
                    editMode: "edit_button",
                    blockEditing: true,
                    setBlockEditing: () => {},
                }),
            ).toBe(true);
            expect(
                layoutRuntimeFieldIsEditable(
                    { refKey: "opportunity.created_at", editable: false },
                    "production",
                )
                    && layoutRuntimeBlockAllowsFieldEdit({
                        editMode: "edit_button",
                        blockEditing: true,
                        setBlockEditing: () => {},
                    }),
            ).toBe(false);
        });

        it("related-list columns honor inline-editable metadata", () => {
            expect(
                layoutRuntimeCollectionColumnIsInlineEditable(
                    { refKey: "inquiry_child.location_id", editable: true },
                    "production",
                ),
            ).toBe(true);
            expect(
                layoutRuntimeCollectionColumnIsInlineEditable({ refKey: "child.name", editable: false }, "production"),
            ).toBe(false);
            expect(
                layoutRuntimeCollectionColumnIsInlineEditable({ refKey: "child.dob_age", editable: true }, "production"),
            ).toBe(false);
        });

        it("fields outside block edit context stay display-only", () => {
            expect(layoutRuntimeBlockAllowsFieldEdit(null)).toBe(false);
        });
    });

    describe("header Edit affordance", () => {
        it("field card with inline-editable field renders Edit test hook", () => {
            const item = enrollmentDetailsCard();
            const html = renderToStaticMarkup(
                <LayoutRuntimeBlockEditProvider editMode="edit_button">
                    <BlockEditToggleProbe itemId={item.id} />
                </LayoutRuntimeBlockEditProvider>,
            );
            expect(html).toContain('data-testid="layout-runtime-block-edit-card-enrollment-details"');
        });

        it("related list with inline-editable columns renders Edit test hook", () => {
            const item = childrenRelatedList();
            const html = renderToStaticMarkup(
                <LayoutRuntimeBlockEditProvider editMode="edit_button">
                    <BlockEditToggleProbe itemId={item.id} />
                </LayoutRuntimeBlockEditProvider>,
            );
            expect(html).toContain('data-testid="layout-runtime-block-edit-rl-children"');
        });
    });

    describe("save / cancel block edit lifecycle", () => {
        let container: HTMLDivElement;
        let root: Root;
        let latestEditing: boolean | null;

        beforeEach(() => {
            container = document.createElement("div");
            document.body.appendChild(container);
            root = createRoot(container);
            latestEditing = null;
        });

        afterEach(() => {
            act(() => {
                root.unmount();
            });
            container.remove();
        });

        it("save success exits edit mode", () => {
            act(() => {
                root.render(
                    <LayoutRuntimeBlockEditProvider editMode="edit_button">
                        <BlockEditStateProbe onChange={(editing) => { latestEditing = editing; }} />
                        <BlockEditToggleProbe itemId="card-1" />
                    </LayoutRuntimeBlockEditProvider>,
                );
            });

            act(() => {
                container.querySelector('[data-testid="layout-runtime-block-edit-card-1"]')?.dispatchEvent(
                    new MouseEvent("click", { bubbles: true }),
                );
            });
            expect(latestEditing).toBe(true);

            act(() => {
                dispatchLayoutRuntimeDrawerSaved();
            });
            expect(latestEditing).toBe(false);
        });

        it("save failure keeps edit mode open when saved event is not dispatched", () => {
            act(() => {
                root.render(
                    <LayoutRuntimeBlockEditProvider editMode="edit_button">
                        <BlockEditStateProbe onChange={(editing) => { latestEditing = editing; }} />
                        <BlockEditToggleProbe itemId="card-1" />
                    </LayoutRuntimeBlockEditProvider>,
                );
            });

            act(() => {
                container.querySelector('[data-testid="layout-runtime-block-edit-card-1"]')?.dispatchEvent(
                    new MouseEvent("click", { bubbles: true }),
                );
            });
            expect(latestEditing).toBe(true);
            expect(latestEditing).toBe(true);
        });

        it("cancel exits edit mode without saving", () => {
            act(() => {
                root.render(
                    <LayoutRuntimeBlockEditProvider editMode="edit_button">
                        <BlockEditStateProbe onChange={(editing) => { latestEditing = editing; }} />
                        <BlockEditToggleProbe itemId="card-1" />
                    </LayoutRuntimeBlockEditProvider>,
                );
            });

            act(() => {
                container.querySelector('[data-testid="layout-runtime-block-edit-card-1"]')?.dispatchEvent(
                    new MouseEvent("click", { bubbles: true }),
                );
            });
            expect(latestEditing).toBe(true);

            act(() => {
                dispatchLayoutRuntimeDrawerReverted();
            });
            expect(latestEditing).toBe(false);
        });
    });
});

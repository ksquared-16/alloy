"use client";

import { useMemo, useState } from "react";
import OpportunityDrawerLayoutFieldPicker from "@/components/adminV2/settings/OpportunityDrawerLayoutFieldPicker";
import {
    LAYOUT_BUILDER_BLOCK_OPTIONS,
    LAYOUT_BUILDER_PALETTE_GROUPS,
    LAYOUT_BUILDER_SECTION_ADD_OPTIONS,
    LAYOUT_BUILDER_STARTER_TEMPLATES,
    LAYOUT_BUILDER_WIDGET_OPTIONS,
    layoutBuilderFriendlySectionKeyLabel,
    type LayoutBuilderPaletteGroupKey,
} from "@/lib/layout/layoutBuilderPaletteModel";
import type { LayoutCatalogGroup } from "@/lib/layout/fieldCatalog";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import {
    addCustomOpportunityDrawerSection,
    addRelatedListOpportunityDrawerSection,
    addRegisteredSection,
    addWidgetOpportunityDrawerSection,
    listMissingRegisteredSections,
} from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import {
    applyOpportunityDrawerStarterTemplate,
    type OpportunityDrawerStarterTemplateKey,
} from "@/lib/layout/layoutEditorOpportunityDrawerStarterTemplates";
import {
    addLayoutBlockToSection,
    isLayoutEditorBlockTemplateKey,
} from "@/lib/layout/layoutEditorBlockRegistry";
import {
    addSectionFieldItem,
    addSectionRow,
    addSectionTextItem,
    addSectionWidgetItem,
} from "@/lib/layout/layoutEditorSectionComposition";
import { readSectionType } from "@/lib/layout/layoutEditorSectionLayout";
import {
    buildAddSuccessMessage,
    diffNewSectionKeys,
    resolvePaletteTargetSectionId,
    sectionZoneLabel,
    type LayoutBuilderPaletteItemKind,
} from "@/lib/layout/layoutBuilderStudioUx";
import type { OpportunityDrawerSectionKey } from "@/lib/layout/surfaceLayoutRegistry";
import { opSectionTitle, opSectionSupport } from "@/lib/operational/ui/operationalVisualTokens";

export type LayoutBuilderStudioNotice = {
    tone: "success" | "error" | "info";
    message: string;
};

type Props = {
    doc: LayoutDoc;
    selectedSectionId: string | null;
    fieldPickerGroups: LayoutCatalogGroup[];
    validationOk: boolean;
    studioNotice: LayoutBuilderStudioNotice | null;
    applyDoc: (next: LayoutDoc) => void;
    onSelectSection: (sectionKey: string | null) => void;
    onSelectItem: (sectionKey: string, itemId: string) => void;
    onStudioNotice: (notice: LayoutBuilderStudioNotice | null) => void;
    onScrollToSection: (sectionKey: string) => void;
};

function PaletteGroup({
    groupKey,
    label,
    description,
    open,
    onToggle,
    children,
}: {
    groupKey: LayoutBuilderPaletteGroupKey;
    label: string;
    description: string;
    open: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}) {
    return (
        <section className="border-b border-alloy-forge/10 pb-3 last:border-b-0" data-testid={`layout-builder-palette-group-${groupKey}`}>
            <button
                type="button"
                className="flex w-full items-start justify-between gap-2 text-left"
                onClick={onToggle}
                aria-expanded={open}
            >
                <span>
                    <span className={opSectionTitle}>{label}</span>
                    <span className={opSectionSupport}>{description}</span>
                </span>
                <span className="shrink-0 text-xs text-alloy-midnight/40">{open ? "−" : "+"}</span>
            </button>
            {open ?
                <div className="mt-2 space-y-1.5">{children}</div>
            :   null}
        </section>
    );
}

function PaletteButton({
    label,
    description,
    testId,
    onClick,
    tone = "default",
    disabled = false,
}: {
    label: string;
    description?: string;
    testId: string;
    onClick: () => void;
    tone?: "default" | "pine" | "blue";
    disabled?: boolean;
}) {
    const toneClass =
        tone === "pine" ? "border-alloy-pine/25 bg-alloy-pine/[0.05] text-alloy-pine hover:border-alloy-pine/40"
        : tone === "blue" ? "border-alloy-blue/25 bg-alloy-blue/[0.05] text-alloy-blue hover:border-alloy-blue/40"
        : "border-alloy-forge/15 bg-white text-alloy-midnight/75 hover:border-alloy-pine/30";
    return (
        <button
            type="button"
            disabled={disabled}
            className={`w-full rounded-lg border px-2.5 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${toneClass}`}
            onClick={onClick}
            data-testid={testId}
        >
            <span className="block text-xs font-medium">{label}</span>
            {description ?
                <span className="mt-0.5 block text-[10px] leading-snug opacity-70">{description}</span>
            :   null}
        </button>
    );
}

function TargetHint({ selectedSectionId, doc }: { selectedSectionId: string | null; doc: LayoutDoc }) {
    const section = selectedSectionId ? doc.sections.find((s) => s.key === selectedSectionId) : null;
    if (section) {
        const type = readSectionType(section);
        return (
            <p className="mt-2 rounded-md bg-alloy-pine/[0.06] px-2 py-1.5 text-[10px] text-alloy-pine" data-testid="layout-builder-palette-target">
                Adding to: <strong>{section.title}</strong>
                <span className="block text-alloy-pine/70">
                    {type === "widget" ? "Widget section" : type === "related_list" ? "Related list" : "Content section"} ·{" "}
                    {sectionZoneLabel(doc, section.key)}
                </span>
            </p>
        );
    }
    return (
        <p className="mt-2 rounded-md border border-dashed border-alloy-forge/20 bg-alloy-stone/[0.04] px-2 py-1.5 text-[10px] text-alloy-midnight/50" data-testid="layout-builder-palette-target-hint">
            Click a drawer card on the canvas to choose where fields and widgets go. We&apos;ll pick a sensible default if you add without selecting.
        </p>
    );
}

function NoticeBanner({ notice }: { notice: LayoutBuilderStudioNotice }) {
    const toneClass =
        notice.tone === "error" ? "border-red-200 bg-red-50 text-red-800"
        : notice.tone === "success" ? "border-alloy-pine/25 bg-alloy-pine/[0.08] text-alloy-midnight"
        : "border-alloy-blue/20 bg-alloy-blue/[0.06] text-alloy-midnight/75";
    return (
        <p className={`mt-2 rounded-md border px-2 py-1.5 text-[10px] leading-snug ${toneClass}`} data-testid="layout-builder-palette-notice">
            {notice.message}
        </p>
    );
}

export default function LayoutBuilderPalettePanel({
    doc,
    selectedSectionId,
    fieldPickerGroups,
    validationOk,
    studioNotice,
    applyDoc,
    onSelectSection,
    onSelectItem,
    onStudioNotice,
    onScrollToSection,
}: Props) {
    const missingSections = useMemo(() => listMissingRegisteredSections(doc), [doc]);
    const selectedSection = selectedSectionId ? doc.sections.find((s) => s.key === selectedSectionId) : null;
    const selectedSectionType = selectedSection ? readSectionType(selectedSection) : null;

    const [openGroups, setOpenGroups] = useState<Record<LayoutBuilderPaletteGroupKey, boolean>>({
        starter_templates: true,
        sections: true,
        fields: false,
        widgets: false,
        related_lists: false,
        blocks: false,
        text: false,
    });

    const toggleGroup = (key: LayoutBuilderPaletteGroupKey) => {
        setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const ensureSectionRow = (baseDoc: LayoutDoc, sectionKey: string): LayoutDoc => {
        const section = baseDoc.sections.find((s) => s.key === sectionKey);
        if (!section || section.rows.length > 0) return baseDoc;
        return addSectionRow(baseDoc, sectionKey, 1);
    };

    const focusSection = (sectionKey: string, message?: string) => {
        onSelectSection(sectionKey);
        onScrollToSection(sectionKey);
        if (message) onStudioNotice({ tone: "success", message });
    };

    const applyDocWithNewSections = (nextDoc: LayoutDoc, fallbackMessage?: string) => {
        const added = diffNewSectionKeys(doc, nextDoc);
        applyDoc(nextDoc);
        onStudioNotice(null);
        if (added.length > 0) {
            const key = added[added.length - 1]!;
            const title = nextDoc.sections.find((s) => s.key === key)?.title ?? "New section";
            focusSection(key, fallbackMessage ?? `Added "${title}" to the ${sectionZoneLabel(nextDoc, key)}.`);
            return;
        }
        if (fallbackMessage) onStudioNotice({ tone: "info", message: fallbackMessage });
    };

    const resolveTargetOrExplain = (
        itemKind: LayoutBuilderPaletteItemKind,
    ): { sectionId: string; preparedDoc: LayoutDoc; createdSection: boolean } | null => {
        let workingDoc = doc;
        let createdSection = false;
        let target = resolvePaletteTargetSectionId(workingDoc, selectedSectionId, itemKind);

        if (!target.sectionId && itemKind === "widget") {
            const before = workingDoc;
            workingDoc = addWidgetOpportunityDrawerSection(workingDoc, { zone: "summary_strip" });
            const added = diffNewSectionKeys(before, workingDoc);
            const newKey = added[added.length - 1];
            if (newKey) {
                createdSection = true;
                target = { sectionId: newKey };
            }
        }

        if (!target.sectionId && itemKind === "related_list") {
            const before = workingDoc;
            workingDoc = addRelatedListOpportunityDrawerSection(workingDoc, { zone: "main" });
            const added = diffNewSectionKeys(before, workingDoc);
            const newKey = added[added.length - 1];
            if (newKey) {
                createdSection = true;
                target = { sectionId: newKey };
            }
        }

        if (!target.sectionId && (itemKind === "field" || itemKind === "block" || itemKind === "text")) {
            const before = workingDoc;
            workingDoc = addCustomOpportunityDrawerSection(workingDoc, { zone: "main" });
            const added = diffNewSectionKeys(before, workingDoc);
            const newKey = added[added.length - 1];
            if (newKey) {
                createdSection = true;
                target = { sectionId: newKey };
            }
        }

        if (!target.sectionId) {
            onStudioNotice({ tone: "error", message: "Could not find a place to add this component. Try adding a section first." });
            return null;
        }

        if (target.reason && !createdSection && target.sectionId !== selectedSectionId) {
            onStudioNotice({ tone: "info", message: target.reason });
        }

        return {
            sectionId: target.sectionId,
            preparedDoc: ensureSectionRow(workingDoc, target.sectionId),
            createdSection,
        };
    };

    const addItemToTarget = (
        itemKind: LayoutBuilderPaletteItemKind,
        addFn: (doc: LayoutDoc, sectionKey: string, rowIndex: number, colIndex: number) => { ok: boolean; error?: string; itemId?: string; doc?: LayoutDoc },
        itemLabel: string,
    ) => {
        const target = resolveTargetOrExplain(itemKind);
        if (!target) return;

        const section = target.preparedDoc.sections.find((s) => s.key === target.sectionId);
        const rowIndex = Math.max(0, (section?.rows.length ?? 1) - 1);
        const result = addFn(target.preparedDoc, target.sectionId, rowIndex, 0);
        if (!result.ok) {
            onStudioNotice({ tone: "error", message: result.error ?? `Unable to add ${itemLabel}.` });
            return;
        }
        const nextDoc = result.doc ?? target.preparedDoc;
        applyDoc(nextDoc);
        onSelectSection(target.sectionId);
        onScrollToSection(target.sectionId);
        if (result.itemId) onSelectItem(target.sectionId, result.itemId);
        const sectionTitle = nextDoc.sections.find((s) => s.key === target.sectionId)?.title ?? "section";
        onStudioNotice({
            tone: "success",
            message: buildAddSuccessMessage({
                itemLabel,
                sectionTitle,
                zoneLabel: sectionZoneLabel(nextDoc, target.sectionId),
                createdSection: target.createdSection,
            }),
        });
    };

    const fieldsNeedContentSection = !selectedSectionId || selectedSectionType === "widget" || selectedSectionType === "related_list";

    return (
        <aside
            className="flex max-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-xl border border-alloy-forge/12 bg-white/95 shadow-sm"
            data-testid="layout-builder-palette-panel"
        >
            <div className="border-b border-alloy-forge/10 px-4 py-3">
                <h3 className={opSectionTitle}>Add components</h3>
                <p className={opSectionSupport}>Click to add — new items appear on the canvas and open in Properties.</p>
                <TargetHint selectedSectionId={selectedSectionId} doc={doc} />
                {studioNotice ?
                    <NoticeBanner notice={studioNotice} />
                :   null}
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3">
                {LAYOUT_BUILDER_PALETTE_GROUPS.map((group) => (
                    <PaletteGroup
                        key={group.key}
                        groupKey={group.key}
                        label={group.label}
                        description={group.description}
                        open={openGroups[group.key]}
                        onToggle={() => toggleGroup(group.key)}
                    >
                        {group.key === "starter_templates" ?
                            LAYOUT_BUILDER_STARTER_TEMPLATES.map((template) => (
                                <PaletteButton
                                    key={template.key}
                                    label={template.label}
                                    description={template.description}
                                    testId={`visual-editor-starter-${template.key}`}
                                    tone="blue"
                                    onClick={() => {
                                        const next = applyOpportunityDrawerStarterTemplate(
                                            doc,
                                            template.key as OpportunityDrawerStarterTemplateKey,
                                        );
                                        if (next === doc) {
                                            onStudioNotice({
                                                tone: "info",
                                                message: `"${template.label}" is already on this layout or could not be added.`,
                                            });
                                            return;
                                        }
                                        applyDocWithNewSections(next, `Added "${template.label}" starter pattern.`);
                                    }}
                                />
                            ))
                        : group.key === "sections" ?
                            <>
                                {LAYOUT_BUILDER_SECTION_ADD_OPTIONS.map((opt) => (
                                    <PaletteButton
                                        key={opt.key}
                                        label={opt.label}
                                        description={opt.description}
                                        testId={`visual-editor-add-${opt.key === "custom" ? "custom-section" : opt.key === "widget" ? "widget-section" : "related-list-section"}`}
                                        tone="pine"
                                        onClick={() => {
                                            if (opt.key === "custom") {
                                                applyDocWithNewSections(addCustomOpportunityDrawerSection(doc, { zone: "main" }));
                                            } else if (opt.key === "widget") {
                                                applyDocWithNewSections(addWidgetOpportunityDrawerSection(doc, { zone: "summary_strip" }));
                                            } else {
                                                applyDocWithNewSections(addRelatedListOpportunityDrawerSection(doc, { zone: "main" }));
                                            }
                                        }}
                                    />
                                ))}
                                {missingSections.map((key) => (
                                    <PaletteButton
                                        key={key}
                                        label={layoutBuilderFriendlySectionKeyLabel(key)}
                                        testId={`visual-editor-add-section-${key}`}
                                        onClick={() =>
                                            applyDocWithNewSections(
                                                addRegisteredSection(doc, key as OpportunityDrawerSectionKey),
                                                `Added ${layoutBuilderFriendlySectionKeyLabel(key)} card.`,
                                            )
                                        }
                                    />
                                ))}
                            </>
                        : group.key === "fields" ?
                            fieldsNeedContentSection ?
                                <>
                                    <p className="mb-1 text-[10px] text-alloy-midnight/45">
                                        Pick a field below — we&apos;ll add it to a content section.
                                    </p>
                                    <OpportunityDrawerLayoutFieldPicker
                                        groups={fieldPickerGroups}
                                        disabled={!validationOk}
                                        onPickField={(field) =>
                                            addItemToTarget("field", (d, sk, ri, ci) => addSectionFieldItem(d, sk, ri, ci, field), field.fieldLabel)
                                        }
                                    />
                                </>
                            :   <OpportunityDrawerLayoutFieldPicker
                                    groups={fieldPickerGroups}
                                    disabled={!validationOk}
                                    onPickField={(field) =>
                                        addItemToTarget("field", (d, sk, ri, ci) => addSectionFieldItem(d, sk, ri, ci, field), field.fieldLabel)
                                    }
                                />
                        : group.key === "widgets" ?
                            LAYOUT_BUILDER_WIDGET_OPTIONS.map((widget) => (
                                <PaletteButton
                                    key={widget.key}
                                    label={widget.label}
                                    description={widget.description}
                                    testId={`layout-builder-palette-widget-${widget.key}`}
                                    onClick={() =>
                                        addItemToTarget(
                                            "widget",
                                            (d, sk, ri, ci) => addSectionWidgetItem(d, sk, ri, ci, widget.key),
                                            widget.label,
                                        )
                                    }
                                />
                            ))
                        : group.key === "related_lists" ?
                            <PaletteButton
                                label="Children list"
                                description="Adds a related list in the main content area — configure rows in Properties."
                                testId="layout-builder-palette-add-related-list"
                                tone="blue"
                                onClick={() => {
                                    const before = doc;
                                    const next = applyOpportunityDrawerStarterTemplate(before, "children_enrollment_list");
                                    if (next === before) {
                                        const target = resolveTargetOrExplain("related_list");
                                        if (!target) return;
                                        onSelectSection(target.sectionId);
                                        onScrollToSection(target.sectionId);
                                        onStudioNotice({
                                            tone: "info",
                                            message: "Children list is already on this layout — select it on the canvas to edit.",
                                        });
                                        return;
                                    }
                                    applyDocWithNewSections(next, 'Added Children list to main content.');
                                }}
                            />
                        : group.key === "blocks" ?
                            LAYOUT_BUILDER_BLOCK_OPTIONS.map((block) => (
                                <PaletteButton
                                    key={block.key}
                                    label={block.label}
                                    description={
                                        block.runtimeEffective ? block.description : `${block.description} (preview only)`
                                    }
                                    testId={`layout-builder-palette-block-${block.key}`}
                                    onClick={() => {
                                        const target = resolveTargetOrExplain("block");
                                        if (!target || !isLayoutEditorBlockTemplateKey(block.key)) return;
                                        const result = addLayoutBlockToSection(target.preparedDoc, target.sectionId, block.key);
                                        if (!result.ok) {
                                            onStudioNotice({ tone: "error", message: result.error });
                                            return;
                                        }
                                        applyDoc(result.doc);
                                        onSelectSection(target.sectionId);
                                        onScrollToSection(target.sectionId);
                                        onSelectItem(target.sectionId, result.blockItemId);
                                        const title = result.doc.sections.find((s) => s.key === target.sectionId)?.title ?? "section";
                                        onStudioNotice({
                                            tone: "success",
                                            message: buildAddSuccessMessage({
                                                itemLabel: block.label,
                                                sectionTitle: title,
                                                zoneLabel: sectionZoneLabel(result.doc, target.sectionId),
                                                createdSection: target.createdSection,
                                            }),
                                        });
                                    }}
                                />
                            ))
                        : group.key === "text" ?
                            <PaletteButton
                                label="Text block"
                                description="Heading or helper copy inside a content section."
                                testId="layout-builder-palette-add-text"
                                onClick={() => addItemToTarget("text", addSectionTextItem, "text block")}
                            />
                        :   null}
                    </PaletteGroup>
                ))}
            </div>
        </aside>
    );
}

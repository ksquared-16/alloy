/**
 * Document composition authoring helpers (FD-8 / FD-9).
 * Client-side default generation — public runtime via FormEngineRenderer when composition is set.
 */

import {
    documentCompositionSchema,
    sortDocumentBlocks,
    type DocumentBlock,
    type DocumentComposition,
    type DocumentFieldRegionBlock,
} from "@/lib/forms/documentComposition";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";

export const COMPOSITION_BRANDING_LOGO_SRC = "pending:org-logo";
export const COMPOSITION_FOOTER_TEXT = "Organization footer — contact and legal text appear here.";

export const COMPOSITION_BLOCK_COPY = {
    workspaceTitle: "Document composition",
    workspaceLead: "Compose the intake document families receive. Field definitions stay canonical — regions reference them by key.",
    addInstruction: "Add instruction",
    addDivider: "Add divider",
    addSpacer: "Add spacer",
    addSignature: "Add signature region",
    addBranding: "Add header / logo",
    addFieldRegion: "Add section",
    addQuestionToSection: "Add question to section",
    removeEmptySection: "Remove section",
    moveSectionUp: "Move section up",
    moveSectionDown: "Move section down",
    fieldRegionEmpty: "No questions in this section yet — add one below.",
    brandingHeader: "Header / branding",
    footerRegion: "Footer",
} as const;

function newBlockId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function topLevelFieldIds(schema: FormSchemaV1): string[] {
    const main = schema.sections[0];
    if (main?.field_ids.length) return [...main.field_ids];
    return schema.fields.map((f) => f.id);
}

function firstSignatureFieldId(schema: FormSchemaV1): string | undefined {
    return schema.fields.find((f) => f.type === "signature")?.id;
}

/** Safe default composition from an existing schema — backward-compatible. */
export function buildDefaultDocumentComposition(schema: FormSchemaV1): DocumentComposition {
    const fieldIds = topLevelFieldIds(schema);
    const sectionTitle = schema.sections[0]?.title?.trim();
    const signatureFieldId = firstSignatureFieldId(schema);

    const blocks: DocumentBlock[] = [
        {
            id: "doc-heading",
            type: "heading",
            content: schema.title,
            level: "h1",
            order: 0,
        },
        {
            id: "brand-logo",
            type: "image",
            src: COMPOSITION_BRANDING_LOGO_SRC,
            alt: "Organization logo",
            role: "logo",
            order: 1,
        },
    ];

    if (sectionTitle) {
        blocks.push({
            id: "doc-section-heading",
            type: "heading",
            content: sectionTitle,
            level: "h2",
            order: 2,
        });
    }

    blocks.push({
        id: "doc-field-region-main",
        type: "field_region",
        title: sectionTitle ?? "Intake questions",
        helper: "Questions families complete in this section.",
        layout: "one_column",
        field_ids: fieldIds,
        order: 3,
    });

    if (signatureFieldId) {
        blocks.push({
            id: "doc-signature-bound",
            type: "signature",
            field_id: signatureFieldId,
            label: schema.fields.find((f) => f.id === signatureFieldId)?.label ?? "Signature",
            order: 4,
        });
    } else {
        blocks.push({
            id: "doc-signature-placeholder",
            type: "signature",
            label: "Signature",
            order: 4,
        });
    }

    blocks.push({
        id: "doc-footer-text",
        type: "text",
        content: COMPOSITION_FOOTER_TEXT,
        format: "plain",
        order: 5,
    });

    return {
        version: 1,
        blocks,
        branding_zones: [
            { id: "zone-header", zone: "header", block_ids: ["brand-logo"] },
            { id: "zone-footer", zone: "footer", block_ids: ["doc-footer-text"] },
        ],
    };
}

export function parseDocumentComposition(value: unknown): DocumentComposition | null {
    const parsed = documentCompositionSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}

/** Returns persisted composition or a generated default (not persisted until save). */
export function resolveDocumentComposition(schema: FormSchemaV1): DocumentComposition {
    const existing = parseDocumentComposition(schema.document_composition);
    if (existing) return syncCompositionWithSchemaFields(schema, existing);
    return buildDefaultDocumentComposition(schema);
}

function collectFieldRegionIds(composition: DocumentComposition): Set<string> {
    const ids = new Set<string>();
    for (const block of composition.blocks) {
        if (block.type === "field_region") {
            for (const fid of block.field_ids) ids.add(fid);
        }
    }
    return ids;
}

/** Ensures new top-level fields appear in the primary field region. */
export function syncCompositionWithSchemaFields(
    schema: FormSchemaV1,
    composition: DocumentComposition
): DocumentComposition {
    const topIds = topLevelFieldIds(schema);
    const referenced = collectFieldRegionIds(composition);
    const missing = topIds.filter((id) => !referenced.has(id));
    if (missing.length === 0) return composition;

    const blocks = composition.blocks.map((b) => ({ ...b }));
    const regionIndices = blocks
        .map((b, i) => (b.type === "field_region" ? i : -1))
        .filter((i) => i >= 0);
    const targetIdx = regionIndices.length > 0 ? regionIndices[regionIndices.length - 1]! : -1;
    if (targetIdx >= 0) {
        const region = blocks[targetIdx] as DocumentFieldRegionBlock;
        blocks[targetIdx] = {
            ...region,
            field_ids: [...region.field_ids, ...missing.filter((id) => !region.field_ids.includes(id))],
        };
    } else {
        blocks.push({
            id: newBlockId("field-region"),
            type: "field_region",
            title: schema.sections[0]?.title ?? "Intake questions",
            layout: "one_column",
            field_ids: topIds,
            order: blocks.length,
        });
    }

    return { ...composition, blocks };
}

export function patchSchemaComposition(
    schema: FormSchemaV1,
    composition: DocumentComposition
): FormSchemaV1 {
    const synced = syncCompositionWithSchemaFields(schema, composition);
    const sorted = sortDocumentBlocks(synced.blocks);
    const titleBlock = sorted.find((b): b is Extract<DocumentBlock, { type: "heading" }> => b.type === "heading" && b.level === "h1");
    const orderedFieldIds = flattenFieldIdsFromComposition({ ...synced, blocks: sorted }, schema);

    let next: FormSchemaV1 = {
        ...schema,
        document_composition: { ...synced, blocks: sorted },
    };

    if (titleBlock?.content.trim() && titleBlock.content !== schema.title) {
        next = { ...next, title: titleBlock.content.trim() };
    }

    if (schema.sections[0]) {
        const s0 = schema.sections[0];
        const firstRegion = sorted.find((b): b is DocumentFieldRegionBlock => b.type === "field_region");
        next = {
            ...next,
            sections: [
                {
                    ...s0,
                    title: firstRegion?.title ?? s0.title,
                    field_ids: orderedFieldIds,
                },
                ...schema.sections.slice(1),
            ],
        };
    }

    return next;
}

export function updateCompositionBlock(
    composition: DocumentComposition,
    blockId: string,
    patch: Partial<DocumentBlock>
): DocumentComposition {
    return {
        ...composition,
        blocks: composition.blocks.map((b) => (b.id === blockId ? ({ ...b, ...patch } as DocumentBlock) : b)),
    };
}

export function addCompositionBlock(
    composition: DocumentComposition,
    block: DocumentBlock
): DocumentComposition {
    const order = composition.blocks.length;
    return {
        ...composition,
        blocks: [...composition.blocks, { ...block, order }],
    };
}

export function removeCompositionBlock(composition: DocumentComposition, blockId: string): DocumentComposition {
    return {
        ...composition,
        blocks: composition.blocks.filter((b) => b.id !== blockId),
        branding_zones: composition.branding_zones?.map((z) => ({
            ...z,
            block_ids: z.block_ids.filter((id) => id !== blockId),
        })),
    };
}

export function listFieldRegionBlocks(composition: DocumentComposition): DocumentFieldRegionBlock[] {
    return sortDocumentBlocks(composition.blocks).filter(
        (b): b is DocumentFieldRegionBlock => b.type === "field_region"
    );
}

export function flattenFieldIdsFromComposition(
    composition: DocumentComposition,
    schema: FormSchemaV1
): string[] {
    const ordered: string[] = [];
    const seen = new Set<string>();
    for (const block of sortDocumentBlocks(composition.blocks)) {
        if (block.type !== "field_region") continue;
        for (const fid of block.field_ids) {
            if (!schema.fields.some((f) => f.id === fid) || seen.has(fid)) continue;
            seen.add(fid);
            ordered.push(fid);
        }
    }
    for (const fid of topLevelFieldIds(schema)) {
        if (!seen.has(fid)) ordered.push(fid);
    }
    return ordered;
}

export function moveCompositionBlock(
    composition: DocumentComposition,
    blockId: string,
    dir: -1 | 1
): DocumentComposition {
    const sorted = sortDocumentBlocks(composition.blocks);
    const idx = sorted.findIndex((b) => b.id === blockId);
    if (idx < 0) return composition;
    const j = idx + dir;
    if (j < 0 || j >= sorted.length) return composition;
    const next = [...sorted];
    const tmp = next[idx]!;
    next[idx] = next[j]!;
    next[j] = tmp;
    return {
        ...composition,
        blocks: next.map((b, i) => ({ ...b, order: i })),
    };
}

export function moveFieldInRegion(
    composition: DocumentComposition,
    regionId: string,
    fieldId: string,
    dir: -1 | 1
): DocumentComposition {
    return {
        ...composition,
        blocks: composition.blocks.map((b) => {
            if (b.type !== "field_region" || b.id !== regionId) return b;
            const ids = [...b.field_ids];
            const idx = ids.indexOf(fieldId);
            if (idx < 0) return b;
            const j = idx + dir;
            if (j < 0 || j >= ids.length) return b;
            const tmp = ids[idx]!;
            ids[idx] = ids[j]!;
            ids[j] = tmp!;
            return { ...b, field_ids: ids };
        }),
    };
}

export function moveFieldToRegion(
    composition: DocumentComposition,
    fieldId: string,
    toRegionId: string
): DocumentComposition {
    return {
        ...composition,
        blocks: composition.blocks.map((b) => {
            if (b.type !== "field_region") return b;
            if (b.id === toRegionId) {
                if (b.field_ids.includes(fieldId)) return b;
                return { ...b, field_ids: [...b.field_ids, fieldId] };
            }
            if (b.field_ids.includes(fieldId)) {
                return { ...b, field_ids: b.field_ids.filter((id) => id !== fieldId) };
            }
            return b;
        }),
    };
}

export function addFieldIdToRegion(
    composition: DocumentComposition,
    regionId: string,
    fieldId: string
): DocumentComposition {
    return {
        ...composition,
        blocks: composition.blocks.map((b) => {
            if (b.type !== "field_region") return b;
            if (b.id === regionId) {
                return b.field_ids.includes(fieldId) ? b : { ...b, field_ids: [...b.field_ids, fieldId] };
            }
            return b.field_ids.includes(fieldId) ? { ...b, field_ids: b.field_ids.filter((id) => id !== fieldId) } : b;
        }),
    };
}

export function removeFieldIdFromComposition(
    composition: DocumentComposition,
    fieldId: string
): DocumentComposition {
    return {
        ...composition,
        blocks: composition.blocks.map((b) =>
            b.type === "field_region" ?
                { ...b, field_ids: b.field_ids.filter((id) => id !== fieldId) }
            :   b
        ),
    };
}

export function canRemoveFieldRegion(block: DocumentFieldRegionBlock): boolean {
    return block.field_ids.length === 0;
}

export function fieldById(schema: FormSchemaV1, fieldId: string): FormField | undefined {
    return schema.fields.find((f) => f.id === fieldId);
}

export function fieldRegionLayoutClass(layout: DocumentFieldRegionBlock["layout"]): string {
    switch (layout) {
        case "two_column":
            return "grid gap-2 sm:grid-cols-2";
        case "three_column":
            return "grid gap-2 sm:grid-cols-3";
        case "inline_compact":
            return "flex flex-col gap-1.5";
        default:
            return "space-y-2";
    }
}

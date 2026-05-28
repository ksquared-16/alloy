/**
 * Document composition block model (FD-4 foundation).
 * Optional `document_composition` on form schema — rendered by FormEngineRenderer when present.
 */

import { z } from "zod";

const documentBlockBaseSchema = z
    .object({
        id: z.string().min(1),
        /** Reading order within the composition layer (parallel to field sections). */
        order: z.number().int().min(0).optional(),
    })
    .strict();

export const documentTextBlockSchema = documentBlockBaseSchema
    .extend({
        type: z.literal("text"),
        content: z.string().min(1),
        /** Rich text staging — plain string until editor ships. */
        format: z.enum(["plain", "markdown"]).optional().default("plain"),
    })
    .strict();

export const documentHeadingBlockSchema = documentBlockBaseSchema
    .extend({
        type: z.literal("heading"),
        content: z.string().min(1),
        level: z.enum(["h1", "h2", "h3"]).optional().default("h2"),
    })
    .strict();

export const documentSignatureBlockSchema = documentBlockBaseSchema
    .extend({
        type: z.literal("signature"),
        /** When set, binds to an existing form field id for capture. */
        field_id: z.string().min(1).optional(),
        label: z.string().min(1).optional(),
    })
    .strict();

export const documentImageBlockSchema = documentBlockBaseSchema
    .extend({
        type: z.literal("image"),
        /** Asset reference or external URL — resolved server-side in later stages. */
        src: z.string().min(1),
        alt: z.string().optional(),
        /** logo | banner | inline */
        role: z.enum(["logo", "banner", "inline"]).optional().default("inline"),
    })
    .strict();

export const documentSpacerBlockSchema = documentBlockBaseSchema
    .extend({
        type: z.literal("spacer"),
        size: z.enum(["sm", "md", "lg"]).optional().default("md"),
    })
    .strict();

export const documentDividerBlockSchema = documentBlockBaseSchema
    .extend({
        type: z.literal("divider"),
        style: z.enum(["solid", "dashed", "brand"]).optional().default("solid"),
    })
    .strict();

/** Groups existing form fields into a document section (FD-9). */
export const documentFieldRegionBlockSchema = documentBlockBaseSchema
    .extend({
        type: z.literal("field_region"),
        title: z.string().optional(),
        helper: z.string().optional(),
        layout: z.enum(["one_column", "two_column", "three_column", "inline_compact"]).optional().default("one_column"),
        field_ids: z.array(z.string().min(1)),
    })
    .strict();

export const documentBlockSchema = z.discriminatedUnion("type", [
    documentTextBlockSchema,
    documentHeadingBlockSchema,
    documentSignatureBlockSchema,
    documentImageBlockSchema,
    documentSpacerBlockSchema,
    documentDividerBlockSchema,
    documentFieldRegionBlockSchema,
]);

export type DocumentBlock = z.infer<typeof documentBlockSchema>;
export type DocumentTextBlock = z.infer<typeof documentTextBlockSchema>;
export type DocumentHeadingBlock = z.infer<typeof documentHeadingBlockSchema>;
export type DocumentSignatureBlock = z.infer<typeof documentSignatureBlockSchema>;
export type DocumentImageBlock = z.infer<typeof documentImageBlockSchema>;
export type DocumentSpacerBlock = z.infer<typeof documentSpacerBlockSchema>;
export type DocumentDividerBlock = z.infer<typeof documentDividerBlockSchema>;
export type DocumentFieldRegionBlock = z.infer<typeof documentFieldRegionBlockSchema>;

export const documentBrandingZoneSchema = z
    .object({
        id: z.string().min(1),
        /** header | footer | cover */
        zone: z.enum(["header", "footer", "cover"]),
        block_ids: z.array(z.string().min(1)),
    })
    .strict();

export type DocumentBrandingZone = z.infer<typeof documentBrandingZoneSchema>;

export const documentCompositionSchema = z
    .object({
        version: z.literal(1),
        blocks: z.array(documentBlockSchema),
        branding_zones: z.array(documentBrandingZoneSchema).optional(),
    })
    .strict();

export type DocumentComposition = z.infer<typeof documentCompositionSchema>;

export function safeParseDocumentComposition(value: unknown) {
    return documentCompositionSchema.safeParse(value);
}

export function sortDocumentBlocks(blocks: DocumentBlock[]): DocumentBlock[] {
    return [...blocks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

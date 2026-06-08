"use client";

import clsx from "clsx";
import type { DocumentBlock } from "@/lib/forms/documentComposition";
import { opMetadata, opMutedMeta } from "@/lib/operational/ui/operationalVisualTokens";

const BLOCK_LABEL: Record<DocumentBlock["type"], string> = {
    text: "Text block",
    heading: "Heading",
    signature: "Signature region",
    image: "Image / logo",
    spacer: "Spacer",
    divider: "Divider",
    field_region: "Field section",
};

type Props = {
    block: DocumentBlock;
    className?: string;
};

/** Authoring-time placeholder — not public intake renderer (FD-4). */
export function DocumentCompositionBlockPlaceholder({ block, className }: Props) {
    return (
        <div
            className={clsx(
                "rounded-lg border border-dashed border-alloy-midnight/15 bg-alloy-stone/10 px-3 py-2",
                className
            )}
            data-testid={`document-block-${block.type}-${block.id}`}
        >
            <p className={opMetadata}>{BLOCK_LABEL[block.type]}</p>
            {"content" in block && block.content ?
                <p className={clsx("mt-0.5 line-clamp-2 text-sm", opMutedMeta)}>{block.content}</p>
            :   null}
            {"src" in block ?
                <p className={clsx("mt-0.5 truncate text-xs", opMutedMeta)}>{block.src}</p>
            :   null}
        </div>
    );
}

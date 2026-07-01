"use client";

import LayoutRuntimeFieldInput, {
    layoutRuntimeDependentValueReader,
} from "@/components/layout/LayoutRuntimeFieldInput";
import type { ComponentProps } from "react";

type InlineProps = Omit<ComponentProps<typeof LayoutRuntimeFieldInput>, "compact">;

/** Compact in-place drawer row/card edit control — preserves configured layout density. */
export default function LayoutRuntimeInlineEditFieldControl({
    variant = "inline",
    ...props
}: InlineProps) {
    return <LayoutRuntimeFieldInput {...props} variant={variant} />;
}

export { layoutRuntimeDependentValueReader };

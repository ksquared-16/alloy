"use client";

import type { ReactNode } from "react";
import LayoutRuntimeLinkSurface, { type LayoutRuntimeLinkHandler } from "@/components/layout/LayoutRuntimeLinkSurface";
import type { LayoutFieldAdornment, LayoutItem } from "@/lib/layout/layoutV2";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export type LayoutRuntimeChildLinkHandler = LayoutRuntimeLinkHandler;

type Props = {
    componentName: string;
    surface: "queue" | "drawer";
    item: LayoutItem;
    rowRecord: ProofRuntimeRecord;
    anchorRecord?: ProofRuntimeRecord;
    adornment?: LayoutFieldAdornment | null;
    display: ReactNode;
    secondary?: ReactNode;
    onAction?: LayoutRuntimeChildLinkHandler;
    className?: string;
};

export default function LayoutRuntimeChildLinkSurface(props: Props) {
    return <LayoutRuntimeLinkSurface {...props} entityType="child" />;
}

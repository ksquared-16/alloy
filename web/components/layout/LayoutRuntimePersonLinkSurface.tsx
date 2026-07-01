"use client";

import type { ReactNode } from "react";
import LayoutRuntimeLinkSurface, { type LayoutRuntimeLinkHandler } from "@/components/layout/LayoutRuntimeLinkSurface";
import type { LayoutFieldAdornment, LayoutItem } from "@/lib/layout/layoutV2";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export type LayoutRuntimePersonLinkHandler = LayoutRuntimeLinkHandler;

type Props = {
    componentName: string;
    surface: "queue" | "drawer";
    item: LayoutItem;
    personId: string | null | undefined;
    adornment?: LayoutFieldAdornment | null;
    display: ReactNode;
    onAction?: LayoutRuntimePersonLinkHandler;
    rowRecord?: ProofRuntimeRecord;
    anchorRecord?: ProofRuntimeRecord;
    className?: string;
};

export default function LayoutRuntimePersonLinkSurface(props: Props) {
    return <LayoutRuntimeLinkSurface {...props} entityType="person" />;
}

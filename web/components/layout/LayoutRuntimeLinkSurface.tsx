"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import AdornmentIcon from "@/components/layout/AdornmentIcon";
import LayoutRuntimeLinkDebugBadge from "@/components/layout/LayoutRuntimeLinkDebugBadge";
import type { LayoutFieldAdornment, LayoutItem } from "@/lib/layout/layoutV2";
import { isolateLayoutRuntimeLinkClick } from "@/lib/layout/runtime/isolateLayoutRuntimeLinkClick";
import {
    logChildLinkStep,
    logPersonLinkStep,
    summarizeLayoutRuntimeLinkRow,
} from "@/lib/layout/runtime/childLinkBrowserTrace";
import {
    ensureLayoutRuntimeChildLinkAdornment,
    ensureLayoutRuntimePersonLinkAdornment,
    layoutRuntimeChildLinkDomDataset,
    layoutRuntimePersonLinkDomDataset,
} from "@/lib/layout/runtime/layoutRuntimeLinkHarness";
import {
    buildLayoutRuntimeLinkDebugKey,
    classifyLayoutRuntimeLinkTargetIdType,
    registerLayoutRuntimeLinkDebug,
    reportLayoutRuntimeLinkDebugProgress,
    resolveLayoutRuntimeLinkRouteMethod,
    setActiveLayoutRuntimeLinkDebugKey,
} from "@/lib/layout/runtime/layoutRuntimeLinkDebug";
import { resolveLayoutRuntimeChildOpenTarget } from "@/lib/layout/runtime/resolveLayoutRuntimeChildOpenTarget";
import { summarizeLayoutRuntimeChildRowForDebug } from "@/lib/layout/runtime/enrichLayoutRuntimeChildRowIdentifiers";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export type LayoutRuntimeLinkHandler = (
    item: LayoutItem,
    adornment: LayoutFieldAdornment,
    rowRecord?: ProofRuntimeRecord,
) => void;

type Props = {
    componentName: string;
    surface: "queue" | "drawer";
    entityType: "person" | "child";
    item: LayoutItem;
    display: ReactNode;
    secondary?: ReactNode;
    onAction?: LayoutRuntimeLinkHandler;
    className?: string;
    rowRecord?: ProofRuntimeRecord;
    anchorRecord?: ProofRuntimeRecord;
    personId?: string | null;
    adornment?: LayoutFieldAdornment | null;
    /** When row chrome already shows the entity avatar, omit duplicate child/person icons. */
    suppressEntityIcon?: boolean;
};

/** Unified person/child link surface with optional visible debug badge. */
export default function LayoutRuntimeLinkSurface({
    componentName,
    surface,
    entityType,
    item,
    display,
    secondary,
    onAction,
    className,
    rowRecord,
    anchorRecord,
    personId,
    adornment,
    suppressEntityIcon = false,
}: Props) {
    const linkSurface = surface === "drawer" ? "drawer" : "queue";
    const effectiveAdornment = useMemo((): LayoutFieldAdornment => {
        return entityType === "child"
            ? ensureLayoutRuntimeChildLinkAdornment(adornment, item.refKey)
            : ensureLayoutRuntimePersonLinkAdornment(adornment);
    }, [adornment, entityType, item.refKey]);
    const showEntityIcon = !suppressEntityIcon;

    const childOpenTarget = useMemo(() => {
        if (entityType !== "child" || !rowRecord) return null;
        return resolveLayoutRuntimeChildOpenTarget(rowRecord, {
            anchorRecord,
            idPath: effectiveAdornment.action?.idPath ?? "child.id",
            refKey: item.refKey,
        });
    }, [anchorRecord, effectiveAdornment.action?.idPath, entityType, item.refKey, rowRecord]);

    const resolvedPersonId = useMemo(() => {
        if (entityType === "person") {
            return personId?.trim()
                || String(anchorRecord?.["opportunity.primary_person_id"] ?? anchorRecord?.["person.id"] ?? "").trim()
                || null;
        }
        return childOpenTarget?.personId?.trim() || null;
    }, [anchorRecord, childOpenTarget?.personId, entityType, personId]);

    const targetId =
        entityType === "child"
            ? (childOpenTarget?.personId ?? childOpenTarget?.customerMemberId ?? null)
            : resolvedPersonId;

    const targetIdType = classifyLayoutRuntimeLinkTargetIdType({
        entityType,
        targetId,
        childOpenTarget,
    });

    const rowKey = rowRecord?.id != null ? String(rowRecord.id) : null;
    const debugKey = buildLayoutRuntimeLinkDebugKey({
        surface: linkSurface,
        entityType,
        rowKey,
        refKey: item.refKey,
        componentName,
    });

    const routeMethod = resolveLayoutRuntimeLinkRouteMethod(linkSurface, entityType);
    const handlerAttached = Boolean(onAction);
    const linkable =
        entityType === "child" ?
            Boolean(rowRecord) && Boolean(targetId) && handlerAttached
        :   handlerAttached && Boolean(resolvedPersonId);

    const childRowSummary = useMemo(() => {
        if (entityType !== "child" || !rowRecord) return null;
        return summarizeLayoutRuntimeChildRowForDebug(rowRecord);
    }, [entityType, rowRecord]);

    useEffect(() => {
        registerLayoutRuntimeLinkDebug({
            debugKey,
            surface: linkSurface,
            entityType,
            linkable,
            handlerAttached,
            targetId,
            targetIdType,
            routeMethod,
            componentName,
            rowKey,
            childRowSummary,
        });
    }, [
        childRowSummary,
        componentName,
        debugKey,
        entityType,
        handlerAttached,
        linkSurface,
        linkable,
        routeMethod,
        rowKey,
        targetId,
        targetIdType,
    ]);

    const domDataset =
        entityType === "child" && rowRecord
            ? layoutRuntimeChildLinkDomDataset(rowRecord, surface, anchorRecord)
            : layoutRuntimePersonLinkDomDataset(resolvedPersonId, surface);

    const handleOpen = () => {
        setActiveLayoutRuntimeLinkDebugKey(debugKey);
        reportLayoutRuntimeLinkDebugProgress("clicked", null, debugKey);

        if (entityType === "child") {
            logChildLinkStep("click", {
                surface: linkSurface,
                rowKey,
                row: summarizeLayoutRuntimeLinkRow(rowRecord),
                targetEntityType: "child",
                openMethod: componentName,
                hasHandler: handlerAttached,
                personId: childOpenTarget?.personId ?? null,
                customerMemberId: childOpenTarget?.customerMemberId ?? null,
                ocmId: childOpenTarget?.ocmId ?? null,
            });
        } else {
            logPersonLinkStep("click", {
                surface: linkSurface,
                rowKey,
                targetEntityType: "person",
                openMethod: componentName,
                personId: resolvedPersonId,
                hasHandler: handlerAttached,
            });
        }

        if (!onAction) {
            reportLayoutRuntimeLinkDebugProgress("failed", "missing_onAction_handler", debugKey);
            return;
        }

        if (entityType === "child" && !rowRecord) {
            reportLayoutRuntimeLinkDebugProgress("failed", "missing_row_record", debugKey);
            return;
        }

        reportLayoutRuntimeLinkDebugProgress("resolving", null, debugKey);
        onAction(item, effectiveAdornment, rowRecord);
    };

    const linkButtonClass = [
        "inline-flex min-w-0 items-center gap-1 rounded px-0 text-left text-inherit",
        "hover:bg-[#eef3fb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#00458C]",
        className,
    ]
        .filter(Boolean)
        .join(" ");

    const entityAttr = entityType === "child" ? "child" : "person";
    const dataLinkAttr =
        entityType === "child"
            ? { "data-layout-runtime-child-link": "true" as const }
            : { "data-layout-runtime-person-link": "true" as const };

    return (
        <span className="inline-flex max-w-full items-center gap-0.5">
            {linkable && handlerAttached ?
                <button
                    type="button"
                    className={linkButtonClass}
                    title={`Open ${entityType} record`}
                    aria-label={`Open ${entityType} record`}
                    {...domDataset}
                    {...dataLinkAttr}
                    data-layout-runtime-adornment-link="true"
                    data-layout-runtime-adornment-entity={entityAttr}
                    onPointerDown={isolateLayoutRuntimeLinkClick}
                    onMouseDown={isolateLayoutRuntimeLinkClick}
                    onClick={(e) => {
                        isolateLayoutRuntimeLinkClick(e);
                        handleOpen();
                    }}
                >
                    {showEntityIcon && effectiveAdornment.icon ?
                        <AdornmentIcon icon={effectiveAdornment.icon} className="h-3 w-3 shrink-0" aria-hidden />
                    :   null}
                    <span className="min-w-0 truncate">{display}</span>
                    {secondary ? <span className="shrink-0 opacity-80">{secondary}</span> : null}
                </button>
            :   <span className="inline-flex min-w-0 items-center gap-1.5">
                    {showEntityIcon && effectiveAdornment.icon ?
                        <AdornmentIcon icon={effectiveAdornment.icon} className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
                    :   null}
                    <span className="min-w-0 truncate">{display}</span>
                    {secondary ? <span className="shrink-0 opacity-80">{secondary}</span> : null}
                </span>
            }
            <LayoutRuntimeLinkDebugBadge
                debugKey={debugKey}
                onTestOpen={handleOpen}
                showTestOpen={entityType === "child"}
            />
        </span>
    );
}

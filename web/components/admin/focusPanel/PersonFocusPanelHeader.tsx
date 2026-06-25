"use client";

import type { ReactNode } from "react";
import { ChevronRight, User, X } from "lucide-react";

import FocusPanelHeader from "@/components/admin/focusPanel/FocusPanelHeader";
import { PersonDrawerHeaderControls } from "@/components/admin/entity/PersonDrawerHeaderControls";
import VmPersonStatusControl from "@/components/admin/vmDrawer/VmPersonStatusControl";
import { useActiveRuntimePerspective } from "@/lib/adminV2/runtime/perspective/RuntimePerspectiveContext";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
import type { StatusControlVm } from "@/lib/adminV2/viewModel/drawer/types";
import type { PersonStatusProfileKey } from "@/lib/admin/person/personStatusApplicability";

export type PersonFocusPanelHeaderProps = {
    title: string;
    personId: string;
    record: Record<string, unknown>;
    entityLabel: string;
    isChild: boolean;
    statusLabel: string | null;
    statusControl: StatusControlVm | null;
    currentStatusKey: string;
    statusProfile?: PersonStatusProfileKey | null;
    canMutate: boolean;
    activeMode: FocusPanelMode;
    onModeChange: (mode: FocusPanelMode) => void;
    onClose: () => void;
    backLink?: { label: string; onClick: () => void } | null;
    businessProcessLabel?: string | null;
    queueNavigation?: ReactNode | null;
};

export default function PersonFocusPanelHeader({
    title,
    personId,
    record,
    entityLabel,
    isChild,
    statusLabel,
    statusControl,
    currentStatusKey,
    statusProfile = null,
    canMutate,
    activeMode,
    onModeChange,
    onClose,
    backLink,
    businessProcessLabel,
    queueNavigation,
}: PersonFocusPanelHeaderProps) {
    const perspective = useActiveRuntimePerspective();
    const breadcrumbParts = [
        businessProcessLabel?.trim() || entityLabel,
        perspective?.label?.trim(),
        title,
    ].filter(Boolean);

    const chromeRow = (
        <div className="alloy-os-focus-panel-chrome-row">
            <button
                type="button"
                onClick={onClose}
                aria-label="Close Focus Panel"
                className="alloy-os-focus-panel-chrome-row__close"
                data-focus-panel-close="true"
            >
                <X className="h-4 w-4" aria-hidden />
            </button>
            <nav
                className="alloy-os-focus-panel-chrome-row__breadcrumb min-w-0"
                aria-label="Subject context"
                data-focus-panel-breadcrumb="true"
            >
                {breadcrumbParts.map((part, index) => (
                    <span key={`${part}-${index}`} className="inline-flex min-w-0 items-center gap-1">
                        {index > 0 ?
                            <ChevronRight className="h-3 w-3 shrink-0 opacity-40" aria-hidden />
                        :   null}
                        <span className={index === breadcrumbParts.length - 1 ? "truncate font-medium" : "truncate opacity-70"}>
                            {part}
                        </span>
                    </span>
                ))}
            </nav>
            <div className="alloy-os-focus-panel-chrome-row__actions shrink-0">
                {backLink ?
                    <button
                        type="button"
                        className="text-xs font-semibold text-alloy-juniper hover:underline"
                        onClick={backLink.onClick}
                        data-focus-panel-back-link="true"
                    >
                        {backLink.label}
                    </button>
                :   null}
                <PersonDrawerHeaderControls
                    personId={personId}
                    overviewData={record}
                    opportunitySingular={entityLabel}
                    proofLayoutActions
                    canMutate={canMutate}
                    manageDisabledReason="Person manage actions are not configured yet."
                />
            </div>
        </div>
    );

    const subjectRow = (
        <div className="alloy-os-focus-panel-subject-row">
            <div
                className="alloy-os-focus-panel-subject-row__avatar"
                data-focus-panel-subject-avatar="true"
                aria-hidden
            >
                <User className="h-5 w-5" />
            </div>
            <div className="alloy-os-focus-panel-subject-row__main min-w-0">
                <h2 id="admin-focus-panel-title" className="alloy-os-focus-panel-subject-row__title">
                    {title}
                </h2>
                {perspective?.label ?
                    <p className="alloy-os-focus-panel-subject-row__mission" data-focus-panel-mission="true">
                        {perspective.label}
                        {isChild ? " · Child subject" : ""}
                    </p>
                :   null}
                <div className="alloy-os-focus-panel-subject-row__state">
                    {statusControl ?
                        <VmPersonStatusControl
                            personId={personId}
                            statusLabel={statusLabel}
                            currentStatusKey={currentStatusKey}
                            statusControl={statusControl}
                            statusProfile={statusProfile}
                            canMutate={canMutate}
                            childSurface={isChild}
                        />
                    :   null}
                </div>
            </div>
        </div>
    );

    return (
        <FocusPanelHeader
            chromeRow={chromeRow}
            subjectRow={subjectRow}
            activeMode={activeMode}
            onModeChange={onModeChange}
            queueNavigation={queueNavigation}
        />
    );
}

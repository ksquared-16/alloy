"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import type { ProgramOperatorDetail } from "@/lib/programs/programsOperatorModel";
import { useEffect, useRef, useState } from "react";

export function ProgramSelectedWorkspace({
    detail,
    canMutate,
    locationsHref,
    onEdit,
    onManageLocations,
    onArchive,
    onRestore,
    onDelete,
}: {
    detail: ProgramOperatorDetail;
    canMutate: boolean;
    locationsHref: string;
    onEdit: () => void;
    onManageLocations: () => void;
    onArchive: () => void;
    onRestore: () => void;
    onDelete: () => void;
}) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const archived = detail.lifecycleStatus === "retired";
    const previewLocations = detail.locationLabels.slice(0, 4);
    const overflow = Math.max(0, detail.locationLabels.length - 4);

    useEffect(() => {
        if (!menuOpen) return;
        const onPointer = (event: MouseEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
        };
        window.addEventListener("mousedown", onPointer);
        return () => window.removeEventListener("mousedown", onPointer);
    }, [menuOpen]);

    return (
        <div className="space-y-4" data-testid="programs-selected-workspace">
            <section
                className="process-config-setup-card p-5"
                data-testid="programs-selected-header"
            >
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="config-typo-workspace-title text-xl text-alloy-midnight">
                                {detail.name}
                            </h2>
                            <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                    archived
                                        ? "bg-alloy-stone/40 text-alloy-midnight/55"
                                        : "bg-alloy-bend-pine/10 text-alloy-bend-pine"
                                }`}
                                data-testid="programs-selected-status"
                            >
                                {detail.statusLabel}
                            </span>
                        </div>
                        <p className="mt-1.5 text-sm text-alloy-midnight/55" data-testid="programs-selected-summary">
                            {[detail.ageRangeLabel, detail.availabilityLabel].filter(Boolean).join(" · ")
                                || detail.availabilityLabel}
                        </p>
                    </div>
                    {canMutate ?
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                            {archived ?
                                <ConfigurationPrimaryButton
                                    onClick={onRestore}
                                    data-testid="programs-restore"
                                >
                                    Restore Program
                                </ConfigurationPrimaryButton>
                            :   <ConfigurationPrimaryButton
                                    onClick={onEdit}
                                    data-testid="programs-edit"
                                >
                                    Edit Program
                                </ConfigurationPrimaryButton>
                            }
                            <div className="relative" ref={menuRef}>
                                <ConfigurationSecondaryButton
                                    aria-haspopup="menu"
                                    aria-expanded={menuOpen}
                                    onClick={() => setMenuOpen((open) => !open)}
                                    data-testid="programs-more"
                                >
                                    <MoreHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden />
                                    <span className="sr-only">More</span>
                                </ConfigurationSecondaryButton>
                                {menuOpen ?
                                    <div
                                        role="menu"
                                        className="absolute right-0 z-20 mt-1 min-w-[11rem] rounded-lg border border-alloy-stone/25 bg-white py-1 shadow-sm"
                                        data-testid="programs-more-menu"
                                    >
                                        {!archived ?
                                            <button
                                                type="button"
                                                role="menuitem"
                                                className="block w-full px-3 py-2 text-left text-sm text-alloy-midnight hover:bg-alloy-stone/10"
                                                onClick={() => {
                                                    setMenuOpen(false);
                                                    onArchive();
                                                }}
                                                data-testid="programs-archive"
                                            >
                                                Archive Program
                                            </button>
                                        :   null}
                                        <button
                                            type="button"
                                            role="menuitem"
                                            className="block w-full px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                                            onClick={() => {
                                                setMenuOpen(false);
                                                onDelete();
                                            }}
                                            data-testid="programs-delete"
                                        >
                                            Delete Program
                                        </button>
                                    </div>
                                :   null}
                            </div>
                        </div>
                    :   null}
                </div>
            </section>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
                <section className="process-config-setup-card p-5" data-testid="programs-about-tile">
                    <h3 className="text-sm font-semibold text-alloy-midnight">About this Program</h3>
                    <dl className="mt-4 space-y-4">
                        <div>
                            <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/40">
                                Description
                            </dt>
                            <dd className="mt-1 text-sm text-alloy-midnight/75 whitespace-pre-wrap">
                                {detail.descriptionDisplay}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/40">
                                Age range
                            </dt>
                            <dd className="mt-1 text-sm text-alloy-midnight/75">{detail.ageRangeDisplay}</dd>
                        </div>
                    </dl>
                </section>

                <section className="process-config-setup-card p-5" data-testid="programs-locations-tile">
                    <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold text-alloy-midnight">Available at Locations</h3>
                        <span className="text-sm font-semibold text-alloy-midnight/55" data-testid="programs-locations-count">
                            {detail.locationCount}
                        </span>
                    </div>
                    {detail.locationCount === 0 ?
                        <div className="mt-4">
                            <p className="text-sm text-alloy-midnight/70">Not available at any Locations</p>
                            <p className="mt-1 text-sm text-alloy-midnight/50">
                                Choose where this Program should be offered.
                            </p>
                            {canMutate && !archived ?
                                <ConfigurationPrimaryButton
                                    className="mt-3"
                                    onClick={onManageLocations}
                                    data-testid="programs-manage-locations-empty"
                                >
                                    Manage Locations
                                </ConfigurationPrimaryButton>
                            :   null}
                        </div>
                    :   <div className="mt-4">
                            <ul className="space-y-1.5 text-sm text-alloy-midnight/75">
                                {previewLocations.map((label) => (
                                    <li key={label}>{label}</li>
                                ))}
                                {overflow > 0 ?
                                    <li className="text-alloy-midnight/50">+{overflow} more</li>
                                :   null}
                            </ul>
                            {canMutate && !archived ?
                                <button
                                    type="button"
                                    className="mt-3 text-sm font-medium text-alloy-bend-pine hover:underline"
                                    onClick={onManageLocations}
                                    data-testid="programs-manage-locations"
                                >
                                    Manage Locations
                                </button>
                            :   null}
                        </div>
                    }
                </section>
            </div>

            <section className="process-config-setup-card p-5" data-testid="programs-schedule-tile">
                <h3 className="text-sm font-semibold text-alloy-midnight">Schedule patterns</h3>
                <p className="mt-2 max-w-2xl text-sm text-alloy-midnight/60">
                    Full Day, Half Day, and weekly schedule patterns are managed within each Location.
                </p>
                <Link
                    href={locationsHref}
                    className="mt-3 inline-flex text-sm font-medium text-alloy-bend-pine hover:underline"
                    data-testid="programs-view-locations"
                >
                    View Locations
                </Link>
            </section>
        </div>
    );
}

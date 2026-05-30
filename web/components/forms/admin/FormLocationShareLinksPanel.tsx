"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/admin/StatusBadge";
import type { FormPublicLinkRow } from "@/components/forms/workspace/FormDistributionPanel";
import {
    distributionIsPreviewLink,
    distributionLinkLabel,
} from "@/lib/forms/distributionPresentation";
import { buildFormEmbedIframeSnippet } from "@/lib/forms/formSharePresentation";
import type { OutcomeRoutingLabelCatalog } from "@/lib/forms/outcomeConfigLabelCatalog";
import type { OutcomeConfigPickerOptions } from "@/lib/forms/resolveOutcomeConfigPickerOptions";
import { resolveLinkLocationLabel } from "@/lib/forms/locationSpecificPublicLinkMetadata";
import { readLinkEmbedUrl } from "@/lib/forms/intakeRuntimeOrchestrationStorage";
import {
    intakeWorkspaceBtnPrimary,
    intakeWorkspaceBtnSecondary,
} from "@/components/forms/workspace/IntakeWorkspaceHubView";
import { opMetadata, opMutedMeta } from "@/lib/operational/ui/operationalVisualTokens";

export type CreateLocationLinkInput = {
    label: string;
    locationId: string;
    workUnitId?: string | null;
};

type Props = {
    formId: string;
    formKey: string;
    formName: string;
    links: FormPublicLinkRow[];
    hasPublished: boolean;
    canMutate?: boolean;
    creating?: boolean;
    createErr?: string | null;
    copied?: string | null;
    onCopy: (key: string, text: string) => void;
    onCreateLocationLink: (input: CreateLocationLinkInput) => void | Promise<void>;
    onLinkCreated?: (linkId: string) => void;
};

/** Create and manage location-specific share links for one form (multi-site website intake). */
export function FormLocationShareLinksPanel({
    formId,
    formKey,
    formName,
    links,
    hasPublished,
    canMutate = false,
    creating = false,
    createErr = null,
    copied = null,
    onCopy,
    onCreateLocationLink,
}: Props) {
    const [labelCatalog, setLabelCatalog] = useState<OutcomeRoutingLabelCatalog | null>(null);
    const [pickerOptions, setPickerOptions] = useState<OutcomeConfigPickerOptions | null>(null);
    const [loading, setLoading] = useState(true);
    const [linkName, setLinkName] = useState("");
    const [locationId, setLocationId] = useState("");
    const [workUnitId, setWorkUnitId] = useState("");
    const [localErr, setLocalErr] = useState<string | null>(null);

    const loadPickers = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(
                `/api/admin/forms/${encodeURIComponent(formId)}/outcome-labels?include_picker_options=1`,
                { credentials: "include" }
            );
            const json = await res.json().catch(() => ({}));
            if (res.ok) {
                const data = json as OutcomeRoutingLabelCatalog & { pickerOptions?: OutcomeConfigPickerOptions | null };
                setLabelCatalog({
                    locations: data.locations ?? {},
                    workUnits: data.workUnits ?? {},
                    departments: data.departments ?? {},
                    verticals: data.verticals ?? {},
                    opportunityStatusKeys: data.opportunityStatusKeys ?? {},
                });
                setPickerOptions(data.pickerOptions ?? null);
            }
        } finally {
            setLoading(false);
        }
    }, [formId]);

    useEffect(() => {
        void loadPickers();
    }, [loadPickers]);

    const operationalLinks = useMemo(
        () => links.filter((l) => !distributionIsPreviewLink(l)),
        [links]
    );

    const handleCreate = () => {
        setLocalErr(null);
        const trimmedName = linkName.trim();
        if (!trimmedName) {
            setLocalErr("Link name is required.");
            return;
        }
        if (!locationId.trim()) {
            setLocalErr("Choose a location.");
            return;
        }
        void onCreateLocationLink({
            label: trimmedName,
            locationId: locationId.trim(),
            workUnitId: workUnitId.trim() || null,
        });
    };

    if (!hasPublished) {
        return (
            <p className={opMetadata} data-testid="location-share-links-publish-first">
                Publish your form before creating location-specific share links.
            </p>
        );
    }

    return (
        <div data-testid="form-location-share-links">
            <p className={opMutedMeta}>
                One form, multiple share links — each iframe routes new inquiries to the selected school or site.
            </p>

            {canMutate ?
                <div
                    className="mt-3 rounded-lg bg-white/95 px-3 py-3 ring-1 ring-alloy-midnight/[0.07]"
                    data-testid="location-share-link-create"
                >
                    <p className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/65">
                        Create location-specific link
                    </p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <label className="block space-y-1 sm:col-span-2">
                            <span className="text-xs font-medium text-alloy-midnight">Link name</span>
                            <input
                                type="text"
                                className="w-full rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-sm shadow-sm"
                                placeholder={`${formName} — West Campus`}
                                value={linkName}
                                data-testid="location-link-name"
                                onChange={(e) => setLinkName(e.target.value)}
                            />
                        </label>
                        <label className="block space-y-1">
                            <span className="text-xs font-medium text-alloy-midnight">Location / site</span>
                            <select
                                className="w-full rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-sm shadow-sm"
                                value={locationId}
                                disabled={loading}
                                data-testid="location-link-location"
                                onChange={(e) => setLocationId(e.target.value)}
                            >
                                <option value="">Select location…</option>
                                {(pickerOptions?.locations ?? []).map((opt) => (
                                    <option key={opt.id} value={opt.id}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block space-y-1">
                            <span className="text-xs font-medium text-alloy-midnight">Pipeline (optional)</span>
                            <select
                                className="w-full rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-sm shadow-sm"
                                value={workUnitId}
                                disabled={loading}
                                data-testid="location-link-work-unit"
                                onChange={(e) => setWorkUnitId(e.target.value)}
                            >
                                <option value="">Default enrollment routing</option>
                                {(pickerOptions?.workUnits ?? []).map((opt) => (
                                    <option key={opt.id} value={opt.id}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                    {localErr || createErr ?
                        <p className="mt-2 text-sm text-alloy-ember" role="alert">
                            {localErr ?? createErr}
                        </p>
                    :   null}
                    <button
                        type="button"
                        className={clsx(intakeWorkspaceBtnPrimary, "mt-3")}
                        disabled={creating || loading}
                        data-testid="location-link-create-submit"
                        onClick={handleCreate}
                    >
                        {creating ? "Creating…" : "Create location-specific link"}
                    </button>
                </div>
            :   null}

            <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm" data-testid="location-share-link-table">
                    <thead>
                        <tr className="border-b border-alloy-midnight/10 text-xs font-semibold uppercase tracking-wide text-alloy-midnight/55">
                            <th className="px-2 py-1.5">Link name</th>
                            <th className="px-2 py-1.5">Location</th>
                            <th className="px-2 py-1.5">Status</th>
                            <th className="px-2 py-1.5">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {operationalLinks.length === 0 ?
                            <tr>
                                <td colSpan={4} className={clsx("px-2 py-3", opMetadata)}>
                                    No share links yet. Create one above or use Get share link for a default link.
                                </td>
                            </tr>
                        :   operationalLinks.map((link) => {
                                const name = distributionLinkLabel(link, formKey);
                                const locationLabel = resolveLinkLocationLabel(link.metadata, labelCatalog?.locations);
                                const embedUrl = readLinkEmbedUrl(link.id);
                                const iframeSnippet =
                                    embedUrl ? buildFormEmbedIframeSnippet(embedUrl, name) : null;

                                return (
                                    <tr
                                        key={link.id}
                                        className="border-b border-alloy-midnight/[0.06]"
                                        data-testid={`location-share-link-row-${link.id}`}
                                    >
                                        <td className="px-2 py-2 font-medium text-alloy-midnight">{name}</td>
                                        <td className={clsx("px-2 py-2", opMetadata)}>
                                            {locationLabel ?? "Default org routing"}
                                        </td>
                                        <td className="px-2 py-2">
                                            <StatusBadge
                                                label={link.is_active ? "Live" : "Inactive"}
                                                variant={link.is_active ? "success" : "neutral"}
                                            />
                                        </td>
                                        <td className="px-2 py-2">
                                            <div className="flex flex-wrap gap-2">
                                                {iframeSnippet ?
                                                    <button
                                                        type="button"
                                                        className={intakeWorkspaceBtnSecondary}
                                                        data-testid={`location-link-copy-iframe-${link.id}`}
                                                        onClick={() => onCopy(`location-iframe-${link.id}`, iframeSnippet)}
                                                    >
                                                        {copied === `location-iframe-${link.id}` ? "Copied" : "Copy iframe"}
                                                    </button>
                                                :   null}
                                                {embedUrl ?
                                                    <a
                                                        href={embedUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className={intakeWorkspaceBtnSecondary}
                                                        data-testid={`location-link-open-${link.id}`}
                                                    >
                                                        Open
                                                    </a>
                                                :   null}
                                                {!embedUrl ?
                                                    <span className={clsx("self-center", opMutedMeta)}>
                                                        Copy embed when link is created
                                                    </span>
                                                :   null}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        }
                    </tbody>
                </table>
            </div>
        </div>
    );
}

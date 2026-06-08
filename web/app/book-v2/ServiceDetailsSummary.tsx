"use client";

import {
    accessMethodBookingDisplayLabel,
    accessMethodIsFrontDeskFlow,
    accessMethodIsHomeFlow,
} from "@/lib/book-v2/bookingCanonicalMaps";
import { ServiceDetails, SERVICE_DETAILS_PUBLIC_EXCLUDED_FIELD_KEYS } from "./ServiceDetailsForm";

interface ServiceDetailsSummaryProps {
    details: ServiceDetails;
    onEdit: () => void;
}

function formatConfigurableLabel(fieldKey: string): string {
    return fieldKey
        .split("_")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

function formatBedBathToken(raw: string): string {
    const v = raw.trim();
    if (!v) return v;
    if (/_plus$/i.test(v)) return `${v.replace(/_plus$/i, "")}+`;
    return v.replace(/_/g, ".");
}

function formatConfigurableValue(key: string, value: string | boolean | string[]): string {
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (
        typeof value === "string" &&
        (key === "beds" || key === "baths" || key === "bedrooms" || key === "bathrooms")
    )
        return formatBedBathToken(value);
    return String(value);
}

export default function ServiceDetailsSummary({
    details,
    onEdit,
}: ServiceDetailsSummaryProps) {
    const bedSummary = details.beds?.trim() || details.bedrooms?.trim();
    const bathSummary = details.baths?.trim() || details.bathrooms?.trim();
    const legacyProperty =
        Boolean(details.home_type?.trim()) || Boolean(bedSummary) || Boolean(bathSummary);

    const configurableEntries = Object.entries(details.configurable_values ?? {}).filter(([key, v]) => {
        if (SERVICE_DETAILS_PUBLIC_EXCLUDED_FIELD_KEYS.has(key)) return false;
        if (key === "gate_code" && !accessMethodIsFrontDeskFlow(details.access_method)) return false;
        return (
            v !== undefined &&
            v !== null &&
            !(typeof v === "string" && !v.trim()) &&
            !(Array.isArray(v) && v.length === 0)
        );
    });

    return (
        <div className="space-y-3">
            <div className="flex items-start justify-between">
                <div className="flex-1 space-y-2">
                    <div>
                        <p className="text-sm font-medium text-alloy-midnight">{details.address}</p>
                        <p className="text-sm text-alloy-midnight/70">{details.city}</p>
                    </div>

                    {legacyProperty && (
                        <>
                            {details.home_type && (
                                <p className="text-sm text-alloy-midnight/70">
                                    <strong className="text-alloy-midnight">Home type:</strong>{" "}
                                    {details.home_type}
                                </p>
                            )}
                            {(bedSummary || bathSummary) && (
                                <p className="text-sm text-alloy-midnight/70">
                                    {bedSummary ? (
                                        <span className="tabular-nums">
                                            <span className="font-medium text-alloy-midnight">
                                                {formatBedBathToken(bedSummary)}
                                            </span>{" "}
                                            bed{bedSummary === "1" ? "" : "s"}
                                        </span>
                                    ) : null}
                                    {bedSummary && bathSummary ? (
                                        <span className="text-alloy-midnight/40 mx-2" aria-hidden>
                                            ·
                                        </span>
                                    ) : null}
                                    {bathSummary ? (
                                        <span className="tabular-nums">
                                            <span className="font-medium text-alloy-midnight">
                                                {formatBedBathToken(bathSummary)}
                                            </span>{" "}
                                            bath{bathSummary === "1" ? "" : "s"}
                                        </span>
                                    ) : null}
                                </p>
                            )}
                        </>
                    )}

                    {!legacyProperty &&
                        configurableEntries.map(([key, value]) => (
                            <p key={key} className="text-sm text-alloy-midnight/70">
                                <strong className="text-alloy-midnight">{formatConfigurableLabel(key)}:</strong>{" "}
                                {formatConfigurableValue(key, value)}
                            </p>
                        ))}

                    {details.has_pets && (
                        <p className="text-sm text-alloy-midnight/70">
                            <strong className="text-alloy-midnight">Pets:</strong> Yes
                        </p>
                    )}

                    <div>
                        <p className="text-sm text-alloy-midnight/70">
                            <strong className="text-alloy-midnight">Access:</strong>{" "}
                            {accessMethodBookingDisplayLabel(details.access_method)}
                        </p>
                        {!accessMethodIsHomeFlow(details.access_method) && details.access_note && (
                            <p className="text-sm text-alloy-midnight/70 mt-1 pl-4 border-l-2 border-alloy-stone/30">
                                {details.access_note}
                            </p>
                        )}
                    </div>

                </div>
            </div>

            <button
                type="button"
                onClick={onEdit}
                className="text-sm text-alloy-juniper hover:underline font-medium"
            >
                Edit details
            </button>
        </div>
    );
}

"use client";

import { ServiceDetails } from "./ServiceDetailsForm";

interface ServiceDetailsSummaryProps {
    details: ServiceDetails;
    onEdit: () => void;
}

const accessMethodLabels: Record<ServiceDetails["access_method"], string> = {
    home: "I will be home",
    code: "Door/Garage Code",
    key: "Hidden Key",
    building: "Building / Front Desk",
};

function formatConfigurableLabel(fieldKey: string): string {
    return fieldKey
        .split("_")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

function formatConfigurableValue(value: string | boolean | string[]): string {
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
}

export default function ServiceDetailsSummary({
    details,
    onEdit,
}: ServiceDetailsSummaryProps) {
    const legacyProperty =
        Boolean(details.home_type?.trim()) ||
        Boolean(details.bedrooms?.trim()) ||
        Boolean(details.bathrooms?.trim());

    const configurableEntries = Object.entries(details.configurable_values ?? {}).filter(([key, v]) => {
        if (key === "gate_code" && details.access_method !== "building") return false;
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
                            {(details.bedrooms || details.bathrooms) && (
                                <div className="flex gap-4 text-sm text-alloy-midnight/70">
                                    {details.bedrooms ? (
                                        <span>
                                            <strong className="text-alloy-midnight">{details.bedrooms}</strong>{" "}
                                            Bedroom{details.bedrooms !== "1" ? "s" : ""}
                                        </span>
                                    ) : null}
                                    {details.bathrooms ? (
                                        <span>
                                            <strong className="text-alloy-midnight">{details.bathrooms}</strong>{" "}
                                            Bathroom
                                            {details.bathrooms !== "1" && details.bathrooms !== "4+" ? "s" : ""}
                                        </span>
                                    ) : null}
                                </div>
                            )}
                        </>
                    )}

                    {!legacyProperty &&
                        configurableEntries.map(([key, value]) => (
                            <p key={key} className="text-sm text-alloy-midnight/70">
                                <strong className="text-alloy-midnight">{formatConfigurableLabel(key)}:</strong>{" "}
                                {formatConfigurableValue(value)}
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
                            {accessMethodLabels[details.access_method]}
                        </p>
                        {details.access_method !== "home" && details.access_note && (
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

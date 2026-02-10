"use client";

import { useState } from "react";
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

export default function ServiceDetailsSummary({
    details,
    onEdit,
}: ServiceDetailsSummaryProps) {
    const [showFullNotes, setShowFullNotes] = useState(false);
    const maxNotesLength = 100;

    return (
        <div className="space-y-3">
            <div className="flex items-start justify-between">
                <div className="flex-1 space-y-2">
                    {/* Address + City */}
                    <div>
                        <p className="text-sm font-medium text-alloy-midnight">
                            {details.address}
                        </p>
                        <p className="text-sm text-alloy-midnight/70">
                            {details.city}
                        </p>
                    </div>

                    {/* Home type */}
                    {details.home_type && (
                        <p className="text-sm text-alloy-midnight/70">
                            <strong className="text-alloy-midnight">Home type:</strong> {details.home_type}
                        </p>
                    )}

                    {/* Bedrooms / Bathrooms */}
                    <div className="flex gap-4 text-sm text-alloy-midnight/70">
                        <span>
                            <strong className="text-alloy-midnight">{details.bedrooms}</strong> Bedroom{details.bedrooms !== "1" ? "s" : ""}
                        </span>
                        <span>
                            <strong className="text-alloy-midnight">{details.bathrooms}</strong> Bathroom{details.bathrooms !== "1" && details.bathrooms !== "4+" ? "s" : ""}
                        </span>
                    </div>

                    {/* Access Method */}
                    <div>
                        <p className="text-sm text-alloy-midnight/70">
                            <strong className="text-alloy-midnight">Access:</strong> {accessMethodLabels[details.access_method]}
                        </p>
                        {details.access_method !== "home" && details.access_note && (
                            <p className="text-sm text-alloy-midnight/70 mt-1 pl-4 border-l-2 border-alloy-stone/30">
                                {details.access_note}
                            </p>
                        )}
                    </div>

                    {/* Additional Notes */}
                    {details.additional_notes && (
                        <div>
                            <p className="text-sm text-alloy-midnight/70">
                                <strong className="text-alloy-midnight">Notes:</strong>{" "}
                                {showFullNotes || details.additional_notes.length <= maxNotesLength
                                    ? details.additional_notes
                                    : `${details.additional_notes.substring(0, maxNotesLength)}...`}
                            </p>
                            {details.additional_notes.length > maxNotesLength && (
                                <button
                                    onClick={() => setShowFullNotes(!showFullNotes)}
                                    className="text-xs text-alloy-blue hover:underline mt-1"
                                >
                                    {showFullNotes ? "Show less" : "Show more"}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <button
                onClick={onEdit}
                className="text-sm text-alloy-blue hover:underline font-medium"
            >
                Edit details
            </button>
        </div>
    );
}


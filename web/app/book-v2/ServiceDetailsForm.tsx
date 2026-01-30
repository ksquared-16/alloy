"use client";

import { useState, useEffect } from "react";

export interface ServiceDetails {
    address: string;
    city: string;
    bedrooms: string;
    bathrooms: string;
    access_method: "home" | "code" | "key" | "building";
    access_note: string;
    additional_notes: string;
}

interface ServiceDetailsFormProps {
    initialData?: Partial<ServiceDetails>;
    onDataChange: (data: ServiceDetails, isValid: boolean) => void;
}

const STORAGE_KEY = "alloy_book_v2_service_details";

export default function ServiceDetailsForm({
    initialData,
    onDataChange,
}: ServiceDetailsFormProps) {
    const [formData, setFormData] = useState<ServiceDetails>({
        address: initialData?.address || "",
        city: initialData?.city || "",
        bedrooms: initialData?.bedrooms || "",
        bathrooms: initialData?.bathrooms || "",
        access_method: initialData?.access_method || "home",
        access_note: initialData?.access_note || "",
        additional_notes: initialData?.additional_notes || "",
    });

    // Load from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                setFormData((prev) => ({ ...prev, ...parsed }));
            }
        } catch (e) {
            console.warn("Failed to load service details from storage:", e);
        }
    }, []);

    // Save to localStorage on change
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
        } catch (e) {
            console.warn("Failed to save service details to storage:", e);
        }
    }, [formData]);

    // Validate and notify parent
    useEffect(() => {
        const isValid = validateForm(formData);
        onDataChange(formData, isValid);
    }, [formData, onDataChange]);

    const validateForm = (data: ServiceDetails): boolean => {
        // Required fields
        if (!data.address.trim()) return false;
        if (!data.city.trim()) return false;
        if (!data.bedrooms) return false;
        if (!data.bathrooms) return false;

        // Access note required unless "I will be home"
        if (data.access_method !== "home" && !data.access_note.trim()) {
            return false;
        }

        return true;
    };

    const handleChange = (field: keyof ServiceDetails, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const handleAccessMethodChange = (method: ServiceDetails["access_method"]) => {
        setFormData((prev) => ({
            ...prev,
            access_method: method,
            // Clear access note when switching to "home"
            access_note: method === "home" ? "" : prev.access_note,
        }));
    };

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-lg font-semibold text-alloy-midnight mb-1">
                    A few details to round out your booking
                </h3>
                <p className="text-sm text-alloy-midnight/60">
                    We'll use this information to prepare for your service
                </p>
            </div>

            <div className="space-y-3">
                {/* Address and City on same row */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-alloy-midnight mb-2">
                            Address <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={formData.address}
                            onChange={(e) => handleChange("address", e.target.value)}
                            placeholder="123 Main Street"
                            className="w-full px-4 py-3 border border-alloy-stone/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-blue focus:border-transparent"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-alloy-midnight mb-2">
                            City <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={formData.city}
                            onChange={(e) => handleChange("city", e.target.value)}
                            placeholder="Los Angeles"
                            className="w-full px-4 py-3 border border-alloy-stone/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-blue focus:border-transparent"
                        />
                    </div>
                </div>

                {/* Bedrooms and Bathrooms */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-alloy-midnight mb-2">
                            Bedrooms <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={formData.bedrooms}
                            onChange={(e) => handleChange("bedrooms", e.target.value)}
                            className="w-full px-4 py-3 border border-alloy-stone/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-blue focus:border-transparent bg-white"
                        >
                            <option value="">Select</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5+">5+</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-alloy-midnight mb-2">
                            Bathrooms <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={formData.bathrooms}
                            onChange={(e) => handleChange("bathrooms", e.target.value)}
                            className="w-full px-4 py-3 border border-alloy-stone/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-blue focus:border-transparent bg-white"
                        >
                            <option value="">Select</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4+">4+</option>
                        </select>
                    </div>
                </div>

                {/* Access Method - Dropdown */}
                <div>
                    <label className="block text-sm font-medium text-alloy-midnight mb-2">
                        How will your cleaner get into your home? <span className="text-red-500">*</span>
                    </label>
                    <select
                        value={formData.access_method}
                        onChange={(e) => handleAccessMethodChange(e.target.value as ServiceDetails["access_method"])}
                        className="w-full px-4 py-3 border border-alloy-stone/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-blue focus:border-transparent bg-white"
                    >
                        <option value="home">I will be home</option>
                        <option value="code">Door/Garage Code</option>
                        <option value="key">Hidden Key</option>
                        <option value="building">Building / Front Desk</option>
                    </select>
                </div>

                {/* Access Note (conditional) */}
                {formData.access_method !== "home" && (
                    <div>
                        <label className="block text-sm font-medium text-alloy-midnight mb-2">
                            Access note <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            value={formData.access_note}
                            onChange={(e) => handleChange("access_note", e.target.value)}
                            placeholder={
                                formData.access_method === "code"
                                    ? "Enter the door or garage code"
                                    : formData.access_method === "key"
                                        ? "Describe where the key is hidden"
                                        : "Provide building access instructions"
                            }
                            rows={3}
                            className="w-full px-4 py-3 border border-alloy-stone/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-blue focus:border-transparent resize-none"
                        />
                    </div>
                )}

                {/* Additional Notes */}
                <div>
                    <label className="block text-sm font-medium text-alloy-midnight mb-2">
                        Anything else we should know before we arrive?
                    </label>
                    <textarea
                        value={formData.additional_notes}
                        onChange={(e) => handleChange("additional_notes", e.target.value)}
                        placeholder="Special instructions, parking info, pet details, etc."
                        rows={3}
                        className="w-full px-4 py-3 border border-alloy-stone/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-blue focus:border-transparent resize-none"
                    />
                </div>
            </div>
        </div>
    );
}


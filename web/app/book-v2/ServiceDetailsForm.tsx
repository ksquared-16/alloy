"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import ConfigurableFieldSections, {
    type PublicFieldDef,
    type PublicSectionDef,
} from "@/components/public/ConfigurableFieldSections";

export interface ServiceDetails {
    address: string;
    city: string;
    access_method: "home" | "code" | "key" | "building";
    access_note: string;
    additional_notes: string;
    has_pets: boolean;
    /** Values for org-defined public booking fields (field_key → value). */
    configurable_values: Record<string, string | boolean | string[]>;
    /** When no public field defs exist, legacy property selects (optional). */
    home_type?: string;
    bedrooms?: string;
    bathrooms?: string;
}

interface ServiceDetailsFormProps {
    initialData?: Partial<ServiceDetails>;
    onDataChange: (data: ServiceDetails, isValid: boolean) => void;
    /** Vertical slug for catalog_key resolution (e.g. pricing_sqft_tiers). */
    verticalSlug?: string;
}

const STORAGE_KEY = "alloy_book_v2_service_details";

const emptyConfigurable = (): Record<string, string | boolean | string[]> => ({});

export default function ServiceDetailsForm({
    initialData,
    onDataChange,
    verticalSlug = "cleaning",
}: ServiceDetailsFormProps) {
    const [formData, setFormData] = useState<ServiceDetails>({
        address: initialData?.address || "",
        city: initialData?.city || "",
        access_method: initialData?.access_method || "home",
        access_note: initialData?.access_note || "",
        additional_notes: initialData?.additional_notes || "",
        has_pets: initialData?.has_pets ?? false,
        configurable_values: initialData?.configurable_values ?? emptyConfigurable(),
        home_type: initialData?.home_type,
        bedrooms: initialData?.bedrooms,
        bathrooms: initialData?.bathrooms,
    });

    const [locationFields, setLocationFields] = useState<PublicFieldDef[]>([]);
    const [locationSections, setLocationSections] = useState<PublicSectionDef[]>([]);
    const [defsLoading, setDefsLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const q = new URLSearchParams({ entity_type: "location" });
        if (verticalSlug?.trim()) q.set("vertical_slug", verticalSlug.trim());
        fetch(`/api/public/field-definitions?${q.toString()}`)
            .then((r) => r.json())
            .then((data: { ok?: boolean; fields?: PublicFieldDef[]; sections?: PublicSectionDef[] }) => {
                if (cancelled || !data?.ok) return;
                setLocationFields(data.fields ?? []);
                setLocationSections(data.sections ?? []);
            })
            .catch(() => {
                if (!cancelled) {
                    setLocationFields([]);
                    setLocationSections([]);
                }
            })
            .finally(() => {
                if (!cancelled) setDefsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [verticalSlug]);

    const prefetched = useMemo(
        () =>
            locationFields.length > 0
                ? { fields: locationFields, sections: locationSections }
                : null,
        [locationFields, locationSections]
    );

    const defsReady = !defsLoading;
    const useLegacyPropertyFields = defsReady && locationFields.length === 0;

    // Load from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored) as Partial<ServiceDetails>;
                setFormData((prev) => ({
                    ...prev,
                    ...parsed,
                    has_pets: parsed.has_pets === true,
                    configurable_values:
                        parsed.configurable_values && typeof parsed.configurable_values === "object"
                            ? { ...prev.configurable_values, ...parsed.configurable_values }
                            : prev.configurable_values,
                }));
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

    const validateForm = useCallback(
        (data: ServiceDetails): boolean => {
            if (!data.address.trim() || !data.city.trim()) return false;
            if (data.access_method !== "home" && !data.access_note.trim()) return false;

            if (useLegacyPropertyFields) {
                if (!data.bedrooms?.trim()) return false;
                if (!data.bathrooms?.trim()) return false;
            }

            for (const f of locationFields) {
                if (!f.is_required) continue;
                const v = data.configurable_values[f.field_key];
                if (v === undefined || v === null) return false;
                if (typeof v === "string" && !v.trim()) return false;
                if (Array.isArray(v) && v.length === 0) return false;
            }

            return true;
        },
        [locationFields, useLegacyPropertyFields]
    );

    useEffect(() => {
        const isValid = validateForm(formData);
        onDataChange(formData, isValid);
    }, [formData, onDataChange, validateForm]);

    const handleChange = (field: keyof ServiceDetails, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const handleAccessMethodChange = (method: ServiceDetails["access_method"]) => {
        setFormData((prev) => ({
            ...prev,
            access_method: method,
            access_note: method === "home" ? "" : prev.access_note,
        }));
    };

    const onConfigurableChange = (fieldKey: string, value: string | boolean | string[]) => {
        setFormData((prev) => ({
            ...prev,
            configurable_values: { ...prev.configurable_values, [fieldKey]: value },
        }));
    };

    const DEFAULT_HOME = [
        { value: "Single-Family Home", label: "Single-Family Home" },
        { value: "Apartment / Condo", label: "Apartment / Condo" },
        { value: "Townhome", label: "Townhome" },
        { value: "Duplex", label: "Duplex" },
        { value: "Other", label: "Other" },
    ];
    const DEFAULT_BED = ["1", "2", "3", "4", "5+"].map((v) => ({ value: v, label: v }));
    const DEFAULT_BATH = ["1", "2", "3", "4+"].map((v) => ({ value: v, label: v }));

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-lg font-semibold text-alloy-midnight mb-1">
                    A few details to round out your booking
                </h3>
                <p className="text-sm text-alloy-midnight/60">
                    We&apos;ll use this information to prepare for your service
                </p>
            </div>

            <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-alloy-midnight mb-2">
                            Address <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={formData.address}
                            onChange={(e) => handleChange("address", e.target.value)}
                            placeholder="123 Main Street"
                            className="w-full px-4 py-3 border border-alloy-stone/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-juniper/70 focus:border-transparent"
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
                            className="w-full px-4 py-3 border border-alloy-stone/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-juniper/70 focus:border-transparent"
                        />
                    </div>
                </div>

                {useLegacyPropertyFields && (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-alloy-midnight mb-2">Home type</label>
                            <select
                                value={formData.home_type ?? ""}
                                onChange={(e) =>
                                    setFormData((p) => ({ ...p, home_type: e.target.value }))
                                }
                                className="w-full px-4 py-3 border border-alloy-stone/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-juniper/70 bg-white"
                            >
                                <option value="">Select home type</option>
                                {DEFAULT_HOME.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-alloy-midnight mb-2">
                                    Bedrooms <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={formData.bedrooms ?? ""}
                                    onChange={(e) =>
                                        setFormData((p) => ({ ...p, bedrooms: e.target.value }))
                                    }
                                    className="w-full px-4 py-3 border border-alloy-stone/30 rounded-lg bg-white"
                                >
                                    <option value="">Select</option>
                                    {DEFAULT_BED.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-alloy-midnight mb-2">
                                    Bathrooms <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={formData.bathrooms ?? ""}
                                    onChange={(e) =>
                                        setFormData((p) => ({ ...p, bathrooms: e.target.value }))
                                    }
                                    className="w-full px-4 py-3 border border-alloy-stone/30 rounded-lg bg-white"
                                >
                                    <option value="">Select</option>
                                    {DEFAULT_BATH.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </>
                )}

                {defsLoading && (
                    <p className="text-sm text-alloy-midnight/50">Loading property fields…</p>
                )}
                {defsReady && locationFields.length > 0 && prefetched && (
                    <ConfigurableFieldSections
                        entityType="location"
                        verticalSlug={verticalSlug}
                        prefetched={prefetched}
                        values={formData.configurable_values}
                        onChange={onConfigurableChange}
                    />
                )}

                <div>
                    <label className="block text-sm font-medium text-alloy-midnight mb-2">
                        How will your cleaner get into your home? <span className="text-red-500">*</span>
                    </label>
                    <select
                        value={formData.access_method}
                        onChange={(e) =>
                            handleAccessMethodChange(e.target.value as ServiceDetails["access_method"])
                        }
                        className="w-full px-4 py-3 border border-alloy-stone/30 rounded-lg bg-white"
                    >
                        <option value="home">I will be home</option>
                        <option value="code">Door/Garage Code</option>
                        <option value="key">Hidden Key</option>
                        <option value="building">Building / Front Desk</option>
                    </select>
                </div>

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
                            className="w-full px-4 py-3 border border-alloy-stone/30 rounded-lg resize-none"
                        />
                    </div>
                )}

                <div className="flex items-center gap-2">
                    <input
                        id="book-v2-has-pets"
                        type="checkbox"
                        checked={formData.has_pets}
                        onChange={(e) =>
                            setFormData((prev) => ({ ...prev, has_pets: e.target.checked }))
                        }
                        className="h-4 w-4 rounded border-alloy-stone/40 text-alloy-juniper"
                    />
                    <label htmlFor="book-v2-has-pets" className="text-sm font-medium text-alloy-midnight">
                        Pets at this address
                    </label>
                </div>

                <div>
                    <label className="block text-sm font-medium text-alloy-midnight mb-2">
                        Anything else we should know before we arrive?
                    </label>
                    <textarea
                        value={formData.additional_notes}
                        onChange={(e) => handleChange("additional_notes", e.target.value)}
                        placeholder="Special instructions, parking info, pet details, etc."
                        rows={3}
                        className="w-full px-4 py-3 border border-alloy-stone/30 rounded-lg resize-none"
                    />
                </div>
            </div>
        </div>
    );
}

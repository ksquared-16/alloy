"use client";

import { useEffect, useState } from "react";
import ProcessingAlloyDialog from "./ProcessingAlloyDialog";
import { DEFAULT_FORM_ACCENT } from "@/lib/forms/processingFormBranding";

export type CreateFormOrigin = "blank" | "document" | "packet";

export default function ProcessingCreateFormDialog({
    open,
    onClose,
    onContinue,
    submitting,
    error,
}: {
    open: boolean;
    onClose: () => void;
    onContinue: (payload: {
        name: string;
        description: string;
        brand_name: string;
        accent_color: string;
        origin: CreateFormOrigin;
    }) => void | Promise<void>;
    submitting?: boolean;
    error?: string | null;
}) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [brandName, setBrandName] = useState("");
    const [accentColor, setAccentColor] = useState(DEFAULT_FORM_ACCENT);
    const [origin, setOrigin] = useState<CreateFormOrigin>("blank");

    useEffect(() => {
        if (open) {
            setName("");
            setDescription("");
            setBrandName("");
            setAccentColor(DEFAULT_FORM_ACCENT);
            setOrigin("blank");
        }
    }, [open]);

    const canContinue = name.trim().length > 0 && origin === "blank" && !submitting;

    return (
        <ProcessingAlloyDialog
            open={open}
            onClose={onClose}
            title="Create form"
            subtitle="Let's start with the basics."
            testId="processing-create-form-dialog"
            footer={
                <>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="rounded-lg border border-alloy-stone/20 bg-white px-4 py-2 text-[12px] font-semibold text-alloy-midnight/70 hover:bg-alloy-stone/[0.06] disabled:opacity-50"
                        data-testid="create-form-cancel"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={!canContinue}
                        onClick={() =>
                            void onContinue({
                                name: name.trim(),
                                description: description.trim(),
                                brand_name: brandName.trim(),
                                accent_color: accentColor,
                                origin,
                            })
                        }
                        className="rounded-lg bg-alloy-bend-pine px-4 py-2 text-[12px] font-semibold text-white hover:bg-alloy-bend-pine/90 disabled:opacity-40"
                        data-testid="create-form-continue"
                    >
                        {submitting ? "Creating…" : "Continue"}
                    </button>
                </>
            }
        >
            <div className="space-y-5">
                {error ? (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800" role="alert">
                        {error}
                    </p>
                ) : null}
                <label className="block">
                    <span className="mb-1.5 block text-[12px] font-semibold text-alloy-midnight">Form name</span>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Lead inquiry form"
                        autoFocus
                        className="w-full rounded-[10px] border border-alloy-stone/20 px-3 py-2.5 text-[13px] shadow-sm outline-none focus:border-alloy-bend-pine/40 focus:ring-2 focus:ring-alloy-bend-pine/15"
                        data-testid="create-form-name"
                    />
                </label>
                <label className="block">
                    <span className="mb-1.5 block text-[12px] font-semibold text-alloy-midnight">Description</span>
                    <span className="mb-1.5 block text-[11px] text-alloy-midnight/45">What is this form used for?</span>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={2}
                        placeholder="Annual enrollment for returning families"
                        className="w-full resize-none rounded-[10px] border border-alloy-stone/20 px-3 py-2.5 text-[13px] shadow-sm outline-none focus:border-alloy-bend-pine/40 focus:ring-2 focus:ring-alloy-bend-pine/15"
                        data-testid="create-form-description"
                    />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                        <span className="mb-1.5 block text-[12px] font-semibold text-alloy-midnight">Brand / school name</span>
                        <input
                            type="text"
                            value={brandName}
                            onChange={(e) => setBrandName(e.target.value)}
                            placeholder="Bend Forest School"
                            className="w-full rounded-[10px] border border-alloy-stone/20 px-3 py-2.5 text-[13px] shadow-sm outline-none focus:border-alloy-bend-pine/40 focus:ring-2 focus:ring-alloy-bend-pine/15"
                            data-testid="create-form-brand-name"
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1.5 block text-[12px] font-semibold text-alloy-midnight">Accent color</span>
                        <div className="flex items-center gap-2">
                            <input
                                type="color"
                                value={accentColor}
                                onChange={(e) => setAccentColor(e.target.value)}
                                className="h-10 w-12 cursor-pointer rounded-lg border border-alloy-stone/20 bg-white p-1"
                                data-testid="create-form-accent-color"
                            />
                            <input
                                type="text"
                                value={accentColor}
                                onChange={(e) => setAccentColor(e.target.value)}
                                className="min-w-0 flex-1 rounded-[10px] border border-alloy-stone/20 px-3 py-2.5 font-mono text-[12px] uppercase shadow-sm outline-none focus:border-alloy-bend-pine/40"
                            />
                        </div>
                    </label>
                </div>
                <fieldset>
                    <legend className="mb-2 text-[12px] font-semibold text-alloy-midnight">Created from</legend>
                    <div className="space-y-2">
                        {(
                            [
                                { value: "blank" as const, label: "Blank form", hint: "Start with an empty canvas" },
                                { value: "document" as const, label: "Existing document", hint: "Import from Work", disabled: true },
                                { value: "packet" as const, label: "Existing packet", hint: "Coming later", disabled: true },
                            ] as const
                        ).map((opt) => (
                            <label
                                key={opt.value}
                                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
                                    origin === opt.value
                                        ? "border-alloy-bend-pine/35 bg-alloy-bend-pine/[0.06]"
                                        : "border-alloy-stone/15 bg-white hover:border-alloy-stone/25"
                                } ${"disabled" in opt && opt.disabled ? "cursor-not-allowed opacity-55" : ""}`}
                            >
                                <input
                                    type="radio"
                                    name="create-form-origin"
                                    value={opt.value}
                                    checked={origin === opt.value}
                                    disabled={"disabled" in opt && opt.disabled}
                                    onChange={() => setOrigin(opt.value)}
                                    className="mt-0.5"
                                    data-testid={`create-form-origin-${opt.value}`}
                                />
                                <span>
                                    <span className="block text-[12px] font-semibold text-alloy-midnight">{opt.label}</span>
                                    <span className="mt-0.5 block text-[11px] text-alloy-midnight/45">{opt.hint}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                </fieldset>
            </div>
        </ProcessingAlloyDialog>
    );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Mail, MessageSquare, Palette, PenLine, School } from "lucide-react";

import CommunicationsStudioListRow from "@/app/adminV2/communications/CommunicationsStudioListRow";
import { COMMS_FIELD_LABEL_CLASS, COMMS_INPUT_CLASS, COMMS_PANEL_SHELL_CLASS } from "@/app/adminV2/communications/commsWorkspaceUi";
import {
    fetchCommunicationsBindingsCached,
    type CommunicationsBindingsPayload,
} from "@/lib/communications/communicationsBindingsCache";
import { DEFAULT_FORM_ACCENT } from "@/lib/forms/processingFormBranding";

type BrandingKey = "logo" | "school_name" | "reply_to" | "signature" | "sms_number" | "brand_colors";

type BindingRow = {
    channel: string;
    display_label?: string | null;
    from_email_hint?: string | null;
    inbound_to_e164?: string | null;
    status?: string | null;
};

const BRANDING_ITEMS: {
    key: BrandingKey;
    label: string;
    subtitle: string;
    icon: typeof School;
}[] = [
    { key: "logo", label: "Logo", subtitle: "School logo and favicon", icon: Image },
    { key: "school_name", label: "School Name", subtitle: "Displayed name in communications", icon: School },
    { key: "reply_to", label: "Reply-To Email", subtitle: "Family replies go to this address", icon: Mail },
    { key: "signature", label: "Email Signature", subtitle: "Default signature for emails", icon: PenLine },
    { key: "sms_number", label: "SMS Number", subtitle: "Outgoing SMS phone number", icon: MessageSquare },
    { key: "brand_colors", label: "Brand Colors", subtitle: "Primary colors and accents", icon: Palette },
];

/**
 * Studio Rules - channels, signatures, and organization communication rules inside the Communications shell.
 * Surfaces existing binding hints and org defaults; no new APIs or mutation paths.
 */
export default function RulesWorkspace() {
    const [bindings, setBindings] = useState<BindingRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<BrandingKey | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { ok, json } = await fetchCommunicationsBindingsCached();
            const payload = json as CommunicationsBindingsPayload;
            if (ok && Array.isArray(payload.bindings)) {
                setBindings(payload.bindings as BindingRow[]);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const emailBinding = useMemo(() => bindings.find((b) => b.channel === "email"), [bindings]);
    const smsBinding = useMemo(() => bindings.find((b) => b.channel === "sms"), [bindings]);

    const values = useMemo(
        () => ({
            logo: "Configured per published form assets",
            school_name: emailBinding?.display_label?.trim() || "Your organization",
            reply_to: emailBinding?.from_email_hint?.trim() || "Not configured",
            signature: "Managed in template and announcement editors",
            sms_number: smsBinding?.inbound_to_e164?.trim() || "Not configured",
            brand_colors: DEFAULT_FORM_ACCENT,
        }),
        [emailBinding, smsBinding]
    );

    if (selected) {
        const item = BRANDING_ITEMS.find((b) => b.key === selected);
        const value = values[selected];
        return (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white" data-rules-workspace="true">
                <header className="shrink-0 border-b border-alloy-stone/12 px-4 py-2.5">
                    <button
                        type="button"
                        onClick={() => setSelected(null)}
                        className="text-[11px] font-semibold text-alloy-bend-pine hover:underline"
                    >
                        &lt;- Rules
                    </button>
                    <h2 className="mt-1 text-[14px] font-semibold text-alloy-midnight">{item?.label}</h2>
                    <p className="mt-0.5 text-[11px] text-alloy-midnight/50">{item?.subtitle}</p>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    <div className={`${COMMS_PANEL_SHELL_CLASS} max-w-lg space-y-3 p-4`}>
                        <label className="block">
                            <span className={COMMS_FIELD_LABEL_CLASS}>Current value</span>
                            {selected === "brand_colors" ? (
                                <div className="mt-1.5 flex items-center gap-2">
                                    <span
                                        className="h-8 w-8 rounded-lg border border-alloy-stone/20"
                                        style={{ backgroundColor: value }}
                                        aria-hidden
                                    />
                                    <input readOnly value={value} className={`${COMMS_INPUT_CLASS} mt-0`} />
                                </div>
                            ) : (
                                <input readOnly value={value} className={`${COMMS_INPUT_CLASS} mt-1.5`} />
                            )}
                        </label>
                        <p className="text-[11px] leading-snug text-alloy-midnight/50">
                            Organization communication branding is read from existing provider bindings and template defaults.
                            Full self-service editing for all branding fields is rolling out in Studio - no workflow or API changes in this sprint.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-0 flex-1 overflow-y-auto bg-white" data-rules-workspace="true">
            <div className={`${COMMS_PANEL_SHELL_CLASS} mx-auto my-4 max-w-2xl overflow-hidden`}>
                <header className="border-b border-alloy-stone/12 px-4 py-3">
                    <h2 className="text-[13px] font-semibold text-alloy-midnight">Rules</h2>
                    <p className="mt-0.5 text-[11px] text-alloy-midnight/50">Channels, signatures, and communication rules</p>
                </header>
                <ul className="divide-y divide-alloy-stone/12">
                    {BRANDING_ITEMS.map((item) => {
                        const Icon = item.icon;
                        const configured =
                            item.key === "reply_to"
                                ? Boolean(emailBinding?.from_email_hint)
                                : item.key === "sms_number"
                                  ? Boolean(smsBinding?.inbound_to_e164)
                                  : item.key === "school_name"
                                    ? Boolean(emailBinding?.display_label)
                                    : item.key === "brand_colors";
                        return (
                            <li key={item.key}>
                                <CommunicationsStudioListRow
                                    icon={<Icon className="h-4 w-4" aria-hidden strokeWidth={2} />}
                                    title={item.label}
                                    subtitle={item.subtitle}
                                    status={loading ? "..." : configured ? "Configured" : "Review"}
                                    statusTone={configured ? "active" : "neutral"}
                                    onClick={() => setSelected(item.key)}
                                />
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
}

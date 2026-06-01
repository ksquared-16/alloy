"use client";

import { useEffect, useMemo, useState } from "react";
import {
    validateAddPersonSubmitPayload,
    type AddPersonSubmitPayload,
} from "@/lib/admin/actions/submitAddPersonFromDrawer";

const ROLE_OPTIONS = [
    { value: "parent", label: "Parent" },
    { value: "guardian", label: "Guardian" },
    { value: "primary_contact", label: "Primary person" },
    { value: "family_member", label: "Family member" },
    { value: "emergency_contact", label: "Emergency contact" },
    { value: "other", label: "Other" },
] as const;

export type AddPersonModalProps = {
    open: boolean;
    title?: string;
    onClose: () => void;
    onSubmit: (payload: AddPersonSubmitPayload) => Promise<void> | void;
    /** Default role select value when modal opens. */
    defaultRoleType?: string;
};

export function AddPersonModal(props: AddPersonModalProps) {
    const { open, title = "Add person", onClose, onSubmit, defaultRoleType = "parent" } = props;
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [roleType, setRoleType] = useState<string>(defaultRoleType);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setFirstName("");
        setLastName("");
        setEmail("");
        setPhone("");
        setRoleType(defaultRoleType);
        setBusy(false);
        setError(null);
    }, [open, defaultRoleType]);

    const overlay = "fixed inset-0 z-[80] bg-black/20 backdrop-blur-[1px]";
    const panel =
        "fixed left-1/2 top-1/2 z-[81] w-[92vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-admin-border bg-white shadow-xl";
    const label = "text-[11px] font-semibold tracking-wide text-alloy-forge/50";
    const input =
        "w-full rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue/45 focus:outline-none focus:ring-2 focus:ring-alloy-blue/15 disabled:opacity-60";

    const roleOptions = useMemo(() => [...ROLE_OPTIONS], []);

    const canSubmit = useMemo(() => {
        if (busy) return false;
        if (!firstName.trim() || !lastName.trim()) return false;
        if (!email.trim() && !phone.trim()) return false;
        return true;
    }, [busy, email, firstName, lastName, phone]);

    if (!open) return null;

    return (
        <>
            <div className={overlay} onClick={() => (!busy ? onClose() : null)} />
            <div className={panel} role="dialog" aria-modal="true" aria-label={title}>
                <div className="flex items-start justify-between gap-3 border-b border-alloy-stone/15 px-5 py-4">
                    <div className="min-w-0">
                        <div className="text-sm font-semibold text-alloy-midnight">{title}</div>
                        <div className="mt-0.5 text-[12px] text-alloy-midnight/60">
                            Links this person to the household and this inquiry when a customer is on file.
                        </div>
                    </div>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onClose}
                        className="text-xs font-semibold text-alloy-midnight/60 hover:text-alloy-midnight disabled:opacity-50"
                    >
                        Close
                    </button>
                </div>

                <div className="space-y-3 px-5 py-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <div className={label}>First name</div>
                            <input
                                value={firstName}
                                disabled={busy}
                                onChange={(e) => setFirstName(e.target.value)}
                                className={input}
                                autoComplete="given-name"
                            />
                        </div>
                        <div>
                            <div className={label}>Last name</div>
                            <input
                                value={lastName}
                                disabled={busy}
                                onChange={(e) => setLastName(e.target.value)}
                                className={input}
                                autoComplete="family-name"
                            />
                        </div>
                    </div>
                    <div>
                        <div className={label}>Role</div>
                        <select value={roleType} disabled={busy} onChange={(e) => setRoleType(e.target.value)} className={input}>
                            {roleOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <div className={label}>Email</div>
                            <input
                                value={email}
                                disabled={busy}
                                onChange={(e) => setEmail(e.target.value)}
                                className={input}
                                type="email"
                                autoComplete="email"
                            />
                        </div>
                        <div>
                            <div className={label}>Phone</div>
                            <input
                                value={phone}
                                disabled={busy}
                                onChange={(e) => setPhone(e.target.value)}
                                className={input}
                                type="tel"
                                autoComplete="tel"
                            />
                        </div>
                    </div>
                    <p className="text-[11px] text-alloy-midnight/55">Phone or email is required.</p>

                    {error ? (
                        <div className="rounded-lg border border-alloy-ember/30 bg-alloy-ember/5 px-3 py-2 text-sm text-alloy-ember">
                            {error}
                        </div>
                    ) : null}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-alloy-stone/15 px-5 py-4">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onClose}
                        className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm font-semibold text-alloy-midnight/75 hover:bg-alloy-stone/5 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={!canSubmit}
                        onClick={async () => {
                            const payload: AddPersonSubmitPayload = {
                                first_name: firstName.trim(),
                                last_name: lastName.trim(),
                                email: email.trim() || undefined,
                                phone: phone.trim() || undefined,
                                role_type: roleType.trim() || undefined,
                            };
                            const validationError = validateAddPersonSubmitPayload(payload);
                            if (validationError) {
                                setError(validationError);
                                return;
                            }
                            setBusy(true);
                            setError(null);
                            try {
                                await onSubmit(payload);
                                onClose();
                            } catch (e) {
                                setError(e instanceof Error ? e.message : "Save failed");
                            } finally {
                                setBusy(false);
                            }
                        }}
                        className="rounded-lg border border-alloy-blue/30 bg-alloy-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                    >
                        {busy ? "Saving…" : "Add person"}
                    </button>
                </div>
            </div>
        </>
    );
}

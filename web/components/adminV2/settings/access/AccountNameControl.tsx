"use client";

/**
 * W7-F002 (corrected) — THE LOGIN'S OWN NAME, EDITABLE.
 *
 * A user account carries a human name of its own; it is what operator and audit activity name when
 * the login is not linked to a Person — and a Person link is optional. A missing name is the one
 * attribution problem, so it is the one thing warned about here. Nothing is ever inferred from the
 * email address, and saving a name never creates or links a Person.
 */
import { useState } from "react";

import { ConfigTextInput } from "@/components/adminV2/settings/configurationRuntime/ConfigEditorPrimitives";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";

export default function AccountNameControl({
    userId,
    name,
    canManage,
    onSaved,
}: {
    userId: string;
    name: string | null;
    canManage: boolean;
    onSaved?: () => void | Promise<void>;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(name ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const save = async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/access/account-name", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ user_id: userId, name: draft }),
            });
            const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
            if (!res.ok || !body.ok) throw new Error(body.error || "The name could not be saved.");
            setEditing(false);
            await onSaved?.();
        } catch (e) {
            setError(e instanceof Error ? e.message : "The name could not be saved.");
        } finally {
            setBusy(false);
        }
    };

    if (editing) {
        return (
            <div className="space-y-2" data-testid="access-user-account-name-editor">
                <ConfigTextInput
                    value={draft}
                    onChange={setDraft}
                    placeholder="First and last name"
                    testId="access-user-account-name-input"
                />
                {error ? (
                    <p className="text-xs text-red-700" role="alert" data-testid="access-user-account-name-error">
                        {error}
                    </p>
                ) : null}
                <div className="flex gap-2">
                    <ConfigurationPrimaryButton
                        onClick={() => void save()}
                        disabled={busy || draft.trim().length < 2}
                        data-testid="access-user-account-name-save"
                    >
                        {busy ? "Saving…" : "Save name"}
                    </ConfigurationPrimaryButton>
                    <ConfigurationSecondaryButton
                        onClick={() => { setEditing(false); setDraft(name ?? ""); setError(null); }}
                        disabled={busy}
                    >
                        Cancel
                    </ConfigurationSecondaryButton>
                </div>
            </div>
        );
    }

    return (
        <div data-testid="access-user-account-name" data-account-named={name ? "true" : "false"}>
            <span className="flex flex-wrap items-baseline gap-2">
                {name ? (
                    <span className="text-sm text-alloy-midnight" data-testid="access-user-overview-name">{name}</span>
                ) : (
                    <span className="text-sm text-alloy-midnight/55" data-testid="access-user-overview-name-unknown">No name on file</span>
                )}
                {canManage ? (
                    <button
                        type="button"
                        className="text-xs font-semibold text-alloy-bend-pine hover:text-alloy-bend-pine/80"
                        onClick={() => { setDraft(name ?? ""); setEditing(true); }}
                        data-testid="access-user-account-name-edit"
                    >
                        {name ? "Edit" : "Add name"}
                    </button>
                ) : null}
            </span>
            {!name ? (
                <p className="mt-1 text-xs text-amber-800" data-testid="access-user-account-name-missing">
                    Add a name to this account so operator and audit activity can identify who acted.
                </p>
            ) : null}
        </div>
    );
}

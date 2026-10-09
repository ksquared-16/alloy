"use client";

/**
 * W7-F002 — WHICH HUMAN THIS LOGIN IS.
 *
 * The operator surface for `user_person_links`: the current link (by name), or the fact that there
 * is none — and, where the operator may decide identity, an explicit choice of a named Person with a
 * recorded reason. Nothing is inferred: no email match, no "best guess"; the operator picks the person.
 *
 * A login that holds a money-capable capability without a link is called out, because Access refuses
 * to grant financial capability to an unlinked login (grant time, `20261122140000`) and the financial
 * audit trail cannot name what such a login did. Revoking such a login's link is refused by the
 * database; replacing it is one atomic act.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import {
    ConfigFieldLabel,
    ConfigSelectInput,
    ConfigTextInput,
} from "@/components/adminV2/settings/configurationRuntime/ConfigEditorPrimitives";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";

type LinkState = {
    links: Array<{ userId: string; personId: string; personName?: string | null; linkedAt: string | null }>;
    unresolvedMoneyCapableActors: Array<{ userId: string; capabilities: string[] }>;
    linkCandidates: Array<{ personId: string; name: string }>;
};

type Mode = "idle" | "link" | "replace" | "revoke";

export default function UserPersonLinkControl({ userId, canManage }: { userId: string; canManage: boolean }) {
    const [state, setState] = useState<LinkState | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [mode, setMode] = useState<Mode>("idle");
    const [personId, setPersonId] = useState("");
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoadError(null);
        try {
            const res = await fetch("/api/admin/access/person-links", { credentials: "include", cache: "no-store" });
            const json = (await res.json()) as { ok?: boolean; error?: string } & Partial<LinkState>;
            if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not read identity links.");
            setState({
                links: json.links ?? [],
                unresolvedMoneyCapableActors: json.unresolvedMoneyCapableActors ?? [],
                linkCandidates: json.linkCandidates ?? [],
            });
        } catch (e) {
            setLoadError(e instanceof Error ? e.message : "Could not read identity links.");
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const link = useMemo(() => state?.links.find((l) => l.userId === userId) ?? null, [state, userId]);
    const unresolved = useMemo(
        () => state?.unresolvedMoneyCapableActors.find((a) => a.userId === userId) ?? null,
        [state, userId],
    );

    const reset = () => {
        setMode("idle");
        setPersonId("");
        setNote("");
        setActionError(null);
    };

    const submit = async () => {
        setBusy(true);
        setActionError(null);
        try {
            const res = await fetch("/api/admin/access/person-links", {
                method: mode === "link" ? "POST" : "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                    mode === "link"
                        ? { user_id: userId, person_id: personId, note }
                        : { action: mode, user_id: userId, person_id: mode === "replace" ? personId : undefined, note },
                ),
            });
            const json = (await res.json()) as { ok?: boolean; error?: string };
            if (!res.ok || !json.ok) throw new Error(json.error ?? "That change could not be saved.");
            reset();
            await load();
        } catch (e) {
            setActionError(e instanceof Error ? e.message : "That change could not be saved.");
        } finally {
            setBusy(false);
        }
    };

    if (loadError) {
        return <p className="text-xs text-red-700" role="alert">{loadError}</p>;
    }
    if (!state) {
        return (
            <span
                className="inline-block h-4 w-40 animate-pulse rounded bg-alloy-stone/25"
                aria-busy="true"
                aria-label="Loading linked person"
                data-testid="access-user-person-link-pending"
            />
        );
    }

    const needsPerson = mode === "link" || mode === "replace";
    const canSubmit = !busy && note.trim().length >= 4 && (!needsPerson || personId !== "");

    return (
        <div data-testid="access-user-person-link" data-link-state={link ? "linked" : "unlinked"}>
            {link ? (
                <p className="text-sm text-alloy-midnight" data-testid="access-user-person-link-name">
                    {link.personName ?? "A person with no name on file"}
                    {link.linkedAt ? (
                        <span className="ml-2 text-xs text-alloy-midnight/50">since {link.linkedAt.slice(0, 10)}</span>
                    ) : null}
                </p>
            ) : (
                <p className="text-sm text-alloy-midnight/70" data-testid="access-user-person-link-none">
                    Not linked to a person
                </p>
            )}
            {!link && unresolved ? (
                <p className="mt-1 text-xs text-amber-800" data-testid="access-user-person-link-money-gap">
                    This login can move money ({unresolved.capabilities.join(", ")}), so its financial activity cannot
                    name who acted until it is linked to a named person.
                </p>
            ) : null}

            {canManage && mode === "idle" ? (
                <div className="mt-2 flex flex-wrap gap-2">
                    {link ? (
                        <>
                            <ConfigurationSecondaryButton onClick={() => setMode("replace")} data-testid="access-user-person-link-replace">
                                Replace
                            </ConfigurationSecondaryButton>
                            <ConfigurationSecondaryButton onClick={() => setMode("revoke")} data-testid="access-user-person-link-revoke">
                                Revoke
                            </ConfigurationSecondaryButton>
                        </>
                    ) : (
                        <ConfigurationSecondaryButton onClick={() => setMode("link")} data-testid="access-user-person-link-start">
                            Link to a person
                        </ConfigurationSecondaryButton>
                    )}
                </div>
            ) : null}

            {mode !== "idle" ? (
                <div className="mt-2 space-y-2 rounded-md border border-alloy-stone/40 p-3" data-testid="access-user-person-link-editor">
                    {needsPerson ? (
                        <ConfigFieldLabel label="Person">
                            <ConfigSelectInput
                                value={personId}
                                onChange={setPersonId}
                                options={[
                                    { value: "", label: "Choose the person this login belongs to…" },
                                    ...state.linkCandidates.map((c) => ({ value: c.personId, label: c.name })),
                                ]}
                                testId="access-user-person-link-person"
                            />
                        </ConfigFieldLabel>
                    ) : null}
                    <ConfigFieldLabel label="Reason (recorded)">
                        <ConfigTextInput
                            value={note}
                            onChange={setNote}
                            placeholder={mode === "revoke" ? "Why this link is removed" : "How you know this is the right person"}
                            testId="access-user-person-link-note"
                        />
                    </ConfigFieldLabel>
                    <p className="text-[11px] text-alloy-midnight/50">
                        Nothing is matched from the email address — you are deciding which human this login is.
                    </p>
                    {actionError ? (
                        <p className="text-xs text-red-700" role="alert" data-testid="access-user-person-link-error">
                            {actionError}
                        </p>
                    ) : null}
                    <div className="flex gap-2">
                        <ConfigurationPrimaryButton onClick={() => void submit()} disabled={!canSubmit} data-testid="access-user-person-link-save">
                            {mode === "revoke" ? "Revoke link" : mode === "replace" ? "Replace link" : "Link"}
                        </ConfigurationPrimaryButton>
                        <ConfigurationSecondaryButton onClick={reset} disabled={busy}>
                            Cancel
                        </ConfigurationSecondaryButton>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

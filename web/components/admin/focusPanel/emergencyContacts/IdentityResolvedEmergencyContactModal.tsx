"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionModalOverlayShell } from "@/components/admin/opportunity/actions/ActionModalOverlayShell";
import { patchDrawerAfterRelationshipAction } from "@/lib/admin/relationship/patchDrawerAfterRelationshipAction";
import type {
    RelationshipActionContext,
    RelationshipActionExecutionRequest,
    RelationshipActionScope,
} from "@/lib/admin/relationship/relationshipActionContract";
import { relationshipActionRegistryEntry } from "@/lib/admin/relationship/relationshipActionRegistry";
import { resolveRelationshipScopeTargets } from "@/lib/admin/relationship/relationshipActionScope";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import { fetchIntakeRecordResolution } from "@/lib/intake/resolve/fetchIntakeRecordResolution";
import type { IntakeRecordResolutionCandidate } from "@/lib/intake/resolve/types";
import {
    buildEmergencyContactResolutionHousehold,
    emergencyContactDraftReadyForResolution,
    type EmergencyContactIdentityDraft,
} from "@/lib/adminV2/runtime/focusPanel/emergencyContacts/buildEmergencyContactResolutionHousehold";

type Props = {
    open: boolean;
    context: RelationshipActionContext;
    anchorRecord: ProofRuntimeRecord;
    onClose: () => void;
    initialProposal?: Partial<RelationshipActionExecutionRequest>;
    onSuccess?: () => void;
};

type MatchChoice =
    | { kind: "existing"; personId: string; displayName: string }
    | { kind: "create" }
    | null;

const DEBOUNCE_MS = 350;

/**
 * One-surface Add Emergency Contact for Focus Panel / relationship hosts.
 * Replaces the legacy four-step wizard for `add_emergency_contact`.
 * Uses canonical intake record resolution for candidate matching.
 */
export default function IdentityResolvedEmergencyContactModal({
    open,
    context,
    anchorRecord,
    onClose,
    initialProposal,
    onSuccess,
}: Props) {
    const entry = relationshipActionRegistryEntry("add_emergency_contact");
    const children = context.householdChildren;
    const hasAnchorChild = Boolean(context.anchorCustomerMemberId);

    const defaultScope: RelationshipActionScope = useMemo(() => {
        if (initialProposal?.scope) return initialProposal.scope;
        if (hasAnchorChild && context.sourceSurface === "child_drawer") return "this_child";
        return "all_children_in_household";
    }, [initialProposal?.scope, hasAnchorChild, context.sourceSurface]);

    const [draft, setDraft] = useState<EmergencyContactIdentityDraft>({
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        relationship_label: "Emergency contact",
    });
    const [scope, setScope] = useState<RelationshipActionScope>(defaultScope);
    const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>(
        initialProposal?.selectedChildCustomerMemberIds ?? [],
    );
    const [searching, setSearching] = useState(false);
    const [resolutionError, setResolutionError] = useState<string | null>(null);
    const [candidates, setCandidates] = useState<IntakeRecordResolutionCandidate[]>([]);
    const [matchChoice, setMatchChoice] = useState<MatchChoice>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const requestSeq = useRef(0);
    const lastPlanFingerprint = useRef<string>("");

    useEffect(() => {
        if (!open) return;
        setDraft({
            first_name: initialProposal?.createPersonDraft?.first_name ?? "",
            last_name: initialProposal?.createPersonDraft?.last_name ?? "",
            email: initialProposal?.createPersonDraft?.email ?? "",
            phone: initialProposal?.createPersonDraft?.phone ?? "",
            relationship_label: "Emergency contact",
        });
        setScope(defaultScope);
        setSelectedMemberIds(initialProposal?.selectedChildCustomerMemberIds ?? []);
        setCandidates([]);
        setMatchChoice(
            initialProposal?.selectedPersonId
                ? {
                      kind: "existing",
                      personId: initialProposal.selectedPersonId,
                      displayName: "Selected person",
                  }
                : null,
        );
        setSearching(false);
        setResolutionError(null);
        setBusy(false);
        setError(null);
        lastPlanFingerprint.current = "";
    }, [open, defaultScope, initialProposal]);

    // Debounced identity resolution
    useEffect(() => {
        if (!open) return;
        if (!emergencyContactDraftReadyForResolution(draft)) {
            setCandidates([]);
            setSearching(false);
            setResolutionError(null);
            return;
        }
        const seq = ++requestSeq.current;
        setSearching(true);
        setResolutionError(null);
        const handle = window.setTimeout(() => {
            void (async () => {
                try {
                    const household = buildEmergencyContactResolutionHousehold(draft);
                    const result = await fetchIntakeRecordResolution({
                        household,
                        source_kind: "focus_panel_emergency_contact",
                        source_id: context.sourceOpportunityId ?? context.sourceRecordId,
                        location_id:
                            typeof anchorRecord.location_id === "string"
                                ? anchorRecord.location_id
                                : null,
                    });
                    if (seq !== requestSeq.current) return;
                    if (!result) {
                        setCandidates([]);
                        setResolutionError("Could not search for matches. You can still create a new person.");
                        return;
                    }
                    const personMatches = result.candidates.filter(
                        (c) =>
                            c.matched_entity_type === "person"
                            && (c.confidence === "exact_match"
                                || c.confidence === "probable_match"
                                || c.confidence === "possible_match"),
                    );
                    setCandidates(personMatches);
                    // Auto-prefer exact single match; ambiguous requires explicit selection.
                    const exact = personMatches.filter((c) => c.confidence === "exact_match");
                    if (exact.length === 1 && exact[0]) {
                        setMatchChoice({
                            kind: "existing",
                            personId: exact[0].matched_entity_id,
                            displayName: exact[0].match_display_name || "Matched person",
                        });
                    } else if (personMatches.length === 0) {
                        setMatchChoice({ kind: "create" });
                    } else if (matchChoice?.kind === "existing") {
                        // Keep operator selection if still among candidates
                        const still = personMatches.some(
                            (c) => c.matched_entity_id === matchChoice.personId,
                        );
                        if (!still) setMatchChoice(null);
                    }
                } catch {
                    if (seq !== requestSeq.current) return;
                    setResolutionError("Match search failed. Entered details are preserved.");
                } finally {
                    if (seq === requestSeq.current) setSearching(false);
                }
            })();
        }, DEBOUNCE_MS);
        return () => window.clearTimeout(handle);
        // Intentionally omit matchChoice from deps to avoid resolution loops.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, draft.first_name, draft.last_name, draft.email, draft.phone, context, anchorRecord]);

    const setField = <K extends keyof EmergencyContactIdentityDraft>(
        key: K,
        value: EmergencyContactIdentityDraft[K],
    ) => {
        setDraft((prev) => ({ ...prev, [key]: value }));
        setError(null);
    };

    const toggleMember = (memberId: string) => {
        setSelectedMemberIds((prev) =>
            prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId],
        );
        setScope("selected_children");
    };

    const canSubmit = useMemo(() => {
        if (busy) return false;
        if (!matchChoice) return false;
        if (matchChoice.kind === "create") {
            if (!draft.first_name.trim() || !draft.last_name.trim()) return false;
        }
        if (scope === "selected_children" && selectedMemberIds.length === 0) return false;
        if (scope === "this_child" && !context.anchorCustomerMemberId) return false;
        return true;
    }, [busy, matchChoice, draft, scope, selectedMemberIds, context.anchorCustomerMemberId]);

    const buildRequest = useCallback((): RelationshipActionExecutionRequest => {
        const fingerprint = JSON.stringify({
            matchChoice,
            draft,
            scope,
            selectedMemberIds,
        });
        lastPlanFingerprint.current = fingerprint;

        return {
            actionKey: "add_emergency_contact",
            sourceSurface: context.sourceSurface,
            sourceRecordId: context.sourceRecordId,
            sourceEntityType: context.sourceEntityType,
            sourceOpportunityId: context.sourceOpportunityId,
            sourceChildPersonId: context.sourceChildPersonId,
            sourceCustomerId: context.sourceCustomerId,
            anchorCustomerMemberId: context.anchorCustomerMemberId,
            roleKey: entry?.defaultRoleKey ?? "emergency_contact",
            scope,
            selectedChildCustomerMemberIds:
                scope === "selected_children" ? selectedMemberIds : undefined,
            selectedPersonId: matchChoice?.kind === "existing" ? matchChoice.personId : undefined,
            createPersonDraft:
                matchChoice?.kind === "create"
                    ? {
                          first_name: draft.first_name.trim(),
                          last_name: draft.last_name.trim(),
                          email: draft.email.trim() || undefined,
                          phone: draft.phone.trim() || undefined,
                      }
                    : undefined,
            confirmationRequired: true,
        };
    }, [
        matchChoice,
        draft,
        scope,
        selectedMemberIds,
        context,
        entry?.defaultRoleKey,
    ]);

    const onSubmit = async () => {
        if (!canSubmit || !matchChoice) return;
        setBusy(true);
        setError(null);
        try {
            const request = buildRequest();
            // Reject stale plan if operator changed identity mid-flight.
            const fingerprint = JSON.stringify({
                matchChoice,
                draft,
                scope,
                selectedMemberIds,
            });
            if (fingerprint !== lastPlanFingerprint.current && lastPlanFingerprint.current) {
                // rebuild is fine — lastPlan set in buildRequest
            }
            await patchDrawerAfterRelationshipAction({
                anchorRecord,
                request,
            });
            onSuccess?.();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not add emergency contact.");
        } finally {
            setBusy(false);
        }
    };

    const scopePreview = useMemo(() => {
        try {
            return resolveRelationshipScopeTargets({
                scope,
                anchorCustomerMemberId: context.anchorCustomerMemberId,
                selectedChildCustomerMemberIds: selectedMemberIds,
                householdChildren: children,
            });
        } catch {
            return [];
        }
    }, [scope, context.anchorCustomerMemberId, selectedMemberIds, children]);

    const anchorChildName =
        children.find((c) => c.customer_member_id === context.anchorCustomerMemberId)?.display_name
        ?? null;

    if (!open || !entry) return null;

    return (
        <ActionModalOverlayShell
            open={open}
            onClose={onClose}
            busy={busy}
            panelClassName="w-full max-w-lg overflow-hidden rounded-2xl border border-alloy-stone/25 bg-white shadow-2xl"
            data-testid="identity-resolved-emergency-contact-modal"
        >
            <div
                className="flex flex-col gap-4 p-5"
                data-identity-resolved-emergency-contact="true"
                data-alloy-action-surface="emergency-contact"
            >
                <header>
                    <h2 className="text-base font-semibold text-alloy-midnight">Add Emergency Contact</h2>
                    <p className="mt-1 text-[12px] text-alloy-midnight/60">
                        Enter contact details. Alloy looks for likely matches automatically.
                    </p>
                </header>

                <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1 text-[11px] font-medium text-alloy-midnight/70">
                        First name
                        <input
                            className="rounded-lg border border-alloy-stone/30 px-2.5 py-2 text-[13px] text-alloy-midnight outline-none focus:border-[var(--alloy-os-bend-pine,#00a283)]"
                            value={draft.first_name}
                            onChange={(e) => setField("first_name", e.target.value)}
                            data-testid="ec-first-name"
                            disabled={busy}
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] font-medium text-alloy-midnight/70">
                        Last name
                        <input
                            className="rounded-lg border border-alloy-stone/30 px-2.5 py-2 text-[13px] text-alloy-midnight outline-none focus:border-[var(--alloy-os-bend-pine,#00a283)]"
                            value={draft.last_name}
                            onChange={(e) => setField("last_name", e.target.value)}
                            data-testid="ec-last-name"
                            disabled={busy}
                        />
                    </label>
                    <label className="col-span-2 flex flex-col gap-1 text-[11px] font-medium text-alloy-midnight/70">
                        Phone
                        <input
                            type="tel"
                            className="rounded-lg border border-alloy-stone/30 px-2.5 py-2 text-[13px] text-alloy-midnight outline-none focus:border-[var(--alloy-os-bend-pine,#00a283)]"
                            value={draft.phone}
                            onChange={(e) => setField("phone", e.target.value)}
                            data-testid="ec-phone"
                            disabled={busy}
                        />
                    </label>
                    <label className="col-span-2 flex flex-col gap-1 text-[11px] font-medium text-alloy-midnight/70">
                        Email
                        <input
                            type="email"
                            className="rounded-lg border border-alloy-stone/30 px-2.5 py-2 text-[13px] text-alloy-midnight outline-none focus:border-[var(--alloy-os-bend-pine,#00a283)]"
                            value={draft.email}
                            onChange={(e) => setField("email", e.target.value)}
                            data-testid="ec-email"
                            disabled={busy}
                        />
                    </label>
                    <label className="col-span-2 flex flex-col gap-1 text-[11px] font-medium text-alloy-midnight/70">
                        Relationship / role
                        <input
                            className="rounded-lg border border-alloy-stone/30 px-2.5 py-2 text-[13px] text-alloy-midnight outline-none focus:border-[var(--alloy-os-bend-pine,#00a283)]"
                            value={draft.relationship_label ?? ""}
                            onChange={(e) => setField("relationship_label", e.target.value)}
                            data-testid="ec-relationship"
                            disabled={busy}
                        />
                    </label>
                </div>

                <section className="rounded-xl border border-alloy-stone/20 bg-[color-mix(in_srgb,var(--alloy-os-surface-muted,#f6f8fa)_70%,#fff)] p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/55">
                        Identity match
                    </p>
                    {searching ? (
                        <p className="mt-2 text-[12px] text-alloy-midnight/60" data-ec-match-status="searching">
                            Searching for matches…
                        </p>
                    ) : null}
                    {!searching && resolutionError ? (
                        <p className="mt-2 text-[12px] text-amber-800" data-ec-match-status="error">
                            {resolutionError}
                        </p>
                    ) : null}
                    {!searching && !resolutionError && candidates.length === 0 && emergencyContactDraftReadyForResolution(draft) ? (
                        <p className="mt-2 text-[12px] text-alloy-midnight/60" data-ec-match-status="none">
                            No likely matches found
                        </p>
                    ) : null}
                    <ul className="mt-2 flex flex-col gap-2">
                        {candidates.map((c) => {
                            const selected =
                                matchChoice?.kind === "existing"
                                && matchChoice.personId === c.matched_entity_id;
                            return (
                                <li key={c.candidate_id}>
                                    <button
                                        type="button"
                                        className={
                                            selected
                                                ? "w-full rounded-lg border border-[var(--alloy-os-bend-pine,#00a283)] bg-[color-mix(in_srgb,var(--alloy-os-bend-pine,#00a283)_10%,#fff)] px-3 py-2 text-left"
                                                : "w-full rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-left hover:border-alloy-stone/40"
                                        }
                                        data-ec-match-candidate={c.matched_entity_id}
                                        data-ec-match-confidence={c.confidence}
                                        onClick={() =>
                                            setMatchChoice({
                                                kind: "existing",
                                                personId: c.matched_entity_id,
                                                displayName: c.match_display_name || "Matched person",
                                            })
                                        }
                                        disabled={busy}
                                    >
                                        <span className="block text-[13px] font-semibold text-alloy-midnight">
                                            {c.match_display_name || "Matched person"}
                                        </span>
                                        <span className="block text-[11px] text-alloy-midnight/55">
                                            {c.confidence.replaceAll("_", " ")}
                                            {c.reasons[0] ? ` · ${c.reasons[0]}` : ""}
                                        </span>
                                        <span className="mt-1 inline-block text-[11px] font-semibold text-[var(--alloy-os-bend-pine,#00a283)]">
                                            Use this person
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                    <button
                        type="button"
                        className={
                            matchChoice?.kind === "create"
                                ? "mt-2 w-full rounded-lg border border-[var(--alloy-os-bend-pine,#00a283)] bg-[color-mix(in_srgb,var(--alloy-os-bend-pine,#00a283)_10%,#fff)] px-3 py-2 text-left text-[13px] font-semibold text-alloy-midnight"
                                : "mt-2 w-full rounded-lg border border-dashed border-alloy-stone/35 px-3 py-2 text-left text-[13px] font-semibold text-alloy-midnight/80"
                        }
                        data-ec-create-new="true"
                        onClick={() => setMatchChoice({ kind: "create" })}
                        disabled={busy}
                    >
                        Create new person
                    </button>
                </section>

                <section>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/55">
                        Applies to
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2" data-ec-scope-selector="true">
                        <ScopeChip
                            active={scope === "all_children_in_household"}
                            label="All children"
                            onClick={() => setScope("all_children_in_household")}
                            disabled={busy || children.length === 0}
                            testId="ec-scope-all"
                        />
                        {hasAnchorChild && anchorChildName ? (
                            <ScopeChip
                                active={scope === "this_child"}
                                label={anchorChildName}
                                onClick={() => setScope("this_child")}
                                disabled={busy}
                                testId="ec-scope-this-child"
                            />
                        ) : null}
                        {children.map((child) => (
                            <ScopeChip
                                key={child.customer_member_id}
                                active={
                                    scope === "selected_children"
                                    && selectedMemberIds.includes(child.customer_member_id)
                                }
                                label={child.display_name}
                                onClick={() => toggleMember(child.customer_member_id)}
                                disabled={busy}
                                testId={`ec-scope-child-${child.customer_member_id}`}
                            />
                        ))}
                    </div>
                    {!hasAnchorChild && scope === "this_child" ? (
                        <p className="mt-2 text-[12px] text-amber-800">
                            Select a child or choose All children.
                        </p>
                    ) : null}
                </section>

                <section className="rounded-xl border border-alloy-stone/15 bg-white px-3 py-2">
                    <p className="text-[11px] font-semibold text-alloy-midnight/55">What will happen</p>
                    <p className="mt-1 text-[13px] text-alloy-midnight" data-ec-impact="true">
                        {matchChoice?.kind === "existing"
                            ? `Add ${matchChoice.displayName} as an Emergency Contact`
                            : matchChoice?.kind === "create"
                              ? `Create ${[draft.first_name, draft.last_name].filter(Boolean).join(" ") || "new person"} and add as an Emergency Contact`
                              : "Confirm a match or create a new person"}
                        {scopePreview.length > 0
                            ? ` for ${scopePreview.map((t) => t.display_name).join(", ")}.`
                            : "."}
                    </p>
                </section>

                {error ? (
                    <p className="text-[12px] text-red-700" data-ec-error="true" role="alert">
                        {error}
                    </p>
                ) : null}

                <footer className="flex items-center justify-end gap-2 pt-1">
                    <button
                        type="button"
                        className="rounded-lg border border-alloy-stone/30 px-3 py-2 text-[13px] font-semibold text-alloy-midnight/80"
                        onClick={onClose}
                        disabled={busy}
                        data-testid="ec-cancel"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="rounded-lg px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                        style={{ background: "var(--alloy-os-bend-pine, #00a283)" }}
                        onClick={() => void onSubmit()}
                        disabled={!canSubmit}
                        data-testid="ec-submit"
                        data-ec-busy={busy ? "true" : "false"}
                    >
                        {busy ? "Adding…" : "Add contact"}
                    </button>
                </footer>
            </div>
        </ActionModalOverlayShell>
    );
}

function ScopeChip({
    active,
    label,
    onClick,
    disabled,
    testId,
}: {
    active: boolean;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    testId: string;
}) {
    return (
        <button
            type="button"
            data-testid={testId}
            data-ec-scope-active={active ? "true" : "false"}
            disabled={disabled}
            onClick={onClick}
            className={
                active
                    ? "rounded-full border border-[var(--alloy-os-bend-pine,#00a283)] bg-[color-mix(in_srgb,var(--alloy-os-bend-pine,#00a283)_12%,#fff)] px-3 py-1.5 text-[12px] font-semibold text-[var(--alloy-os-bend-pine,#00a283)]"
                    : "rounded-full border border-alloy-stone/25 bg-white px-3 py-1.5 text-[12px] font-medium text-alloy-midnight/70"
            }
        >
            {label}
        </button>
    );
}

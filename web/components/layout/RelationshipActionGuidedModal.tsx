"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ActionModalOverlayShell } from "@/components/admin/opportunity/actions/ActionModalOverlayShell";
import { patchDrawerAfterRelationshipAction } from "@/lib/admin/relationship/patchDrawerAfterRelationshipAction";
import {
    RELATIONSHIP_ACTION_SCOPE_LABELS,
    type RelationshipActionContext,
    type RelationshipActionExecutionRequest,
    type RelationshipActionKey,
    type RelationshipActionScope,
} from "@/lib/admin/relationship/relationshipActionContract";
import {
    listEditableRelationshipRoles,
    relationshipActionRegistryEntry,
} from "@/lib/admin/relationship/relationshipActionRegistry";
import { resolveRelationshipScopeTargets } from "@/lib/admin/relationship/relationshipActionScope";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

type IdentityMode = "existing" | "create";

type Props = {
    open: boolean;
    actionKey: RelationshipActionKey;
    context: RelationshipActionContext;
    anchorRecord: ProofRuntimeRecord;
    onClose: () => void;
    /** Prefill from BOS proposal (still requires confirm). */
    initialProposal?: Partial<RelationshipActionExecutionRequest>;
    onSuccess?: () => void;
};

type WizardStep = 1 | 2 | 3 | 4;

export default function RelationshipActionGuidedModal({
    open,
    actionKey,
    context,
    anchorRecord,
    onClose,
    initialProposal,
    onSuccess,
}: Props) {
    const entry = relationshipActionRegistryEntry(actionKey);
    const [step, setStep] = useState<WizardStep>(1);
    const [identityMode, setIdentityMode] = useState<IdentityMode>("existing");
    const [selectedPersonId, setSelectedPersonId] = useState("");
    const [selectedChildPersonId, setSelectedChildPersonId] = useState("");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [dateOfBirth, setDateOfBirth] = useState("");
    const [roleKey, setRoleKey] = useState(entry?.defaultRoleKey ?? "");
    const [scope, setScope] = useState<RelationshipActionScope>(entry?.allowedScopes[0] ?? "this_child");
    const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isChildIdentity = entry?.identityKind === "child";
    const adultCandidates = context.householdAdultCandidates;
    const childCandidates = context.householdChildCandidates;
    const siblingOptions = useMemo(
        () =>
            context.householdChildren.filter(
                (child) => child.customer_member_id !== context.anchorCustomerMemberId,
            ),
        [context.anchorCustomerMemberId, context.householdChildren],
    );

    useEffect(() => {
        if (!open || !entry) return;
        setStep(1);
        setIdentityMode(isChildIdentity ? "existing" : adultCandidates.length > 0 ? "existing" : "create");
        setSelectedPersonId(initialProposal?.selectedPersonId ?? adultCandidates[0]?.person_id ?? "");
        setSelectedChildPersonId(initialProposal?.selectedChildPersonId ?? childCandidates[0]?.child_person_id ?? "");
        setFirstName(initialProposal?.createPersonDraft?.first_name ?? initialProposal?.createChildDraft?.first_name ?? "");
        setLastName(initialProposal?.createPersonDraft?.last_name ?? initialProposal?.createChildDraft?.last_name ?? "");
        setEmail(initialProposal?.createPersonDraft?.email ?? "");
        setPhone(initialProposal?.createPersonDraft?.phone ?? "");
        setDateOfBirth(initialProposal?.createChildDraft?.date_of_birth ?? "");
        setRoleKey(initialProposal?.roleKey ?? entry.defaultRoleKey ?? "");
        setScope(initialProposal?.scope ?? entry.allowedScopes[0] ?? "this_child");
        setSelectedMemberIds(initialProposal?.selectedChildCustomerMemberIds ?? []);
        setBusy(false);
        setError(null);
    }, [open, entry, isChildIdentity, adultCandidates, childCandidates, initialProposal]);

    const identityLabel = useMemo(() => {
        if (isChildIdentity) {
            if (identityMode === "existing") {
                return childCandidates.find((c) => c.child_person_id === selectedChildPersonId)?.display_name ?? "Child";
            }
            return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ") || "New child";
        }
        if (identityMode === "existing") {
            return adultCandidates.find((c) => c.person_id === selectedPersonId)?.display_name ?? "Person";
        }
        return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ") || "New person";
    }, [
        adultCandidates,
        childCandidates,
        firstName,
        identityMode,
        isChildIdentity,
        lastName,
        selectedChildPersonId,
        selectedPersonId,
    ]);

    const scopeTargets = useMemo(
        () =>
            resolveRelationshipScopeTargets({
                scope,
                anchorCustomerMemberId: context.anchorCustomerMemberId,
                householdChildren: context.householdChildren,
                selectedChildCustomerMemberIds:
                    scope === "selected_children" && context.anchorCustomerMemberId ?
                        [...new Set([context.anchorCustomerMemberId, ...selectedMemberIds])]
                    :   selectedMemberIds,
            }),
        [context.anchorCustomerMemberId, context.householdChildren, scope, selectedMemberIds],
    );

    const canAdvanceStep1 =
        isChildIdentity ?
            identityMode === "existing" ?
                Boolean(selectedChildPersonId)
            :   Boolean(firstName.trim() && lastName.trim())
        : identityMode === "existing" ?
            Boolean(selectedPersonId)
        :   Boolean(firstName.trim() && lastName.trim() && (email.trim() || phone.trim()));

    const buildRequest = useCallback((): RelationshipActionExecutionRequest => {
        return {
            actionKey,
            sourceSurface: context.sourceSurface,
            sourceRecordId: context.sourceRecordId,
            sourceEntityType: context.sourceEntityType,
            sourceOpportunityId: context.sourceOpportunityId,
            sourceChildPersonId: context.sourceChildPersonId,
            sourceCustomerId: context.sourceCustomerId,
            anchorCustomerMemberId: context.anchorCustomerMemberId ?? undefined,
            scope,
            roleKey: roleKey || undefined,
            selectedChildCustomerMemberIds:
                scope === "selected_children" && context.anchorCustomerMemberId ?
                    [...new Set([context.anchorCustomerMemberId, ...selectedMemberIds])]
                :   scope === "selected_children" ? selectedMemberIds
                :   undefined,
            selectedPersonId: !isChildIdentity && identityMode === "existing" ? selectedPersonId : undefined,
            selectedChildPersonId: isChildIdentity && identityMode === "existing" ? selectedChildPersonId : undefined,
            createPersonDraft:
                !isChildIdentity && identityMode === "create" ?
                    {
                        first_name: firstName.trim(),
                        last_name: lastName.trim(),
                        email: email.trim() || undefined,
                        phone: phone.trim() || undefined,
                    }
                :   undefined,
            createChildDraft:
                isChildIdentity && identityMode === "create" ?
                    {
                        first_name: firstName.trim(),
                        last_name: lastName.trim(),
                        date_of_birth: dateOfBirth.trim() || undefined,
                    }
                :   undefined,
            confirmationRequired: true,
        };
    }, [
        actionKey,
        context,
        dateOfBirth,
        email,
        firstName,
        identityMode,
        isChildIdentity,
        lastName,
        phone,
        roleKey,
        scope,
        selectedChildPersonId,
        selectedMemberIds,
        selectedPersonId,
    ]);

    const handleConfirm = useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
            await patchDrawerAfterRelationshipAction({
                anchorRecord,
                request: buildRequest(),
            });
            onSuccess?.();
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Relationship action failed.");
        } finally {
            setBusy(false);
        }
    }, [anchorRecord, buildRequest, onClose, onSuccess]);

    if (!open || !entry) return null;

    return (
        <ActionModalOverlayShell
            open={open}
            onClose={onClose}
            busy={busy}
            panelClassName="w-[92vw] max-w-[560px] overflow-hidden rounded-2xl border border-admin-border bg-white shadow-xl"
            data-testid={`relationship-action-modal-${actionKey}`}
        >
            <div role="dialog" aria-modal="true" aria-label={entry.label}>
                <div className="border-b border-alloy-stone/15 px-5 py-4">
                    <div className="text-sm font-semibold text-alloy-midnight">{entry.label}</div>
                    <div className="mt-0.5 text-[12px] text-alloy-midnight/60">
                        Step {step} of 4 — {context.childDisplayName || context.sourceRecordId}
                    </div>
                </div>

                <div className="space-y-4 px-5 py-4 text-sm text-alloy-midnight/85">
                    {step === 1 ?
                        <StepIdentity
                            isChildIdentity={isChildIdentity}
                            identityMode={identityMode}
                            setIdentityMode={setIdentityMode}
                            adultCandidates={adultCandidates}
                            childCandidates={childCandidates}
                            selectedPersonId={selectedPersonId}
                            setSelectedPersonId={setSelectedPersonId}
                            selectedChildPersonId={selectedChildPersonId}
                            setSelectedChildPersonId={setSelectedChildPersonId}
                            firstName={firstName}
                            setFirstName={setFirstName}
                            lastName={lastName}
                            setLastName={setLastName}
                            email={email}
                            setEmail={setEmail}
                            phone={phone}
                            setPhone={setPhone}
                            dateOfBirth={dateOfBirth}
                            setDateOfBirth={setDateOfBirth}
                        />
                    : step === 2 ?
                        <StepRole
                            roleKey={roleKey}
                            setRoleKey={setRoleKey}
                            roleEditable={entry.roleEditable}
                            defaultRoleKey={entry.defaultRoleKey}
                            identityLabel={identityLabel}
                        />
                    : step === 3 ?
                        <StepScope
                            allowedScopes={entry.allowedScopes}
                            scope={scope}
                            setScope={setScope}
                            siblingOptions={siblingOptions}
                            anchorMemberId={context.anchorCustomerMemberId}
                            anchorLabel={context.childDisplayName}
                            selectedMemberIds={selectedMemberIds}
                            toggleMember={(id) =>
                                setSelectedMemberIds((prev) =>
                                    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                                )
                            }
                        />
                    :   <StepConfirm
                            entryLabel={entry.label}
                            confirmationCopy={entry.confirmationCopy}
                            identityLabel={identityLabel}
                            roleKey={roleKey || entry.defaultRoleKey || "—"}
                            scopeTargets={scopeTargets}
                            writeTargets={entry.writeTargets}
                        />
                    }
                    {error ?
                        <p className="text-xs text-alloy-ember" data-testid="relationship-action-error">
                            {error}
                        </p>
                    :   null}
                </div>

                <div className="flex justify-between gap-2 border-t border-alloy-stone/15 px-5 py-4">
                    <button
                        type="button"
                        className="rounded-lg border border-alloy-forge/15 px-3 py-2 text-xs font-medium text-alloy-midnight/65"
                        onClick={() => {
                            if (step === 1) onClose();
                            else setStep((prev) => (prev > 1 ? ((prev - 1) as WizardStep) : prev));
                        }}
                        disabled={busy}
                    >
                        {step === 1 ? "Cancel" : "Back"}
                    </button>
                    <button
                        type="button"
                        className="rounded-lg bg-alloy-pine px-4 py-2 text-xs font-semibold text-white hover:bg-alloy-pine/90 disabled:opacity-50"
                        disabled={busy || (step === 1 && !canAdvanceStep1)}
                        onClick={() => {
                            if (step < 4) setStep((prev) => (prev + 1) as WizardStep);
                            else void handleConfirm();
                        }}
                        data-testid={step === 4 ? "relationship-action-confirm" : `relationship-action-next-${step}`}
                    >
                        {step === 4 ? (busy ? "Saving…" : "Confirm and save") : "Next"}
                    </button>
                </div>
            </div>
        </ActionModalOverlayShell>
    );
}

function StepIdentity(props: {
    isChildIdentity: boolean;
    identityMode: IdentityMode;
    setIdentityMode: (mode: IdentityMode) => void;
    adultCandidates: RelationshipActionContext["householdAdultCandidates"];
    childCandidates: RelationshipActionContext["householdChildCandidates"];
    selectedPersonId: string;
    setSelectedPersonId: (id: string) => void;
    selectedChildPersonId: string;
    setSelectedChildPersonId: (id: string) => void;
    firstName: string;
    setFirstName: (v: string) => void;
    lastName: string;
    setLastName: (v: string) => void;
    email: string;
    setEmail: (v: string) => void;
    phone: string;
    setPhone: (v: string) => void;
    dateOfBirth: string;
    setDateOfBirth: (v: string) => void;
}) {
    const candidates = props.isChildIdentity ? props.childCandidates : props.adultCandidates;
    return (
        <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/50">
                {props.isChildIdentity ? "Choose or create child" : "Choose or create person"}
            </legend>
            <div className="flex gap-2">
                <Chip active={props.identityMode === "existing"} label="Link existing" onClick={() => props.setIdentityMode("existing")} />
                <Chip active={props.identityMode === "create"} label="Create new" onClick={() => props.setIdentityMode("create")} />
            </div>
            {props.identityMode === "existing" ?
                <select
                    className="w-full rounded-lg border border-alloy-forge/15 px-3 py-2 text-sm"
                    value={props.isChildIdentity ? props.selectedChildPersonId : props.selectedPersonId}
                    onChange={(e) =>
                        props.isChildIdentity ?
                            props.setSelectedChildPersonId(e.target.value)
                        :   props.setSelectedPersonId(e.target.value)
                    }
                    data-testid="relationship-action-existing-identity"
                >
                    {candidates.length === 0 ?
                        <option value="">No candidates loaded</option>
                    : props.isChildIdentity ?
                        props.childCandidates.map((c) => (
                            <option key={c.child_person_id ?? c.customer_member_id} value={c.child_person_id ?? ""}>
                                {c.display_name}
                            </option>
                        ))
                    :   props.adultCandidates.map((c) => (
                            <option key={c.person_id} value={c.person_id}>
                                {c.display_name}
                            </option>
                        ))
                    }
                </select>
            :   <div className="grid grid-cols-2 gap-3">
                    <Field label="First name" value={props.firstName} onChange={props.setFirstName} testId="relationship-action-first-name" />
                    <Field label="Last name" value={props.lastName} onChange={props.setLastName} testId="relationship-action-last-name" />
                    {!props.isChildIdentity ?
                        <>
                            <Field label="Email" value={props.email} onChange={props.setEmail} className="col-span-2" />
                            <Field label="Phone" value={props.phone} onChange={props.setPhone} className="col-span-2" />
                        </>
                    :   <Field label="Date of birth" value={props.dateOfBirth} onChange={props.setDateOfBirth} className="col-span-2" />
                    }
                </div>
            }
        </fieldset>
    );
}

function StepRole(props: {
    roleKey: string;
    setRoleKey: (v: string) => void;
    roleEditable: boolean;
    defaultRoleKey: string | null;
    identityLabel: string;
}) {
    if (!props.roleEditable) {
        return (
            <p>
                <strong>{props.identityLabel}</strong> will be linked as{" "}
                <strong>{(props.defaultRoleKey ?? props.roleKey).replace(/_/g, " ")}</strong>.
            </p>
        );
    }
    return (
        <label className="block text-xs font-medium text-alloy-midnight/75">
            Responsibility role
            <select
                className="mt-1.5 w-full rounded-lg border border-alloy-forge/15 px-3 py-2 text-sm"
                value={props.roleKey}
                onChange={(e) => props.setRoleKey(e.target.value)}
                data-testid="relationship-action-role-select"
            >
                {listEditableRelationshipRoles().map((role) => (
                    <option key={role} value={role}>
                        {role.replace(/_/g, " ")}
                    </option>
                ))}
            </select>
        </label>
    );
}

function StepScope(props: {
    allowedScopes: readonly RelationshipActionScope[];
    scope: RelationshipActionScope;
    setScope: (scope: RelationshipActionScope) => void;
    siblingOptions: RelationshipActionContext["householdChildren"];
    anchorMemberId: string | null;
    anchorLabel: string;
    selectedMemberIds: string[];
    toggleMember: (id: string) => void;
}) {
    return (
        <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/50">Applies to</legend>
            {props.allowedScopes.map((scopeKey) => (
                <label key={scopeKey} className="flex items-start gap-2 text-sm">
                    <input
                        type="radio"
                        name="relationship-action-scope"
                        checked={props.scope === scopeKey}
                        onChange={() => props.setScope(scopeKey)}
                        data-testid={`relationship-action-scope-${scopeKey}`}
                    />
                    <span>
                        {scopeKey === "this_child" ?
                            `${RELATIONSHIP_ACTION_SCOPE_LABELS[scopeKey]} (${props.anchorLabel})`
                        :   RELATIONSHIP_ACTION_SCOPE_LABELS[scopeKey]}
                    </span>
                </label>
            ))}
            {props.scope === "selected_children" && props.anchorMemberId ?
                <div className="ml-6 space-y-1 border-l border-alloy-forge/10 pl-3">
                    <label className="flex items-center gap-2 text-xs font-medium">
                        <input type="checkbox" checked disabled readOnly />
                        {props.anchorLabel} (this child)
                    </label>
                    {props.siblingOptions.map((child) => (
                        <label key={child.customer_member_id} className="flex items-center gap-2 text-xs">
                            <input
                                type="checkbox"
                                checked={props.selectedMemberIds.includes(child.customer_member_id)}
                                onChange={() => props.toggleMember(child.customer_member_id)}
                            />
                            {child.display_name}
                        </label>
                    ))}
                </div>
            :   null}
        </fieldset>
    );
}

function StepConfirm(props: {
    entryLabel: string;
    confirmationCopy: string;
    identityLabel: string;
    roleKey: string;
    scopeTargets: ReturnType<typeof resolveRelationshipScopeTargets>;
    writeTargets: readonly string[];
}) {
    return (
        <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/50">Confirm impact</p>
            <p className="text-sm">{props.confirmationCopy}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
                <li>
                    <strong>{props.identityLabel}</strong> as <strong>{props.roleKey.replace(/_/g, " ")}</strong>
                </li>
                <li>Affected records: {props.scopeTargets.map((t) => t.display_name).join(", ") || "—"}</li>
                <li>Tables: {props.writeTargets.join(", ")}</li>
            </ul>
            <p className="text-xs text-alloy-midnight/55">No changes are saved until you confirm.</p>
        </div>
    );
}

function Chip(props: { active: boolean; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                props.active ?
                    "border-alloy-pine/40 bg-alloy-pine/[0.08] text-alloy-pine"
                :   "border-alloy-forge/12 text-alloy-midnight/70"
            }`}
            onClick={props.onClick}
        >
            {props.label}
        </button>
    );
}

function Field(props: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    className?: string;
    testId?: string;
}) {
    return (
        <label className={`block text-xs font-medium text-alloy-midnight/75 ${props.className ?? ""}`}>
            {props.label}
            <input
                className="mt-1.5 w-full rounded-lg border border-alloy-forge/15 px-3 py-2 text-sm"
                value={props.value}
                onChange={(e) => props.onChange(e.target.value)}
                data-testid={props.testId}
            />
        </label>
    );
}

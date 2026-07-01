"use client";

import { DistributionLinksPanel } from "@/components/forms/workspace/DistributionLinksPanel";
import type { FormLifecycleRecordCreationGate } from "@/lib/forms/lifecycle/isFormLifecycleReadyForRecordCreation";
import type { DistributionCreatedLinkPayload, DistributionLinkRow } from "@/lib/forms/distributionPresentation";

export type FormPublicLinkRow = DistributionLinkRow & {
    token_prefix: string | null;
    pinned_form_definition_version_id: string | null;
};

export type CreatedLinkPayload = {
    plaintext_token: string;
    embed_path: string;
    embed_url: string | null;
};

type Props = {
    formKey: string;
    canMutate: boolean;
    creating: boolean;
    createErr: string | null;
    links: FormPublicLinkRow[];
    createdOnce: CreatedLinkPayload | null;
    copied: string | null;
    copyWarn: string | null;
    viewerTz: string;
    onCreateLink: () => void;
    onCopy: (key: string, text: string) => void;
    recordCreationGate?: FormLifecycleRecordCreationGate;
};

function toCreatedLink(payload: CreatedLinkPayload | null): DistributionCreatedLinkPayload | null {
    if (!payload) return null;
    return {
        embed_path: payload.embed_path,
        embed_url: payload.embed_url,
        plaintext_token: payload.plaintext_token,
    };
}

/** Form distribution wrapper around shared DistributionLinksPanel (OW-7). */
export function FormDistributionPanel({
    formKey,
    canMutate,
    creating,
    createErr,
    links,
    createdOnce,
    copied,
    copyWarn,
    viewerTz,
    onCreateLink,
    onCopy,
    recordCreationGate,
}: Props) {
    const shareIntakeBlocked = Boolean(recordCreationGate?.blocksRecordCreatingShare);
    return (
        <div data-testid="form-distribution-panel">
            <DistributionLinksPanel
                mode="form"
                subjectName="Form"
                formKey={formKey}
                canMutate={canMutate}
                busy={creating}
                error={createErr}
                links={links}
                createdLink={toCreatedLink(createdOnce)}
                viewerTz={viewerTz}
                copied={copied}
                copyWarn={copyWarn}
                onCopy={onCopy}
                onShareIntake={onCreateLink}
                shareIntakeBlocked={shareIntakeBlocked}
                shareIntakeBlockedLabel={recordCreationGate?.shareBlockButtonLabel ?? "Add required fields first"}
                shareIntakeBlockedMessage={recordCreationGate?.shareBlockMessage ?? null}
            />
        </div>
    );
}

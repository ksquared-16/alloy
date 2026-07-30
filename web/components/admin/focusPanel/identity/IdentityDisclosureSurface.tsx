"use client";

import { type ReactNode } from "react";
import clsx from "clsx";
import type { IdentityDisclosureDepth, IdentityRecordVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";
import IdentityRecordSummary from "@/components/admin/focusPanel/identity/IdentityRecordSummary";
import type { IdentityFieldSaveArgs } from "@/components/admin/focusPanel/identity/IdentityFieldGrid";
import type { IdentityFieldBatchSaveArgs } from "@/components/admin/focusPanel/identity/IdentityRecordSummary";
import IdentityEvidenceCollections from "@/components/admin/focusPanel/identity/IdentityEvidenceCollections";
import IdentityAvatarEditable, {
    type IdentityAvatarPhotoClear,
    type IdentityAvatarPhotoSave,
} from "@/components/admin/focusPanel/identity/IdentityAvatarEditable";

type Props = {
    record: IdentityRecordVM;
    depth: Extract<IdentityDisclosureDepth, "details" | "evidence">;
    className?: string;
    onEditContact?: (recordId: string) => void;
    onSaveField?: (args: IdentityFieldSaveArgs) => Promise<{ ok: boolean } | void>;
    onSaveFields?: (args: IdentityFieldBatchSaveArgs) => Promise<{ ok: boolean } | void>;
    onEditField?: (fieldRef: string) => void;
    onLinkField?: (fieldRef: string) => void;
    onSelectEvidenceCollection?: (key: string) => void;
    onEnterEvidence?: () => void;
    /** Live Work Unit avatar upload (canonical person profile photo). */
    personId?: string | null;
    customerMemberId?: string | null;
    /**
     * Ungated photo URL from evidence (`child.imageUrl`). Prefer over
     * `record.avatar.imageUrl`, which may be null when useProfilePhotos is off.
     */
    photoUrl?: string | null;
    onSavePhoto?: IdentityAvatarPhotoSave;
    onClearPhoto?: IdentityAvatarPhotoClear;
    avatarSlot?: ReactNode;
};

/** Details or Evidence depth for one selected identity. */
export default function IdentityDisclosureSurface({
    record,
    depth,
    className,
    onEditContact,
    onSaveField,
    onSaveFields,
    onEditField,
    onLinkField,
    onSelectEvidenceCollection,
    onEnterEvidence,
    personId,
    customerMemberId,
    photoUrl = null,
    onSavePhoto,
    onClearPhoto,
    avatarSlot,
}: Props) {
    const liveAvatarSlot =
        avatarSlot
        ?? (record.avatar?.visible === false
            ? undefined
            : onSavePhoto || personId || customerMemberId
              ? (
                    <IdentityAvatarEditable
                        name={record.title}
                        imageUrl={photoUrl ?? record.avatar?.imageUrl}
                        visible={true}
                        role={record.avatar?.role}
                        recordId={record.id}
                        personId={personId}
                        customerMemberId={customerMemberId}
                        onSavePhoto={onSavePhoto}
                        onClearPhoto={onClearPhoto}
                        allowUpload={Boolean(onSavePhoto)}
                        size={40}
                    />
                )
              : undefined);

    return (
        <div
            className={clsx("identity-disclosure-surface", className)}
            data-identity-disclosure-surface={depth}
            data-identity-record={record.id}
        >
            <IdentityRecordSummary
                record={record}
                depth={depth}
                onEditContact={onEditContact}
                onSaveField={onSaveField}
                onSaveFields={onSaveFields}
                onEditField={onEditField}
                onLinkField={onLinkField}
                avatarSlot={liveAvatarSlot}
            />
            {depth === "details" ?
                <>
                    {record.evidenceCollections && record.evidenceCollections.length > 0 && onEnterEvidence ?
                        <button
                            type="button"
                            className="identity-disclosure-surface__evidence-link alloy-os-ucard__action alloy-os-ucard__action--system5"
                            onClick={onEnterEvidence}
                        >
                            View evidence →
                        </button>
                    :   null}
                </>
            :   null}
            {depth === "evidence" ?
                <IdentityEvidenceCollections
                    collections={record.evidenceCollections ?? []}
                    onSelectCollection={onSelectEvidenceCollection}
                />
            :   null}
        </div>
    );
}

"use client";

/**
 * Shared identity avatar with optional upload/replace for live Work Unit cards.
 * Honors Surfaces avatar visibility; persists through canonical person profile-photo API.
 */

import { useEffect, useRef, useState } from "react";
import IdentityAvatar from "@/components/admin/focusPanel/identity/IdentityAvatar";
import type { IdentityAvatarSemanticRole } from "@/lib/adminV2/runtime/focusPanel/focusPanelIdentityAvatar";
import type { FocusPanelPhotoSaveResult } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import {
    clearPersonProfilePhoto,
    resolvePersonIdForProfilePhoto,
    uploadPersonProfilePhotoDocument,
} from "@/lib/adminV2/runtime/focusPanel/persistPersonProfilePhoto";
import {
    getChildAvatarSessionPreview,
    setChildAvatarSessionPreview,
} from "@/lib/adminV2/runtime/focusPanel/children/childAvatarSessionPreview";
import { useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";

export type IdentityAvatarPhotoSave = (args: {
    childId: string;
    personId: string;
    documentId: string;
}) => Promise<FocusPanelPhotoSaveResult>;

export type IdentityAvatarPhotoClear = (args: {
    childId: string;
    personId: string;
}) => Promise<FocusPanelPhotoSaveResult>;

type Props = {
    name: string;
    imageUrl?: string | null;
    size?: number;
    visible?: boolean;
    role?: IdentityAvatarSemanticRole;
    recordId?: string;
    /** Person id for documents upload entity binding. */
    personId?: string | null;
    /** Fallback when inquiry evidence omitted person_id — resolve/ensure via member. */
    customerMemberId?: string | null;
    /** When set, operators can upload/replace from the live card (Surfaces Avatar on). */
    onSavePhoto?: IdentityAvatarPhotoSave;
    onClearPhoto?: IdentityAvatarPhotoClear;
    disabled?: boolean;
};

function resolveInitialUrl(args: {
    recordId?: string;
    imageUrl?: string | null;
    composerPreview: string | null;
}): string | null {
    return (
        args.composerPreview
        ?? (args.recordId ? getChildAvatarSessionPreview(args.recordId) : null)
        ?? args.imageUrl
        ?? null
    );
}

export default function IdentityAvatarEditable({
    name,
    imageUrl,
    size = 30,
    visible = true,
    role,
    recordId,
    personId,
    customerMemberId,
    onSavePhoto,
    onClearPhoto,
    disabled = false,
}: Props) {
    const composer = useFocusPanelComposer();
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const sessionPreview =
        recordId && composer ? composer.childAvatarPreviewUrl(recordId) : null;
    const [resolvedUrl, setResolvedUrl] = useState<string | null>(() =>
        resolveInitialUrl({ recordId, imageUrl, composerPreview: sessionPreview }),
    );
    const [resolvedPersonId, setResolvedPersonId] = useState<string | null>(personId ?? null);

    const applyPreview = (url: string | null) => {
        setResolvedUrl(url);
        if (recordId) {
            setChildAvatarSessionPreview(recordId, url);
            composer?.setChildAvatarPreviewUrl(recordId, url);
        }
    };

    // Prefer evidence URL once truth catches up; otherwise keep session/local preview.
    useEffect(() => {
        const preview =
            (recordId && composer ? composer.childAvatarPreviewUrl(recordId) : null)
            ?? (recordId ? getChildAvatarSessionPreview(recordId) : null);
        setResolvedUrl(imageUrl?.trim() || preview || null);
        setResolvedPersonId(personId ?? null);
    }, [recordId, imageUrl, personId, composer, sessionPreview]);

    if (!visible) return null;

    const showUploadControls = Boolean(onSavePhoto && recordId && !disabled);
    const canAttemptUpload = Boolean(showUploadControls && (resolvedPersonId || customerMemberId));

    const onFileChange = async (file: File | undefined) => {
        if (!file || !onSavePhoto || !recordId) return;
        setUploading(true);
        setError(null);
        try {
            const resolved = await resolvePersonIdForProfilePhoto({
                personId: resolvedPersonId,
                customerMemberId,
            });
            if (!resolved.ok) throw new Error(resolved.error);
            setResolvedPersonId(resolved.personId);

            const uploaded = await uploadPersonProfilePhotoDocument({
                personId: resolved.personId,
                file,
                title: `${name} profile photo`,
            });
            if (!uploaded.ok) throw new Error(uploaded.error);

            const result = await onSavePhoto({
                childId: recordId,
                personId: resolved.personId,
                documentId: uploaded.documentId,
            });
            if (!result.ok) throw new Error(result.error || "Could not save profile photo");
            applyPreview(result.photoUrl ?? null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Upload failed");
        } finally {
            setUploading(false);
        }
    };

    const onRemove = async () => {
        if (!recordId) return;
        setUploading(true);
        setError(null);
        try {
            const resolved = await resolvePersonIdForProfilePhoto({
                personId: resolvedPersonId,
                customerMemberId,
            });
            if (!resolved.ok) throw new Error(resolved.error);
            setResolvedPersonId(resolved.personId);

            if (onClearPhoto) {
                const result = await onClearPhoto({ childId: recordId, personId: resolved.personId });
                if (!result.ok) throw new Error(result.error || "Could not remove photo");
                applyPreview(result.photoUrl || null);
            } else {
                const result = await clearPersonProfilePhoto({ personId: resolved.personId });
                if (!result.ok) throw new Error(result.error);
                applyPreview(null);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Remove failed");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div
            className="identity-avatar-editable"
            data-children-avatar="true"
            data-identity-avatar-editable={showUploadControls ? "true" : "false"}
            data-identity-avatar-can-persist={canAttemptUpload ? "true" : "false"}
        >
            <IdentityAvatar
                name={name}
                imageUrl={resolvedUrl}
                size={size}
                visible={visible}
                role={role}
                recordId={recordId}
                allowZoom={!showUploadControls}
            />
            {showUploadControls ? (
                <div className="identity-avatar-editable__actions">
                    <button
                        type="button"
                        className="identity-avatar-editable__btn"
                        data-child-avatar-upload="true"
                        disabled={uploading}
                        onClick={() => {
                            if (!resolvedPersonId && !customerMemberId) {
                                setError("Link a person record before uploading a profile photo.");
                                return;
                            }
                            inputRef.current?.click();
                        }}
                    >
                        {uploading ? "…" : resolvedUrl ? "Change" : "Add photo"}
                    </button>
                    {resolvedUrl && (onClearPhoto || resolvedPersonId || customerMemberId) ? (
                        <button
                            type="button"
                            className="identity-avatar-editable__btn identity-avatar-editable__btn--muted"
                            data-child-avatar-remove="true"
                            disabled={uploading}
                            onClick={() => void onRemove()}
                        >
                            Remove
                        </button>
                    ) : null}
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        data-child-avatar-file-input="true"
                        onChange={(e) => {
                            void onFileChange(e.target.files?.[0]);
                            e.target.value = "";
                        }}
                    />
                </div>
            ) : null}
            {error ? (
                <p className="identity-avatar-editable__error" data-child-avatar-error="true">
                    {error}
                </p>
            ) : null}
        </div>
    );
}

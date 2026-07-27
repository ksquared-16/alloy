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
    uploadPersonProfilePhotoDocument,
} from "@/lib/adminV2/runtime/focusPanel/persistPersonProfilePhoto";

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
    /** When set, operators can upload/replace from the live card (Surfaces Avatar on). */
    onSavePhoto?: IdentityAvatarPhotoSave;
    onClearPhoto?: IdentityAvatarPhotoClear;
    disabled?: boolean;
};

export default function IdentityAvatarEditable({
    name,
    imageUrl,
    size = 30,
    visible = true,
    role,
    recordId,
    personId,
    onSavePhoto,
    onClearPhoto,
    disabled = false,
}: Props) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resolvedUrl, setResolvedUrl] = useState<string | null>(imageUrl ?? null);

    useEffect(() => {
        setResolvedUrl(imageUrl ?? null);
    }, [imageUrl]);

    if (!visible) return null;

    const showUploadControls = Boolean(onSavePhoto && recordId && !disabled);
    const canPersist = Boolean(showUploadControls && personId);

    const onFileChange = async (file: File | undefined) => {
        if (!file || !onSavePhoto || !recordId) return;
        if (!personId) {
            setError("Link a person record before uploading a profile photo.");
            return;
        }
        setUploading(true);
        setError(null);
        try {
            const uploaded = await uploadPersonProfilePhotoDocument({
                personId,
                file,
                title: `${name} profile photo`,
            });
            if (!uploaded.ok) throw new Error(uploaded.error);

            const result = await onSavePhoto({
                childId: recordId,
                personId,
                documentId: uploaded.documentId,
            });
            if (!result.ok) throw new Error(result.error || "Could not save profile photo");
            setResolvedUrl(result.photoUrl ?? null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Upload failed");
        } finally {
            setUploading(false);
        }
    };

    const onRemove = async () => {
        if (!recordId) return;
        if (!personId) {
            setError("Link a person record before removing a profile photo.");
            return;
        }
        setUploading(true);
        setError(null);
        try {
            if (onClearPhoto) {
                const result = await onClearPhoto({ childId: recordId, personId });
                if (!result.ok) throw new Error(result.error || "Could not remove photo");
                setResolvedUrl(result.photoUrl || null);
            } else {
                const result = await clearPersonProfilePhoto({ personId });
                if (!result.ok) throw new Error(result.error);
                setResolvedUrl(null);
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
            data-identity-avatar-can-persist={canPersist ? "true" : "false"}
        >
            <IdentityAvatar
                name={name}
                imageUrl={resolvedUrl}
                size={size}
                visible={visible}
                role={role}
                recordId={recordId}
            />
            {showUploadControls ? (
                <div className="identity-avatar-editable__actions">
                    <button
                        type="button"
                        className="identity-avatar-editable__btn"
                        data-child-avatar-upload="true"
                        disabled={uploading}
                        onClick={() => {
                            if (!personId) {
                                setError("Link a person record before uploading a profile photo.");
                                return;
                            }
                            inputRef.current?.click();
                        }}
                    >
                        {uploading ? "…" : resolvedUrl ? "Change" : "Add photo"}
                    </button>
                    {resolvedUrl && (onClearPhoto || personId) ? (
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

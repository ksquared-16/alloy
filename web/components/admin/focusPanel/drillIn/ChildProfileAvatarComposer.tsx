"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { ImagePlus } from "lucide-react";

import CardAvatar from "@/components/admin/focusPanel/CardAvatar";
import {
    groupShowAvatarForNestedGroup,
    setGroupShowAvatarInNestedGroup,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";

type Props = {
    surfaceId: string;
    groupKey: string;
    childId: string;
    childName: string;
    imageUrl: string | null;
    personId: string | null;
    size?: number;
};

/**
 * Child identity avatar — runtime display + composer presentation controls.
 *
 * Upload uses the existing documents upload API (`entity_type=person`). Canonical
 * photo persistence on `persons` / inquiry-child rows is not wired yet — composer
 * preview URLs are held in session until a profile-photo metadata path lands.
 */
export default function ChildProfileAvatarComposer({
    surfaceId,
    groupKey,
    childId,
    childName,
    imageUrl,
    personId,
    size = 40,
}: Props) {
    const composer = useFocusPanelComposer();
    const composing = composer?.isComposingSurface(surfaceId) ?? false;
    const config = composer?.configFor(surfaceId);
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    const previewUrl = composer?.childAvatarPreviewUrl(childId) ?? imageUrl;
    const showAvatar = config ? groupShowAvatarForNestedGroup(config, groupKey) : true;

    if (!showAvatar) return null;

    const mutate = (next: NestedSurfaceConfig) => composer?.updateConfig(surfaceId, next);

    const onFileChange = async (file: File | undefined) => {
        if (!file || !composer || !personId) {
            setUploadError(personId ? null : "Link a person record before uploading a profile photo.");
            return;
        }
        setUploading(true);
        setUploadError(null);
        try {
            const body = new FormData();
            body.append("file", file);
            body.append("entity_type", "person");
            body.append("entity_id", personId);
            body.append("doc_type", "profile_photo");
            body.append("title", `${childName} profile photo`);

            const uploadRes = await fetch("/api/admin/documents/upload", { method: "POST", body });
            if (!uploadRes.ok) {
                throw new Error("Upload failed");
            }
            const payload = (await uploadRes.json()) as { document?: { id?: string } };
            const docId = payload.document?.id;
            if (!docId) {
                throw new Error("Upload response missing document id");
            }
            const signedRes = await fetch(`/api/admin/documents/${docId}/signed-url`);
            if (!signedRes.ok) {
                throw new Error("Could not resolve uploaded image URL");
            }
            const signed = (await signedRes.json()) as { url?: string };
            if (!signed.url) {
                throw new Error("Signed URL missing");
            }
            composer.setChildAvatarPreviewUrl(childId, signed.url);
        } catch {
            setUploadError("Profile photo uploaded to documents; runtime photo field persistence is pending.");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="fp-child-avatar" data-child-avatar-composer={childId}>
            <CardAvatar name={childName} imageUrl={previewUrl} size={size} />
            {composing && config ? (
                <div className="fp-child-avatar__controls">
                    <button
                        type="button"
                        className={clsx("fp-layout-field__toggle", showAvatar && "is-on")}
                        aria-pressed={showAvatar}
                        onClick={() => mutate(setGroupShowAvatarInNestedGroup(config, groupKey, !showAvatar))}
                    >
                        Avatar
                    </button>
                    <button
                        type="button"
                        className="fp-child-avatar__upload"
                        disabled={uploading}
                        onClick={() => inputRef.current?.click()}
                    >
                        <ImagePlus className="h-3 w-3" aria-hidden />
                        {uploading ? "Uploading…" : "Set image"}
                    </button>
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => {
                            void onFileChange(e.target.files?.[0]);
                            e.target.value = "";
                        }}
                    />
                    {uploadError ? (
                        <p className="fp-child-avatar__hint">{uploadError}</p>
                    ) : (
                        <p className="fp-child-avatar__hint">
                            Uses document upload; person photo field persistence pending.
                        </p>
                    )}
                </div>
            ) : null}
        </div>
    );
}

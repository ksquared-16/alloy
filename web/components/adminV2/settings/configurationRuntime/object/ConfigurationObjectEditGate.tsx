"use client";

import type { ReactNode } from "react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import type { ConfigurationObjectEditSession } from "@/lib/configRuntime/configurationObject/types";

/**
 * Intentional editing gate — read mode is default; Edit is explicit.
 */
export function ConfigurationObjectEditGate({
    session,
    readContent,
    editContent,
    onBeginEdit,
    onCancel,
    onSave,
    editLabel = "Edit",
    saveLabel = "Save",
    cancelLabel = "Cancel",
    testId = "configuration-object-edit-gate",
}: {
    session: ConfigurationObjectEditSession<unknown>;
    readContent: ReactNode;
    editContent: ReactNode;
    onBeginEdit: () => void;
    onCancel: () => void;
    onSave: () => void;
    editLabel?: string;
    saveLabel?: string;
    cancelLabel?: string;
    testId?: string;
}) {
    const editing = session.mode === "edit";

    return (
        <div
            className="space-y-3"
            data-testid={testId}
            data-edit-mode={session.mode}
            data-dirty={session.dirty ? "true" : "false"}
        >
            <div className="flex flex-wrap items-center justify-end gap-2">
                {!editing ?
                    <ConfigurationSecondaryButton onClick={onBeginEdit} data-testid={`${testId}-edit`}>
                        {editLabel}
                    </ConfigurationSecondaryButton>
                :   <>
                        <ConfigurationSecondaryButton
                            onClick={onCancel}
                            disabled={session.saving}
                            data-testid={`${testId}-cancel`}
                        >
                            {cancelLabel}
                        </ConfigurationSecondaryButton>
                        <ConfigurationPrimaryButton
                            onClick={onSave}
                            disabled={session.saving || !session.dirty}
                            data-testid={`${testId}-save`}
                        >
                            {session.saving ? "Saving…" : saveLabel}
                        </ConfigurationPrimaryButton>
                    </>
                }
            </div>
            {session.saveError ?
                <p
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                    role="alert"
                    data-testid={`${testId}-save-error`}
                >
                    {session.saveError}
                </p>
            :   null}
            {session.validationErrors.length > 0 ?
                <ul className="space-y-1" data-testid={`${testId}-validation`}>
                    {session.validationErrors.map((error) => (
                        <li key={`${error.field}:${error.message}`} className="text-xs text-red-800">
                            <span className="font-semibold">{error.field}</span>: {error.message}
                        </li>
                    ))}
                </ul>
            :   null}
            <div data-testid={editing ? `${testId}-edit-surface` : `${testId}-read-surface`}>
                {editing ? editContent : readContent}
            </div>
        </div>
    );
}

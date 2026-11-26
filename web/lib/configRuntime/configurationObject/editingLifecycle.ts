/**
 * Configuration Object intentional editing lifecycle (Checkpoint C.5).
 *
 * Read mode is default. Edit is explicit. Domains own draft shape and mutation.
 */

import type {
    ConfigurationObjectEditMode,
    ConfigurationObjectEditSession,
} from "@/lib/configRuntime/configurationObject/types";

export function createConfigurationObjectEditSession<TDraft>(
    draft: TDraft | null = null,
): ConfigurationObjectEditSession<TDraft> {
    return {
        mode: "read",
        draft,
        dirty: false,
        saving: false,
        validationErrors: [],
        saveError: null,
    };
}

export function beginConfigurationObjectEdit<TDraft>(
    session: ConfigurationObjectEditSession<TDraft>,
    draft: TDraft,
): ConfigurationObjectEditSession<TDraft> {
    return {
        ...session,
        mode: "edit",
        draft,
        dirty: false,
        saving: false,
        validationErrors: [],
        saveError: null,
    };
}

export function patchConfigurationObjectDraft<TDraft>(
    session: ConfigurationObjectEditSession<TDraft>,
    draft: TDraft,
): ConfigurationObjectEditSession<TDraft> {
    if (session.mode !== "edit") return session;
    return {
        ...session,
        draft,
        dirty: true,
        saveError: null,
    };
}

export function cancelConfigurationObjectEdit<TDraft>(
    session: ConfigurationObjectEditSession<TDraft>,
): ConfigurationObjectEditSession<TDraft> {
    return {
        ...session,
        mode: "read",
        draft: null,
        dirty: false,
        saving: false,
        validationErrors: [],
        saveError: null,
    };
}

export function markConfigurationObjectSaving<TDraft>(
    session: ConfigurationObjectEditSession<TDraft>,
    saving: boolean,
): ConfigurationObjectEditSession<TDraft> {
    return { ...session, saving };
}

export function failConfigurationObjectSave<TDraft>(
    session: ConfigurationObjectEditSession<TDraft>,
    error: string,
    validationErrors: ReadonlyArray<{ field: string; message: string }> = [],
): ConfigurationObjectEditSession<TDraft> {
    return {
        ...session,
        saving: false,
        saveError: error,
        validationErrors,
        // Retain draft + dirty so the operator does not lose input.
        dirty: true,
        mode: "edit",
    };
}

export function completeConfigurationObjectSave<TDraft>(
    session: ConfigurationObjectEditSession<TDraft>,
): ConfigurationObjectEditSession<TDraft> {
    return {
        ...session,
        mode: "read",
        draft: null,
        dirty: false,
        saving: false,
        validationErrors: [],
        saveError: null,
    };
}

/**
 * Block navigation away from dirty edit sessions.
 * Callers use the boolean to confirm or stay.
 */
export function configurationObjectEditBlocksNavigation(
    session: ConfigurationObjectEditSession<unknown>,
): boolean {
    return session.mode === "edit" && session.dirty && !session.saving;
}

export function isConfigurationObjectEditMode(mode: ConfigurationObjectEditMode): boolean {
    return mode === "edit";
}

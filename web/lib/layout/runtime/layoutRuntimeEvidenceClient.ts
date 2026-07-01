/** Client gate for staging layout runtime evidence console dumps. */

import { isLayoutRuntimeHardCutoverActiveClient } from "../featureFlag";

export function shouldLogLayoutRuntimeEvidence(): boolean {
    return (
        isLayoutRuntimeHardCutoverActiveClient() ||
        process.env.NEXT_PUBLIC_APP_ENV === "staging" ||
        process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_STAGING_DEBUG === "1"
    );
}

export function shouldShowLayoutRuntimeEvidencePanel(): boolean {
    return shouldLogLayoutRuntimeEvidence();
}

/**
 * Diagnostics carried by configuration draft transforms.
 *
 * Warnings and errors are the same shape deliberately: decision D3 says severity is a property of
 * *when* a defect is reported (draft vs publish) and *whether the current edit touched it*, not of
 * the defect itself. The same finding is a warning on an unrelated stage and a blocking error on
 * the stage being saved, so it must be representable without re-encoding.
 */

export type ConfigurationDiagnostic = {
    /** Stable machine code — surfaces key their copy off this, never off `message`. */
    code: string;
    /** Operator-facing sentence. */
    message: string;
    /** Configuration path the finding is about, when it has one. */
    path?: string;
    stage_key?: string;
    detail?: Record<string, unknown>;
};

export type ConfigurationWarning = ConfigurationDiagnostic;
export type ConfigurationError = ConfigurationDiagnostic;

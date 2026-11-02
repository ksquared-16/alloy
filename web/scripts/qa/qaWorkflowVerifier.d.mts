/**
 * TYPES ONLY for `qaWorkflowVerifier.mjs`. TypeScript resolves this companion ahead of the JavaScript, so a TS
 * caller sees the discriminated results the module actually returns (under `allowJs` the `ok` literals widened to
 * `boolean` and nothing narrowed). Node, tsx and vitest still load the `.mjs`; nothing here runs.
 *
 * Each arm of a result also names the other arm's fields as absent, so a caller that reads `binding` (or `code`)
 * without narrowing first gets `undefined`, exactly as at runtime.
 */

export declare const WORKFLOW_VERIFICATION_SCHEMA: "alloy.qa_workflow_verification.v1";
export declare const PREVIEW_PORT_MIN: 4410;
export declare const PREVIEW_PORT_MAX: 4419;
export declare const ALLOWED_METHODS: readonly ["GET", "HEAD"];

export declare const WORKFLOW_REFUSALS: Readonly<{
    BINDING_ABSENT: "workflow_binding_absent";
    PREVIEW_ORIGIN: "workflow_preview_origin_refused";
    SESSION_ORIGIN: "workflow_session_origin_refused";
    SESSION_FILE: "workflow_session_file_unbound";
    SESSION_DIGEST: "workflow_session_digest_mismatch";
    IDENTITY: "workflow_identity_unbound";
    CANDIDATE: "workflow_candidate_mismatch";
    ENVIRONMENT: "workflow_environment_mismatch";
    RUN: "workflow_run_mismatch";
    ORG: "workflow_org_mismatch";
    API: "workflow_api_mismatch";
    EXPIRED: "workflow_binding_expired";
    ADAPTER: "workflow_adapter_invalid";
    ROUTE: "workflow_route_unapproved";
    ATTEST: "workflow_attestation_refused";
}>;

export declare const WORKFLOW_FAILURES: Readonly<{
    SIGNED_OUT: "workflow_session_not_signed_in";
    WRONG_IDENTITY: "workflow_wrong_identity";
    REDIRECTED: "workflow_route_redirected";
    MUTATION: "workflow_hidden_mutation_attempted";
    OUTBOUND: "workflow_outbound_request_attempted";
    DRIVER: "workflow_driver_failed";
    ASSERTION: "workflow_assertion_failed";
}>;

export type WorkflowRefusalCode = (typeof WORKFLOW_REFUSALS)[keyof typeof WORKFLOW_REFUSALS];
export type WorkflowFailureCode = (typeof WORKFLOW_FAILURES)[keyof typeof WORKFLOW_FAILURES];

/** `refuse(code, detail)`. */
export type WorkflowRefusal = { ok: false; code: WorkflowRefusalCode; detail: string; binding?: undefined };

export type WorkflowAuthority = {
    candidate_sha: string;
    environment_id: string;
    qa_run_id: string;
    org_id: string;
    api_url: string;
    expires_at: string;
};

export type WorkflowBinding = Readonly<{
    previewOrigin: string;
    sessionOrigin: string;
    sessionFile: string;
    expectedIdentity: string;
    candidate: string;
    environmentId: string;
    qaRunId: string;
    persona: string;
    orgId: string;
    allowedOrigins: readonly string[];
    expiresAtMs: number;
}>;

export type WorkflowBindingResult = { ok: true; binding: WorkflowBinding; code?: undefined; detail?: undefined } | WorkflowRefusal;

export declare function readWorkflowBinding(
    env: Record<string, string | undefined>,
    authority: WorkflowAuthority,
    opts?: { nowMs?: number; readFile?: (p: string) => Buffer | string },
): WorkflowBindingResult;

export type WorkflowRequestVerdict = { ok: true; failure?: undefined } | { ok: false; failure: WorkflowFailureCode };

export declare function judgeRequest(binding: WorkflowBinding, method: unknown, url: unknown): WorkflowRequestVerdict;

export type ForeignOriginClass =
    | "unparseable"
    | "non_http_scheme"
    | "loopback_other_port"
    | "session_host_other_port"
    | "tailnet_other_host"
    | "private_network"
    | "third_party";

export declare function foreignOriginOf(binding: WorkflowBinding, url: unknown): { origin: string; class: ForeignOriginClass };

export type WorkflowCheck = { ok: boolean; check: string };

export type WorkflowCaptureSpec = {
    readonly name: string;
    readonly selector: string;
    readonly attrs?: readonly string[];
    readonly parts?: Readonly<Record<string, { readonly selector: string; readonly attr?: string }>>;
};

/** One captured element: the spec's attributes, its trimmed text and its named parts. */
export type WorkflowCapture = { attrs: Record<string, string | null>; text: string; parts: Record<string, string | null> };

export type WorkflowAdapter = {
    readonly key: string;
    readonly routes: readonly { readonly id: string; readonly path: string }[];
    readonly capture: readonly WorkflowCaptureSpec[];
    readonly reveal?: readonly string[];
    assert(routeId: string, snapshot: Record<string, unknown>, context: Record<string, unknown>): readonly WorkflowCheck[];
};

export declare function validateAdapter(adapter: unknown): { ok: true; code?: undefined; detail?: undefined } | WorkflowRefusal;

/** What the verifier hands `driver.open`: the bound session, the adapter's reveal/capture and its own judge. */
export type WorkflowPolicy = Readonly<{
    baseOrigin: string;
    storageStatePath: string;
    allowedOrigins: readonly string[];
    allowedMethods: readonly string[];
    reveal: readonly string[];
    capture: readonly WorkflowCaptureSpec[];
    judge: (method: string, url: string) => WorkflowRequestVerdict;
}>;

/** What a driver reports for one visit; every field is re-judged, so none is trusted to be present. */
export type WorkflowPage = {
    finalUrl?: unknown;
    identity?: string | null;
    requests?: readonly { method?: string; url?: string; blocked?: boolean }[] | null;
    snapshot?: unknown;
};

export type WorkflowSession = {
    visit(path: string): Promise<WorkflowPage>;
    close?(): unknown;
};

export type WorkflowDriver = {
    open(policy: WorkflowPolicy): WorkflowSession | Promise<WorkflowSession>;
};

export type WorkflowAttestation = { readonly ok?: unknown } | null | undefined;

export type WorkflowVerificationResult = {
    schema: typeof WORKFLOW_VERIFICATION_SCHEMA;
    adapter: string | null;
    ok: boolean;
    refusal?: WorkflowRefusalCode;
    failures: string[];
    checks: WorkflowCheck[];
};

export declare function runWorkflowVerification(args: {
    adapter: WorkflowAdapter;
    binding: WorkflowBinding;
    driver: WorkflowDriver;
    attest?: () => WorkflowAttestation | Promise<WorkflowAttestation>;
    context?: Record<string, unknown>;
    nowMs?: () => number;
}): Promise<WorkflowVerificationResult>;

export declare function workflowVerificationLines(result: WorkflowVerificationResult): string[];

export type ConfigurationRuntimeIssueCode =
    | "not_initialized"
    | "migration_required"
    | "access_denied"
    | "unavailable"
    | "action_failed";

export type ConfigurationRuntimeIssue = {
    code: ConfigurationRuntimeIssueCode;
    title: string;
    message: string;
    nextStep: string;
    reference?: string;
};

export type ClassifiedConfigurationRuntimeIssue = {
    issue: ConfigurationRuntimeIssue;
    status: number;
    technical: string;
};

export class ConfigurationRuntimeIssueError extends Error {
    readonly issue: ConfigurationRuntimeIssue;

    constructor(issue: ConfigurationRuntimeIssue) {
        super(issue.message);
        this.name = "ConfigurationRuntimeIssueError";
        this.issue = issue;
    }
}

function technicalMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && "message" in error) {
        return String((error as { message?: unknown }).message ?? "");
    }
    return "Unknown Configuration Runtime error";
}

function reference(): string {
    const uuid = globalThis.crypto?.randomUUID?.();
    return `cfg-${uuid ? uuid.slice(0, 8) : Date.now().toString(36)}`;
}

export function classifyConfigurationRuntimeIssue(
    error: unknown,
    options: {
        domainLabel?: string;
        fallbackMessage?: string;
        fallbackStatus?: number;
    } = {},
): ClassifiedConfigurationRuntimeIssue {
    const domainLabel = options.domainLabel?.trim() || "Configuration";
    const technical = technicalMessage(error);
    const diagnosticReference = reference();

    if (/PGRST205|42P01|could not find the table|relation .+ does not exist/i.test(technical)) {
        return {
            issue: {
                code: "not_initialized",
                title: `${domainLabel} setup is not complete`,
                message: `This Configuration area has not been initialized in this environment.`,
                nextStep: "An administrator needs to complete platform setup before this configuration can be used.",
                reference: diagnosticReference,
            },
            status: 503,
            technical,
        };
    }
    if (/PGRST202|PGRST204|42883|could not find the .+ column|function .+ does not exist|migration/i.test(technical)) {
        return {
            issue: {
                code: "migration_required",
                title: `${domainLabel} needs a platform update`,
                message: "This Configuration area is available, but its required platform update has not completed.",
                nextStep: "An administrator should complete the pending update, then try again.",
                reference: diagnosticReference,
            },
            status: 503,
            technical,
        };
    }
    if (/42501|permission denied|forbidden|not authorized|access denied/i.test(technical)) {
        return {
            issue: {
                code: "access_denied",
                title: `${domainLabel} is not available to your role`,
                message: "Your current access does not include this Configuration area.",
                nextStep: "Ask an Organization administrator for Configuration access if you need it.",
                reference: diagnosticReference,
            },
            status: 403,
            technical,
        };
    }
    if (/PGRST00[0-3]|failed to fetch|connection|timed out|timeout|network/i.test(technical)) {
        return {
            issue: {
                code: "unavailable",
                title: `${domainLabel} is temporarily unavailable`,
                message: "The Configuration service could not be reached.",
                nextStep: "Wait a moment and try again. If the problem continues, share the reference below with engineering.",
                reference: diagnosticReference,
            },
            status: 503,
            technical,
        };
    }
    return {
        issue: {
            code: "action_failed",
            title: "The Configuration action could not be completed",
            message: options.fallbackMessage?.trim() || "Your changes were not applied.",
            nextStep: "Review the requested change and try again.",
            reference: diagnosticReference,
        },
        status: options.fallbackStatus ?? 400,
        technical,
    };
}

export function readConfigurationRuntimeIssue(
    value: unknown,
    domainLabel = "Configuration",
): ConfigurationRuntimeIssue {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        const candidate = value as Partial<ConfigurationRuntimeIssue>;
        if (
            typeof candidate.code === "string"
            && typeof candidate.title === "string"
            && typeof candidate.message === "string"
            && typeof candidate.nextStep === "string"
        ) {
            return candidate as ConfigurationRuntimeIssue;
        }
    }
    return classifyConfigurationRuntimeIssue(value, { domainLabel }).issue;
}

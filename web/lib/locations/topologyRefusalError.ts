/**
 * An error that carries the server's NAMED topology refusal code alongside its
 * sentence, so a form can explain the refusal without reading the sentence.
 */
export class TopologyRefusalError extends Error {
    readonly code: string | null;

    constructor(message: string, code: string | null) {
        super(message);
        this.name = "TopologyRefusalError";
        this.code = code;
    }
}

/** The refusal code on an unknown thrown value, when there is one. */
export function topologyRefusalCodeOf(cause: unknown): string | null {
    return cause instanceof TopologyRefusalError ? cause.code : null;
}

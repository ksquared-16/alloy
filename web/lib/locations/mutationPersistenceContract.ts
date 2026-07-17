function valuesMatch(actual: unknown, expected: unknown): boolean {
    if (Array.isArray(expected)) {
        return (
            Array.isArray(actual) &&
            actual.length === expected.length &&
            expected.every((value, index) => valuesMatch(actual[index], value))
        );
    }
    if (expected != null && typeof expected === "object") {
        if (actual == null || typeof actual !== "object" || Array.isArray(actual)) return false;
        return Object.entries(expected as Record<string, unknown>).every(([key, value]) =>
            valuesMatch((actual as Record<string, unknown>)[key], value),
        );
    }
    return Object.is(actual, expected);
}

/**
 * A successful mutation response must echo every requested field from the
 * authoritative row. Closing an editor on HTTP 200 alone is not sufficient.
 */
export function mutationResponseContainsPatch(
    response: Record<string, unknown>,
    patch: Record<string, unknown>,
): boolean {
    return Object.entries(patch).every(([key, expected]) => valuesMatch(response[key], expected));
}

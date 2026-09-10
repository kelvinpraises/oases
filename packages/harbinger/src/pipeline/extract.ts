export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}

/**
 * Resolves a dot-notated path (e.g. "data.account.totalCollateralUSD" or "pools[0].reserve")
 * on an arbitrary JSON / GraphQL response object.
 */
export function resolveJsonPath(data: unknown, path: string): unknown {
  if (data === null || data === undefined) {
    throw new ExtractionError(`Cannot extract path '${path}' from null or undefined object.`);
  }

  // Normalize array brackets: "pools[0].id" -> "pools.0.id"
  const normalizedPath = path.replace(/\[(\w+)\]/g, ".$1");
  const segments = normalizedPath.split(".").filter(Boolean);

  let current: unknown = data;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (current === null || current === undefined || typeof current !== "object") {
      throw new ExtractionError(
        `Failed to resolve path '${path}': segment '${segment}' is missing on non-object value at depth ${i}.`
      );
    }

    const obj = current as Record<string, unknown>;
    if (!(segment in obj)) {
      throw new ExtractionError(
        `Failed to resolve path '${path}': property '${segment}' does not exist on response.`
      );
    }

    current = obj[segment];
  }

  if (current === undefined) {
    throw new ExtractionError(`Resolved path '${path}' resulted in undefined value.`);
  }

  return current;
}

/**
 * Extracts a map of named signals from a raw GraphQL response using a dictionary of paths.
 * Fails fast if any path cannot be resolved.
 */
export function extractSignals(
  data: Record<string, unknown>,
  mappings: Record<string, string>
): Record<string, unknown> {
  const extracted: Record<string, unknown> = {};

  for (const [signalName, jsonPath] of Object.entries(mappings)) {
    extracted[signalName] = resolveJsonPath(data, jsonPath);
  }

  return extracted;
}

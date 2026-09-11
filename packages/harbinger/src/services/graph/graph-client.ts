import { freshnessService } from "./freshness-service";
import {
  GraphQueryError,
  type GraphQueryOptions,
  type GraphResponse,
} from "./types";

export class GraphClient {
  constructor(private defaultSubgraphUrl: string) {}

  /**
   * Executes a stateless Time-Travel GraphQL query explicitly pinned to targetBlock.
   * Automatically includes _meta { block { number } } and validates indexer freshness.
   */
  public async queryBlock<T = unknown>(
    queryBody: string,
    targetBlock: number,
    options: GraphQueryOptions & { subgraphUrl?: string } = {},
  ): Promise<{ data: T; indexerBlock: number }> {
    const subgraphUrl = options.subgraphUrl || this.defaultSubgraphUrl;
    const timeoutMs = options.timeoutMs ?? 10_000;
    const maxRetries = options.retries ?? 3;

    // Wrap query with explicit block pinning and mandatory _meta inclusion (Dual Injection)
    const wrappedQuery = this.formatTimeTravelQuery(queryBody, targetBlock);

    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(subgraphUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...options.headers,
          },
          body: JSON.stringify({ query: wrappedQuery }),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
          throw new Error(
            `HTTP error from Subgraph: ${response.status} ${response.statusText}`,
          );
        }

        const json = (await response.json()) as GraphResponse<T>;

        if (json.errors && json.errors.length > 0) {
          throw new GraphQueryError(json.errors, subgraphUrl);
        }

        if (!json.data) {
          throw new Error(`Empty data returned from Subgraph ${subgraphUrl}`);
        }

        // Validate indexer freshness against targetBlock
        freshnessService.assertFreshness(json._meta, targetBlock, subgraphUrl);

        return {
          data: json.data,
          indexerBlock: json._meta!.block.number,
        };
      } catch (err: unknown) {
        if (err instanceof GraphQueryError) {
          throw err;
        }
        attempt++;
        if (attempt > maxRetries) {
          throw err;
        }
        const delay = freshnessService.calculateBackoffMs(attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error(`Failed to query Subgraph after ${maxRetries} retries`);
  }

  /**
   * Dual Injection:
   * 1. Injects `_meta { block { number hash timestamp } }` at the root query level.
   * 2. Injects `block: { number: B }` into entity selections if not already present.
   */
  public formatTimeTravelQuery(
    queryBody: string,
    targetBlock: number,
  ): string {
    const metaSelection = `_meta { block { number hash timestamp } }`;
    let cleanBody = queryBody.trim();

    // 1. Inject block: { number: targetBlock } into entity selectors if missing
    cleanBody = this.injectEntityBlockPin(cleanBody, targetBlock);

    // 2. Inject _meta into root document
    if (cleanBody.includes("_meta")) {
      // _meta already present
      if (cleanBody.startsWith("query")) {
        return cleanBody;
      }
      return `query TimeTravelBlock_${targetBlock} {\n  ${cleanBody}\n}`;
    }

    if (cleanBody.startsWith("query")) {
      return cleanBody.replace(
        /query[^{]*\{/,
        (match) => `${match}\n  ${metaSelection}\n`,
      );
    }

    return `query TimeTravelBlock_${targetBlock} {\n  ${metaSelection}\n  ${cleanBody}\n}`;
  }

  /**
   * Helper to ensure top-level entity selectors pin the block height.
   */
  private injectEntityBlockPin(body: string, targetBlock: number): string {
    // If query already pins block anywhere, keep as is
    if (/block\s*:\s*\{[^}]*number/i.test(body)) {
      return body;
    }

    // Match entity with existing arguments: e.g. account(id: "0x...") or v1: account(id: "0x...")
    const withArgsRegex = /((?:[\w-]+:\s*)?[a-zA-Z_]\w*)\s*\(([^)]*)\)/g;
    const replaced = body.replace(withArgsRegex, (match, entityPrefix, args) => {
      if (match.includes("block:")) return match;
      const cleanArgs = args.trim();
      const newArgs = cleanArgs.length > 0
        ? `${cleanArgs}, block: { number: ${targetBlock} }`
        : `block: { number: ${targetBlock} }`;
      return `${entityPrefix}(${newArgs})`;
    });

    return replaced;
  }

  /**
   * Coalesces multiple child vault queries into a single GraphQL document using field aliases.
   */
  public coalesceClusterQuery(
    vaultQueries: Array<{ alias: string; entityQuery: string }>,
  ): string {
    return vaultQueries
      .map(({ alias, entityQuery }) => `${alias}: ${entityQuery}`)
      .join("\n  ");
  }
}

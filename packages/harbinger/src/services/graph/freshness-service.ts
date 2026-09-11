import { IndexerLagError, type GraphMetaBlock } from "./types";

export class FreshnessService {
  /**
   * Asserts that the indexer has synced up to or past the target block height.
   * Throws IndexerLagError if the indexer is behind.
   */
  public assertFreshness(
    meta: { block: GraphMetaBlock } | undefined,
    targetBlock: number,
    subgraphUrl: string,
  ): void {
    if (!meta || !meta.block || typeof meta.block.number !== "number") {
      throw new Error(
        `Missing _meta.block in GraphQL response from ${subgraphUrl}`,
      );
    }

    if (meta.block.number < targetBlock) {
      throw new IndexerLagError(targetBlock, meta.block.number, subgraphUrl);
    }
  }

  /**
   * Calculates backoff delay with exponential jitter for lagged indexers.
   */
  public calculateBackoffMs(
    attempt: number,
    baseMs = 500,
    maxMs = 5000,
  ): number {
    const exp = Math.min(maxMs, baseMs * Math.pow(2, attempt));
    const jitter = Math.random() * 200;
    return exp + jitter;
  }
}

export const freshnessService = new FreshnessService();

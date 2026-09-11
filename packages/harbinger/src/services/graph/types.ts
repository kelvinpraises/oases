export interface GraphMetaBlock {
  number: number;
  hash?: string;
  timestamp?: number;
}

export interface GraphResponse<T = unknown> {
  data?: T;
  _meta?: {
    block: GraphMetaBlock;
    deployment?: string;
    hasIndexingErrors?: boolean;
  };
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
  }>;
}

export interface GraphQueryOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
}

export class IndexerLagError extends Error {
  constructor(
    public readonly targetBlock: number,
    public readonly indexerBlock: number,
    public readonly subgraphUrl: string,
  ) {
    super(
      `Indexer lag detected on ${subgraphUrl}: indexer block ${indexerBlock} is behind target block ${targetBlock}`,
    );
    this.name = "IndexerLagError";
  }
}

export class GraphQueryError extends Error {
  constructor(
    public readonly errors: Array<{ message: string }>,
    public readonly subgraphUrl: string,
  ) {
    super(
      `GraphQL query failed on ${subgraphUrl}: ${errors.map((e) => e.message).join("; ")}`,
    );
    this.name = "GraphQueryError";
  }
}

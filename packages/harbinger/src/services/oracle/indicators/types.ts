export type PureToolFn = (
  inputs: Record<string, unknown>,
  params?: Record<string, unknown>
) => unknown;

export interface RegisteredTool {
  id: string;
  name: string;
  codeString: string;
  hash: string; // SHA-256 hash of codeString.trim()
  fn: PureToolFn;
}

export interface ToolContext {
  signals: Record<string, string | number | boolean>;
}

export interface ToolDefinition {
  id: string;
  hash?: string;
  execute(
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<string | number | boolean> | string | number | boolean;
}

export interface DataEvent<T = unknown> {
    id: string;
    source: string;
    timestamp: number;
    payload: T;
}
export interface TensionSignal {
    tensionId: string;
    targetAddress: string;
    locationAddress: string;
    intensityScore: number;
    targetEvent: string;
    metadata: Record<string, unknown>;
}
export interface ISovereignAgent {
    readonly id: string;
    readonly name: string;
    start(): Promise<void>;
    stop(): Promise<void>;
}
//# sourceMappingURL=types.d.ts.map
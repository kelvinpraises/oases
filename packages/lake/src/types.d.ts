export interface X402Challenge {
    status: 402;
    message: string;
    paymentAddress: string;
    network: string;
    amount: string;
    token: string;
    scheme: "bearer" | "eip712";
}
export interface StreamEvent<T = unknown> {
    id: string;
    topic: string;
    timestamp: number;
    data: T;
}
export interface LakeServerConfig {
    port: number;
    paymentAddress: string;
    pricePerQuery: string;
    token: string;
    network: string;
}
//# sourceMappingURL=types.d.ts.map
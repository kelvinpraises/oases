export declare enum ConvictionSide {
    YES = 0,
    NO = 1
}
export interface TensionDescriptor {
    id: string;
    characterAddress: string;
    locationAddress: string;
    targetEvent: string;
    deadlineBlock: bigint;
    description: string;
}
export interface ConvictionQuote {
    side: ConvictionSide;
    depositAmount: bigint;
    estimatedShares: bigint;
    effectivePricePerShare: bigint;
    feeShare: bigint;
}
export interface VaultState {
    address: string;
    tension: TensionDescriptor;
    yesPool: bigint;
    noPool: bigint;
    yesShares: bigint;
    noShares: bigint;
    isResolved: boolean;
    winningSide?: ConvictionSide;
}
//# sourceMappingURL=types.d.ts.map
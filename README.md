# Oases

A living state engine and conviction market built on The Graph and Hedera.

Oases transforms on-chain relational data into observable entities, spawns event-driven conviction markets, and monetizes real-time intelligence through x402 micropayments.

## Architecture

```
oases/
├── app/                  # Web terminal (TanStack Start, Vite, Tailwind CSS)
├── cli/                  # Orchestration CLI for agents and operators
└── packages/
    ├── contracts/        # Hedera EVM smart contracts (Foundry)
    ├── harbinger/        # Sovereign data-gathering agent framework
    ├── lake/             # Real-time x402 data stream gateway
    └── options/          # Conviction pricing engine and lnWad bonding curve
```

## Primitives

* **Corpus as State**: Ingests event-sourced entities from The Graph's standardized subgraphs.
* **Conviction Vaults**: Hedera smart contracts where each vault maps to a state tension. Pricing uses logarithmic (`lnWad`) curves to incentivize early conviction.
* **x402 Alpha Streams**: HTTP 402 pay-per-query endpoints that stream live state deltas to external AI agents. Query fees route directly into conviction pools.

## Getting Started

### Prerequisites

* Node.js >= 20
* Foundry (`forge`)

### Installation

```bash
npm install
npm run build
```

### Development

```bash
# Start web interface
npm run dev

# Run CLI
npm run cli -- status

# Run smart contract tests
npm run test --workspace=@oases/contracts
```

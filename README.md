# Snowflake Safe SDK

Snowflake Safe SDK provides an easy way to interact with the Snowflake Safe app and onchain programs

## Installation

Install with npm

```bash
npm i @snowflake-so/safe-sdk
```

Install with yarn

```bash
yarn add @snowflake-so/safe-sdk
```

## Quick start guide

### Initialize Snowflake

To create a new Snowflake service, we would need to initialize with the Provider.

```typescript
// if your Anchor version is older than 0.24.2,
// please use Snowflake SDK version 1.0.11 and initialize the provider as below
let provider: Provider = Provider.local(API_URL);

// if your Anchor version is 0.24.2 or later,
// please use the latest version of Snowflake SDK and initialize the provider as below
let provider: Provider = AnchorProvider.local(API_URL);
```

The `API_URL` is the endpoint to the Solana cluster. Empty API_URL is pointed to the `local testnet`

- Mainnet Beta: `https://api.mainnet-beta.solana.com`
- Testnet: `https://api.testnet.solana.com`
- Devnet: `https://api.devnet.solana.com`

```typescript
let snowflakeSafe: SnowflakeSafe = new SnowflakeSafe(provider);
```

---

### Fetch safe

Fetch safe onchain information by safe address

```typescript
await snowflakeSafe.fetchSafe(safeAddress);
```

### Fetch proposals of safe

Fetch all onchain proposals of the safe

```typescript
await snowflakeSafe.fetchAllProposals(safeAddress);
```

### Fetch proposal

Fetch onchain proposal information

```typescript
await snowflakeSafe.fetchProposal(proposalAddress);
```

### Fetch owned safes

Fetch all safes that the provided wallet owned

```typescript
await snowflakeSafe.fetchOwnedSafes(ownerAddress);
```

---

### Create a new safe

Create a new safe with one owner and approvals required as one

```typescript
const input = {
  approvalsRequired: 1,
  owners: [owner],
};
const [newSafeAddress, txId] = await snowflakeSafe.createSafe(
  input.owners,
  input.approvalsRequired
);
```

### Create a new proposal

Create a new proposal that can be executed by any safe owners

```typescript
const response = await snowflakeSafe.createProposal(safeAddress, 'hello world', instructions);
```

### Create a new recurring proposal

Create a new recurring proposal that can be executed automatically by Snowflake node operators

```typescript
const proposal = new MultisigJobBuilder()
  .jobName('hello world')
  .jobInstructions(instructions)
  .scheduleCron('0 0 * * *')
  .build();

const [newProposalAddress, txId] = await snowflakeSafe.createRecurringProposal(
  safeAddress,
  proposal
);
```

### Create a proposal with large payload

In production, there is proposal created with multiple actions which has bunches of accounts. This method is used to solve the issue

```typescript
const [newProposalAddress] = await snowflakeSafe.createProposal(
  safeAddress,
  'hello world',
  instructions,
  [],
  DEFAULT_FLOW_SIZE,
  true,
  true // Set separatedActions parameter to true
);
```

### Update an existing safe

#### Add owner proposal

The method will create a new instruction to propose adding new owner to the safe

```typescript
const ix = await snowflakeSafe.createAddOwnerProposalInstruction(safeAddress, newOwner);
```

#### Remove owner proposal

The method will create a new instruction to propose removing an existing owner from the safe

```typescript
const ix = await snowflakeSafe.createRemoveOwnerProposalInstruction(safeAddress, newOwner);
```

#### Change threshold proposal

The method will create a new instruction to propose changing threshold of the safe

```typescript
const ix = await snowflakeSafe.createChangeThresholdProposalInstruction(safeAddress, newThreshold);
```

### Approve a proposal

```typescript
await snowflakeSafe.approveProposal(flowAddress);
```

### Reject a proposal

```typescript
await snowflakeSafe.rejectProposal(flowAddress);
```

### Execute a proposal

```typescript
await snowflakeSafe.executeProposal(flowAddress);
```

### Abort a recurring proposal

```typescript
await snowflakeSafe.abortRecurringProposal(flowAddress);
```

---

### Build an once-off scheduled job

With Snowflake SDK, you can create a job with two line of code.

```typescript
const job = new MultisigJobBuilder()
  .jobName('hello world')
  .jobInstructions(instructions)
  .scheduleOnce(tomorrow())
  .build();
```

### Build a recurring scheduled job

Schedule a job that runs every minute for 10 times.

```typescript
const job = new MultisigJobBuilder()
  .jobName('hello world')
  .jobInstructions(instructions)
  .scheduleCron('* * * * *', 10)
  .build();
```

Schedule a job that runs at 10:00 AM on the first day of every month .

```typescript
const job = new MultisigJobBuilder()
  .jobName('hello world')
  .jobInstructions(instructions)
  .scheduleCron('0 10 1 * *')
  .build();
```

### Build a program condition triggered job

Schedule a job that is triggered based on an arbitrary condition defined within the user program.

```typescript
const job = new MultisigJobBuilder()
  .jobName('hello world')
  .jobInstructions(instructions)
  .scheduleConditional(1)
  .build();
```

## Support

### Struggle with the SDK integration?

If you have any problem with using the SDK in your system, drop a question our Snowflake Discord #sdk to receive a support from our engineers.

### Find a bug or want to contribute to Snowflake?

If you find a bug or have any problem and idea while using the SDK, you can create an issue on SDK Github.

## License

Apache Version 2.0

# Metaplex Core NFT Transfer

This repository contains scripts for transferring Metaplex Core NFTs on Solana.

## Direct Transfer Script

The `metaplex-core-nft-transfer.js` script allows direct transfers of Metaplex Core NFTs between wallets without using the Snowflake SDK. This approach is preferred as the Snowflake program hasn't been updated since 2022.

### Prerequisites

- Node.js installed
- Solana wallet with private key
- SOL in your wallet for transaction fees
- Metaplex Core NFT that you own

### Setup

1. Install dependencies:
```
npm install @solana/web3.js dotenv
```

2. Create a `.env` file with the following variables:
```
WALLET_PRIVATE_KEY=<your-wallet-private-key-as-json-array>
NFT_ASSET_ADDRESS=<address-of-nft-to-transfer>
DESTINATION_WALLET=<recipient-wallet-address>
NFT_COLLECTION_ADDRESS=<collection-address-if-nft-is-part-of-collection>
HELIUS_API_KEY=<your-helius-api-key-optional>
SOLANA_NETWORK=mainnet
```

### Usage

Run the script:
```
node metaplex-core-nft-transfer.js
```

### Troubleshooting

- **Not enough SOL**: Ensure your wallet has SOL to pay for transaction fees.
- **Ownership verification**: Make sure the NFT belongs to your wallet.
- **Borsh serialization errors**: The NFT may require additional account information or have a different structure. Try using the Metaplex JS SDK directly if available.

## Original Snowflake Safe Script

The `snowflake-safe-nft-retrieval.js` script attempts to transfer NFTs using the Snowflake Safe SDK. However, this approach is less reliable as the Snowflake program hasn't been updated since 2022.

## Why Create a Direct Transfer Script?

As suggested by the Solana Foundation:

> The Snowflake program hasn't been updated since 2022, so it might no longer be functional. Before debugging further, it's important to confirm that you can transfer Core NFTs using the provided instructions without utilizing the Snowflake SDK.

The direct transfer script follows this recommendation by implementing transfers using native Solana web3.js.

/**
 * Snowflake Safe NFT Retrieval Script - Metaplex Core Version
 *
 * This script retrieves NFTs from a Snowflake Safe by creating a proposal
 * that uses the Metaplex Core transfer instruction.
 *
 * Fixed with proper Umi type conversion for compatibility.
 */

// ---- 1. SETUP AND IMPORTS ----
const {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const { AnchorProvider, BN, Wallet, web3, utils } = require('@project-serum/anchor');
const { SnowflakeSafe } = require('@snowflake-so/safe-sdk');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import Metaplex Core and adapters with proper error handling
let createTransferV1Instruction, createUmi, mplCorePlugin, web3JsRpc, web3JsEddsa;
let fromWeb3JsPublicKey, toWeb3JsInstruction, publicKey;
let umiContext = null;

try {
  // Import core libraries
  const mplCore = require('@metaplex-foundation/mpl-core');
  const { createUmi: umiFactory } = require('@metaplex-foundation/umi');
  const { mplCore: mplCorePluginFactory } = require('@metaplex-foundation/mpl-core');
  const { web3JsRpc: web3JsRpcFactory } = require('@metaplex-foundation/umi-rpc-web3js');
  const { web3JsEddsa: web3JsEddsaFactory } = require('@metaplex-foundation/umi-eddsa-web3js');
  const { publicKey: publicKeyFn } = require('@metaplex-foundation/umi');
  const {
    fromWeb3JsPublicKey: fromPubkey,
    toWeb3JsInstruction: toInstruction,
  } = require('@metaplex-foundation/umi-web3js-adapters');

  // Assign to our variables
  createTransferV1Instruction = mplCore.createTransferV1Instruction;
  createUmi = umiFactory;
  mplCorePlugin = mplCorePluginFactory;
  web3JsRpc = web3JsRpcFactory;
  web3JsEddsa = web3JsEddsaFactory;
  fromWeb3JsPublicKey = fromPubkey;
  toWeb3JsInstruction = toInstruction;
  publicKey = publicKeyFn;

  console.log('Successfully imported Metaplex Core and Umi adapters');
} catch (error) {
  console.log('Error importing Metaplex libraries:', error.message);
  console.log('Falling back to custom instruction creation method');
}

// Network configuration from environment variables
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const SOLANA_NETWORK = process.env.SOLANA_NETWORK || 'mainnet';
const NETWORK = `https://${SOLANA_NETWORK}.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

// Initialize Umi context with proper RPC configuration
try {
  if (createUmi && web3JsRpc && web3JsEddsa && mplCorePlugin) {
    // Explicitly provide the RPC endpoint when creating the Umi instance
    umiContext = createUmi(NETWORK).use(web3JsRpc()).use(web3JsEddsa()).use(mplCorePlugin());
    console.log('Successfully initialized Umi context with Helius RPC');
  }
} catch (error) {
  console.log('Failed to initialize Umi context:', error.message);
  umiContext = null;
}

// ---- 2. CONFIGURATION ----
const SAFE_ADDRESS = new PublicKey(process.env.SAFE_ADDRESS);
const NFT_ASSET_ADDRESS = new PublicKey(process.env.NFT_ASSET_ADDRESS);
const DESTINATION_WALLET = new PublicKey(process.env.DESTINATION_WALLET);
const NFT_COLLECTION_ADDRESS = new PublicKey(process.env.NFT_COLLECTION_ADDRESS);

// Program IDs
const METAPLEX_CORE_PROGRAM_ID = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');
const MEMO_PROGRAM_ID = new PublicKey('Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo');

// Ensure we have Umi versions of our public keys if possible
let UMI_METAPLEX_CORE_PROGRAM_ID;
let UMI_SYSTEM_PROGRAM_ID;
let UMI_SYSVAR_RENT_PUBKEY;
let UMI_SYSVAR_INSTRUCTIONS_PUBKEY;

try {
  if (fromWeb3JsPublicKey) {
    // Convert program IDs to Umi format for later use
    UMI_METAPLEX_CORE_PROGRAM_ID = fromWeb3JsPublicKey(METAPLEX_CORE_PROGRAM_ID);
    UMI_SYSTEM_PROGRAM_ID = fromWeb3JsPublicKey(SystemProgram.programId);
    UMI_SYSVAR_RENT_PUBKEY = fromWeb3JsPublicKey(web3.SYSVAR_RENT_PUBKEY);
    UMI_SYSVAR_INSTRUCTIONS_PUBKEY = fromWeb3JsPublicKey(web3.SYSVAR_INSTRUCTIONS_PUBKEY);
    console.log('Successfully created Umi versions of program IDs');
  }
} catch (error) {
  console.log('Error creating Umi versions of program IDs:', error.message);
}

// ---- 3. UTILITY FUNCTIONS ----
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function setupConnection() {
  console.log('Setting up connection to Solana network using Helius RPC...');

  // Initialize connection to Solana network via Helius
  const connection = new Connection(NETWORK, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 120000, // 2 minutes timeout
  });

  // Verify the connection is working
  try {
    const blockHeight = await connection.getBlockHeight();
    console.log(`Successfully connected to Helius RPC. Current block height: ${blockHeight}`);
  } catch (error) {
    console.error('Error connecting to Helius RPC:', error.message);
    console.error('Please verify your API key is correct and has sufficient credits');
    throw new Error('Failed to connect to Helius RPC');
  }

  // Load owner wallet keypair from environment variable
  try {
    if (!process.env.WALLET_PRIVATE_KEY) {
      throw new Error('WALLET_PRIVATE_KEY not found in environment variables');
    }

    // Parse the private key from environment variable
    const privateKeyArray = JSON.parse(process.env.WALLET_PRIVATE_KEY);
    const secretKey = Uint8Array.from(privateKeyArray);
    const wallet = Keypair.fromSecretKey(secretKey);

    // Create Anchor provider
    const provider = new AnchorProvider(connection, new Wallet(wallet), {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
      skipPreflight: false,
    });

    console.log(`Connected with wallet: ${wallet.publicKey.toString()}`);
    return { connection, wallet, provider };
  } catch (error) {
    console.error('Error loading wallet from environment variables:', error.message);
    throw new Error(
      'Failed to load wallet. Make sure WALLET_PRIVATE_KEY is correctly configured in .env file'
    );
  }
}

async function initializeSafe(provider) {
  console.log('Initializing Snowflake Safe SDK...');

  // Create an instance of the Snowflake Safe
  const snowflakeSafe = new SnowflakeSafe(provider);

  console.log('Snowflake SDK initialized');

  // Fix: Manually attach the provider if necessary
  if (!snowflakeSafe.provider) {
    snowflakeSafe.provider = provider;
    console.log('Added missing provider to Snowflake Safe SDK instance');
  }

  return snowflakeSafe;
}

async function findSafeSignerAddress(safeAddress, programId) {
  return PublicKey.findProgramAddress(
    [utils.bytes.utf8.encode('SafeSigner'), safeAddress.toBuffer()],
    programId
  );
}

// Update the transfer instruction creation function for proper Umi integration
async function createMetaplexCoreTransferInstruction(safeSignerAddress, assetAddress, destination) {
  console.log(`Creating Metaplex Core transfer instruction...`);
  console.log(`- Asset address: ${assetAddress.toString()}`);
  console.log(`- Current owner (safe signer): ${safeSignerAddress.toString()}`);
  console.log(`- Destination wallet: ${destination.toString()}`);

  // Check if NFT_COLLECTION_ADDRESS is set and valid before proceeding
  if (
    !process.env.NFT_COLLECTION_ADDRESS ||
    process.env.NFT_COLLECTION_ADDRESS === PublicKey.default.toString()
  ) {
    console.error('ERROR: NFT_COLLECTION_ADDRESS is not set or is invalid in your .env file.');
    throw new Error('Missing or invalid NFT collection address configuration.');
  }
  const collectionAddress = new PublicKey(process.env.NFT_COLLECTION_ADDRESS);
  console.log(`- Collection: ${collectionAddress.toString()}`);

  // If we have all the necessary Umi components, use them with proper type conversion
  if (umiContext && createTransferV1Instruction && fromWeb3JsPublicKey && toWeb3JsInstruction) {
    console.log('Using Metaplex Core SDK with proper Umi type conversion');

    try {
      // Convert web3.js PublicKeys to Umi PublicKeys
      const umiAsset = fromWeb3JsPublicKey(assetAddress);
      const umiOwner = fromWeb3JsPublicKey(safeSignerAddress);
      const umiDestination = fromWeb3JsPublicKey(destination);
      const umiCollection = fromWeb3JsPublicKey(collectionAddress); // Use validated collection address

      // Use the pre-converted program IDs
      const umiSystemProgram = UMI_SYSTEM_PROGRAM_ID;
      const umiSysvarRent = UMI_SYSVAR_RENT_PUBKEY;
      const umiSysvarInstructions = UMI_SYSVAR_INSTRUCTIONS_PUBKEY;

      // Create null delegate using publicKey(0) for Umi
      const nullDelegate = publicKey('11111111111111111111111111111111');

      console.log('Successfully converted all public keys to Umi format');

      // Create the transfer instruction with proper Umi interfaces
      // Ensure all required fields are present
      const transferParams = {
        asset: umiAsset,
        owner: umiOwner,
        delegate: nullDelegate, // Using a proper Umi public key as null delegate
        collection: umiCollection, // Pass the collection address
        updateAuthority: umiOwner, // Safe Signer PDA is the update authority in this context
        newOwner: umiDestination,
        payer: umiOwner, // Safe Signer PDA pays for the transaction via CPI
        systemProgram: umiSystemProgram,
        sysvarRent: umiSysvarRent, // Rent sysvar is required
        log: umiSysvarInstructions, // Instructions sysvar is required
      };

      // Proper amount format for Umi (Some(1))
      const amount = { __option: 'Some', value: new BN(1) };

      console.log('Creating Umi instruction with proper parameters:', transferParams);
      const umiInstruction = createTransferV1Instruction(
        umiContext,
        transferParams,
        { amount } // Pass amount correctly
      );

      // Convert the Umi instruction back to a web3.js instruction
      console.log('Successfully created Umi instruction, converting to web3.js format');
      return toWeb3JsInstruction(umiInstruction);
    } catch (error) {
      console.error('Error in Umi instruction creation:', error);
      console.log('Falling back to manual instruction creation method');
      // Continue to fallback method below
    }
  }

  // Fallback to manual instruction creation with updated account structure
  console.log('Using custom instruction creation method');

  // Proper discriminator for Metaplex Core transferV1
  const transferDiscriminator = Buffer.from([116, 97, 188, 150, 133, 175, 148, 44]);

  // Create the instruction data with proper Option<u64> encoding for amount = 1
  const someFlag = Buffer.from([1]); // Option::Some
  const amountValue = new BN(1).toArrayLike(Buffer, 'le', 8);
  const instructionData = Buffer.concat([transferDiscriminator, someFlag, amountValue]);

  console.log(`Using collection address: ${collectionAddress.toString()}`);

  // Required accounts for Metaplex Core transferV1 in the correct order
  const accounts = [
    // 0. The asset account being transferred
    { pubkey: assetAddress, isWritable: true, isSigner: false },
    // 1. The current owner (must be a signer)
    { pubkey: safeSignerAddress, isWritable: false, isSigner: true },
    // 2. Delegate (null in this case) - use System Program's default address
    { pubkey: PublicKey.default, isWritable: false, isSigner: false },
    // 3. Collection address - MUST BE VALID
    { pubkey: collectionAddress, isWritable: false, isSigner: false },
    // 4. Update authority (same as owner for safe transfers) - Not signing directly
    { pubkey: safeSignerAddress, isWritable: false, isSigner: false },
    // 5. New owner/destination
    { pubkey: destination, isWritable: false, isSigner: false },
    // 6. Payer (same as owner for safe transfers, signs via CPI)
    { pubkey: safeSignerAddress, isWritable: true, isSigner: true },
    // 7. System program
    { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
    // 8. Rent sysvar
    { pubkey: web3.SYSVAR_RENT_PUBKEY, isWritable: false, isSigner: false },
    // 9. Instructions sysvar (for logging CPIs)
    { pubkey: web3.SYSVAR_INSTRUCTIONS_PUBKEY, isWritable: false, isSigner: false },
  ];

  console.log(
    'Manual instruction accounts:',
    accounts.map(a => ({ ...a, pubkey: a.pubkey.toString() }))
  );
  console.log('Manual instruction data:', instructionData.toString('hex'));

  // Return the correctly formatted instruction
  return new web3.TransactionInstruction({
    programId: METAPLEX_CORE_PROGRAM_ID,
    keys: accounts,
    data: instructionData,
  });
}

async function verifyNFTInSafe(connection, assetAddress) {
  console.log(`Verifying NFT token account: ${assetAddress.toString()}`);

  try {
    const accountInfo = await connection.getAccountInfo(assetAddress);

    if (!accountInfo) {
      console.error('Error: The specified NFT asset account does not exist!');
      return false;
    }

    console.log('NFT asset account exists with data size:', accountInfo.data.length);
    console.log('Asset account owner program:', accountInfo.owner.toString());

    // Verify this is a Metaplex Core account by checking the owner
    if (!accountInfo.owner.equals(METAPLEX_CORE_PROGRAM_ID)) {
      console.error('Error: The specified address is not owned by Metaplex Core!');
      return false;
    }

    console.log('✅ Successfully verified as a valid Metaplex Core asset');
    return true;
  } catch (error) {
    console.error('Error verifying NFT asset account:', error);
    return false;
  }
}

// ---- 4. MAIN FUNCTIONALITY ----
async function createTransferProposal(safe, connection, wallet) {
  console.log('Creating NFT transfer proposal...');

  try {
    // Get the safe signer PDA
    const [safeSignerAddress, safeSignerBump] = await findSafeSignerAddress(
      SAFE_ADDRESS,
      safe.program.programId
    );

    // Create the Metaplex Core transfer instruction with fixed format
    const transferIx = await createMetaplexCoreTransferInstruction(
      safeSignerAddress,
      NFT_ASSET_ADDRESS,
      DESTINATION_WALLET
    );

    // Create the proposal with the transfer instruction
    const proposalName = `Transfer Metaplex Core NFT`;
    console.log(`Creating proposal: ${proposalName}`);

    // Create proposal with using the SDK
    const [proposalAddress, txSignature] = await safe.createProposal(
      SAFE_ADDRESS,
      proposalName,
      [transferIx],
      [], // No setup instructions needed
      1800, // Standard account size
      true, // Auto-approve by creator
      {
        skipPreflight: false,
        maxRetries: 2,
        commitment: 'confirmed',
      }
    );

    console.log(`Proposal created successfully! Address: ${proposalAddress.toString()}`);
    console.log(`Transaction signature: ${txSignature}`);

    return proposalAddress;
  } catch (error) {
    console.error('Error creating transfer proposal:', error);
    throw error;
  }
}

// Update the enhanced executeProposal function to better match the TypeScript implementation
async function executeProposal(safe, proposalAddress, maxRetries = 3) {
  console.log(`Executing proposal with Safe SDK: ${proposalAddress.toString()}`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${maxRetries}...`);

      // This will execute the proposal through the Snowflake Safe program
      const txid = await safe.executeProposal(proposalAddress, {
        skipPreflight: false, // Enable simulation to catch errors
        commitment: 'confirmed',
        maxRetries: 0, // We're handling retries manually
      });

      console.log(`Proposal executed successfully! Txid: ${txid}`);
      return txid;
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error.message);

      // Log detailed error information if available
      if (error.logs) {
        console.error('Error logs:');
        error.logs.forEach(log => console.error(`  ${log}`));
      }

      if (attempt < maxRetries) {
        const waitTime = 5000 * Math.pow(1.5, attempt - 1);
        console.log(`Waiting ${Math.round(waitTime / 1000)} seconds before retry...`);
        await sleep(waitTime);
      } else {
        throw error;
      }
    }
  }
}

// Add a function to retrieve the NFT collection address
async function getMetaplexNFTCollectionAddress(connection, assetAddress) {
  console.log(`Attempting to retrieve collection address for NFT: ${assetAddress.toString()}`);

  try {
    // Get the account info
    const accountInfo = await connection.getAccountInfo(assetAddress);

    if (!accountInfo) {
      console.error('NFT asset account not found');
      return null;
    }

    // For debugging, log the data
    console.log(`NFT data size: ${accountInfo.data.length} bytes`);

    // Depending on the NFT standard, you may need to parse the data differently
    // This is a simplified approach that tries to extract collection data from Metaplex format

    // If we have at least 64 bytes of data, try to extract the collection
    if (accountInfo.data.length >= 64) {
      // The collection address might be stored at a specific offset
      // This is a placeholder - you'll need to research the actual data format
      console.log('Attempting to parse collection data from NFT account');

      // Return null for now - this needs to be replaced with actual parsing logic
      return null;
    }

    console.log('Could not find collection data in NFT account');
    return null;
  } catch (error) {
    console.error('Error retrieving NFT collection data:', error);
    return null;
  }
}

// ---- ADD NEW FUNCTION ----
async function initializeUmi(connection) {
  try {
    if (createUmi && web3JsRpc && web3JsEddsa && mplCorePlugin) {
      // Explicitly provide the connection to the RPC adapter
      const umi = createUmi() // Create base Umi
        .use(web3JsRpc(connection)) // Pass the existing web3.js connection
        .use(web3JsEddsa())
        .use(mplCorePlugin());
      console.log('Successfully initialized Umi context using existing connection');
      return umi; // Return the initialized Umi instance
    } else {
      console.log('Umi libraries or required plugins not available.');
      return null; // Return null if setup fails
    }
  } catch (error) {
    console.error('Failed to initialize Umi context:', error.message); // Log error more prominently
    return null; // Ensure null is returned on error
  }
}

// ---- 5. MAIN EXECUTION FUNCTION ----
async function retrieveNFTFromSafe() {
  try {
    console.log('Starting Metaplex Core NFT retrieval from Snowflake Safe...');
    console.log(`Using RPC endpoint: ${NETWORK}`);

    // Setup connection and initialize SDK
    const { connection, wallet, provider } = await setupConnection();

    // ---- INITIALIZE UMI HERE ----
    umiContext = await initializeUmi(connection); // Assign the result to the global umiContext

    // Check if Umi initialization was successful before proceeding
    if (!umiContext) {
      console.error('Aborting: Umi context failed to initialize. Cannot use Metaplex SDK path.');
      // Optionally, you could decide whether to proceed with manual fallback or stop
      // Forcing Umi path for now:
      return;
    }

    let safe = await initializeSafe(provider);

    // Verify NFT asset account
    const nftExists = await verifyNFTInSafe(connection, NFT_ASSET_ADDRESS);
    if (!nftExists) {
      console.log('Aborting NFT transfer process due to NFT verification failure.');
      return;
    }

    // Check if we're using an existing proposal or creating a new one
    let proposalAddress;
    const existingProposalAddressStr = process.env.EXISTING_PROPOSAL;

    if (existingProposalAddressStr) {
      try {
        proposalAddress = new PublicKey(existingProposalAddressStr);
        console.log(`Using existing proposal address: ${proposalAddress.toString()}`);
      } catch (error) {
        console.error('Invalid existing proposal address. Creating a new one.');
        proposalAddress = await createTransferProposal(safe, connection, wallet);
      }
    } else {
      // Create transfer proposal
      proposalAddress = await createTransferProposal(safe, connection, wallet);
    }

    // Wait for the proposal to propagate
    console.log('Waiting 5 seconds for the proposal to propagate through RPC...');
    await sleep(5000);

    // Fetch safe configuration to check approval threshold
    console.log(`Fetching safe configuration for: ${SAFE_ADDRESS.toString()}`);
    const safeAccount = await safe.fetchSafe(SAFE_ADDRESS);
    console.log('Safe configuration retrieved:');
    console.log(`- Owners: ${safeAccount.owners.map(o => o.toString()).join(',')}`);
    console.log(`- Threshold: ${safeAccount.approvalsRequired}`);

    // Try to fetch the proposal to check approval status
    // NOTE: Execute logic might move inside createTransferProposal if we always execute immediately
    // Fetch proposal to check status before attempting execution
    console.log(`Fetching proposal details: ${proposalAddress.toString()}`);
    let proposal;
    try {
      proposal = await safe.fetchProposal(proposalAddress);
    } catch (fetchError) {
      console.error(`Error fetching proposal ${proposalAddress.toString()}:`, fetchError);
      console.log(
        'Assuming proposal exists but might still be propagating. Will attempt execution.'
      );
      // Allow execution attempt even if fetch fails initially
    }

    const approvalCount = proposal
      ? proposal.approvals.filter(a => a.isApproved).length
      : safeAccount.approvalsRequired; // Assume approved if fetch failed but we auto-approve

    console.log(
      `\nProposal has ${approvalCount} approvals out of ${safeAccount.approvalsRequired} required.`
    );

    if (approvalCount >= safeAccount.approvalsRequired) {
      console.log('Proposal has enough approvals. Attempting execution...');

      // Execute the proposal with the improved function
      await executeProposal(safe, proposalAddress, 3);

      // Verify the NFT transfer happened
      try {
        console.log('Waiting 5 seconds for transfer to settle...');
        await sleep(5000); // Give network time to settle

        // Check the owner of the NFT account data, not just existence
        const nftAccountInfo = await connection.getAccountInfo(NFT_ASSET_ADDRESS);
        if (!nftAccountInfo) {
          console.log('NFT account no longer exists. Transfer likely successful!');
        } else {
          // Attempt to deserialize the account data to find the owner field
          // This requires knowing the specific data layout of Metaplex Core AssetV1
          // Placeholder: Check if owner program is still Metaplex Core
          if (!nftAccountInfo.owner.equals(METAPLEX_CORE_PROGRAM_ID)) {
            console.log(
              `NFT account owner changed to ${nftAccountInfo.owner.toString()}. Transfer likely successful!`
            );
          } else {
            // Manually check the destination wallet for the NFT using an explorer
            console.log(
              'NFT account still owned by Metaplex Core. Transfer might have failed or destination is wrong.'
            );
            console.log(
              `Please verify manually if ${DESTINATION_WALLET.toString()} received the NFT.`
            );
          }
        }
      } catch (checkError) {
        console.error('Could not verify the NFT transfer status:', checkError.message);
        console.log(`Please check destination wallet ${DESTINATION_WALLET.toString()} manually.`);
      }
    } else {
      console.log(
        `You need ${safeAccount.approvalsRequired - approvalCount} more approvals before executing.`
      );
      console.log(`Share this proposal address with other owners: ${proposalAddress.toString()}`);
      console.log('Once you have enough approvals, run this script with:');
      console.log(
        `EXISTING_PROPOSAL=${proposalAddress.toString()} node snowflake-safe-nft-retrieval.js`
      );
    }

    console.log('\nNFT retrieval process completed.');
  } catch (error) {
    // Log the full error object for more details
    console.error('Error retrieving NFT from safe:', error);
    // Check if it has logs attached (like SendTransactionError)
    if (error.logs) {
      console.error('Transaction Logs:', error.logs);
    }
    console.log(
      '\nPlease check your wallet and the transaction on the explorer to see if the NFT was transferred despite the error.'
    );
  }
}

// ---- 6. RUN THE SCRIPT ----
retrieveNFTFromSafe();

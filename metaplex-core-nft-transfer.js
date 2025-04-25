/**
 * Metaplex Core – Direct NFT Transfer
 * by @capos 2024-06
 *
 * Env vars required:
 *   HELIUS_API_KEY?          – optional, speeds up RPC
 *   SOLANA_NETWORK           – 'mainnet' | 'devnet'   (default: mainnet)
 *   WALLET_PRIVATE_KEY       – JSON array, e.g. "[12,34, …]"
 *   NFT_ASSET_ADDRESS        – PDA of the asset record (NOT the mint!)
 *   NFT_COLLECTION_ADDRESS?  – PDA of collection record    (optional)
 *   DESTINATION_WALLET       – receiver's public key
 *
 * Install deps:
 *   npm i @solana/web3.js @metaplex-foundation/mpl-core @metaplex-foundation/umi dotenv @solana/spl-token
 *   npm i --legacy-peer-deps @metaplex-foundation/umi-bundle-defaults @metaplex-foundation/umi-web3js-adapters
 */

require('dotenv').config();
const { Connection, Keypair, PublicKey, clusterApiUrl } = require('@solana/web3.js');

// Import required Metaplex packages
const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
const { mplCore, transferV1, fetchAsset } = require('@metaplex-foundation/mpl-core');
const { keypairIdentity } = require('@metaplex-foundation/umi');
const { publicKey } = require('@metaplex-foundation/umi');
const { fromWeb3JsKeypair } = require('@metaplex-foundation/umi-web3js-adapters');
const { base58 } = require('@metaplex-foundation/umi/serializers');

// Configuration from environment variables
const NETWORK = (process.env.SOLANA_NETWORK || 'mainnet').toLowerCase();
const HELIUS_KEY = process.env.HELIUS_API_KEY || '';
const ENDPOINT = HELIUS_KEY
  ? `https://${NETWORK}.helius-rpc.com/?api-key=${HELIUS_KEY}`
  : clusterApiUrl(NETWORK === 'mainnet' ? 'mainnet-beta' : 'devnet');

// Helper function to require environment variables
function requireEnv(key) {
  if (!process.env[key]) {
    throw new Error(`Environment variable ${key} is required`);
  }
  return process.env[key];
}

// Sleep helper function
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Required wallet and addresses
const walletSecret = Uint8Array.from(JSON.parse(requireEnv('WALLET_PRIVATE_KEY')));
const wallet = Keypair.fromSecretKey(walletSecret);
const ASSET_ADDRESS = new PublicKey(requireEnv('NFT_ASSET_ADDRESS'));
const DESTINATION_WALLET = new PublicKey(requireEnv('DESTINATION_WALLET'));
const COLLECTION_ADDRESS = process.env.NFT_COLLECTION_ADDRESS
  ? new PublicKey(process.env.NFT_COLLECTION_ADDRESS)
  : null;

// Create Solana connection
const connection = new Connection(ENDPOINT, { commitment: 'confirmed' });

// Function to verify asset ownership
async function verifyAssetOwnership(umi, assetAddress, expectedOwner) {
  try {
    console.log(`Verifying ownership of asset: ${assetAddress.toString()}`);

    // Fetch the asset's current state
    const asset = await fetchAsset(umi, publicKey(assetAddress.toString()));

    if (!asset) {
      console.log('❓ Could not find asset');
      return false;
    }

    const currentOwner = asset.owner.toString();
    console.log(`Current owner: ${currentOwner}`);

    return currentOwner === expectedOwner.toString();
  } catch (error) {
    console.error(`Error verifying asset ownership: ${error.message}`);
    return false;
  }
}

// Main execution function
async function transferNFT() {
  try {
    console.log(`\n=== Metaplex Core NFT Transfer ===`);
    console.log(`Network: ${NETWORK}`);
    console.log(`Asset Address: ${ASSET_ADDRESS.toBase58()}`);
    console.log(`Wallet: ${wallet.publicKey.toBase58()}`);
    console.log(`Destination: ${DESTINATION_WALLET.toBase58()}`);
    if (COLLECTION_ADDRESS) {
      console.log(`Collection: ${COLLECTION_ADDRESS.toBase58()}`);
    }

    // Check wallet balance
    const balance = await connection.getBalance(wallet.publicKey);
    console.log(`Wallet balance: ${balance / 10 ** 9} SOL`);
    if (balance < 0.01 * 10 ** 9) {
      throw new Error(`Low wallet balance: ${balance / 10 ** 9} SOL. Need at least 0.01 SOL.`);
    }

    // Create UMI instance
    const umi = createUmi(ENDPOINT)
      .use(keypairIdentity(fromWeb3JsKeypair(wallet)))
      .use(mplCore());

    // Fetch the asset to get information about it
    console.log('\nFetching asset details...');
    const asset = await fetchAsset(umi, publicKey(ASSET_ADDRESS.toBase58()));

    if (!asset) {
      throw new Error('Asset not found on chain');
    }

    console.log(`Asset name: ${asset.name}`);
    console.log(`Asset owner: ${asset.owner.toString()}`);

    // Check if asset is already owned by destination wallet
    if (asset.owner.toString() === DESTINATION_WALLET.toBase58()) {
      console.log(
        `\n⚠️ Asset is already owned by destination wallet: ${DESTINATION_WALLET.toBase58()}`
      );
      console.log('No transfer needed.');
      return 'No transfer needed - already owned by destination wallet';
    }

    // Check if the wallet is the owner
    if (asset.owner.toString() !== wallet.publicKey.toBase58()) {
      throw new Error(
        `You are not the owner of this asset. Current owner is: ${asset.owner.toString()}`
      );
    }

    // If the asset belongs to a collection, we'll use it for plugin operations
    let collectionPubkey = COLLECTION_ADDRESS;
    if (!collectionPubkey && asset.collection) {
      console.log(`Using collection from asset: ${asset.collection.toString()}`);
      collectionPubkey = new PublicKey(asset.collection.toString());
    }

    if (!collectionPubkey) {
      console.log(
        '\n⚠️ No collection found for this asset. This may cause issues with plugin operations.'
      );
    }

    // Try the transfer
    console.log('\nExecuting transfer...');

    // Configure the transfer parameters
    const transferParams = {
      asset: publicKey(ASSET_ADDRESS.toBase58()),
      authority: umi.identity,
      owner: publicKey(wallet.publicKey.toBase58()),
      newOwner: publicKey(DESTINATION_WALLET.toBase58()),
    };

    // Add collection if available
    if (collectionPubkey) {
      transferParams.collection = publicKey(collectionPubkey.toBase58());
    }

    // Add a numeric amount parameter for NFT transfer
    transferParams.amount = 1;

    let txSignature = null;

    try {
      // Set skipPreflight to true to get better error information
      const sendOptions = {
        send: { skipPreflight: true },
      };

      // Create and send the transfer transaction
      const { signature } = await transferV1(umi, transferParams).sendAndConfirm(umi, sendOptions);

      txSignature = base58.serialize(signature);

      console.log('\n✅ Transaction sent. Signature:', txSignature);
      console.log(`Explorer: https://explorer.solana.com/tx/${txSignature}?cluster=${NETWORK}`);
    } catch (error) {
      console.warn('\n⚠️ Client-side error:', error.message);
      console.log('Checking if the transfer still succeeded on-chain...');
    }

    // Wait a moment for the transaction to be confirmed
    console.log('Waiting for transaction to be confirmed...');
    await sleep(5000); // 5 seconds to allow for confirmation

    // Verify the transfer actually happened
    const isTransferred = await verifyAssetOwnership(umi, ASSET_ADDRESS, DESTINATION_WALLET);

    if (isTransferred) {
      console.log('\n✅ Transfer confirmed! Asset is now owned by the destination wallet.');
      if (txSignature) {
        console.log(`Signature: ${txSignature}`);
      } else {
        console.log('Transfer succeeded despite client-side error.');
      }
      return true;
    } else {
      // Check if we need to try again
      console.log('\n⚠️ Asset transfer not confirmed.');

      // Double check the current owner
      const asset = await fetchAsset(umi, publicKey(ASSET_ADDRESS.toBase58()));
      if (asset && asset.owner.toString() === DESTINATION_WALLET.toBase58()) {
        console.log('\n✅ On second check, transfer was successful!');
        return true;
      }

      console.log(
        'Transfer may have failed or is still pending. Check blockchain explorer for confirmation.'
      );
      return false;
    }
  } catch (error) {
    console.error('\n❌ Transfer failed');
    console.error(error.message || error);

    if (error.logs) {
      console.error('\n— Logs —');
      error.logs.forEach(log => console.error(log));
    }

    // Even if we got an error, double-check if the transfer happened anyway
    console.log('\nVerifying final asset ownership despite error...');

    try {
      const umi = createUmi(ENDPOINT)
        .use(keypairIdentity(fromWeb3JsKeypair(wallet)))
        .use(mplCore());

      // Give the network a moment to process any pending transactions
      await sleep(5000);

      const isTransferred = await verifyAssetOwnership(umi, ASSET_ADDRESS, DESTINATION_WALLET);

      if (isTransferred) {
        console.log('\n✅ Despite errors, the transfer was successful!');
        return true;
      } else {
        console.log('\n❌ Confirmed: Transfer did not happen.');
        return false;
      }
    } catch (verifyError) {
      console.error('Error while trying to verify final state:', verifyError.message);
      return false;
    }
  }
}

// Execute the transfer
transferNFT()
  .then(result => {
    console.log('\nScript completed.');
    process.exit(result ? 0 : 1);
  })
  .catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
  });

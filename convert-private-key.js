const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const fs = require('fs');

// Replace with your private key from wallet export
const privateKeyBase58 = '';

// Convert base58 private key to byte array
const privateKeyBytes = bs58.decode(privateKeyBase58);

// Create keypair from private key
const keypair = Keypair.fromSecretKey(privateKeyBytes);

// Save to JSON file in required format
fs.writeFileSync('converted-keypair.json', JSON.stringify(Array.from(keypair.secretKey)), 'utf8');

console.log('Conversion complete!');
console.log('Public key:', keypair.publicKey.toString());
console.log('Private key saved to converted-keypair.json');

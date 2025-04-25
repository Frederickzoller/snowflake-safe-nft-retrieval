const { Keypair } = require('@solana/web3.js');
const fs = require('fs');

// Generate a new keypair
const keypair = Keypair.generate();

// Save the secret key to a file
fs.writeFileSync('my-keypair.json', JSON.stringify(Array.from(keypair.secretKey)), 'utf8');

console.log('Keypair generated successfully!');
console.log('Public key (wallet address):', keypair.publicKey.toString());
console.log('Private key saved to my-keypair.json');
console.log('IMPORTANT: Keep your private key secret and secure!');

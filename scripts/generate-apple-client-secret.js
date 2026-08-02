// Generates the client-secret JWT Apple's Sign In With Apple requires for
// Supabase's Apple provider config (Authentication -> Providers -> Apple,
// "Secret Key" field). Apple's token endpoint doesn't accept the raw .p8
// private key directly -- it requires a JWT signed with that key. Apple
// caps the JWT's lifetime at ~6 months, so this needs re-running (and the
// Supabase field re-pasting) periodically, not just once.
//
// Requires the `jsonwebtoken` package, intentionally not a project
// dependency (used rarely) -- install it just before running:
//   npm install --no-save --no-package-lock jsonwebtoken
//
// Usage:
//   node scripts/generate-apple-client-secret.js \
//     --team-id <Apple Team ID> \
//     --key-id <Key ID from the .p8 download page> \
//     --client-id <bundle ID, e.g. com.owenecurran.alienapp> \
//     --key-path <path to the downloaded AuthKey_XXXXXXXXXX.p8 file>

const fs = require('fs');
const jwt = require('jsonwebtoken');

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    args[key] = argv[i + 1];
  }
  return args;
}

const { 'team-id': teamId, 'key-id': keyId, 'client-id': clientId, 'key-path': keyPath } = parseArgs();

if (!teamId || !keyId || !clientId || !keyPath) {
  console.error(
    'Usage: node scripts/generate-apple-client-secret.js --team-id <id> --key-id <id> --client-id <bundle id> --key-path <path to .p8>'
  );
  process.exit(1);
}

const privateKey = fs.readFileSync(keyPath, 'utf8');

const now = Math.floor(Date.now() / 1000);
const SIX_MONTHS_SECONDS = 15777000; // Apple's documented max lifetime.

const token = jwt.sign(
  {
    iss: teamId,
    iat: now,
    exp: now + SIX_MONTHS_SECONDS,
    aud: 'https://appleid.apple.com',
    sub: clientId,
  },
  privateKey,
  {
    algorithm: 'ES256',
    keyid: keyId,
  }
);

console.log(token);

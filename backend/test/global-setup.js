const { execFileSync } = require('child_process');
const path = require('path');

module.exports = async function globalSetup() {
  const url = process.env.DATABASE_URL || '';
  if (!url.includes('mysentinelcircle_test')) {
    throw new Error(
      `[e2e safety] DATABASE_URL does not point at mysentinelcircle_test ` +
      `(got: ${url ? url.replace(/:[^:@/]+@/, ':***@') : '(unset)'}). ` +
      `Refusing to run e2e tests against a non-test database. ` +
      `Make sure backend/.env.test exists and is loaded (npm run test:e2e ` +
      `already does this via --env-file-if-exists).`,
    );
  }

  console.log('[e2e] Resetting mysentinelcircle_test schema...');
  // execFileSync with an explicit binary path (not `npx`, which resolves
  // the command to run via PATH) so schema reset never depends on which
  // "prisma" happens to be first on PATH.
  execFileSync(
    path.join(__dirname, '..', 'node_modules', '.bin', 'prisma'),
    ['migrate', 'reset', '--force', '--skip-generate'],
    { cwd: __dirname + '/..', stdio: 'inherit', env: process.env },
  );
  console.log('[e2e] Schema reset complete.');
};

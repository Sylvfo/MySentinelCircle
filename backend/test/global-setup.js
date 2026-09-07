const { execSync } = require('child_process');

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
  execSync('npx prisma migrate reset --force --skip-generate', {
    cwd: __dirname + '/..',
    stdio: 'inherit',
    env: process.env,
  });
  console.log('[e2e] Schema reset complete.');
};

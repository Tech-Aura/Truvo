/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.ts"],
  // Integration tests hit testnet — allow generous timeouts.
  testTimeout: 120_000,
  // Silence noisy output during long test runs.
  verbose: true,
};

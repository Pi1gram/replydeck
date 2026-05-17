/**
 * Jest globalTeardown — runs ONCE after all tests.
 *
 * We deliberately leave the `replydeck_test` database in place so it can be
 * reused across runs (faster). The dev `replydeck` database is never touched.
 */
export default async function globalTeardown(): Promise<void> {
  // intentionally empty
}

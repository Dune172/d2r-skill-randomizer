// Kept for the documented command; see scripts/verify-season.mjs.
process.argv.push('--season', 'autumn');
await import('./verify-season.mjs');

// Reuse the actual input/persistence regression with a separate visual batch.
process.env.LIVING_CITY_SMOKE_OUT = 'art/review/clean_cartoon_v3';
process.env.LIVING_CITY_CAPTURE_DETAILS = '1';
await import('./refined_city_smoke.mjs');

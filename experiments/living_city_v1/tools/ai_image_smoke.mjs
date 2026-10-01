process.env.LIVING_CITY_SMOKE_OUT ??= 'art/review/ai_image_v4';
process.env.LIVING_CITY_CAPTURE_DETAILS = '1';
process.env.LIVING_CITY_GENERATED_CHARACTERS = '1';
await import('./refined_city_smoke.mjs');

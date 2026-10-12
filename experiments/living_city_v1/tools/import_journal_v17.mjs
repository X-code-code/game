import fs from 'node:fs';
process.env.LIVING_CITY_ART_PRODUCTION='art/production/ai_image_v17';
const {importEntry}=await import('./import_generated_art.mjs');
const base=process.env.LIVING_CITY_ART_PRODUCTION;
const assets=[];
for(const city of ['street_block_01','garden_market_02','harbor_walk_03']) {
  for(const [name,width,height,border] of [['ui_journal_panel_v17',1024,480,76],['ui_journal_card_v17',192,208,24]]) {
    assets.push(await importEntry({name,stage:'ui',source:name,width,height,inset:2,
      resizeFit:'fill',nineSliceBorder:border,bundle:`assets/bundles/city_living_city_${city}`,
      runtime:`ui/${name}.png`,transparent:true}));
  }
}
fs.writeFileSync(`${base}/production_manifest.json`,JSON.stringify({batchId:'ai_image_v17',
 sourceType:'codex_builtin_image_gen',styleId:'cozy_handdrawn_journal_v17',generationCalls:2,
 uniqueGeneratedPngs:2,assets,playerApproval:'pending',processing:'Alpha bounds crop, resize, transparent inset, nine-slice registration; no drawing.'},null,2)+'\n');
console.log('Imported two generated journal sprites into all three existing city bundles.');

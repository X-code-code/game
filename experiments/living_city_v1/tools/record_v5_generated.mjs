// Preserve original built-in image output and its actual prompt, without drawing.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pixels,bounds} from './import_generated_art.mjs';
const [id,original,promptId=id]=process.argv.slice(2);
if(!id || !original)throw new Error('Usage: record_v5_generated.mjs id original_path [prompt_id]');
const base=process.env.LIVING_CITY_ART_PRODUCTION??'art/production/ai_image_v5',source=`${base}/sources/${id}.png`,prompt=`${base}/prompts/${promptId}.md`;
fs.mkdirSync(path.dirname(source),{recursive:true});
fs.copyFileSync(original,source);
if(!fs.existsSync(prompt))throw new Error(`Actual prompt missing: ${prompt}`);
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const {data,info}=await pixels(source);
const file=`${base}/generation_record.json`;
const record=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{batchId:path.basename(base),sourceType:'codex_builtin_image_gen',styleId:'cozy_flat_town_v5',visualApproval:'pending',sources:[]};
const entry={id,originalToolOutput:original,source,prompt,sourceSha256:hash(source),originalToolOutputSha256:hash(original),sourceSize:{width:info.width,height:info.height},alphaBounds:bounds(data,info,0),status:'generated_unapproved'};
record.sources=record.sources.filter(item=>item.id!==id);record.sources.push(entry);
fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({id,source,size:entry.sourceSize,transparentPixels:entry.alphaBounds.transparent}));

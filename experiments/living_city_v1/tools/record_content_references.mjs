// Preserve actual input pixels/prompts for reproducible image-generation records.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const base=process.env.LIVING_CITY_ART_PRODUCTION??'art/production/ai_image_v6';
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const record=read(`${base}/generation_record.json`),plan=read(`${base}/generation_plan.json`);
fs.mkdirSync(`${base}/references`,{recursive:true});
for(const source of record.sources) {
    source.promptSha256=hash(source.prompt);
    const job=plan.jobs.find(job=>job.id===source.id);
    if(!job)continue;
    assert.equal(fs.readFileSync(source.prompt,'utf8').trim(),job.prompt.trim());
    source.references=job.references.map(inputPath=>{
        const retainedPath=inputPath.replaceAll('\\','/').includes('/'+base+'/sources/')
            ?`${base}/sources/${path.basename(inputPath)}`:`${base}/references/${path.basename(inputPath)}`;
        if(!inputPath.replaceAll('\\','/').includes('/'+base+'/sources/'))fs.copyFileSync(inputPath,retainedPath);
        assert.equal(hash(inputPath),hash(retainedPath));
        return {actualInputPath:inputPath,retainedPath,sha256:hash(retainedPath),visualApproval:'reference_only'};
    });
}
fs.writeFileSync(`${base}/generation_record.json`,JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({status:'actual_references_and_prompts_retained',generationJobs:plan.jobs.length,
    uniqueReferences:new Set(record.sources.flatMap(source=>source.references??[]).map(ref=>ref.retainedPath)).size}));

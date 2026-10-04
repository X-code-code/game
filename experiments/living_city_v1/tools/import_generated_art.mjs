// Mechanical PNG processing only: read generated pixels, crop/resize, register
// transparent canvases and write Cocos metadata. No drawing or vector rendering.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const sharp = require(process.env.COCOS_SHARP_PATH ??
    'C:/Users/24627/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = path.resolve('.');
const production = process.env.LIVING_CITY_ART_PRODUCTION ?? 'art/production/ai_image_v4';
const bundle = 'assets/bundles/city_living_city_street_block_01';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, data) => {
    fs.mkdirSync(path.dirname(file), {recursive:true});
    fs.writeFileSync(file, JSON.stringify(data,null,2)+'\n');
};
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export async function pixels(file) {
    return sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
}
export function bounds(data, info, threshold = 8) {
    let left=info.width,top=info.height,right=-1,bottom=-1,transparent=0,visible=0;
    for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) {
        const a=data[(y*info.width+x)*4+3];
        if(a===0)transparent++;
        if(a<=threshold)continue;
        visible++;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    assert.ok(right>=left && bottom>=top,'empty generated asset');
    return {left,top,width:right-left+1,height:bottom-top+1,transparent,visible};
}
function directoryMeta(folder, bundleName) {
    fs.mkdirSync(folder,{recursive:true});
    if(fs.existsSync(folder+'.meta'))return;
    write(folder+'.meta',{ver:'1.2.0',importer:'directory',imported:true,uuid:randomUUID(),
        files:[],subMetas:{},userData:bundleName?{isBundle:true,bundleName,priority:8}: {}});
}
async function imageMeta(file, name, border=0) {
    const {data,info}=await pixels(file),b=bounds(data,info,0);
    const old = fs.existsSync(file+'.meta')?read(file+'.meta'):null;
    const uuid=old?.uuid??randomUUID(),w=info.width,h=info.height;
    // Full-canvas registration avoids trim/pivot drift between animation cels.
    write(file+'.meta',{ver:'1.0.27',importer:'image',imported:true,uuid,files:['.json','.png'],
        subMetas:{
            '6c48a':{ver:'1.0.22',importer:'texture',imported:true,uuid:uuid+'@6c48a',displayName:name,
                id:'6c48a',name:'texture',files:['.json'],subMetas:{},userData:{wrapModeS:'clamp-to-edge',
                    wrapModeT:'clamp-to-edge',minfilter:'linear',magfilter:'linear',mipfilter:'none',
                    anisotropy:0,imageUuidOrDatabaseUri:uuid,isUuid:true,visible:false}},
            'f9941':{ver:'1.0.12',importer:'sprite-frame',imported:true,uuid:uuid+'@f9941',displayName:name,
                id:'f9941',name:'spriteFrame',files:['.json'],subMetas:{},userData:{trimType:'custom',trimThreshold:1,
                    rotated:false,offsetX:0,offsetY:0,trimX:0,trimY:0,width:w,height:h,rawWidth:w,rawHeight:h,
                    borderTop:border,borderBottom:border,borderLeft:border,borderRight:border,packable:true,pixelsToUnit:100,
                    pivotX:.5,pivotY:.5,meshType:0,isUuid:true,imageUuidOrDatabaseUri:uuid+'@6c48a',atlasUuid:'',
                    vertices:{rawPosition:[-w/2,-h/2,0,w/2,-h/2,0,-w/2,h/2,0,w/2,h/2,0],
                        uv:[0,h,w,h,0,0,w,0],nuv:[0,0,1,0,0,1,1,1],
                        minPos:[-w/2,-h/2,0],maxPos:[w/2,h/2,0],indexes:[0,1,2,2,1,3]}}}},
        userData:{type:'sprite-frame',fixAlphaTransparencyArtifacts:false,hasAlpha:true,redirect:uuid+'@6c48a'}});
    return {width:w,height:h,alphaBounds:b,uuid};
}
export async function importEntry(entry) {
    const source=entry.sourcePath??`${production}/sources/${entry.source??entry.name}.png`;
    assert.ok(fs.existsSync(source),`Missing generated source ${source}`);
    const meta=await sharp(source).metadata();
    assert.ok(meta.hasAlpha || entry.transparent===false,`${source}: generator did not output alpha`);
    let input=sharp(entry.deriveFrom ? `assets/generated/${entry.deriveFrom}.png` : source);
    if(entry.crop) input=input.extract(entry.crop);
    const raw=await input.ensureAlpha().raw().toBuffer({resolveWithObject:true});
    // Generated transparency can contain very faint colored matte specks.
    // Remove only near-transparent alpha, preserving every opaque RGB pixel.
    const alphaFloor=entry.alphaFloor??32;
    for(let i=3;i<raw.data.length;i+=4) if(raw.data[i]<alphaFloor)raw.data[i]=0;
    const b=bounds(raw.data,raw.info,entry.alphaThreshold??8);
    if(entry.transparent!==false)assert.ok(b.transparent>raw.info.width*raw.info.height*.02,`${source}: no clear background`);
    const inset=entry.inset??4;
    const target={width:entry.width,height:entry.height};
    // Original generated pixels only; retain aspect ratio and transparent margins.
    let processed;
    if(entry.keepFullCanvas) {
        processed=await sharp(raw.data,{raw:raw.info}).resize(target.width,target.height,{fit:'fill'}).png().toBuffer();
    } else {
        const figure=sharp(raw.data,{raw:raw.info}).extract({left:b.left,top:b.top,width:b.width,height:b.height});
        const availableHeight=Math.min(target.height-inset*2,entry.maxVisualHeight??Infinity,
            entry.footpoint ? entry.footpoint.y-inset : Infinity);
        const crop=await (entry.figureHeight ? figure.resize({height:entry.figureHeight,kernel:'lanczos3'})
            : figure.resize(target.width-inset*2,Math.floor(availableHeight),{fit:entry.resizeFit??'inside',kernel:'lanczos3'})).png().toBuffer();
        const size=await sharp(crop).metadata();
        let left=Math.floor((target.width-size.width)/2);
        if(entry.footpoint && entry.figureHeight) {
            let sx=0,count=0;
            for(let y=Math.max(b.top,b.top+b.height-7);y<b.top+b.height;y++)
                for(let x=b.left;x<b.left+b.width;x++) if(raw.data[(y*raw.info.width+x)*4+3]>64) {sx+=x;count++;}
            const footX=count?sx/count:b.left+b.width/2;
            left=Math.round(entry.footpoint.x-(footX-b.left)*size.width/b.width);
        }
        const top=entry.footpoint?entry.footpoint.y-size.height:entry.align==='bottom'?target.height-inset-size.height:Math.floor((target.height-size.height)/2);
        assert.ok(left>=0 && left+size.width<=target.width && top>=0 && top+size.height<=target.height,`${entry.name}: frame crosses canvas`);
        processed=await sharp(crop).extend({left,right:target.width-left-size.width,top,bottom:target.height-top-size.height,
            background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
    }
    const finalPixels=await sharp(processed).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    for(let i=3;i<finalPixels.data.length;i+=4) if(finalPixels.data[i]<alphaFloor)finalPixels.data[i]=0;
    processed=await sharp(finalPixels.data,{raw:finalPixels.info}).png().toBuffer();
    directoryMeta('assets/generated','generated_art_v4');
    const output=`assets/generated/${entry.name}.png`;
    fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,processed);
    const runtime=`${entry.bundle??bundle}/${entry.runtime}`;
    fs.mkdirSync(path.dirname(runtime),{recursive:true});fs.writeFileSync(runtime,processed);
    const imported=await imageMeta(runtime,path.basename(runtime,'.png'),entry.nineSliceBorder??0);
    await imageMeta(output,path.basename(output,'.png'),entry.nineSliceBorder??0);
    const prompt=entry.prompt??`${production}/prompts/${entry.source??entry.name}.md`;
    assert.ok(fs.existsSync(prompt),`Missing real prompt ${prompt}`);
    return {...entry,alphaFloor,source,prompt,sourceSha256:hash(source),sourceSize:{width:meta.width,height:meta.height},
        sourceHasAlpha:meta.hasAlpha,output,runtime,sha256:hash(output),...imported,
        method:'builtin_image_gen_then_mechanical_crop_resize_registration',status:'runtime_trial_unapproved'};
}
if(process.argv[1] && path.resolve(process.argv[1])===path.resolve(import.meta.filename)) {
    const plan=read(`${production}/import_plan.json`);
    const existing=fs.existsSync(`${production}/production_manifest.json`)?read(`${production}/production_manifest.json`):
        {batchId:plan.batchId??path.basename(production),sourceType:'codex_builtin_image_gen',styleId:plan.styleId??'cozy_handdrawn_ai_v4',assets:[]};
    for(const entry of plan.assets) {
        if(process.argv[2] && entry.stage!==process.argv[2])continue;
        const result=await importEntry(entry);
        const index=existing.assets.findIndex(a=>a.name===entry.name);
        if(index<0)existing.assets.push(result);else existing.assets[index]=result;
        write(`${production}/production_manifest.json`,existing);
        console.log(JSON.stringify({asset:entry.name,size:[result.width,result.height],transparent:result.alphaBounds.transparent}));
    }
}

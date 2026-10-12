import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, readdir, stat, writeFile, mkdir, unlink, rmdir} from 'node:fs/promises';
import {dirname, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditActiveAssets} from './wechat_active_assets.mjs';

const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const buildRoot=join(projectRoot,'build','wechatgame');
const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
const slash=path=>path.replaceAll('\\','/');
const expected=await readJson(join(projectRoot,'tools/wechat-preview.build.json'));
const audit=await auditActiveAssets(projectRoot);
const appid=expected.packages?.wechatgame?.appid;
assert.match(appid,/^wx[0-9a-f]{16}$/);
const projectPath=join(buildRoot,'project.config.json');
const project=await readJson(projectPath);
assert.equal(project.compileType,'game');
assert.equal(project.appid,appid,'The configured AppID must actually reach the build.');
const settingsNames=(await readdir(join(buildRoot,'src'))).filter(name=>/^settings(?:\.[a-f0-9]+)?\.json$/.test(name));
assert.equal(settingsNames.length,1,'Expected one versioned runtime settings file');
const settings=await readJson(join(buildRoot,'src',settingsNames[0]));
assert.equal(settings.assets.server,expected.server);
const activeNames=audit.bundles.map(bundle=>bundle.name).sort();
assert.deepEqual([...settings.assets.remoteBundles].sort(),activeNames);
for(const bundle of audit.excludedBundles) {
 assert.ok(!settings.assets.projectBundles.includes(bundle.name),`${bundle.name} was not excluded.`);
}
const game=await readJson(join(buildRoot,'game.json'));
assert.equal(game.deviceOrientation,'portrait');
const omittedNames=new Set(audit.excludedBundles.map(bundle=>bundle.name));
const removedStubs=[];
// Creator's WeChat plugin emits an empty script stub for historical folders
// marked as subpackages, even when their bundle output is disabled.
for(const item of game.subpackages??[]) {
 assert.ok(omittedNames.has(item.name),`Unexpected local subpackage: ${item.name}`);
 assert.equal(item.root,`subpackages/${item.name}/`);
 const root=resolve(buildRoot,item.root);
 assert.ok(root.startsWith(buildRoot+sep),'Cleanup path must stay in this build.');
 const entries=await readdir(root,{withFileTypes:true});
 assert.equal(entries.length,1,'Only an empty generated script stub may be removed.');
 assert.ok(entries[0].isFile()&&entries[0].name==='game.js');
 const file=join(root,'game.js'),script=await readFile(file,'utf8');
 assert.equal(script.trim(),"console.log('ejs: no script in subPackage.')");
 removedStubs.push({name:item.name,bytes:(await stat(file)).size});
 await unlink(file);
 await rmdir(root);
}
game.subpackages=[];
await writeFile(join(buildRoot,'game.json'),JSON.stringify(game,null,2)+'\n');
const subpackageRoot=join(buildRoot,'subpackages');
try {
 assert.equal((await readdir(subpackageRoot)).length,0,'Unexpected subpackage output remains.');
 await rmdir(subpackageRoot);
} catch(error) {if(error.code!=='ENOENT')throw error;}

// Only this local preview disables domain checking; production needs HTTPS.
project.setting??={};
project.setting.urlCheck=false;
project.packOptions??={};
project.packOptions.ignore??=[];
if(!project.packOptions.ignore.some(item=>item.type==='folder'&&item.value.replace(/\/$/,'')==='remote')) {
 project.packOptions.ignore.push({type:'folder',value:'remote'});
}
await writeFile(projectPath,JSON.stringify(project,null,2)+'\n');

async function filesUnder(path) {
 const files=[];
 for(const entry of await readdir(path,{withFileTypes:true})) {
  const child=join(path,entry.name);
  if(entry.isDirectory())files.push(...await filesUnder(child));
  else if(entry.isFile())files.push(child);
 }
 return files;
}
function decodeUuid(value) {
 const [short,suffix]=value.split('@');
 if(short.length!==22)return value;
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
 let hex=short.slice(0,2);
 for(let i=2;i<22;i+=2) {
  const lhs=alphabet.indexOf(short[i]),rhs=alphabet.indexOf(short[i+1]);
  assert.ok(lhs>=0&&rhs>=0,'Invalid compressed UUID');
  hex+=(lhs>>2).toString(16)+(((lhs&3)<<2)|(rhs>>4)).toString(16)+(rhs&15).toString(16);
 }
 const uuid=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
 return uuid+(suffix?`@${suffix}`:'');
}
const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
async function bundleConfig(root) {
 const names=(await readdir(root)).filter(name=>/^config(?:\.[a-f0-9]+)?\.json$/.test(name));
 assert.equal(names.length,1,`Expected one bundle config in ${root}`);
 return readJson(join(root,names[0]));
}
async function importedJson(root,uuid) {
 const directory=join(root,'import',uuid.slice(0,2));
 const names=(await readdir(directory)).filter(name=>name===`${uuid}.json`||name.startsWith(`${uuid}.`)&&name.endsWith('.json'));
 assert.equal(names.length,1,`Expected one import JSON for ${uuid}`);
 return readJson(join(directory,names[0]));
}
const pathBindings=config=>new Map(Object.entries(config.paths).map(([key,value])=>[
 value[0],decodeUuid(/^\d+$/.test(key)?config.uuids[Number(key)]:key)
]));
assert.ok(settings.assets.projectBundles.includes('resources'));
const resources=await bundleConfig(join(buildRoot,'assets/resources'));
const catalogMeta=await readJson(join(projectRoot,'assets/resources/configs/city_catalog.json.meta'));
assert.equal(pathBindings(resources).get('configs/city_catalog'),catalogMeta.uuid);
const catalogImport=await importedJson(join(buildRoot,'assets/resources'),catalogMeta.uuid);
function findCatalog(value) {
 if(!value||typeof value!=='object')return undefined;
 if(value.schemaVersion===1&&value.initialCityId&&Array.isArray(value.cities))return value;
 for(const child of Object.values(value)){const found=findCatalog(child);if(found)return found;}
}
assert.deepEqual(findCatalog(catalogImport),audit.catalog,'The packaged catalog must match the current three chapters.');
assert.equal(settings.launch.launchScene,'db://assets/scenes/bootstrap.scene');
const mainConfig=await bundleConfig(join(buildRoot,'assets/main'));
const bootstrapKey=mainConfig.scenes[settings.launch.launchScene];
const bootstrapUuid=decodeUuid(typeof bootstrapKey==='number'?mainConfig.uuids[bootstrapKey]:bootstrapKey);
assert.equal(bootstrapUuid,(await readJson(join(projectRoot,'assets/scenes/bootstrap.scene.meta'))).uuid);
assert.deepEqual((await readdir(join(buildRoot,'assets'),{withFileTypes:true})).filter(e=>e.isDirectory()).map(e=>e.name).sort(),['internal','main','resources']);
const allFiles=await filesUnder(buildRoot);
let jsonCount=0,mainBytes=0,remoteBytes=0;
for(const file of allFiles) {
 const rel=slash(relative(buildRoot,file)),bytes=(await stat(file)).size;
 if(file.endsWith('.json')){await readJson(file);jsonCount++;}
 if(rel.startsWith('remote/'))remoteBytes+=bytes;
 else mainBytes+=bytes;
 assert.ok(!/(^|\/)(art|temp|tests?|test-results|node_modules)(\/|$)/.test(rel),`Unexpected test/source directory: ${rel}`);
}
assert.ok(mainBytes<=4*1024*1024,`Main package exceeds 4 MiB: ${mainBytes} bytes`);
const remoteDirs=(await readdir(join(buildRoot,'remote'),{withFileTypes:true})).filter(e=>e.isDirectory()).map(e=>e.name).sort();
assert.deepEqual(remoteDirs,activeNames);
const sizes=[];
for(const bundle of audit.bundles) {
 const root=join(buildRoot,'remote',bundle.name),files=await filesUnder(root);
 const config=await bundleConfig(root);
 assert.ok(settings.assets.bundleVers[bundle.name],'Remote bundle must have a version to avoid stale cache.');
 const builtUuids=new Set(config.uuids.map(decodeUuid));
 const bindings=pathBindings(config);
 for(const path of bundle.activePaths) {
  const base=slash(relative(join(projectRoot,bundle.relativeRoot),join(projectRoot,path))).replace(/\.[^.]+$/,'');
  const meta=await readJson(join(projectRoot,`${path}.meta`));
  assert.equal(bindings.get(base),meta.uuid,`${bundle.name}: wrong or missing asset binding: ${base}`);
  if(path.endsWith('.png')) {
   assert.equal(bindings.get(`${base}/spriteFrame`),meta.subMetas.f9941.uuid,`Wrong SpriteFrame binding: ${base}`);
   const nativeDir=join(root,'native',meta.uuid.slice(0,2));
   const nativeNames=(await readdir(nativeDir)).filter(name=>name===`${meta.uuid}.png`||name.startsWith(`${meta.uuid}.`)&&name.endsWith('.png'));
   assert.equal(nativeNames.length,1,`Expected one native PNG for ${meta.uuid}`);
   const native=join(nativeDir,nativeNames[0]);
   assert.equal(await hash(native),await hash(join(projectRoot,path)),`PNG SHA mismatch: ${path}`);
  }
 }
 for(const uuid of bundle.activeUuids)assert.ok(builtUuids.has(uuid),`${bundle.name}: active UUID missing: ${uuid}`);
 for(const uuid of bundle.inactiveUuids)assert.ok(!builtUuids.has(uuid),`${bundle.name}: inactive UUID still packed: ${uuid}`);
 assert.ok(!files.some(file=>file.endsWith('.js')),`${bundle.name}: scripts must stay in the local package.`);
 const images=files.filter(file=>file.endsWith('.png'));
 const sourceImages=bundle.activePaths.filter(path=>path.endsWith('.png'));
 assert.equal(images.length,sourceImages.length,'Unexpected or missing native PNGs');
 let bytes=0;for(const file of files)bytes+=(await stat(file)).size;
 sizes.push({name:bundle.name,bytes,files:files.length,pngFiles:images.length,
  requiredSourceFiles:bundle.activePaths.length,requiredPngs:sourceImages.length,
  excludedSourceFiles:bundle.inactivePaths.length,excludedSourceBytes:bundle.inactiveBytes,
  activePathsAndUuidsVerified:true,inactiveUuidsAbsent:true,sourcePngSha256Verified:true});
}
const mainScriptName=(await readdir(join(buildRoot,'assets/main'))).find(name=>/^index(?:\.[a-f0-9]+)?\.js$/.test(name));
const mainScript=await readFile(join(buildRoot,'assets/main',mainScriptName),'utf8');
assert.ok(mainScript.includes('MapBrowserDemo.ts')&&mainScript.includes('ui_journal_panel_v17'),'Latest journal UI missing from the game script.');
const report={timestamp:new Date().toISOString(),projectRoot:slash(projectRoot),importDirectory:slash(buildRoot),
 appid,server:expected.server,mainBytes,remoteBytes,totalOutputBytes:mainBytes+remoteBytes,
 parsedJsonFiles:jsonCount,outputFiles:allFiles.length,subpackages:[],remoteBundles:sizes,
 catalogAndBootstrapVerified:true,
 versionedRemoteBundles:true,
 excludedSourceBytes:audit.totals.inactiveBytes+audit.totals.excludedBundleBytes,
 excludedSourceFiles:audit.totals.inactiveFiles+audit.totals.excludedBundleFiles,
 noTestDirectoriesInOutput:true,devtoolsVerification:'pending',phoneVerification:'not_run',
 productionUploadReady:false};
const review=join(projectRoot,'art/review/wechat_v17');
await mkdir(review,{recursive:true});
if(removedStubs.length)await writeFile(join(review,'output_cleanup_report.json'),JSON.stringify({removedStubs},null,2)+'\n');
await writeFile(join(review,'build_report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));

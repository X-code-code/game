import fs from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditActiveAssets} from './wechat_active_assets.mjs';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const path=join(project,'tools/wechat-preview.build.json');
const config=JSON.parse(fs.readFileSync(path));
const audit=await auditActiveAssets(project);
const street=audit.bundles.find(b=>b.cityId==='living_city_street_block_01');
if(audit.bundles.length!==3 || street?.counts.targets!==12 || street?.counts.reveals!==4) {
 throw new Error('Build must preserve the three current chapters and relaxed first chapter.');
}
config.mainBundleCompressionType='merge_dep';
config.md5Cache=true;
config.server='http://127.0.0.1:8790/';
// Regular project builds resolve remote/compression from the directory's
// bundleConfigID. The per-task output/filter options select the assets.
const settingsPath=join(project,'settings/v2/packages/builder.json');
const settings=JSON.parse(fs.readFileSync(settingsPath));
settings.bundleConfig??={};
settings.bundleConfig.custom??={};
settings.bundleConfig.custom.wechat_city_remote={
 displayName:'WeChat local preview remote city',
 configs:{
  native:{preferredOptions:{isRemote:false,compressionType:'merge_dep'}},
  web:{preferredOptions:{isRemote:false,compressionType:'merge_dep'}},
  miniGame:{fallbackOptions:{isRemote:false,compressionType:'merge_dep'},configMode:'overwrite',
   overwriteSettings:{wechatgame:{isRemote:true,compressionType:'merge_all_json'}}}
 }
};
fs.writeFileSync(settingsPath,JSON.stringify(settings,null,2)+'\n');
for(const bundle of audit.bundles) {
 const metaPath=join(project,`${bundle.relativeRoot}.meta`);
 const meta=JSON.parse(fs.readFileSync(metaPath));
 meta.userData.bundleConfigID='wechat_city_remote';
 fs.writeFileSync(metaPath,JSON.stringify(meta,null,2)+'\n');
}
config.bundleConfigs=[{root:'db://assets/resources',name:'resources',output:true,isRemote:false,
 compressionType:'merge_dep',priority:8},...audit.excludedBundles.map(bundle=>({
 root:`db://${bundle.relativeRoot}`,name:bundle.name,output:false,isRemote:false,
 compressionType:'merge_dep',priority:bundle.priority
})),...audit.bundles.map(bundle=>({
 root:`db://${bundle.relativeRoot}`,name:bundle.name,output:true,isRemote:true,
 compressionType:'merge_all_json',priority:bundle.priority,
 ...(bundle.inactiveUuids.length?{bundleFilterConfig:[{
  range:'exclude',type:'asset',assets:bundle.inactiveUuids
 }]}:{})
}))];
fs.writeFileSync(path,JSON.stringify(config,null,2)+'\n');
const review=join(project,'art/review/wechat_v17');
fs.mkdirSync(review,{recursive:true});
fs.writeFileSync(join(review,'asset_filter_report.json'),JSON.stringify(audit,null,2)+'\n');
console.log(JSON.stringify({activeBytes:audit.totals.activeBytes,
 excludedBytes:audit.totals.inactiveBytes+audit.totals.excludedBundleBytes,
 excludedFiles:audit.totals.inactiveFiles+audit.totals.excludedBundleFiles},null,2));

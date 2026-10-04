import {pixels,bounds} from './import_generated_art.mjs';
for(const file of process.argv.slice(2)) {
  const {data,info}=await pixels(file);
  const histogram=Array(8).fill(0);
  for(let i=3;i<data.length;i+=4)histogram[Math.min(7,Math.floor(data[i]/32))]++;
  console.log(JSON.stringify({file,width:info.width,height:info.height,alphaHistogram32:histogram,bounds:bounds(data,info,32),corners:[data[3],data[(info.width-1)*4+3],data[((info.height-1)*info.width)*4+3],data[data.length-1]]}));
}

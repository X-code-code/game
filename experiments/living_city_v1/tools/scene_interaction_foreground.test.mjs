import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('C:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript');
class Vec3{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}}
class Rect{constructor(x,y,width,height){Object.assign(this,{x,y,width,height});}}
class Size{constructor(width,height){Object.assign(this,{width,height});}}
class UITransform{setContentSize(width,height){this.contentSize={width,height};}convertToNodeSpaceAR(p){return new Vec3(p.x-this.node.position.x,p.y-this.node.position.y);}}
class Sprite{static SizeMode={CUSTOM:1};}
class SpriteFrame{reset(value){Object.assign(this,value);}destroy(){this.destroyed=true;}}
class Node{static EventType={NODE_DESTROYED:'destroyed'};constructor(name){this.name=name;this.isValid=true;this.active=true;this.parts=new Map();this.events=new Map();}setPosition(x,y){this.position={x,y};}setScale(x,y,z){this.scale={x,y,z};}setRotationFromEuler(x,y,z){this.rotation={x,y,z};}addComponent(Type){const c=new Type();c.node=this;this.parts.set(Type,c);return c;}getComponent(Type){return this.parts.get(Type);}once(id,fn){this.events.set(id,fn);}get activeInHierarchy(){return this.active;}destroy(){this.isValid=false;this.events.get('destroyed')?.();}}
const cc={Node,Rect,Size,Sprite,SpriteFrame,UITransform,Vec3,warn:()=>{},tween:()=>{throw Error('Foreground container must not bounce separately');}};
const output=ts.transpileModule(fs.readFileSync('assets/scripts/interaction/SceneInteraction.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const module={exports:{}};
vm.runInNewContext(output,{module,exports:module.exports,require:name=>name==='cc'?cc:{hiddenObjectMapPosition:c=>({x:c.x,y:c.y}),containsClickArea:(area,x,y)=>Math.abs(x)<=area.width/2&&Math.abs(y)<=area.height/2},Math});
const {SceneInteraction}=module.exports;
function setup(restored){const queue=[],entries=[],bundle={load:(path,_type,done)=>queue.push({path,done})},depth={addActor:(node,foot)=>entries.push({node,foot})};const config={id:'tin',asset:'closed',openAsset:'opened',openForegroundStart:177/256,x:605,y:-411,scale:1,rotation:0,visualSize:{width:80,height:80},depthY:-520.5,clickArea:{shape:'rect',width:80,height:80},initialState:'closed',actions:[{objectId:'tin',state:'opened'}]};const interaction=new SceneInteraction(config,{width:2304,height:2048},bundle,depth,restored);return{interaction,queue,entries,config};}
function frame(){const f=new SpriteFrame();f.reset({texture:{id:'generated_png'},rect:new Rect(0,0,256,256),originalSize:new Size(256,256)});return f;}
test('open rim uses original PNG pixels at the same registration above the contents',()=>{const {interaction:i,queue,entries}=setup('opened'),f=frame();queue.shift().done(null,f);assert.equal(entries.length,2);assert.ok(entries[1].foot()<-521);assert.equal(i.foregroundSprite.spriteFrame.texture,f.texture);assert.deepEqual({...f.rect},{x:0,y:0,width:256,height:256});assert.deepEqual({...i.foregroundSprite.spriteFrame.rect},{x:0,y:177,width:256,height:79});assert.equal(i.foreground.position.y-i.foregroundSprite.node.getComponent(UITransform).contentSize.height/2,-451);assert.equal(i.foreground.active,true);});
test('closed state and stale open loads cannot leave a floating rim',()=>{const {interaction:i,queue}=setup();queue.shift().done(null,frame());assert.equal(i.foreground.active,false);i.setState('opened');const stale=queue.shift();i.setState('closed');queue.shift().done(null,frame());stale.done(null,frame());assert.equal(i.foreground.active,false);assert.equal(i.state,'closed');});
test('opening remains clickable once and its runtime crop is disposed with the container',()=>{const {interaction:i,queue}=setup();queue.shift().done(null,frame());assert.equal(i.activate(605,-411).id,'tin');queue.shift().done(null,frame());assert.equal(i.activate(605,-411),null);const crop=i.foregroundFrame;i.node.destroy();assert.equal(crop.destroyed,true);assert.equal(i.foreground.isValid,false);});

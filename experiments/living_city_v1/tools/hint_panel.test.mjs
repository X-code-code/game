import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { HINT_READY_MESSAGE, requestedHintMessage } from '../assets/scripts/ui/HintCopy.ts';

const require = createRequire(import.meta.url);
const ts = require('C:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript');
class Vec3 { constructor(x=0,y=0,z=0) { Object.assign(this,{x,y,z}); } }
class UITransform {
    setContentSize(width,height) { Object.assign(this,{width,height}); }
    get contentSize() { return {width:this.width,height:this.height}; }
    convertToNodeSpaceAR(point) {
        const position=this.node.worldPosition, scale=this.node.worldScale;
        return new Vec3((point.x-position.x)/scale.x,(point.y-position.y)/scale.y);
    }
}
class Node {
    constructor(name) { Object.assign(this,{name,children:[],components:new Map(),active:true,isValid:true,
        position:new Vec3(),scale:new Vec3(1,1,1)}); }
    addChild(node) { node.parent=this; this.children.push(node); }
    addComponent(Type) { const component=new Type();component.node=this;this.components.set(Type,component);return component; }
    getComponent(Type) { return this.components.get(Type); }
    setPosition(x,y,z=0) { this.position=new Vec3(x,y,z); }
    setScale(x,y,z=1) { this.scale=new Vec3(x,y,z); }
    on() {}
    destroy() { this.isValid=false; }
    get activeInHierarchy() { return this.active&&(!this.parent||this.parent.activeInHierarchy); }
    get worldScale() { const p=this.parent?.worldScale??new Vec3(1,1,1);return new Vec3(p.x*this.scale.x,p.y*this.scale.y,p.z*this.scale.z); }
    get worldPosition() { const p=this.parent?.worldPosition??new Vec3(),s=this.parent?.worldScale??new Vec3(1,1,1);return new Vec3(p.x+this.position.x*s.x,p.y+this.position.y*s.y); }
}
class Label { static HorizontalAlign={CENTER:1};static VerticalAlign={CENTER:1};static Overflow={SHRINK:1}; }
class Button { static EventType={CLICK:'click'}; }
class Sprite { enabled=true; }
class Color {}
const module={exports:{}};
const output=ts.transpileModule(fs.readFileSync('assets/scripts/ui/HintPanel.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015},
}).outputText;
vm.runInNewContext(output,{module,exports:module.exports,require:name=>name==='cc'
    ?{Node,UITransform,Vec3,Label,Button,Sprite,Color}:name==='./HintCopy'
        ?{HINT_READY_MESSAGE,requestedHintMessage}:{generatedUi:node=>node.addComponent(Sprite)}});
const {HintPanel}=module.exports;
function fixture() {
    const parent=new Node('Viewport');parent.addComponent(UITransform).setContentSize(444,960);
    const map=new Node('Map');parent.addChild(map);
    return new HintPanel(parent,map,()=>{},true,true);
}

test('compact no-result feedback is visible temporarily and only its button blocks input',()=>{
    for(const status of ['complete','unavailable']) {
        const panel=fixture();assert.equal(panel.message.node.active,false);
        panel.showResult({status});
        assert.equal(panel.message.node.active,true);
        assert.equal(panel.hasTransientFeedback,true);
        assert.equal(panel.marker.active,false);
        assert.equal(panel.message.string,requestedHintMessage({status}));
        const caption=panel.message.node.worldPosition,button=panel.button.worldPosition;
        assert.equal(panel.blocksInput(caption.x,caption.y),false,'caption permits map taps and gestures underneath');
        assert.equal(panel.blocksInput(button.x,button.y),true,'real hint button retains its UI boundary');
        panel.update(null,1);assert.equal(panel.message.node.active,true);
        panel.update(null,1.5);
        assert.equal(panel.hasTransientFeedback,false);assert.equal(panel.message.node.active,false);
        assert.equal(panel.message.string,HINT_READY_MESSAGE);
    }
});

test('a successful hint replaces temporary feedback and keeps its marker until normal expiry',()=>{
    const panel=fixture();panel.showResult({status:'unavailable'});
    const hint={kind:'interactiveObject',label:'找到种子袋',targetLabel:'花叶',position:{x:120,y:-30},radius:50,remaining:4};
    panel.showResult({status:'shown',hint});
    assert.equal(panel.hasTransientFeedback,false);assert.equal(panel.message.node.active,true);
    assert.equal(panel.marker.active,true);assert.ok(panel.message.string.includes('拨开花叶'));
    assert.equal(panel.marker.position.x,120);
    panel.update({...hint,remaining:3},1);assert.equal(panel.marker.active,true);
    panel.update(null,3);
    assert.equal(panel.marker.active,false);assert.equal(panel.message.node.active,false);
});

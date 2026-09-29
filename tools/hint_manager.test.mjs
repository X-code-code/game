import test from 'node:test';
import assert from 'node:assert/strict';
import { HintManager } from '../assets/scripts/hint/HintManager.ts';
import { HintTargetRegistry } from '../assets/scripts/hint/HintTargetRegistry.ts';
import { TaskManager } from '../assets/scripts/task/TaskManager.ts';

const task = (id, required=true, type='hiddenObject') => ({id:`find_${id}`,label:`找到${id}`,type,targetId:id,required});
const entity = (id, kind='hiddenObject', tags=[]) => ({id,kind,tags,radius:50,
    isAvailable:()=>true,getPosition:()=>({x:120,y:-80})});
function setup(tasks, targets, gate) {
    const manager=new TaskManager(tasks), registry=new HintTargetRegistry();
    targets.forEach(target=>registry.register(target));
    const hints=new HintManager(()=>manager.getTaskStates(),t=>registry.resolve(t),gate);
    return {manager,registry,hints};
}

test('prioritizes unfinished required tasks and never discovers or completes a target',()=>{
    const {manager,hints}=setup([task('optional',false),task('main')],[entity('optional'),entity('main')]);
    assert.equal(hints.requestHint().hint.targetId,'main');
    assert.equal(manager.getProgress().requiredCompleted,0);
    manager.handleTargetClicked({type:'hiddenObject',id:'main',tags:[]});
    assert.equal(hints.requestHint().hint.targetId,'optional');
});

test('matches entity types and tags, skipping hidden or unavailable targets',()=>{
    const unavailable={...entity('hidden','chicken',['walking']),isAvailable:()=>false};
    const {hints}=setup([{id:'walk',type:'chickenTag',targetTag:'walking',label:'走路的小鸡',required:true}],
        [entity('prop','hiddenObject',['walking']),unavailable,entity('walker','chicken',['walking'])]);
    assert.equal(hints.requestHint().hint.targetId,'walker');
});

test('reads the live position on request and each update; invalid or vanished targets clear the hint',()=>{
    let position={x:40,y:20}, available=true;
    const {hints}=setup([task('moving',true,'chickenId')],[{...entity('moving','chicken'),
        isAvailable:()=>available,getPosition:()=>position}]);
    position={x:320,y:90};
    assert.deepEqual(hints.requestHint().hint.position,position);
    position={x:405,y:95}; hints.update(0.1);
    assert.deepEqual(hints.active.position,position);
    hints.active.position.x=-900;
    assert.equal(hints.active.position.x,405,'Snapshots must not mutate state');
    position={x:NaN,y:10}; hints.update(0.1); assert.equal(hints.active,null);
    position={x:0,y:0}; hints.requestHint();available=false;hints.update(0.1);
    assert.equal(hints.active,null);
});

test('expiry, task completion and repeated requests have bounded marker lifetime',()=>{
    const {manager,hints}=setup([task('a')],[entity('a')]);
    hints.requestHint(); hints.update(3.5); assert.ok(hints.active);
    hints.requestHint(); assert.equal(hints.active.remaining,4);
    hints.update(-10); assert.equal(hints.active.remaining,4);
    hints.update(4); assert.equal(hints.active,null);
    hints.requestHint();manager.handleTargetClicked({type:'hiddenObject',id:'a',tags:[]});hints.update(0);
    assert.equal(hints.active,null);
    assert.equal(hints.requestHint().status,'complete');
});

test('distinguishes no remaining tasks from temporarily unavailable or unregistered entities',()=>{
    assert.equal(setup([],[]).hints.requestHint().status,'complete');
    assert.equal(setup([task('missing')],[]).hints.requestHint().status,'unavailable');
});

test('a hidden target can resolve to its registered interactive prerequisite without revealing it',()=>{
    let revealed=false;
    const hidden={...entity('key'),prerequisiteId:'cabinet',isAvailable:()=>revealed};
    const {hints,registry}=setup([task('key')],[hidden,entity('cabinet','interactiveObject')]);
    assert.equal(hints.requestHint().hint.kind,'interactiveObject');
    assert.equal(hints.active.targetId,'cabinet');
    revealed=true;
    assert.equal(hints.requestHint().hint.targetId,'key');
    registry.clear();assert.equal(hints.requestHint().status,'unavailable');
    registry.register(hidden);assert.throws(()=>registry.register(hidden),/Duplicate hint target/);
});

test('rewarded hints are optional, reject duplicate requests, and reselect after reward completion',async()=>{
    assert.equal((await setup([],[]).hints.requestRewardedHint()).status,'unsupported');
    let resolve;
    const {manager,hints}=setup([task('a'),task('b')],[entity('a'),entity('b')],
        {requestReward:()=>new Promise(r=>{resolve=r;})});
    const pending=hints.requestRewardedHint();
    assert.equal((await hints.requestRewardedHint()).status,'busy');
    manager.handleTargetClicked({type:'hiddenObject',id:'a',tags:[]});resolve(true);
    assert.equal((await pending).hint.targetId,'b');
});

test('cancelled, failed or late rewards never grant a hint in a disposed city',async()=>{
    const cancelled=setup([task('a')],[entity('a')],{requestReward:async()=>false}).hints;
    assert.equal((await cancelled.requestRewardedHint()).status,'cancelled');assert.equal(cancelled.active,null);
    const failed=setup([task('a')],[entity('a')],{requestReward:async()=>{throw Error('offline');}}).hints;
    assert.equal((await failed.requestRewardedHint()).status,'unavailable');
    let resolve;
    const disposed=setup([task('a')],[entity('a')],{requestReward:()=>new Promise(r=>{resolve=r;})}).hints;
    const pending=disposed.requestRewardedHint();disposed.dispose();disposed.dispose();resolve(true);
    assert.equal((await pending).status,'disposed');assert.equal(disposed.active,null);
    assert.equal(disposed.requestHint().status,'disposed');
});

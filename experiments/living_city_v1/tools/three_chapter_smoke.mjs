import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

// Real Cocos input, sprites and persistence in an isolated disposable browser.
const root = path.resolve('build/web-mobile');
const chapterOneOnly = process.argv.includes('--chapter-one-only');
const rimsOnly = process.argv.includes('--rims-only');
const surfacesOnly = process.argv.includes('--surfaces-only');
const surfaceBaseline = process.argv.includes('--surface-baseline');
const reviewBatch = process.env.LIVING_CITY_REVIEW_BATCH ?? 'ai_image_v9';
assert.match(reviewBatch, /^ai_image_v\d+$/, 'Invalid review batch');
const reviewBase = `art/review/${reviewBatch}`;
const out = path.resolve(process.env.LIVING_CITY_REVIEW_DIR ?? (chapterOneOnly
    ? `${reviewBase}/chapter_1_followup` : `${reviewBase}/three_chapters`));
const expectedFirstBlueprint = JSON.parse(fs.readFileSync(path.resolve('design/street_block_01.json'), 'utf8'));
const previousVersionPath = path.resolve(process.env.LIVING_CITY_PREVIOUS_REPORT ??
    'art/review/ai_image_v9/baseline_v8/runtime_report.json');
const previousVersionBytes = fs.existsSync(previousVersionPath) ? fs.readFileSync(previousVersionPath) : null;
const previousVersion = previousVersionBytes ? JSON.parse(previousVersionBytes) : null;
const previousReviewBatch = /baseline_v8/.test(previousVersionPath) ? 'ai_image_v8' : previousVersionPath.match(/ai_image_v\d+/)?.[0] ?? 'previous';
const previousFirstChapter = previousVersion?.chapters?.[0];
const oldResidents = new Set(previousFirstChapter?.authoredResidents?.map(actor=>actor.id) ?? []);
const oldSceneSlots = new Set(previousFirstChapter?.sceneLoaded?.map(id=>id.replace(/_art$/,'')) ?? []);
const expectedNewResidentIds = expectedFirstBlueprint.npcPlans.filter(actor=>!oldResidents.has(actor.id)).map(actor=>actor.id);
const expectedNewBuildingIds = expectedFirstBlueprint.artSlots.filter(slot=>
    slot.layer==='building_back'&&!oldSceneSlots.has(slot.id)).map(slot=>slot.id);
const renewedResidentIds = expectedFirstBlueprint.npcPlans.filter(actor=>
    actor.generatedSourceBatch === reviewBatch || ['tea_vendor','tea_regular'].includes(actor.id)).map(actor=>actor.id);
const expectedAnimationResidentIds = [...new Set([...expectedNewResidentIds,...renewedResidentIds])];
const tempRoot = path.resolve('temp');
const profile = path.resolve(tempRoot, `edge-refined-${process.pid}`);
assert.ok(profile.startsWith(`${tempRoot}${path.sep}`));
fs.mkdirSync(out, { recursive: true });
const previousReport = path.join(out,'runtime_report.json');
if (fs.existsSync(previousReport)) fs.renameSync(previousReport,path.join(out,`previous_runtime_report_${Date.now()}.json`));
const previousFailure = path.join(out,'failure.json');
if (fs.existsSync(previousFailure)) fs.renameSync(previousFailure,path.join(out,`previous_failure_${Date.now()}.json`));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
    '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm' };
const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/favicon.ico') return response.writeHead(204).end();
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(`${root}${path.sep}`)) return response.writeHead(403).end();
    fs.readFile(file, (error, bytes) => {
        if (error) return response.writeHead(404).end();
        response.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream' }).end(bytes);
    });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const debugPort = 12000 + process.pid % 40000;
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--no-first-run', '--disable-extensions', '--disable-background-networking',
    '--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--window-size=444,960',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [], warnings = [], failedRequests = [];
const residentObservations = new Map();
function observeResidents(current) {
    if (!current.ready) return;
    for(const actor of current.npcs) {
        const key=`${current.cityId}/${actor.id}`;
        let proof=residentObservations.get(key);
        if(!proof)residentObservations.set(key,proof={actorId:actor.id,clips:new Map(),samples:0,
            minX:actor.x,maxX:actor.x,minY:actor.y,maxY:actor.y,activities:new Set()});
        proof.samples++;proof.minX=Math.min(proof.minX,actor.x);proof.maxX=Math.max(proof.maxX,actor.x);
        proof.minY=Math.min(proof.minY,actor.y);proof.maxY=Math.max(proof.maxY,actor.y);
        if(actor.celClip&&actor.celSprite?.loaded&&actor.celSprite.active) {
            assert.equal(actor.celSprite.uuid,actor.loadedClipFrames?.[actor.celClip]?.[actor.celFrame],
                `${actor.id}: displayed PNG does not match the current animation clip/frame`);
            if(!proof.clips.has(actor.celClip))proof.clips.set(actor.celClip,new Set());
            proof.clips.get(actor.celClip).add(actor.celSprite.uuid);
            if(!actor.moving&&actor.idlePose?.supported&&actor.idlePose.visualAction!=='idle')
                proof.activities.add(actor.idlePose.visualAction);
            for(const event of current.events??[])if(event.seconds!==null&&event.actorBeats?.some(beat=>
                beat.npcId===actor.id&&beat.clip==='receive_w'&&actor.celClip===beat.clip&&
                event.seconds>=beat.atSeconds&&event.seconds<beat.atSeconds+beat.durationSeconds))
                proof.activities.add(event.id);
        }
    }
}
let socket;
let failureCapture;
const reports = { startedAt:new Date().toISOString(),scope:chapterOneOnly?'chapter_1_followup':'full_three_chapter',
    expectedFirstChapter:{map:expectedFirstBlueprint.map,layers:expectedFirstBlueprint.artSlots.length,
        residents:expectedFirstBlueprint.npcPlans.length,newResidentIds:expectedNewResidentIds,
        newBuildingIds:expectedNewBuildingIds,
        vendorFoot:expectedFirstBlueprint.npcPlans.find(n=>n.id==='tea_vendor')?.route[0],
        teaCupAt:expectedFirstBlueprint.sceneEvents.find(e=>e.id==='tea_exchange')?.prop?.at} };
if(previousVersionBytes)reports.previousVersionBaseline={
    path:path.relative(process.cwd(),previousVersionPath).replaceAll('\\','/'),
    sha256:createHash('sha256').update(previousVersionBytes).digest('hex'),status:previousVersion.status,
    firstChapter:{layers:previousFirstChapter.layers,residents:previousFirstChapter.residents,
        targets:previousFirstChapter.targets,reveals:previousFirstChapter.revealCount}};
if (chapterOneOnly) {
    const baselinePath = path.resolve(process.env.LIVING_CITY_THREE_CHAPTER_BASELINE ??
        (fs.existsSync(`${reviewBase}/three_chapters/runtime_report.json`)
        ? `${reviewBase}/three_chapters/runtime_report.json` : 'art/review/ai_image_v7/three_chapters/runtime_report.json'));
    const baselineBytes = fs.readFileSync(baselinePath);
    const baseline = JSON.parse(baselineBytes);
    assert.equal(baseline.status,'passed','First-chapter follow-up requires a passing three-chapter baseline');
    assert.equal(baseline.chapters.length,3);
    reports.unchangedChapterBaseline = { path:path.relative(process.cwd(),baselinePath).replaceAll('\\','/'),
        sha256:createHash('sha256').update(baselineBytes).digest('hex'),status:baseline.status,
        chapters:baseline.chapters.length,uniqueTargets:baseline.totalUniqueCollected,reveals:baseline.totalReveals };
}
try {
    let tab;
    for (let i = 0; i < 60 && !tab; i++) {
        try {
            const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`,
                { signal: AbortSignal.timeout(1000) })).json();
            tab = tabs.find(item => item.type === 'page');
        } catch {}
        if (!tab) await wait(250);
    }
    assert.ok(tab, 'Edge debugging endpoint did not start');
    socket = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let nextId = 1;
    const pending = new Map();
    let screencastFrames = null;
    socket.onmessage = ({ data }) => {
        const message = JSON.parse(data);
        if (message.id && pending.has(message.id)) {
            pending.get(message.id)(message); pending.delete(message.id);
        } else if (message.method === 'Page.screencastFrame') {
            if(screencastFrames)screencastFrames.push(message.params);
            send('Page.screencastFrameAck',{sessionId:message.params.sessionId}).catch(()=>{});
        } else if (message.method === 'Runtime.exceptionThrown') {
            errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
        } else if (message.method === 'Runtime.consoleAPICalled') {
            const value = message.params.args.map(arg => arg.value ?? arg.description).join(' ');
            if (message.params.type === 'error') errors.push(value);
            if (['warn', 'warning'].includes(message.params.type)) warnings.push(value);
        } else if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
            failedRequests.push(`${message.params.response.status} ${message.params.response.url}`);
        } else if (message.method === 'Network.loadingFailed') failedRequests.push(message.params.errorText);
    };
    function send(method, params = {}) {
        const id = nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} timed out`)); }, 15000);
            pending.set(id, reply => { clearTimeout(timer); reply.error ? reject(new Error(JSON.stringify(reply.error))) : resolve(reply.result); });
            socket.send(JSON.stringify({ id, method, params }));
        });
    }
    async function evaluate(expression) {
        const reply = await send('Runtime.evaluate', { expression, returnByValue: true });
        if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text);
        return reply.result.value;
    }
    async function screenshot(name) {
        const response = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(out, name), Buffer.from(response.data, 'base64'));
    }
    failureCapture=screenshot;
    const context = `const canvas=cc.director.getScene().getChildByName('Canvas');
        const manager=canvas.getComponent('CityManager'),city=manager.current,view=city.view;
        const map=city.root.getChildByName('TestMap'),box=view.livingGreybox;
        const camera=canvas.getChildByName('Camera').getComponent(cc.Camera);
        const search=(node,name)=>node.name===name?node:node.children.map(child=>search(child,name)).find(Boolean);
        const screen=node=>{const p=camera.worldToScreen(node.worldPosition);return {x:p.x,y:innerHeight-p.y};};
        const screenBounds=node=>{const transform=node?.getComponent('cc.UITransform');if(!transform)return null;
            const rect=transform.getBoundingBoxToWorld(),a=camera.worldToScreen(new cc.Vec3(rect.x,rect.y,0)),
                b=camera.worldToScreen(new cc.Vec3(rect.x+rect.width,rect.y+rect.height,0));
            return {left:Math.min(a.x,b.x),right:Math.max(a.x,b.x),top:innerHeight-Math.max(a.y,b.y),bottom:innerHeight-Math.min(a.y,b.y)};};
        const count=(node,p)=>Number(p(node))+node.children.reduce((n,c)=>n+count(c,p),0);
        const matching=(node,p)=>[...(p(node)?[node.name]:[]),...node.children.flatMap(c=>matching(c,p))];
        const spriteInfo=sprite=>{const frame=sprite?.spriteFrame;return frame?{
            uuid:frame.uuid??frame._uuid,size:{width:frame.originalSize.width,height:frame.originalSize.height},
            color:{r:sprite.color.r,g:sprite.color.g,b:sprite.color.b,a:sprite.color.a}}:null;};`;
    async function state() {
        const current=await evaluate(`(() => {
            if(typeof cc==='undefined'||cc.director.getScene()?.name!=='city')return {ready:false};
            ${context}
            if(!box?.blueprint)return {ready:false};
            const config=city.content.config,fit=view.controller.viewport.fitScale;
            const loadedScene=matching(map,n=>/^lc(?:[0-9]+)?_/.test(n.name)&&n.name.endsWith('_art')&&!!n.getComponent(cc.Sprite)?.spriteFrame);
            const sceneArt=box.blueprint.artSlots.map(slot=>{const n=search(map,slot.id+'_art');return {
                id:slot.id,layer:slot.layer,loaded:!!n?.getComponent(cc.Sprite)?.spriteFrame,active:!!n?.activeInHierarchy,
                screen:n?screen(n):null,center:slot.center,size:slot.size,textureScale:slot.textureScale??1,
                sprite:spriteInfo(n?.getComponent(cc.Sprite))};});
            return {ready:true,viewport:{width:innerWidth,height:innerHeight},
                cityId:config.cityId,mapSize:config.mapSize,blueprintMap:box.blueprint.map,
                expectedLayers:box.blueprint.artSlots.length,
                expectedTargets:config.hiddenObjects.length,expectedReveals:config.interactiveObjects.length,
                expectedResidents:box.blueprint.npcPlans.length,
                expectedBuildings:box.blueprint.artSlots.filter(slot=>slot.layer==='building_back').length,
                camera:{initialZoom:config.view.initialZoom??box.blueprint.camera.initialZoom??config.view.minZoom,
                    minZoom:config.view.minZoom,maxZoom:config.view.maxZoom,relativeZoom:map.scale.x/fit,
                    initialFocus:box.blueprint.camera.initialFocus,detailFocus:box.blueprint.camera.detailPreviewFocus??{x:-390,y:500}},
                progress:view.progress,snapshot:view.getProgressSnapshot(),
                saved:JSON.parse(localStorage.getItem('chriken_living_city_v1_save_v1'))?.cities?.[city.content.config.cityId],
                map:{x:map.position.x,y:map.position.y,scale:map.scale.x},
                sceneLayers:loadedScene.length,sceneLoaded:loadedScene,
                sceneArt,lifeGroups:(box.blueprint.lifeGroups??[]).map(group=>({id:group.id,at:group.at,
                    artSlotIds:group.artSlotIds,loadedArtSlotIds:group.artSlotIds.filter(id=>sceneArt.find(a=>a.id===id)?.loaded)})),
                discoveryPoints:box.blueprint.sceneDiscoveries??[],requests:box.blueprint.residentRequests??[],
                sceneDiscoveryIds:Array.from(view.sceneDiscoveryIds??[]),
                sceneClue:{visible:!!box.clueBubble?.activeInHierarchy,message:box.clueText?.string??'',bounds:screenBounds(box.clueBubble)},
                trayBounds:view.taskPanel?.activeInHierarchy?screenBounds(view.taskPanel):null,
                ground:box.artGroundLoaded,messengerCels:box.npcs.find(n=>n.plan.id==='messenger_customer')?.cels?.isReady,
                npcClues:box.blueprint.npcClues??{},
                npcs:box.npcs.map(n=>({id:n.plan.id,x:n.node.position.x,y:n.node.position.y,
                    screen:screen(n.node),active:n.node.activeInHierarchy,moving:n.moving,
                    eventReserved:box.eventDirector?.isParticipant(n.plan.id)??false,
                    role:n.plan.role,idlePose:n.idle?.pose,actorHeight:n.plan.actorHeight,
                    celsReady:!!n.cels?.isReady,proceduralBody:!!n.node.getComponent(cc.Graphics)?.enabled,
                    celClip:n.cels?.currentClip,celFrame:n.cels?.frameIndex,
                    celSprite:n.cels?.sprite?.spriteFrame?{uuid:n.cels.sprite.spriteFrame.uuid??n.cels.sprite.spriteFrame._uuid,
                        loaded:true,active:n.cels.visual?.activeInHierarchy}:null,
                    celManifest:n.cels?.manifest?{schemaVersion:n.cels.manifest.schemaVersion,loopingClips:n.cels.manifest.loopingClips,
                        actorId:n.cels.manifest.actorId,canvasPx:n.cels.manifest.canvasPx,
                        footpointPx:n.cels.manifest.footpointPx,paintedHeightPx:n.cels.manifest.paintedHeightPx,
                        clips:n.cels.manifest.clips}:null,
                    loadedClipFrames:n.cels?.clips?Object.fromEntries(Object.entries(n.cels.clips).map(([clip,frames])=>
                        [clip,frames.map(frame=>frame.frame.uuid??frame.frame._uuid)])):null})),eventCompleted:box.eventCompleted,
                authoredResidents:box.blueprint.npcPlans.map(n=>({id:n.id,routeStart:n.route[0],actorHeight:n.actorHeight,
                    route:n.route,initialPauseSeconds:n.initialPauseSeconds,idleActions:n.idleActions,
                    pauseSecondsAtWaypoints:n.pauseSecondsAtWaypoints,speedWorldUnitsPerSecond:n.speedWorldUnitsPerSecond})),
                events:box.blueprint.sceneEvents.map(e=>({id:e.id,repeat:!!e.repeat,
                    seconds:box.eventDirector?.eventSeconds(e.id)??null,
                    participants:e.participants??[],trigger:e.trigger,tapTriggerNpcId:e.tapTriggerNpcId??null,
                    cooldownSeconds:e.cooldownSeconds,resumeRouteAfterSeconds:e.resumeRouteAfterSeconds,
                    discoveryId:e.discoveryId??null,actorBeats:e.actorBeats??[],
                    propAt:e.prop?.at??null,
                    propActive:box.eventProps.find(p=>p.eventId===e.id)?.node.activeInHierarchy??false})),
                targets:city.content.config.hiddenObjects.map(c=>{const n=search(map,c.id),art=n?.getChildByName('PropArt');
                    return {id:c.id,active:n?.activeInHierarchy,screen:n?screen(n):null,
                        worldX:n?.position.x,worldY:n?.position.y,
                        depthIndex:n?.getSiblingIndex(),
                        loaded:!!art?.getComponent(cc.Sprite)?.spriteFrame,
                        sprite:spriteInfo(art?.getComponent(cc.Sprite)),
                        visualSize:art?.getComponent('cc.UITransform')?.contentSize};}),
                interactions:[...view.interactions].map(([id,i])=>({id,state:i.state,screen:screen(i.node),
                    worldX:i.node.position.x,worldY:i.node.position.y,
                    foreground:i.foreground?{active:i.foreground.activeInHierarchy,
                        loaded:!!i.foregroundSprite?.spriteFrame,index:i.foreground.getSiblingIndex(),baseIndex:i.node.getSiblingIndex(),
                        sameTexture:i.foregroundSprite?.spriteFrame?.texture===i.node.getComponent(cc.Sprite)?.spriteFrame?.texture,
                        rect:i.foregroundSprite?.spriteFrame?.rect,baseRect:i.node.getComponent(cc.Sprite)?.spriteFrame?.rect,
                        size:i.foreground.getComponent('cc.UITransform')?.contentSize,
                        x:i.foreground.position.x,y:i.foreground.position.y,start:i.config.openForegroundStart}:null,
                    loaded:!!i.node.getComponent(cc.Sprite)?.spriteFrame})),
                stickers:[...view.stickerCards].map(([id,c])=>({id,screen:screen(c.node),loaded:!!c.icon.spriteFrame,
                    active:c.node.activeInHierarchy,collected:c.collected,alpha:c.icon.color.a,
                    sprite:spriteInfo(c.icon),iconSize:c.icon.node.getComponent('cc.UITransform')?.contentSize})),
                clue:view.stickerClueLabel?.string,title:view.taskTitleLabel?.string,
                stickerPage:view.stickerPage,stickerPages:Math.ceil(view.stickerCards.size/12),
                missedTapFeedback:!!view.missedTapFeedback?.activeInHierarchy,
                completionText:manager.ui.summary.string,
                completionArtReady:[manager.ui.card,manager.ui.continueButton,manager.ui.nextButton,
                    manager.ui.modal.getChildByName('CompletionDimmer')].every(n=>!!n.getComponent(cc.Sprite)?.spriteFrame),
                flights:view.collectionFlights.size,landing:view.collectionLandingAnimations,completion:manager.ui.isOpen,
                hint:view.hintManager?.active?{id:view.hintManager.active.targetId,kind:view.hintManager.active.kind}:null,
                hintUi:view.hintPanel?{button:screen(view.hintPanel.button),marker:view.hintPanel.marker.activeInHierarchy,
                    markerLoaded:!!view.hintPanel.ring?.spriteFrame,
                    visible:view.hintPanel.root.activeInHierarchy,message:view.hintPanel.message.string}:null,
                proof:window.__lastLandingProof??null};
        })()`);
        observeResidents(current);
        return current;
    }
    async function until(predicate, description, attempts = 120) {
        let current;
        for(let i=0;i<attempts;i++) {current=await state();if(predicate(current))return current;await wait(100);}
        throw new Error(`${description}: ${JSON.stringify({current,errors,warnings,failedRequests})}`);
    }
    async function click(point, settle = 100) {
        const viewport=await evaluate('({width:innerWidth,height:innerHeight})');
        assert.ok(point.x>0&&point.x<viewport.width&&point.y>0&&point.y<viewport.height,JSON.stringify(point));
        await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
        if(settle)await wait(settle);
    }
    async function focus(id) {
        await evaluate(`(()=>{${context}const n=search(map,${JSON.stringify(id)});
            view.controller.focusAt(n.position.x,n.position.y);return true;})()`);
        await wait(100);
        return state();
    }
    async function setZoom(mode) {
        await evaluate(`(()=>{${context}const config=city.content.config;
            const fit=view.controller.viewport.fitScale;
            const current=map.scale.x/fit;
            const wanted=${JSON.stringify(mode)}==='detail'?config.view.maxZoom:
                config.view.initialZoom??box.blueprint.camera.initialZoom??config.view.minZoom;
            view.controller.viewport.zoomAt(wanted/current,0,0);view.controller.applyState();
            const focus=${JSON.stringify(mode)}==='detail'?box.blueprint.camera.detailPreviewFocus??{x:-390,y:500}:
                box.blueprint.camera.initialFocus;
            view.controller.focusAt(focus.x,focus.y);return true;})()`);
    }

    async function realDragTo(focus, requireHorizontal = true) {
        const before = await state();
        let drags = 0, residual;
        for (let step = 0; step < 16; step++) {
            residual = await evaluate(`(()=>{${context}const viewport=view.controller.viewport;
                const horizontal=Math.max(0,(viewport.mapWidth*map.scale.x-viewport.viewportWidth)/2);
                const vertical=Math.max(0,(viewport.mapHeight*map.scale.y-viewport.viewportHeight)/2);
                const desiredX=Math.min(horizontal,Math.max(-horizontal,-(${focus.x})*map.scale.x));
                const desiredY=Math.min(vertical+Math.min(viewport.bottomInset,viewport.viewportHeight),
                    Math.max(-vertical,-(${focus.y})*map.scale.y));
                const currentWorld=map.worldPosition.clone(),desiredWorld=currentWorld.clone();
                desiredWorld.x+=(desiredX-map.position.x)*map.parent.worldScale.x;
                desiredWorld.y+=(desiredY-map.position.y)*map.parent.worldScale.y;
                const from=camera.worldToScreen(currentWorld),to=camera.worldToScreen(desiredWorld);
                return {dx:to.x-from.x,dy:from.y-to.y,desiredX,desiredY};})()`);
            if (Math.hypot(residual.dx,residual.dy) < 2) break;
            const width=before.viewport.width,height=before.viewport.height;
            const dx = Math.max(-width*.34,Math.min(width*.34,residual.dx));
            const dy = Math.max(-height*.145,Math.min(height*.145,residual.dy));
            const start = { x:width/2,y:height*.46 };
            // A final 2-8px correction is below the game's legitimate tap/drag
            // threshold. Move inward first and return to the wanted endpoint,
            // so this remains real drag input even near a clamped map edge.
            const distance=Math.hypot(dx,dy),small=distance<12;
            const excursion=small?{x:-dx/distance*24,y:-dy/distance*24}:null;
            await send('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',clickCount:1});
            for (let move = 1; move <= 8; move++) {
                const offset=small?(move<=3?{x:excursion.x*move/3,y:excursion.y*move/3}:
                    {x:excursion.x+(dx-excursion.x)*(move-3)/5,y:excursion.y+(dy-excursion.y)*(move-3)/5}):
                    {x:dx*move/8,y:dy*move/8};
                await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:start.x+offset.x,y:start.y+offset.y,
                    button:'left',buttons:1});
                await wait(16);
            }
            await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:start.x+dx,y:start.y+dy,button:'left',clickCount:1});
            await wait(120);drags++;
        }
        const after = await state();
        if (requireHorizontal) {
            assert.ok(drags > 0, 'Wide map exploration did not use a drag');
            assert.ok(Math.abs(after.map.x-before.map.x) > 100, 'Real drag did not move the map horizontally');
        }
        assert.ok(Math.hypot(after.map.x-residual.desiredX,after.map.y-residual.desiredY) < 6,
            `Real drag failed to reach the clamped focus: ${JSON.stringify({focus,residual,map:after.map})}`);
        assert.equal(after.progress.requiredCompleted,before.progress.requiredCompleted,'Exploration drag collected a target');
        assert.equal(after.missedTapFeedback,false,`Exploration drag produced a missed-tap message: ${JSON.stringify({focus,drags,residual})}`);
        return { state:after,proof:{requestedFocus:focus,drags,before:before.map,after:after.map,
            clampedDestination:{x:residual.desiredX,y:residual.desiredY}} };
    }

    async function exploreWideChapter(suffix = '') {
        const west = await realDragTo({ x:-760,y:400 });
        const onScreen = point => point && point.x > 10 && point.x < west.state.viewport.width-10 &&
            point.y > 50 && point.y < west.state.viewport.height*.82;
        const westTargets = west.state.targets.filter(t=>t.active&&t.worldX < -west.state.mapSize.width*0.23&&onScreen(t.screen));
        assert.ok(westTargets.length > 0,'West garden contains no visible, available outer-area target');
        await screenshot(`chapter_1_west_garden${suffix}.png`);
        const east = await realDragTo({ x:760,y:-240 });
        const eastTargets = east.state.targets.filter(t=>t.active&&t.worldX > east.state.mapSize.width*0.23&&onScreen(t.screen));
        assert.ok(eastTargets.length > 0,'East courtyard contains no visible, available outer-area target');
        await screenshot(`chapter_1_east_courtyard${suffix}.png`);
        return { west:{...west.proof,visibleOuterTargets:westTargets.map(t=>t.id)},
            east:{...east.proof,visibleOuterTargets:eastTargets.map(t=>t.id)} };
    }

    async function densityScreens() {
        const proof = [];
        for (const [width,height] of [[444,960],[360,780]]) {
            await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
            await wait(200);await setZoom('initial');
            const sides=await exploreWideChapter(width===444?'':`_${width}x${height}`);
            for (const [region,focusPoint] of [['top',{x:-150,y:700}],['middle',{x:0,y:50}],['bottom',{x:-120,y:-730}]]) {
                const moved=await realDragTo(focusPoint,false),current=moved.state;
                const visible=current.sceneArt.filter(a=>a.loaded&&a.active&&a.screen?.x>0&&a.screen.x<width&&
                    a.screen.y>0&&a.screen.y<height*.84);
                await screenshot(`chapter_1_density_${region}_${width}x${height}.png`);
                proof.push({viewport:{width,height},region,pan:moved.proof,visiblePngLayers:visible.map(a=>a.id)});
            }
            const groups=(await state()).lifeGroups;
            for(const group of groups) {
                const moved=await realDragTo(group.at,false),current=moved.state;
                const visible=group.artSlotIds.filter(id=>{const art=current.sceneArt.find(a=>a.id===id);
                    return art?.loaded&&art.active&&art.screen?.x>0&&art.screen.x<width&&art.screen.y>0&&art.screen.y<height*.84;});
                assert.ok(visible.length>0,`${group.id}: no generated PNG is visible at its living-group focus`);
                await screenshot(`chapter_1_life_${group.id}_${width}x${height}.png`);
                proof.push({viewport:{width,height},region:group.id,pan:moved.proof,visibleGroupPngLayers:visible});
            }
            for(const id of expectedNewBuildingIds) {
                const art=(await state()).sceneArt.find(slot=>slot.id===id);
                assert.ok(art?.loaded&&art.active,`${id}: new building PNG is unavailable`);
                const moved=await realDragTo(art.center,false),current=moved.state;
                const shown=current.sceneArt.find(slot=>slot.id===id);
                assert.ok(shown.screen.x>0&&shown.screen.x<width&&shown.screen.y>0&&shown.screen.y<height*.84,
                    `${id}: new building cannot be viewed at its focus`);
                await screenshot(`chapter_1_new_building_${id}_${width}x${height}.png`);
                proof.push({viewport:{width,height},region:id,pan:moved.proof,visibleNewBuilding:true,
                    visibleResidentIds:current.npcs.filter(actor=>actor.active&&actor.celSprite?.loaded&&
                        actor.screen.x>0&&actor.screen.x<width&&actor.screen.y>0&&actor.screen.y<height*.84).map(actor=>actor.id)});
            }
            for(const slot of expectedFirstBlueprint.artSlots.filter(s=>s.generatedSourceBatch===reviewBatch)) {
                await setZoom('detail');
                const moved=await realDragTo(slot.center,false),art=moved.state.sceneArt.find(a=>a.id===slot.id);
                assert.ok(art?.loaded&&art.active,`${slot.id}: renewed fixture PNG unavailable`);
                const file=`chapter_1_polish_${slot.id}_${width}x${height}.png`;
                await screenshot(file);
                proof.push({viewport:{width,height},region:slot.id,pan:moved.proof,fixtureScreenshot:file});
            }
            for(const id of expectedNewResidentIds) {
                let actor=(await state()).npcs.find(npc=>npc.id===id);
                assert.ok(actor?.celsReady&&actor.celSprite?.loaded&&actor.celSprite.active,`${id}: new resident has no displayed PNG`);
                const moved=await realDragTo({x:actor.x,y:actor.y+actor.actorHeight*.4},false),current=moved.state;
                actor=current.npcs.find(npc=>npc.id===id);
                assert.ok(actor.screen.x>0&&actor.screen.x<width&&actor.screen.y>0&&actor.screen.y<height*.84,
                    `${id}: new resident cannot be viewed at its current position`);
                await screenshot(`chapter_1_new_resident_${id}_${width}x${height}.png`);
                proof.push({viewport:{width,height},region:id,pan:moved.proof,
                    actualCel:{clip:actor.celClip,frame:actor.celFrame,uuid:actor.celSprite.uuid}});
            }
            proof.push({viewport:{width,height},region:'sides',...sides});
        }
        await send('Emulation.setDeviceMetricsOverride',{width:444,height:960,deviceScaleFactor:1,mobile:true});
        await wait(150);await setZoom('initial');
        return proof;
    }

    async function swipeTray(direction, quick = false) {
        const current=await state(),active=current.stickers.filter(card=>card.active);
        const anchor=active[Math.min(3,active.length-1)].screen;
        const distance=current.viewport.width*.27*direction;
        await send('Input.dispatchMouseEvent',{type:'mousePressed',...anchor,button:'left',clickCount:1});
        await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:anchor.x+distance,y:anchor.y,button:'left',buttons:1});
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:anchor.x+distance,y:anchor.y,button:'left',clickCount:1});
        if(!quick)await wait(80);
        return state();
    }

    async function verifyTrayPaging(chapter) {
        const initial=await state();
        const viewports=[];
        for(const [width,height] of [[444,960],[360,780]]) {
            await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
            await wait(200);
            const before=await state(),pages=[];
            for(let page=0;page<initial.stickerPages;page++) {
                const current=await state();
                assert.equal(current.stickerPage,page);
                assert.equal(current.stickers.filter(c=>c.active).length,Math.min(12,current.expectedTargets-page*12));
                assert.equal(current.progress.requiredCompleted,before.progress.requiredCompleted,'Tray paging collected a map target');
                assert.equal(current.clue,before.clue,'Tray swipe activated a card clue');
                assert.equal(current.missedTapFeedback,false,'Tray swipe produced a missed-tap message');
                assert.deepEqual(current.map,before.map,'Tray swipe panned the map');
                for(const card of current.stickers.filter(card=>card.active)) {
                    assert.ok(card.sprite&&card.iconSize.width>0&&card.iconSize.height>0,`${card.id}: tray PNG is unavailable`);
                    assert.ok(Math.abs(card.iconSize.width/card.iconSize.height-card.sprite.size.width/card.sprite.size.height)<.001,
                        `${card.id}: tray resized the PNG with the wrong aspect ratio`);
                    const target=current.targets.find(target=>target.id===card.id);
                    assert.equal(card.sprite.uuid,target?.sprite?.uuid,`${card.id}: map and tray display different SpriteFrames`);
                }
                pages.push(current.stickers.filter(c=>c.active).map(c=>({id:c.id,uuid:c.sprite.uuid,
                    pngSize:c.sprite.size,iconSize:c.iconSize})));
                await screenshot(`chapter_${chapter+1}_target_page_${page+1}_${width}x${height}.png`);
                if(page<initial.stickerPages-1)await swipeTray(-1);
            }
            for(let page=initial.stickerPages-1;page>0;page--)await swipeTray(1);
            assert.equal((await state()).stickerPage,0);
            viewports.push({viewport:{width,height},visibleIdsByPage:pages});
        }
        await send('Emulation.setDeviceMetricsOverride',{width:444,height:960,deviceScaleFactor:1,mobile:true});
        await wait(200);
        return {pages:initial.stickerPages,viewports,swipeChecked:initial.stickerPages>1,
            pngAspectPreserved:true,mapAndTrayUseSameSpriteFrames:true};
    }

    function verifyTargetFrames(current) {
        return current.targets.map(target=>{
            const file=`assets/bundles/city_${current.cityId}/targets/${target.id}.png`,meta=JSON.parse(fs.readFileSync(`${file}.meta`,'utf8'));
            const expected=meta.subMetas.f9941;
            assert.equal(target.sprite?.uuid,expected.uuid,`${target.id}: build loaded a stale or different target SpriteFrame`);
            assert.deepEqual(target.sprite.size,{width:expected.userData.rawWidth,height:expected.userData.rawHeight},
                `${target.id}: build loaded stale PNG canvas dimensions`);
            const card=current.stickers.find(card=>card.id===target.id);
            assert.equal(card?.sprite?.uuid,expected.uuid,`${target.id}: tray loaded a stale or different target SpriteFrame`);
            assert.deepEqual(card.sprite.size,target.sprite.size);
            assert.deepEqual(target.sprite.color,{r:255,g:255,b:255,a:255},`${target.id}: map changes the generated target colors`);
            return {id:target.id,expectedSpriteFrameUuid:expected.uuid,displayedMapUuid:target.sprite.uuid,
                displayedTrayUuid:card.sprite.uuid,pngSize:target.sprite.size,runtimePath:file,
                runtimeSha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')};
        });
    }

    async function verifyLegacyCompletionUpgrade() {
        const legacyPath='art/review/ai_image_v5/chapter_1_vendor_adjustment/runtime_report.json';
        const legacy=JSON.parse(fs.readFileSync(legacyPath,'utf8')).savedJourney;
        const first='living_city_street_block_01',second='living_city_garden_market_02';
        const secondConfig=JSON.parse(fs.readFileSync(`assets/bundles/city_${second}/city.json`,'utf8'));
        const secondTarget=secondConfig.hiddenObjects.find(t=>t.targetable);
        const secondTask=secondConfig.tasks.find(t=>t.targetId===secondTarget.id&&t.required);
        const fixture=structuredClone(legacy);
        fixture.currentCityId=first;fixture.completedCityIds=[first];
        fixture.unlockedCityIds=[...new Set([...fixture.unlockedCityIds,second])];
        fixture.cities[second]={completedTaskIds:[secondTask.id],foundHiddenObjectIds:[secondTarget.id],
            discoveredChickenIds:[],interactiveStates:{},sceneDiscoveryIds:[]};
        await evaluate(`(()=>{localStorage.setItem('chriken_living_city_v1_save_v1',${JSON.stringify(JSON.stringify(fixture))});return true;})()`);
        await send('Page.reload');
        let current=await until(s=>s.ready&&s.expectedTargets>12&&s.targets.every(t=>t.loaded)&&s.stickers.every(c=>c.loaded),
            'Expanded first chapter did not load an old completed save');
        const legacyFound=fixture.cities[first].foundHiddenObjectIds;
        assert.equal(current.progress.requiredCompleted,legacyFound.length);
        assert.deepEqual([...current.snapshot.foundHiddenObjectIds].sort(),[...legacyFound].sort(),
            'Upgrade changed the old collected objects');
        assert.ok(current.stickers.filter(card=>legacyFound.includes(card.id)).every(card=>card.collected),
            'Old discoveries did not restore as collected stickers');
        assert.ok(current.stickers.filter(card=>!legacyFound.includes(card.id)).every(card=>!card.collected&&card.alpha===255),
            'New content did not remain uncollected and full-color');
        assert.deepEqual(current.saved.interactiveStates,fixture.cities[first].interactiveStates,
            'Upgrade changed the old reveal states');
        assert.equal(current.completion,false,'Old 12-target completion incorrectly completed the expanded chapter');
        let saved=await evaluate("JSON.parse(localStorage.getItem('chriken_living_city_v1_save_v1'))");
        assert.ok(!saved.completedCityIds.includes(first),'Expanded unfinished chapter retained its stale completion flag');
        assert.ok(saved.unlockedCityIds.includes(second),'Upgrade removed an already unlocked chapter');
        assert.deepEqual(saved.cities[second],fixture.cities[second],'Upgrade changed another chapter progress');
        await screenshot('chapter_1_legacy_12_of_expanded.png');
        const definitions=await evaluate(`(()=>{${context}return city.content.config.hiddenObjects;})()`);
        const extra=definitions.find(t=>!legacyFound.includes(t.id)&&!t.visibleCondition);
        assert.ok(extra,'No new visible target is available for the upgrade check');
        current=await focus(extra.id);await click(current.targets.find(t=>t.id===extra.id).screen,0);
        await until(s=>s.progress.requiredCompleted===legacyFound.length+1&&s.flights===0&&s.landing===0,
            'New content could not be collected after old save upgrade');
        await send('Page.reload');
        current=await until(s=>s.ready&&s.targets.every(t=>t.loaded)&&s.progress.requiredCompleted===legacyFound.length+1,
            'Upgraded progress failed to survive reload');
        saved=await evaluate("JSON.parse(localStorage.getItem('chriken_living_city_v1_save_v1'))");
        assert.ok(saved.cities[first].foundHiddenObjectIds.includes(extra.id));
        assert.deepEqual(saved.cities[second],fixture.cities[second]);
        const proof={legacyReport:legacyPath,legacyFound:legacyFound.length,newRequiredTotal:current.progress.requiredTotal,
            restoredCompleted:legacyFound.length,collectedNewId:extra.id,afterReloadCompleted:current.progress.requiredCompleted,
            staleCompletionRemoved:true,nextChapterUnlockRetained:true,nextChapterProgressRetained:true};
        const fresh={...fixture,currentCityId:first,unlockedCityIds:[first,'demo_city'],completedCityIds:[],
            cities:{demo_city:fixture.cities.demo_city??{completedTaskIds:[],foundHiddenObjectIds:[],discoveredChickenIds:[],interactiveStates:{}}},
            collectibleIds:[],souvenirIds:[]};
        await evaluate(`(()=>{localStorage.setItem('chriken_living_city_v1_save_v1',${JSON.stringify(JSON.stringify(fresh))});return true;})()`);
        await send('Page.reload');
        await until(s=>s.ready&&s.progress.requiredCompleted===0&&!s.completion,'Fresh QA fixture did not reset');
        return proof;
    }

    async function verifyPreviousVersionRestore() {
        if(!previousVersion?.savedJourney) return {checked:false,reason:'no previous saved journey'};
        const expanded=previousFirstChapter.targets<expectedFirstBlueprint.hiddenObjectSlots.length;
        const first=expectedFirstBlueprint.id,fixture=structuredClone(previousVersion.savedJourney);
        fixture.currentCityId=first;
        const original=fixture.cities[first];
        await evaluate(`(()=>{localStorage.setItem('chriken_living_city_v1_save_v1',${JSON.stringify(JSON.stringify(fixture))});return true;})()`);
        await send('Page.reload');
        const current=await until(s=>s.ready&&s.expectedResidents===expectedFirstBlueprint.npcPlans.length&&
            s.npcs.every(actor=>actor.celsReady)&&s.targets.every(target=>target.loaded)&&s.stickers.every(card=>card.loaded)&&s.completion===!expanded,
            'Completed previous-version save failed to restore in the current town');
        const retainedFound=original.foundHiddenObjectIds.filter(id=>expectedFirstBlueprint.hiddenObjectSlots.some(t=>t.id===id));
        assert.equal(current.progress.requiredCompleted,retainedFound.length);
        assert.ok(current.stickers.filter(card=>original.foundHiddenObjectIds.includes(card.id)).every(card=>card.collected),'Previously collected stickers became pending');
        assert.ok(current.stickers.filter(card=>!original.foundHiddenObjectIds.includes(card.id)).every(card=>!card.collected),'New objects were incorrectly completed');
        assert.deepEqual([...current.snapshot.foundHiddenObjectIds].sort(),[...retainedFound].sort());
        const expectedStates=Object.fromEntries(expectedFirstBlueprint.interactiveSlots.map(slot=>[slot.id,original.interactiveStates[slot.id]??'closed']));
        assert.deepEqual(current.snapshot.interactiveStates,expectedStates);
        assert.deepEqual([...current.snapshot.sceneDiscoveryIds].sort(),[...(original.sceneDiscoveryIds??[])].sort());
        const saved=await evaluate("JSON.parse(localStorage.getItem('chriken_living_city_v1_save_v1'))");
        assert.deepEqual(saved.unlockedCityIds,fixture.unlockedCityIds);
        assert.deepEqual(saved.completedCityIds,expanded?fixture.completedCityIds.filter(id=>id!==first):fixture.completedCityIds);
        for(const [cityId,progress] of Object.entries(fixture.cities))if(cityId!==first)
            assert.deepEqual(saved.cities[cityId],progress,`${cityId}: current update changed another city's progress`);
        await screenshot(`chapter_1_${previousReviewBatch}_completed_save_restored.png`);
        return {checked:true,sourceReport:reports.previousVersionBaseline.path,
            restoredCompleted:current.progress.requiredCompleted,newRequiredTotal:current.progress.requiredTotal,expanded,staleCompletionRemoved:expanded&&!saved.completedCityIds.includes(first),newResidentsLoaded:current.npcs.length,
            originalRevealsPreserved:true,discoveriesPreserved:true,unlocksAndOtherCitiesPreserved:true};
    }

    async function mapPointScreen(point) {
        return evaluate(`(()=>{${context}view.controller.focusAt(${point.x},${point.y});
            const world=map.worldPosition.clone();world.x+=(${point.x})*map.worldScale.x;
            world.y+=(${point.y})*map.worldScale.y;
            const p=camera.worldToScreen(world);return {x:p.x,y:innerHeight-p.y};})()`);
    }

    async function clickResident(request) {
        await evaluate(`(()=>{${context}const npc=box.npcs.find(n=>n.plan.id===${JSON.stringify(request.npcId)});
            view.controller.focusAt(npc.node.position.x,npc.node.position.y+npc.plan.actorHeight*.4);return true;})()`);
        await wait(50);
        const point=await evaluate(`(()=>{${context}const npc=box.npcs.find(n=>n.plan.id===${JSON.stringify(request.npcId)});
            const world=npc.node.worldPosition.clone();world.y+=npc.plan.actorHeight*.4*npc.node.worldScale.y;
            const p=camera.worldToScreen(world);return {x:p.x,y:innerHeight-p.y};})()`);
        await click(point);
        return state();
    }

    async function verifyOrdinaryResidentActivities() {
        const proof=[];
        for(const [id,npcId] of [['flower_scent','flower_buyer'],['child_wave','lane_child']]) {
            await setZoom('detail');
            let current=await state();
            if(!current.events.some(event=>event.id===id))continue;
            const before=current.progress.requiredCompleted;
            assert.ok(!current.snapshot.sceneDiscoveryIds.includes(id),`${id}: activity already awarded before its first tap`);
            current=await clickResident({npcId});
            assert.ok(current.events.find(event=>event.id===id).seconds!==null,`${id}: real tap did not start activity`);
            assert.ok(!current.snapshot.sceneDiscoveryIds.includes(id),`${id}: awarded before completion`);
            const frames=new Set(),start=Date.now();let shot=false;
            while(Date.now()-start<2400){
                current=await state();const actor=current.npcs.find(n=>n.id===npcId);
                if(actor.celClip==='receive_w')frames.add(actor.celSprite.uuid);
                if(frames.size>=2&&!shot){await screenshot(`chapter_1_${id}_generated_activity.png`);shot=true;}
                if(current.snapshot.sceneDiscoveryIds.includes(id))break;
                await wait(65);
            }
            current=await until(s=>s.snapshot.sceneDiscoveryIds.includes(id),`${id}: completion did not persist`);
            assert.ok(frames.size>=2,`${id}: both generated job frames were not observed`);
            assert.equal(current.progress.requiredCompleted,before);
            current=await clickResident({npcId});assert.equal(current.events.find(e=>e.id===id).seconds,null,'Cooldown did not prevent immediate replay');
            proof.push({eventId:id,npcId,actualMouseInput:true,completionOnlyAward:true,cooldownChecked:true,requiredProgressUnchanged:true,generatedJobFrames:[...frames]});
        }
        await send('Page.reload');
        const restored=await until(s=>s.ready&&s.npcs.every(n=>n.celsReady),'Residents not restored after optional activities');
        for(const row of proof){assert.ok(restored.snapshot.sceneDiscoveryIds.includes(row.eventId));row.restoredAfterReload=true;}
        await setZoom('initial');return proof;
    }

    async function recordResidentPlayback() {
        const recordings=[];await setZoom('detail');
        for(const id of ['lane_child','book_shopkeeper','tea_vendor']) {
            await evaluate(`(()=>{${context}const actor=box.npcs.find(n=>n.plan.id===${JSON.stringify(id)});
                view.controller.focusAt(actor.node.position.x,actor.node.position.y+actor.plan.actorHeight*.4);
                return true;})()`);
            screencastFrames=[];
            await send('Page.startScreencast',{format:'jpeg',quality:85,maxWidth:444,maxHeight:960,everyNthFrame:2});
            const samples=[];
            for(let i=0;i<100;i++){
                const s=await state(),actor=s.npcs.find(n=>n.id===id);samples.push({clip:actor.celClip,frame:actor.celFrame,uuid:actor.celSprite.uuid});
                await evaluate(`(()=>{${context}const n=box.npcs.find(a=>a.plan.id===${JSON.stringify(id)});view.controller.focusAt(n.node.position.x,n.node.position.y+n.plan.actorHeight*.4);return true;})()`);
                await wait(100);
            }
            await send('Page.stopScreencast');
            const frames=screencastFrames;screencastFrames=null;
            assert.ok(frames.length>10,'Browser screencast did not deliver actual display frames');
            const frameDir=path.join(profile,`recording_${id}`);fs.mkdirSync(frameDir,{recursive:true});
            const concat=[];
            for(let i=0;i<frames.length;i++){
                const name=`frame_${i}.jpg`;fs.writeFileSync(path.join(frameDir,name),Buffer.from(frames[i].data,'base64'));
                concat.push(`file '${name}'`);
                if(i+1<frames.length)concat.push(`duration ${Math.max(.001,frames[i+1].metadata.timestamp-frames[i].metadata.timestamp)}`);
            }
            fs.writeFileSync(path.join(frameDir,'frames.txt'),concat.join('\n')+'\n');
            const file=`resident_${id}_playback.mp4`;
            await new Promise((resolve,reject)=>{
                const encoder=spawn('E:/ffmpeg-7.1-full_build/ffmpeg-7.1-full_build/bin/ffmpeg.exe',['-y','-loglevel','error','-f','concat','-safe','0','-i',path.join(frameDir,'frames.txt'),'-vsync','vfr','-pix_fmt','yuv420p',path.join(out,file)],{windowsHide:true,stdio:'ignore'});
                encoder.on('error',reject);encoder.on('exit',code=>code===0?resolve():reject(new Error(`Screen video encoding failed: ${code}`)));
            });
            const bytes=fs.statSync(path.join(out,file)).size;assert.ok(bytes>1000);
            recordings.push({id,file,bytes,capturedFrames:frames.length,seconds:frames.at(-1).metadata.timestamp-frames[0].metadata.timestamp,samples});
        }
        await setZoom('initial');return recordings;
    }

    async function verifyResidentAnimation() {
        if(!expectedAnimationResidentIds.length)return {newResidents:0,renewedResidents:0,actors:[]};
        const ready=await state();
        const readProof=id=>residentObservations.get(`${ready.cityId}/${id}`);
        const requiredClips=id=>['tea_vendor','chestnut_seller','lantern_watcher'].includes(id)?['idle_w','receive_w']:
            id==='messenger_customer'?['idle_w','walk_n','receive_w']:
            ['tea_regular','lane_child'].includes(id)?['idle_w','walk_n','walk_ne','receive_w']:
            ['crossing_shopper','flower_buyer'].includes(id)?['idle_w','walk_nw','walk_n','walk_ne','receive_w']:['idle_w','walk_nw','receive_w'];
        const animated=id=>{const proof=readProof(id);return proof&&
            requiredClips(id).every(clip=>(proof.clips.get(clip)?.size??0)>=(reviewBatch==='ai_image_v12'?4:2))&&proof.activities.size>0;};
        const started=Date.now();
        while(!expectedAnimationResidentIds.every(animated)&&Date.now()-started<150000) {await state();await wait(50);}
        const current=await state(),actors=[];
        const frameOwners=new Map();
        for(const id of expectedAnimationResidentIds) {
            const actor=current.npcs.find(npc=>npc.id===id),proof=readProof(id);
            assert.ok(actor?.celsReady&&actor.celSprite?.active,`${id}: PNG animation is not visible`);
            assert.equal(actor.celManifest.actorId,id);
            const expected=JSON.parse(fs.readFileSync(`assets/bundles/city_${current.cityId}/cels/${id}/manifest.json`,'utf8'));
            assert.deepEqual(actor.celManifest.canvasPx,expected.canvasPx);
            assert.deepEqual(actor.celManifest.footpointPx,expected.footpointPx);
            assert.equal(actor.celManifest.schemaVersion,expected.schemaVersion);
            assert.deepEqual(actor.celManifest.loopingClips,expected.loopingClips);
            assert.deepEqual(actor.celManifest.clips,expected.clips,`${id}: built actor manifest is stale`);
            for(const [clip,frames] of Object.entries(expected.clips)) {
                assert.equal(actor.loadedClipFrames[clip]?.length,frames.length,`${id}/${clip}: not all PNG frames loaded`);
                for(const [index,uuid] of actor.loadedClipFrames[clip].entries()) {
                    assert.ok(uuid,`${id}/${clip}: loaded frame has no asset identity`);
                    const framePath=`assets/bundles/city_${current.cityId}/cels/${id}/${frames[index].asset}.png`;
                    const frameMeta=JSON.parse(fs.readFileSync(`${framePath}.meta`,'utf8'));
                    assert.equal(uuid,frameMeta.subMetas.f9941.uuid,`${id}/${clip}: build loaded a different frame asset`);
                    const previous=frameOwners.get(uuid);
                    assert.ok(!previous||previous===id,`${id}: displays ${previous}'s SpriteFrame`);
                    frameOwners.set(uuid,id);
                }
            }
            assert.ok(animated(id),`${id}: actual idle/walk/job playback missing: ${JSON.stringify({
                clips:proof&&Object.fromEntries([...proof.clips].map(([clip,frames])=>[clip,[...frames]])),
                activities:proof&&[...proof.activities]})}`);
            if(!['tea_vendor','chestnut_seller','lantern_watcher'].includes(id))assert.ok(Math.hypot(proof.maxX-proof.minX,proof.maxY-proof.minY)>10,`${id}: resident never walked along its route`);
            actors.push({id,samples:proof.samples,observedClips:Object.fromEntries([...proof.clips].map(([clip,frames])=>[clip,[...frames]])),
                actualActivities:[...proof.activities],motionBounds:{left:proof.minX,right:proof.maxX,bottom:proof.minY,top:proof.maxY},
                loadedFrames:Object.fromEntries(Object.entries(actor.loadedClipFrames).map(([clip,frames])=>[clip,frames.length]))});
        }
        await setZoom('detail');
        for(const proof of actors) {
            if(renewedResidentIds.includes(proof.id))continue;
            await evaluate(`(()=>{${context}const npc=box.npcs.find(actor=>actor.plan.id===${JSON.stringify(proof.id)});
                view.controller.focusAt(npc.node.position.x,npc.node.position.y+npc.plan.actorHeight*.4);return true;})()`);
            const job=await until(s=>{const actor=s.npcs.find(npc=>npc.id===proof.id);return actor&&!actor.moving&&
                actor.celClip==='receive_w'&&actor.idlePose?.supported&&actor.idlePose.visualAction!=='idle'&&
                actor.celSprite?.active&&actor.screen.x>0&&actor.screen.x<444&&
                actor.screen.y>50&&actor.screen.y<790;},`${proof.id}: generated job frames never appeared during a focused natural wait`,200);
            const actor=job.npcs.find(npc=>npc.id===proof.id),file=`chapter_1_job_${proof.id}.png`;
            await screenshot(file);
            proof.jobScreenshot={file,clip:actor.celClip,frame:actor.celFrame,uuid:actor.celSprite.uuid,actualActivity:actor.idlePose.visualAction};
            console.log(JSON.stringify({stage:'resident_job_observed',actorId:proof.id,clip:actor.celClip,
                activity:actor.idlePose.visualAction,screenshot:path.join(out,file)}));
        }
        await setZoom('initial');
        return {newResidents:expectedNewResidentIds.length,renewedResidents:renewedResidentIds.length,
            additionalObservationSeconds:(Date.now()-started)/1000,actors};
    }

    function assertNaturalDialogue(message,targets,label) {
        assert.ok(message?.trim(),`${label}: empty ambient dialogue`);
        assert.ok(!/(目标|物品|点击|轻点|双指|拖动|线索|圈出|在等人发现|能帮我找找|找到后再|仔细看看里面)/.test(message),
            `${label}: ambient dialogue contains a search instruction: ${message}`);
        for(const target of targets)if(target.displayName)
            assert.ok(!message.includes(target.displayName),`${label}: ambient dialogue exposes the target ${target.displayName}: ${message}`);
    }

    function assertDialogueBounds(current) {
        const b=current.sceneClue.bounds;assert.ok(current.sceneClue.visible&&b,'Dialogue has no visible PNG bounds');
        assert.ok(b.left>=-1&&b.right<=current.viewport.width+1&&b.top>=-1&&b.bottom<=current.viewport.height+1,
            `Dialogue clipped by viewport: ${JSON.stringify({bounds:b,viewport:current.viewport})}`);
        if(current.trayBounds)assert.ok(b.bottom<=current.trayBounds.top+1,'Dialogue overlaps the target tray');
        return {viewport:current.viewport,bounds:b,trayBounds:current.trayBounds};
    }

    async function verifyDialogueFit(chapter) {
        const proof=[];
        for(const [width,height] of [[444,960],[360,780]]){
            await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await wait(200);
            await setZoom('detail');let current=await clickResident({npcId:'tea_vendor'});
            proof.push({...assertDialogueBounds(current),kind:'resident',zoom:'maximum'});
            await screenshot(`chapter_${chapter+1}_dialogue_fit_${width}x${height}.png`);
            await send('Input.dispatchMouseEvent',{type:'mousePressed',x:25,y:95,button:'left',clickCount:1});
            await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:100,y:170,button:'left',buttons:1});
            await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:100,y:170,button:'left',clickCount:1});await wait(100);
            current=await state();proof.push({...assertDialogueBounds(current),kind:'resident_after_real_drag',zoom:'maximum'});
            await screenshot(`chapter_${chapter+1}_dialogue_drag_fit_${width}x${height}.png`);
            const point=current.discoveryPoints[0];
            if(point){
                await evaluate(`(()=>{${context}view.controller.focusAt(${point.at.x},${point.at.y});return true;})()`);await wait(50);
                await click(await mapPointScreen(point.at));current=await state();assert.equal(current.sceneClue.message,point.message);
                proof.push({...assertDialogueBounds(current),kind:'facility',zoom:'maximum'});
                await send('Input.dispatchMouseEvent',{type:'mousePressed',x:25,y:95,button:'left',clickCount:1});
                await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:105,y:150,button:'left',buttons:1});
                await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:105,y:150,button:'left',clickCount:1});await wait(100);
                current=await state();proof.push({...assertDialogueBounds(current),kind:'facility_after_real_drag',zoom:'maximum'});
                await screenshot(`chapter_${chapter+1}_facility_dialogue_drag_fit_${width}x${height}.png`);
            }
        }
        await send('Emulation.setDeviceMetricsOverride',{width:444,height:960,deviceScaleFactor:1,mobile:true});await wait(200);
        await setZoom('initial');return {viewportClipping:false,overlapsTargetTray:false,samples:proof};
    }

    async function verifyNaturalDialogue(chapter) {
        if(chapter!==0)return {scope:'unchanged_chapter',checked:0};
        const before=await state(),targets=await evaluate(`(()=>{${context}return city.content.config.hiddenObjects;})()`);
        const requestNpcs=new Set(before.requests.map(request=>request.npcId)),npcMessages=[];
        for(const point of before.discoveryPoints)assertNaturalDialogue(point.message,targets,point.id);
        assert.equal(before.sceneClue.visible,false,'Residents automatically exposed a dialogue bubble');
        for(const [npcId,value] of Object.entries(before.npcClues)) {
            if(requestNpcs.has(npcId)||before.events.some(event=>event.tapTriggerNpcId===npcId))continue;
            const messages=Array.isArray(value)?value:[value];
            for(const message of messages)assertNaturalDialogue(message,targets,npcId);
            const shown=[];
            for(let index=0;index<Math.min(2,messages.length);index++) {
                const current=await clickResident({npcId});
                assert.equal(current.sceneClue.visible,true,`${npcId}: natural dialogue bubble did not open`);
                assert.equal(current.sceneClue.message,messages[index],`${npcId}: actual click produced another resident's dialogue`);
                assert.equal(current.progress.requiredCompleted,before.progress.requiredCompleted,'Ambient chat completed a search target');
                assert.equal(current.hint,null,'Ambient chat invoked the explicit hint manager');
                assert.equal(current.missedTapFeedback,false,'Ambient chat produced a missed-tap message');
                assertDialogueBounds(current);
                if(expectedNewResidentIds.includes(npcId))await screenshot(`chapter_1_natural_chat_${npcId}_${index+1}.png`);
                shown.push(current.sceneClue.message);
            }
            npcMessages.push({npcId,messages,shown,clickRotates:messages.length>1});
        }
        for(const id of expectedNewResidentIds)assert.ok(npcMessages.some(entry=>entry.npcId===id),`${id}: new resident has no natural chat`);
        return {scope:'first_chapter',checked:npcMessages.length,facilityMessages:before.discoveryPoints.length,npcMessages};
    }

    async function verifyExplicitHints(chapter) {
        const before=await state(),card=before.stickers.find(item=>item.active&&!item.collected);
        assert.ok(card,`Chapter ${chapter+1}: no active card is available for an explicit clue`);
        const definition=await evaluate(`(()=>{${context}return view.stickers.find(item=>item.id===${JSON.stringify(card.id)});})()`);
        await click(card.screen);
        let current=await state();
        assert.equal(current.clue,`${definition.name}：${definition.clue}`,'Explicit sticker clue did not appear');
        assert.equal(current.progress.requiredCompleted,before.progress.requiredCompleted,'Sticker clue click collected an object');
        assert.equal(current.missedTapFeedback,false,'Sticker clue click produced a missed-tap message');
        assert.ok(current.hintUi?.visible,'Explicit hint button is unavailable');
        let previousNpcBubble=null;
        if(chapter===0) {
            const npcId=Object.keys(current.npcClues).find(id=>!current.requests.some(request=>request.npcId===id));
            assert.ok(npcId,'No ordinary resident is available before the explicit hint');
            current=await clickResident({npcId});
            assert.equal(current.sceneClue.visible,true,'The real NPC click did not create the bubble that hints must dismiss');
            previousNpcBubble={npcId,message:current.sceneClue.message};
        }
        await click(current.hintUi.button);
        current=await until(s=>s.hint&&s.hintUi.marker&&s.hintUi.markerLoaded,'Explicit hint button failed to show a generated marker');
        assert.equal(current.sceneClue.visible,false,'Explicit hint left the old resident bubble visible');
        assert.equal(current.progress.requiredCompleted,before.progress.requiredCompleted,'Hint request collected an object');
        assert.equal(current.missedTapFeedback,false,'Hint button click produced a missed-tap message');
        const proof={cardId:card.id,cardMessage:current.clue,hintId:current.hint.id,hintKind:current.hint.kind,
            hintMessage:current.hintUi.message,previousNpcBubble,oldNpcBubbleDismissed:true,actualMouseInput:true};
        await screenshot(`chapter_${chapter+1}_explicit_hint.png`);
        await until(s=>!s.hint&&s.stickers.some(item=>item.active),'Explicit hint did not expire and restore the tray',100);
        return proof;
    }

    async function verifyFacilities(chapter) {
        const before=await state(),proof=[];
        for(const point of before.discoveryPoints) {
            const support=before.sceneArt.find(art=>art.id===point.supportArtSlotId);
            assert.ok(support?.loaded,`${point.id}: facility does not use a generated PNG`);
            await click(await mapPointScreen(point.at));
            const current=await until(s=>s.sceneDiscoveryIds.includes(point.id),`Facility ${point.id} did not record its discovery`);
            assert.equal(current.progress.requiredCompleted,before.progress.requiredCompleted,'Facility interaction completed a search task');
            assert.equal(current.sceneClue.message,point.message);
            assert.equal(current.sceneClue.visible,true);
            assertDialogueBounds(current);
            assert.ok(current.saved.sceneDiscoveryIds.includes(point.id));
            await screenshot(`chapter_${chapter+1}_discovery_${point.id}.png`);
            proof.push({id:point.id,supportArtSlotId:point.supportArtSlotId,persisted:true});
        }
        for(const request of before.requests) {
            const current=await clickResident(request);
            assert.equal(current.sceneClue.message,request.waitingMessage,'Resident request did not explain its missing item');
            assert.ok(!current.sceneDiscoveryIds.includes(request.id),'Resident request completed before its required item was found');
            assert.equal(current.progress.requiredCompleted,before.progress.requiredCompleted);
        }
        return proof;
    }

    async function verifyCompletedRequest(request,chapter) {
        const before=await state();
        let current=await clickResident(request);
        assert.equal(current.progress.requiredCompleted,before.progress.requiredCompleted,'Resident request consumed or counted the item twice');
        assert.ok(current.sceneDiscoveryIds.includes(request.id));
        assert.ok(current.snapshot.foundHiddenObjectIds.includes(request.requiredTargetId),'Request consumed the collected sticker');
        assert.equal(current.sceneClue.message,request.completionMessage);
        assert.ok(current.saved.sceneDiscoveryIds.includes(request.id));
        await screenshot(`chapter_${chapter+1}_request_${request.id}_completed.png`);
        const daily=current.npcClues[request.npcId],dailyMessages=Array.isArray(daily)?daily:[daily];
        const savedAfterDelivery=await evaluate("localStorage.getItem('chriken_living_city_v1_save_v1')"),dailyShown=[];
        assert.ok(dailyMessages.every(message=>typeof message==='string'&&message.length>0),`${request.npcId}: no daily chat after delivery`);
        for(let index=0;index<Math.min(2,dailyMessages.length);index++) {
            current=await clickResident(request);
            assert.equal(current.sceneClue.message,dailyMessages[index],`${request.npcId}: delivery kept repeating the thank-you message`);
            assert.equal(current.progress.requiredCompleted,before.progress.requiredCompleted);
            assert.ok(current.snapshot.foundHiddenObjectIds.includes(request.requiredTargetId));
            assert.equal(await evaluate("localStorage.getItem('chriken_living_city_v1_save_v1')"),savedAfterDelivery,
                'Daily chat after delivery wrote the save again');
            dailyShown.push(current.sceneClue.message);
        }
        await send('Page.reload');
        current=await until(s=>s.ready&&s.targets.every(t=>t.loaded)&&s.stickers.every(c=>c.loaded)&&
            s.sceneDiscoveryIds.includes(request.id),'Resident request did not survive reload');
        assert.equal(current.progress.requiredCompleted,before.progress.requiredCompleted);
        const savedAfterReload=await evaluate("localStorage.getItem('chriken_living_city_v1_save_v1')");
        current=await clickResident(request);
        assert.equal(current.sceneClue.message,dailyMessages[0],'Restored delivery did not return to daily chat');
        assert.equal(await evaluate("localStorage.getItem('chriken_living_city_v1_save_v1')"),savedAfterReload);
        await screenshot(`chapter_${chapter+1}_request_${request.id}_daily_chat_after_reload.png`);
        return {id:request.id,requiredTargetId:request.requiredTargetId,persisted:true,consumed:false,
            dailyChatAfterDelivery:dailyShown,dailyChatAfterReload:current.sceneClue.message,repeatedChatWritesSave:false};
    }

    async function observeRepeatableTea(seconds) {
        const samples = [];
        const starts = [], completions = [], propVisibility = [];
        const capturedCupExchanges = new Set();
        const cupStages=new Set(),cupStageScreens=[];
        await setZoom('detail');
        await evaluate(`(()=>{${context}const tea=box.blueprint.sceneEvents.find(event=>event.id==='tea_exchange');
            view.controller.focusAt(tea.prop?.at.x??-250,(tea.prop?.at.y??340)-25);return true;})()`);
        const began = Date.now(), deadline = began + seconds * 1000, finishDeadline = deadline + 5000;
        let previouslyActive = false, previousSeconds = null;
        do {
            const current = await state();
            const tea = current.events.find(event => event.id === 'tea_exchange');
            assert.ok(tea?.repeat, 'First chapter tea exchange must be configured as repeatable');
            const invitation=current.events.find(event=>event.id==='tea_invitation');
            if(invitation)assert.equal(invitation.seconds,null,'The player tea invitation started without a resident tap');
            const at = (Date.now() - began) / 1000;
            const active = tea.seconds !== null;
            if (active && (!previouslyActive || tea.seconds < previousSeconds)) starts.push(at);
            if (previouslyActive && !active) completions.push(at);
            if (tea.propActive) propVisibility.push(at);
            if (active && tea.seconds>=.8 && !capturedCupExchanges.has(starts.length)) {
                capturedCupExchanges.add(starts.length);
                await screenshot(`chapter_1_tea_exchange_${String(starts.length).padStart(2,'0')}.png`);
            }
            const actors=current.npcs.filter(n=>['tea_vendor','tea_regular'].includes(n.id));
            let singleCupStage=null;
            if(active) {
                const cupSources=[...(tea.propActive?['table']:[]),
                    ...actors.filter(actor=>actor.celClip==='receive_w').map(actor=>actor.id)];
                assert.equal(cupSources.length,1,`Tea exchange displayed overlapping/missing cups: ${JSON.stringify({tea,cupSources,actors})}`);
                singleCupStage=cupSources[0];cupStages.add(singleCupStage);
                // The vendor beat lasts only 0.45s. Capturing the preceding
                // table picture can consume that window while encoding a PNG.
                // Observe/photograph the vendor first; use the next real cycle
                // for the table photograph, without freezing the game clock.
                const captureStage=singleCupStage!=='table'||cupStages.has('tea_vendor');
                if(captureStage&&!cupStageScreens.some(proof=>proof.stage===singleCupStage)) {
                    const file=`chapter_1_tea_single_cup_${singleCupStage}.png`;
                    await screenshot(file);cupStageScreens.push({stage:singleCupStage,
                        file:path.relative(process.cwd(),path.join(out,file)).replaceAll('\\','/'),eventSeconds:tea.seconds,
                        actors:actors.map(actor=>({id:actor.id,clip:actor.celClip,uuid:actor.celSprite?.uuid}))});
                }
            }
            samples.push({ wallSeconds:at,eventSeconds:tea.seconds,propActive:tea.propActive,singleCupStage,
                actors:actors.map(n=>({id:n.id,clip:n.celClip,uuid:n.celSprite?.uuid,x:n.x,y:n.y})) });
            previouslyActive = active; previousSeconds = tea.seconds;
            if (Date.now() < finishDeadline) await wait(100);
        } while(Date.now() < finishDeadline && (Date.now() < deadline || completions.length < 2));
        assert.ok(starts.length >= 2, `Tea exchange did not repeat in ${seconds}s: ${JSON.stringify(starts)}`);
        assert.ok(completions.length >= 2, `Tea exchange did not complete twice: ${JSON.stringify(completions)}`);
        assert.ok(propVisibility.length >= 2, 'Generated tea cup was never visible in repeated exchanges');
        assert.deepEqual([...cupStages].sort(),['table','tea_regular','tea_vendor'],'Not all three generated single-cup handoff stages appeared');
        await setZoom('initial');
        return { requestedMinimumSeconds:seconds,observedWallSeconds:(Date.now()-began)/1000,starts,completions,propVisibleSamples:propVisibility.length,
            cupExchangeScreenshots:capturedCupExchanges.size,samplingIntervalMs:100,
            singleCupNeverDuplicated:true,singleCupStates:[...cupStages],cupStageScreens,samples };
    }

    async function verifyActiveTeaInvitation() {
        const initial=await state(),spec=initial.events.find(event=>event.id==='tea_invitation');
        assert.ok(spec,'The first chapter lacks the player tea invitation');
        assert.equal(spec.tapTriggerNpcId,'tea_vendor');
        assert.equal(spec.discoveryId,'tea_break');
        assert.deepEqual(spec.participants,['tea_vendor']);
        assert.ok(!initial.sceneDiscoveryIds.includes(spec.discoveryId),'The optional tea keepsake was awarded before a tap');
        await setZoom('detail');
        const busyBefore=await until(s=>{const event=s.events.find(event=>event.id==='tea_exchange');
            return event.seconds!==null&&event.seconds<event.resumeRouteAfterSeconds-.65;},
            'Automatic tea exchange did not become available for the mutual-exclusion check',400);
        let current=await clickResident({npcId:'tea_vendor'});
        assert.equal(current.events.find(event=>event.id==='tea_invitation').seconds,null,
            'Player invitation stole the vendor from an active tea exchange');
        assert.equal(current.hint,null,'Vendor click invoked a search hint');
        assert.ok(!current.sceneDiscoveryIds.includes(spec.discoveryId),'Busy vendor awarded tea without the activity');
        await screenshot('chapter_1_tea_invitation_busy_exchange.png');
        const ready=await until(s=>s.events.find(event=>event.id==='tea_exchange').seconds===null&&
            s.npcs.find(actor=>actor.id==='tea_regular').moving,
            'Tea regular did not resume walking after the automatic exchange',400);
        const regularBefore=ready.npcs.find(actor=>actor.id==='tea_regular');
        current=await clickResident({npcId:'tea_vendor'});
        assert.notEqual(current.events.find(event=>event.id==='tea_invitation').seconds,null,
            'Actual vendor click did not start the invitation');
        assert.equal(current.npcs.find(actor=>actor.id==='tea_vendor').celClip,'receive_w');
        assert.equal(current.npcs.find(actor=>actor.id==='tea_regular').eventReserved,false,
            'Player invitation reserved the passing tea regular');
        assert.ok(!current.sceneDiscoveryIds.includes(spec.discoveryId),'Tea keepsake was recorded at click time instead of completion');
        assert.equal(current.progress.requiredCompleted,initial.progress.requiredCompleted);
        assert.equal(current.hint,null);
        const samples=[],vendorFrames=new Set();
        let invitationScreenCaptured=false;
        for(let attempt=0;attempt<60;attempt++) {
            const event=current.events.find(event=>event.id==='tea_invitation');
            if(event.seconds===null)break;
            assert.equal(current.events.find(event=>event.id==='tea_exchange').seconds,null,
                'Automatic tea exchange overlapped the active player invitation');
            const vendor=current.npcs.find(actor=>actor.id==='tea_vendor');
            assert.equal(vendor.celClip,'receive_w');vendorFrames.add(vendor.celSprite.uuid);
            samples.push({eventSeconds:event.seconds,vendorUuid:vendor.celSprite.uuid,
                regular:current.npcs.find(actor=>actor.id==='tea_regular')});
            // PNG capture can outlast the 0.2s first offering cel. Observe both
            // real frames before awaiting a screenshot, without changing time.
            if(vendorFrames.size>=2&&!invitationScreenCaptured){
                invitationScreenCaptured=true;
                await screenshot('chapter_1_tea_invitation_started.png');
            }
            await wait(100);current=await state();
        }
        assert.equal(current.events.find(event=>event.id==='tea_invitation').seconds,null,'Player invitation did not finish');
        assert.ok(vendorFrames.size>=2,'Player invitation did not display both generated offering frames');
        assert.ok(samples.some(sample=>Math.hypot(sample.regular.x-regularBefore.x,sample.regular.y-regularBefore.y)>5),
            'Tea regular stopped walking during the independent player invitation');
        assert.equal(current.sceneDiscoveryIds.filter(id=>id===spec.discoveryId).length,1);
        assert.equal(current.saved.sceneDiscoveryIds.filter(id=>id===spec.discoveryId).length,1);
        assert.equal(current.progress.requiredCompleted,initial.progress.requiredCompleted);
        const completedSave=await evaluate("localStorage.getItem('chriken_living_city_v1_save_v1')");
        await screenshot('chapter_1_tea_invitation_completed.png');
        current=await clickResident({npcId:'tea_vendor'});
        assert.equal(current.events.find(event=>event.id==='tea_invitation').seconds,null,
            'Player invitation ignored its completion cooldown');
        assert.equal(await evaluate("localStorage.getItem('chriken_living_city_v1_save_v1')"),completedSave,
            'Cooldown chat wrote the completed keepsake again');
        await wait((spec.cooldownSeconds+.25)*1000);
        await until(s=>s.events.find(event=>event.id==='tea_exchange').seconds===null,
            'Automatic exchange did not release the vendor for a replay',400);
        current=await clickResident({npcId:'tea_vendor'});
        assert.notEqual(current.events.find(event=>event.id==='tea_invitation').seconds,null,'Invitation did not replay after cooldown');
        await until(s=>s.events.find(event=>event.id==='tea_invitation').seconds===null,'Replayed invitation did not complete');
        assert.equal(await evaluate("localStorage.getItem('chriken_living_city_v1_save_v1')"),completedSave,
            'Replayed optional activity wrote or counted the tea keepsake again');
        await send('Page.reload');
        current=await until(s=>s.ready&&s.npcs.every(actor=>actor.celsReady)&&s.targets.every(target=>target.loaded)&&
            s.sceneDiscoveryIds.includes(spec.discoveryId),'Tea keepsake failed to restore after reload');
        assert.equal(current.progress.requiredCompleted,initial.progress.requiredCompleted);
        assert.equal(current.sceneDiscoveryIds.filter(id=>id===spec.discoveryId).length,1);
        await screenshot('chapter_1_tea_break_restored.png');
        await setZoom('initial');
        return {eventId:spec.id,discoveryId:spec.discoveryId,actualMouseInput:true,
            busyExchangeSeconds:busyBefore.events.find(event=>event.id==='tea_exchange').seconds,
            participantsMutuallyExclusive:true,regularContinuedWalking:true,generatedOfferFrames:[...vendorFrames],
            completionOnlyAward:true,requiredProgressUnchanged:true,cooldownSeconds:spec.cooldownSeconds,
            replayWritesSave:false,restoredAfterReload:true,samples};
    }
    await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:444,height:960,deviceScaleFactor:1,mobile:true});
    await send('Page.navigate',{url:`http://127.0.0.1:${port}/`});
    const chapterIds=chapterOneOnly?['living_city_street_block_01']:
        ['living_city_street_block_01','living_city_garden_market_02','living_city_harbor_walk_03'];
    await until(s=>s.ready&&s.cityId===chapterIds[0], 'Fresh journey did not start');
    if(process.argv.includes('--staging-only')){
        await until(s=>s.sceneLayers===s.expectedLayers&&s.targets.every(t=>t.loaded),'Staging assets not ready');
        const samples=[];
        for(const [width,height] of [[444,960],[360,780]]){
            await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await wait(200);
            for(const [zone,x,y] of [['tea_street',-80,440],['shared_courtyard',650,600],['food_shop',400,-630],['garden_utility',-600,-790],['flower_lane',-700,-100]]){
                await setZoom('initial');
                await evaluate(`(()=>{${context}view.controller.focusAt(${x},${y});return true;})()`);await wait(150);
                const file=`${zone}_${width}x${height}.png`;await screenshot(file);samples.push({zone,width,height,file});
            }
        }
        await send('Emulation.setDeviceMetricsOverride',{width:1152,height:1024,deviceScaleFactor:1,mobile:true});await wait(200);
        await evaluate(`(()=>{${context}view.enabled=false;view.taskPanel.active=false;view.hintPanel.root.active=false;
            const v=view.node.getComponent('cc.UITransform'),scale=Math.min(v.width/2304,v.height/2048);map.setScale(scale,scale,1);map.setPosition(0,0);return true;})()`);
        await wait(100);await screenshot('whole_town_layout.png');
        fs.writeFileSync(path.join(out,'staging_report.json'),JSON.stringify({status:'captured',samples,overview:'whole_town_layout.png',overviewNote:'Audit-only full-map camera with HUD hidden; not a gameplay screenshot.',errors,warnings,failedRequests},null,2)+'\n');
        assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);assert.deepEqual(failedRequests,[]);
        console.log(JSON.stringify({status:'captured',screens:samples.length+1,directory:out}));
    }else if(process.argv.includes('--tray-only')){
        const baseline=process.argv.includes('--tray-baseline'), samples=[];
        await until(s=>s.stickers.every(c=>c.loaded),'Tray assets not ready');
        for(const [width,height] of [[360,780],[444,960],[960,540]]){
            await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await wait(250);
            await screenshot(`tray_initial_${width}x${height}.png`);
            const initial=await state();
            const choice=initial.stickers.find(c=>c.active&&c.id==='sealed_letter')??initial.stickers.filter(c=>c.active)[7];
            await click(choice.screen);
            await screenshot(`tray_selected_${width}x${height}.png`);
            const selected=await evaluate(`(()=>{${context}const label=view.stickerClueLabel;
                const bounds=screenBounds(label.node),card=view.stickerCards.get(${JSON.stringify(choice.id)});
                return {id:view.selectedStickerId,clue:label.string,clueBounds:bounds,
                    fontPixels:(label.actualFontSize||label.fontSize)*(bounds.right-bounds.left)/label.node.getComponent('cc.UITransform').width,
                    selectedBackground:card.background.enabled,pageBounds:screenBounds(view.stickerPageLabel.node),
                    trayBounds:screenBounds(view.taskPanel)};})()`);
            if(!baseline){assert.equal(selected.id,choice.id);assert.ok(selected.selectedBackground);
                assert.ok(selected.fontPixels>=11);assert.ok(selected.clueBounds.bottom<=height);
                assert.ok(selected.pageBounds.bottom<selected.clueBounds.top);}
            await click((await state()).hintUi.button);
            const hint=await evaluate(`(()=>{${context}return view.hintManager.active;})()`);
            if(!baseline){const taskId=await evaluate(`(()=>{${context}return view.taskManager.getTaskStates().find(t=>t.config.targetId===${JSON.stringify(choice.id)}).config.id;})()`);
                assert.ok(hint);assert.equal(hint.taskId,taskId);
                if(choice.id==='sealed_letter')assert.equal(hint.kind,'interactiveObject');}
            await screenshot(`tray_hint_${width}x${height}.png`);
            await until(s=>!s.hint,'Hint did not expire');
            const before=await state();await swipeTray(-1);const after=await state();
            const expectedPage=Math.min(1,Math.ceil(after.stickers.length/12)-1);
            assert.equal(after.stickerPage,expectedPage);assert.equal(after.progress.requiredCompleted,before.progress.requiredCompleted);
            await screenshot(`tray_page_${expectedPage+1}_${width}x${height}.png`);
            const longChoice=after.stickers.find(c=>c.id==='postcard');
            assert.ok(longChoice?.active);await click(longChoice.screen);
            const longClue=await evaluate(`(()=>{${context}const label=view.stickerClueLabel,bounds=screenBounds(label.node);
                return {text:label.string,fontPixels:(label.actualFontSize||label.fontSize)*(bounds.right-bounds.left)/label.node.getComponent('cc.UITransform').width};})()`);
            if(!baseline)assert.ok(longClue.fontPixels>=11);
            await screenshot(`tray_long_clue_${width}x${height}.png`);
            await click((await state()).hintUi.button);
            const directHint=await evaluate(`(()=>{${context}return view.hintManager.active;})()`);
            if(!baseline)assert.equal(directHint.targetId,'postcard');
            await screenshot(`tray_direct_hint_${width}x${height}.png`);
            await until(s=>!s.hint,'Direct hint did not expire');await swipeTray(1);
            samples.push({width,height,selected,hint,longClue,directHint,actualCardClick:true,actualHintClick:true,actualSwipe:true});
        }
        const journal=await evaluate(`(()=>{${context}return {panel:view.taskPanelGraphics.spriteFrame?.uuid,
            cards:[...view.stickerCards.values()].map(c=>c.background.spriteFrame?.uuid),progress:view.journalProgressLabel?.string};})()`);
        assert.equal(journal.panel,JSON.parse(fs.readFileSync('assets/bundles/city_living_city_street_block_01/ui/ui_journal_panel_v17.png.meta')).subMetas.f9941.uuid);
        assert.equal(journal.cards.length,12);assert.ok(journal.cards.every(Boolean));assert.equal(journal.progress,'已找到 0/12');
        await send('Emulation.setDeviceMetricsOverride',{width:360,height:780,deviceScaleFactor:1,mobile:true});await wait(250);
        const pickup=await focus('reading_glasses');await click(pickup.targets.find(t=>t.id==='reading_glasses').screen);
        await until(s=>s.saved.foundHiddenObjectIds.includes('reading_glasses')&&s.flights===0&&s.landing===0,'Journal pickup did not finish');
        await screenshot('tray_collected_360x780.png');
        await send('Page.reload');await until(s=>s.ready&&s.saved.foundHiddenObjectIds.includes('reading_glasses'),'Journal pickup did not restore');
        const restored=await evaluate(`(()=>{${context}return {progress:view.journalProgressLabel.string,checked:view.stickerCards.get('reading_glasses').check.node.active};})()`);
        assert.deepEqual(restored,{progress:'已找到 1/12',checked:true});
        assert.deepEqual(errors,[]);assert.deepEqual(failedRequests,[]);
        fs.writeFileSync(path.join(out,'tray_report.json'),JSON.stringify({status:'passed',baseline,samples,journal,restored,errors,warnings,failedRequests},null,2)+'\n');
        console.log(JSON.stringify({status:'passed',baseline,screens:19,directory:out}));
    }else if(surfacesOnly){
        const jobs=JSON.parse(fs.readFileSync(process.env.LIVING_CITY_SURFACE_PLAN??'art/production/ai_image_v10/generation_plan.json')).jobs;
        await until(s=>s.targets.every(t=>t.loaded)&&s.interactions.every(i=>i.loaded),'Surface assets not ready');
        const samples=[];
        for(const [width,height] of [[444,960],[360,780]]){
            await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await wait(150);
            for(const zoom of ['initial','detail']){
                await setZoom(zoom);
                for(const j of jobs){
                    const current=await focus(j.targetId),target=current.targets.find(t=>t.id===j.targetId),expected=expectedFirstBlueprint.hiddenObjectSlots.find(t=>t.id===j.targetId);
                    assert.ok(target.loaded&&target.active);
                    if(!surfaceBaseline){assert.ok(Math.abs(target.worldX-expected.at.x)<.001&&Math.abs(target.worldY-expected.at.y)<.001);
                        const meta=JSON.parse(fs.readFileSync(`assets/bundles/city_${current.cityId}/targets/${j.targetId}.png.meta`));assert.equal(target.sprite.uuid,meta.subMetas.f9941.uuid);}
                    const file=`${j.targetId}_${zoom}_${width}x${height}.png`;await screenshot(file);
                    samples.push({id:j.targetId,viewport:{width,height},zoom,file,target});
                }
            }
        }
        const collected=[];
        if(!surfaceBaseline){for(const j of jobs){let current=await focus(j.targetId);await click(current.targets.find(t=>t.id===j.targetId).screen);await until(s=>s.saved.foundHiddenObjectIds.includes(j.targetId)&&s.flights===0&&s.landing===0,`${j.targetId}: surface pickup failed`);collected.push(j.targetId);}
            await send('Page.reload');await until(s=>s.ready&&collected.every(id=>s.saved.foundHiddenObjectIds.includes(id)&&s.targets.find(t=>t.id===id)?.active===false),'Surface pickups not restored');}
        assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);assert.deepEqual(failedRequests,[]);
        fs.writeFileSync(path.join(out,'surface_report.json'),JSON.stringify({status:'passed',baseline:surfaceBaseline,samples,collected,restoredAfterReload:!surfaceBaseline,
            sceneBlueprintSha256:surfaceBaseline?null:createHash('sha256').update(fs.readFileSync('design/street_block_01.json')).digest('hex'),runtimeErrors:errors,runtimeWarnings:warnings,failedRequests},null,2)+'\n');
        console.log(JSON.stringify({status:'passed',surfaceScreens:samples.length,collected:collected.length,directory:out}));
    }else if(rimsOnly){
        await until(s=>s.targets.every(t=>t.loaded)&&s.interactions.every(i=>i.loaded),'Rim detail assets not ready');
        const samples=[];await setZoom('detail');
        for(const slot of expectedFirstBlueprint.interactiveSlots.filter(i=>i.openForegroundStart!==undefined)){
            let current=await focus(slot.id);await click(current.interactions.find(i=>i.id===slot.id).screen);
            current=await until(s=>s.interactions.find(i=>i.id===slot.id).foreground?.active,'Generated front rim unavailable');
            const foreground=current.interactions.find(i=>i.id===slot.id).foreground;
            assert.ok(foreground.loaded&&foreground.sameTexture);
            const file=`${slot.id}_opened_detail.png`;await screenshot(file);samples.push({id:slot.id,file,foreground});
        }
        const pen=await focus('fountain_pen'),penTarget=pen.targets.find(t=>t.id==='fountain_pen');
        const expectedPen=expectedFirstBlueprint.hiddenObjectSlots.find(t=>t.id==='fountain_pen');
        // The authored position passes through eight-decimal normalized JSON.
        assert.ok(Math.abs(penTarget.worldX-expectedPen.at.x)<.001&&Math.abs(penTarget.worldY-expectedPen.at.y)<.001,
            `Pen position differs: ${JSON.stringify({actual:[penTarget.worldX,penTarget.worldY],expected:expectedPen.at})}`);
        await screenshot('fountain_pen_surface_detail.png');
        await click(penTarget.screen);
        await until(s=>s.saved.foundHiddenObjectIds.includes('fountain_pen'),'Repositioned pen could not be collected');
        await send('Page.reload');
        await until(s=>s.ready&&s.saved.foundHiddenObjectIds.includes('fountain_pen')&&s.interactions.filter(i=>i.foreground).every(i=>i.foreground.active&&i.foreground.loaded),'Final placement save and rims failed to restore');
        assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);assert.deepEqual(failedRequests,[]);
        fs.writeFileSync(path.join(out,'rim_report.json'),JSON.stringify({status:'passed',scope:'final_pen_placement_and_generated_front_rims',
            sceneBlueprintSha256:createHash('sha256').update(fs.readFileSync('design/street_block_01.json')).digest('hex'),
            pen:{at:expectedPen.at,actual:{x:penTarget.worldX,y:penTarget.worldY},actualMouseCollection:true,restoredAfterReload:true,screenshot:'fountain_pen_surface_detail.png'},
            samples,runtimeErrors:errors,runtimeWarnings:warnings,failedRequests},null,2)+'\n');
        console.log(JSON.stringify({status:'passed',rimDetailSamples:samples.length,directory:out}));
    }else{
    await evaluate(`(()=>{const key='chriken_living_city_v1_save_v1',d=JSON.parse(localStorage.getItem(key))??{
        version:1,currentCityId:'living_city_street_block_01',unlockedCityIds:['living_city_street_block_01'],
        completedCityIds:[],cities:{},collectibleIds:[],souvenirIds:[],
        settings:{musicEnabled:true,soundEnabled:true,vibrationEnabled:true}};
        d.currentCityId='demo_city';d.unlockedCityIds.push('demo_city');
        d.cities.demo_city={completedTaskIds:[],foundHiddenObjectIds:[],discoveredChickenIds:[],interactiveStates:{}};
        localStorage.setItem(key,JSON.stringify(d));return true;})()`);
    await send('Page.reload');
    await until(s=>s.ready&&s.cityId===chapterIds[0], 'Retired saved city did not fall back to the active journey');
    reports.retiredCityResume='active_chapter_1_with_old_progress_retained';
    reports.previousVersionRestore=await verifyPreviousVersionRestore();
    if(expectedFirstBlueprint.hiddenObjectSlots.length>12)reports.legacyCompletionUpgrade=await verifyLegacyCompletionUpgrade();
    if(expectedFirstBlueprint.targetRevision==='relaxed_twelve_v16'){
        const fixture=structuredClone(previousVersion.savedJourney),first=expectedFirstBlueprint.id;
        const kept=expectedFirstBlueprint.hiddenObjectSlots.slice(0,3).map(t=>t.id);
        const retired=fixture.cities[first].foundHiddenObjectIds.filter(id=>!expectedFirstBlueprint.hiddenObjectSlots.some(t=>t.id===id));
        fixture.currentCityId=first;fixture.completedCityIds=fixture.completedCityIds.filter(id=>id!==first);
        fixture.cities[first].foundHiddenObjectIds=[...kept,...retired];
        // Deliberately leave the old completion cache full: only actual found IDs count.
        await evaluate(`(()=>{localStorage.setItem('chriken_living_city_v1_save_v1',${JSON.stringify(JSON.stringify(fixture))});return true;})()`);
        await send('Page.reload');
        let partial=await until(s=>s.ready&&s.progress.requiredTotal===12&&s.progress.requiredCompleted===3&&!s.completion,'Partial 32-target save did not migrate to 3/12');
        assert.deepEqual([...partial.snapshot.foundHiddenObjectIds].sort(),[...kept].sort());
        await screenshot('chapter_1_partial_old_save_3_of_12.png');
        await send('Page.reload');await until(s=>s.ready&&s.progress.requiredCompleted===3&&!s.completion,'Reduced partial save did not survive refresh');
        const migrated=await evaluate("JSON.parse(localStorage.getItem('chriken_living_city_v1_save_v1'))");
        assert.deepEqual(migrated.unlockedCityIds,fixture.unlockedCityIds);
        for(const [id,progress]of Object.entries(fixture.cities))if(id!==first)assert.deepEqual(migrated.cities[id],progress);
        reports.reducedPartialRestore={previousFound:kept.length+retired.length,retainedFound:3,total:12,refreshed:true,otherCitiesUnchanged:true};
        const fresh={...fixture,currentCityId:first,completedCityIds:[],cities:{demo_city:fixture.cities.demo_city??{completedTaskIds:[],foundHiddenObjectIds:[],discoveredChickenIds:[],interactiveStates:{}}}};
        await evaluate(`(()=>{localStorage.setItem('chriken_living_city_v1_save_v1',${JSON.stringify(JSON.stringify(fresh))});return true;})()`);
        await send('Page.reload');await until(s=>s.ready&&s.progress.requiredCompleted===0&&!s.completion,'Fresh reduced chapter did not reset');
    }
    residentObservations.clear();
    reports.chapters=[];
    for(let chapter=0;chapter<chapterIds.length;chapter++) {
        const cityId=chapterIds[chapter];
        let current=await until(s=>s.ready&&s.cityId===cityId&&s.sceneLayers===s.expectedLayers&&s.ground&&
            s.npcs.length===s.expectedResidents&&s.npcs.every(n=>n.celsReady&&!n.proceduralBody)&&
            s.targets.length===s.expectedTargets&&s.targets.every(t=>t.loaded)&&s.stickers.every(c=>c.loaded)&&
            s.interactions.length===s.expectedReveals&&s.interactions.every(i=>i.loaded),`${cityId}: PNG assets did not load`);
        const result={cityId,mapSize:current.mapSize,layers:current.sceneLayers,sceneLayers:current.sceneLayers,sceneLoaded:current.sceneLoaded,
            buildings:current.expectedBuildings,
            targets:current.targets.length,revealCount:current.interactions.length,residents:current.npcs.length,
            camera:current.camera,authoredResidents:current.authoredResidents,
            eventDefinitions:current.events.map(e=>({id:e.id,repeat:e.repeat,propAt:e.propAt})),
            lifeGroups:current.lifeGroups,reveals:[],collections:[]};
        assert.equal(current.progress.requiredCompleted,0,'New chapter inherited another chapter progress');
        assert.equal(current.mapSize.width,current.blueprintMap.width,'Runtime config and blueprint have different widths');
        assert.equal(current.mapSize.height,current.blueprintMap.height,'Runtime config and blueprint have different heights');
        if (chapter === 0) {
            assert.equal(current.mapSize.width,expectedFirstBlueprint.map.width,'Build does not contain the current first-chapter width');
            assert.equal(current.sceneLayers,expectedFirstBlueprint.artSlots.length,'Build does not contain the current first-chapter artwork');
            assert.equal(current.expectedTargets,expectedFirstBlueprint.hiddenObjectSlots.length,'Build does not contain all current search targets');
            assert.equal(current.expectedResidents,expectedFirstBlueprint.npcPlans.length,'Build does not contain all current residents');
            assert.equal(current.expectedBuildings,expectedFirstBlueprint.artSlots.filter(slot=>slot.layer==='building_back').length,
                'Build does not contain all current buildings');
            assert.deepEqual(current.npcs.map(actor=>actor.id).sort(),expectedFirstBlueprint.npcPlans.map(actor=>actor.id).sort(),
                'Build does not contain the current resident identities');
            assert.deepEqual(current.authoredResidents.map(actor=>({id:actor.id,route:actor.route})),
                expectedFirstBlueprint.npcPlans.map(actor=>({id:actor.id,route:actor.route})),
                'Build does not contain the current resident routes');
            assert.deepEqual(current.sceneArt.map(slot=>({id:slot.id,center:slot.center,size:slot.size})),
                expectedFirstBlueprint.artSlots.map(slot=>({id:slot.id,center:slot.center,size:slot.size})),
                'Build does not contain the current scene placements');
            for (const slot of current.sceneArt) {
                assert.deepEqual(slot.sprite?.size,{width:slot.size.width*slot.textureScale,height:slot.size.height*slot.textureScale},
                    `${slot.id}: built texture density differs from its declared world size`);
            }
            result.sceneTextureDensity=current.sceneArt.map(slot=>({id:slot.id,worldSize:slot.size,textureScale:slot.textureScale,textureSize:slot.sprite.size}));
            assert.deepEqual(current.npcClues,expectedFirstBlueprint.npcClues??{},'Build does not contain the current natural dialogue');
            for(const target of expectedFirstBlueprint.hiddenObjectSlots) {
                const actual=current.targets.find(item=>item.id===target.id);
                assert.ok(actual&&Math.hypot(actual.worldX-target.at.x,actual.worldY-target.at.y)<.05,
                    `${target.id}: build does not contain the current target coordinate`);
            }
            for(const interaction of expectedFirstBlueprint.interactiveSlots??[]) {
                const actual=current.interactions.find(item=>item.id===interaction.id);
                assert.ok(actual&&Math.hypot(actual.worldX-interaction.at.x,actual.worldY-interaction.at.y)<.05,
                    `${interaction.id}: build does not contain the current container coordinate`);
            }
            assert.equal(current.lifeGroups.length,expectedFirstBlueprint.lifeGroups?.length??0,'Build does not contain all living groups');
            assert.deepEqual(current.authoredResidents.find(n=>n.id==='tea_vendor')?.routeStart,
                reports.expectedFirstChapter.vendorFoot,'Build does not contain the current vendor footpoint');
            assert.deepEqual(current.events.find(e=>e.id==='tea_exchange')?.propAt,
                reports.expectedFirstChapter.teaCupAt??null,'Build does not contain the current tea-cup point');
            if (current.mapSize.width >= 2304) {
                assert.equal(current.mapSize.width,2304);
                assert.equal(current.sceneLayers,expectedFirstBlueprint.artSlots.length);
            }
        }
        assert.equal(current.stickers.length,current.expectedTargets);
        if(reviewBatch==='ai_image_v17') {
            const journal=await evaluate(`(()=>{${context}return {panel:view.taskPanelGraphics.spriteFrame?.uuid,
                cards:[...view.stickerCards.values()].map(c=>c.background.spriteFrame?.uuid),progress:view.journalProgressLabel?.string};})()`);
            const uiBase=`assets/bundles/city_${cityId}/ui`;
            assert.equal(journal.panel,JSON.parse(fs.readFileSync(`${uiBase}/ui_journal_panel_v17.png.meta`)).subMetas.f9941.uuid);
            const cardUuid=JSON.parse(fs.readFileSync(`${uiBase}/ui_journal_card_v17.png.meta`)).subMetas.f9941.uuid;
            assert.ok(journal.cards.every(id=>id===cardUuid));
            assert.equal(journal.progress,`已找到 0/${current.expectedTargets}`);
            result.journal=journal;
        }
        for(const group of current.lifeGroups) {
            assert.ok(group.artSlotIds.length>0,`${group.id}: life group has no PNGs`);
            assert.equal(group.loadedArtSlotIds.length,group.artSlotIds.length,`${group.id}: life group is text-only or missing PNGs`);
        }
        assert.ok(current.stickers.every(s=>s.alpha===255),'Pending target icons lost their actual colors');
        result.targetSpriteFrames=verifyTargetFrames(current);
        assert.ok(current.stickers.filter(s=>s.active).every(s=>s.screen.y>780&&s.screen.y<960&&s.screen.x>0&&s.screen.x<444));
        await screenshot(`chapter_${chapter+1}_initial_444x960.png`);
        await send('Emulation.setDeviceMetricsOverride',{width:360,height:780,deviceScaleFactor:1,mobile:true});
        await wait(250);current=await state();
        assert.ok(current.stickers.filter(s=>s.active).every(s=>s.screen.x>0&&s.screen.x<360&&s.screen.y>600&&s.screen.y<780));
        await screenshot(`chapter_${chapter+1}_initial_360x780.png`);
        console.log(JSON.stringify({stage:'initial_screenshots_ready',chapter:chapter+1,cityId,
            mapSize:current.mapSize,loadedLayers:current.sceneLayers,targets:current.targets.length,
            buildings:current.expectedBuildings,residents:current.npcs.length,
            directory:out}));
        await send('Emulation.setDeviceMetricsOverride',{width:444,height:960,deviceScaleFactor:1,mobile:true});
        await wait(200);
        result.targetTrayPaging=await verifyTrayPaging(chapter);
        await setZoom('detail');
        await wait(250);await screenshot(`chapter_${chapter+1}_detail_max_zoom.png`);
        await setZoom('initial');
        if (chapter === 0 && current.mapSize.width >= 2304) {
            result.wideExploration = await exploreWideChapter();
            result.densityScreens = await densityScreens();
            await setZoom('initial');
        }
        current=await state();const beforeMotion=current.npcs;
        await wait(10000);current=await state();
        const moved=current.npcs.filter(n=>{const old=beforeMotion.find(o=>o.id===n.id);return Math.hypot(n.x-old.x,n.y-old.y)>10;});
        assert.ok(moved.length>=3,'Residents did not walk');result.movingResidents=moved.map(n=>n.id);
        await screenshot(`chapter_${chapter+1}_after_10_seconds.png`);
        if (chapter === 0) {
            result.repeatableTea = await observeRepeatableTea(40);
            await screenshot('chapter_1_after_40_second_tea_observation.png');
            if(current.events.some(event=>event.id==='tea_invitation'))
                result.activeTeaInvitation=await verifyActiveTeaInvitation();
            result.residentTapActivities=await verifyOrdinaryResidentActivities();
            result.newResidentAnimations=await verifyResidentAnimation();
            if(reviewBatch==='ai_image_v12')result.playbackRecordings=await recordResidentPlayback();
            result.naturalDialogue=await verifyNaturalDialogue(chapter);
        }
        result.facilityDiscoveries=await verifyFacilities(chapter);
        result.dialogueFit=await verifyDialogueFit(chapter);
        result.explicitHints=await verifyExplicitHints(chapter);
        const definitions=await evaluate(`(()=>{${context}return city.content.config.hiddenObjects;})()`);
        const firstVisible=definitions.find(t=>!t.visibleCondition).id;
        current=await focus(firstVisible);let point=current.targets.find(t=>t.id===firstVisible).screen;
        await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
        await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+60,y:point.y+25,button:'left',buttons:1});
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+60,y:point.y+25,button:'left',clickCount:1});
        const afterDrag=await state();
        assert.equal(afterDrag.progress.requiredCompleted,0,'Drag collected an object');
        assert.equal(afterDrag.missedTapFeedback,false,'Drag produced a missed-tap message');
        const concealed=definitions.filter(t=>t.visibleCondition);
        const revealGroups=new Map();
        for(const target of concealed) {
            const id=target.visibleCondition.objectId;
            if(!revealGroups.has(id))revealGroups.set(id,[]);
            revealGroups.get(id).push(target);
        }
        for(const [id,targets] of revealGroups) {
            const target=targets[0];
            current=await focus(id);
            for(const item of targets)assert.equal(current.targets.find(t=>t.id===item.id).active,false);
            const prerequisite=await evaluate(`(()=>{${context}const task=view.taskManager.getTaskStates()
                .find(t=>t.config.targetId===${JSON.stringify(target.id)});return view.hintTargets.resolve(task.config)[0]?.id;})()`);
            assert.equal(prerequisite,id,'Hint failed to choose the closed reveal');
            await screenshot(`chapter_${chapter+1}_${id}_closed.png`);
            assert.ok(!current.interactions.find(i=>i.id===id).foreground?.active,`${id}: front rim shown while closed`);
            await click(current.interactions.find(i=>i.id===id).screen);
            current=await until(s=>s.interactions.find(i=>i.id===id).state===target.visibleCondition.state&&
                targets.every(t=>s.targets.find(item=>item.id===t.id).active),
                `Failed to reveal ${target.id}`);
            assert.equal(current.progress.requiredCompleted,0,'Reveal counted as pickup');
            assert.equal(current.saved.interactiveStates[id],target.visibleCondition.state);
            await wait(250);await screenshot(`chapter_${chapter+1}_${id}_opened.png`);
            current=await state();
            const foreground=current.interactions.find(i=>i.id===id).foreground;
            if(foreground){
                assert.ok(foreground.active&&foreground.loaded&&foreground.sameTexture,`${id}: rim is not using its generated open PNG`);
                assert.ok(foreground.index>foreground.baseIndex);
                for(const t of targets)assert.ok(foreground.index>current.targets.find(v=>v.id===t.id).depthIndex,`${id}: target still covers front rim`);
                const start=Math.round(foreground.baseRect.height*foreground.start);
                assert.equal(foreground.rect.y,foreground.baseRect.y+start);
                assert.equal(foreground.rect.height,foreground.baseRect.height-start);
            }
            result.reveals.push({id,targets:targets.map(t=>t.id),saved:true,...(foreground?{generatedFrontRim:foreground}:{})});
        }
        assert.equal(result.reveals.length,result.revealCount,'A configured reveal has no tested target');
        await send('Page.reload');
        current=await until(s=>s.ready&&s.cityId===cityId&&s.targets.every(t=>t.loaded)&&s.interactions.every(i=>i.loaded)&&s.stickers.every(c=>c.loaded),
            'Reveal save failed to reload');
        assert.ok(current.interactions.every(i=>i.state===revealGroups.get(i.id)?.[0].visibleCondition.state));
        assert.ok(current.interactions.every(i=>!i.foreground||(i.foreground.active&&i.foreground.loaded&&i.foreground.sameTexture)),'Opened front rims failed to restore');
        for(const discovery of result.facilityDiscoveries)assert.ok(current.sceneDiscoveryIds.includes(discovery.id));
        const requests=current.requests;
        const requestedIds=new Set(requests.map(request=>request.requiredTargetId));
        const collectionOrder=[...definitions.filter(t=>requestedIds.has(t.id)),...definitions.filter(t=>!requestedIds.has(t.id))];
        result.residentRequests=[];
        for(let index=0;index<collectionOrder.length;index++) {
            const id=collectionOrder[index].id;current=await focus(id);point=current.targets.find(t=>t.id===id).screen;
            assert.ok(point.y<790,`${id} under tray`);
            await click(point,0);await click(point,0);
            if(current.stickerPages>1) {
                const flying=await until(s=>s.progress.requiredCompleted===index+1&&s.flights>0,
                    `${id} did not start its collection flight`,10);
                assert.equal(flying.stickerPage,Math.floor(definitions.findIndex(t=>t.id===id)/12),'Collection did not show its destination page');
                const duringSwipe=await swipeTray(flying.stickerPage===0?-1:1,true);
                assert.equal(duringSwipe.stickerPage,flying.stickerPage,'Tray changed page while the object was airborne');
                assert.equal(duringSwipe.missedTapFeedback,false);
            }
            current=await until(s=>s.progress.requiredCompleted===index+1&&s.stickers.find(c=>c.id===id).collected&&
                s.flights===0&&s.landing===0,`${id} failed to land in tray`);
            assert.equal(current.saved.completedTaskIds.length,index+1);assert.equal(current.targets.find(t=>t.id===id).active,false);
            result.collections.push({id,saved:true});
            for(const request of requests.filter(request=>request.requiredTargetId===id)) {
                result.residentRequests.push(await verifyCompletedRequest(request,chapter));
            }
        }
        current=await until(s=>s.completion,'Completion did not open');
        assert.equal(current.progress.allRequiredComplete,true);
        assert.equal(current.completionArtReady,true);
        assert.ok(current.completionText.includes(`第 ${chapter+1} 关 / 共 3 关`));
        await screenshot(`chapter_${chapter+1}_completed.png`);
        reports.chapters.push(result);
        await send('Page.reload');
        current=await until(s=>s.ready&&s.cityId===cityId&&s.stickers.length===s.expectedTargets&&s.stickers.every(c=>c.collected&&c.loaded)&&s.completion,
            'Completed chapter save did not restore');
        assert.equal(current.progress.requiredCompleted,result.targets);assert.equal(current.flights,0);
        assert.equal(current.completionArtReady,true,'Restored chapter completion PNGs did not load');
        if(chapter<chapterIds.length-1) {
            point=await evaluate(`(()=>{${context}return screen(manager.ui.nextButton);})()`);
            await click(point);
            await until(s=>s.ready&&s.cityId===chapterIds[chapter+1], 'Travel did not load next chapter',200);
        }
    }
    reports.savedJourney=await evaluate("JSON.parse(localStorage.getItem('chriken_living_city_v1_save_v1'))");
    assert.ok(reports.savedJourney.cities.demo_city,'Retired progress should be retained, not deleted');
    for(const chapter of reports.chapters)assert.equal(reports.savedJourney.cities[chapter.cityId].completedTaskIds.length,chapter.targets);
    assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);assert.deepEqual(failedRequests,[]);
    reports.status='passed';reports.totalUniqueCollected=reports.chapters.reduce((total,c)=>total+c.collections.length,0);
    reports.totalReveals=reports.chapters.reduce((total,c)=>total+c.reveals.length,0);
    reports.runtimeErrors=errors;reports.runtimeWarnings=warnings;reports.failedRequests=failedRequests;
    reports.wechatPhone='not_run';
    fs.writeFileSync(path.join(out,'runtime_report.json'),JSON.stringify(reports,null,2)+'\n');
    console.log(JSON.stringify({status:'passed',chapters:reports.chapters.length,uniqueTargets:reports.totalUniqueCollected,
        reveals:reports.totalReveals,sceneLayers:reports.chapters.map(c=>c.layers),report:path.join(out,'runtime_report.json')}));
    }
} catch(error) {
    try { await failureCapture?.('failure_snapshot.png'); } catch {}
    fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:error.stack,errors,warnings,failedRequests,reports},null,2)+'\n');
    throw error;
} finally {
    socket?.close();server.close();
    const closed=new Promise(resolve=>{edge.once('close',resolve);setTimeout(resolve,5000);});
    edge.kill();await closed;
    assert.equal(path.dirname(profile),tempRoot);
    try { fs.rmSync(profile,{recursive:true,force:true,maxRetries:6,retryDelay:250}); }
    catch(error) {
        if(!['EPERM','EBUSY','ENOTEMPTY'].includes(error.code))throw error;
        fs.writeFileSync(path.join(out,'cleanup_note.json'),JSON.stringify({status:'temporary_profile_retained',path:profile,reason:error.code,note:'Browser verification already finished; Windows still holds the isolated temporary profile.'},null,2)+'\n');
    }
}

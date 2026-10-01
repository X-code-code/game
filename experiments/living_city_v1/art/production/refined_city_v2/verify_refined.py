"""Mechanical export and spatial review; does not substitute for Cocos or player acceptance."""
import hashlib,json,math
from pathlib import Path
from PIL import Image,ImageDraw,ImageChops
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
BUNDLE=ROOT/"assets/bundles/city_living_city_street_block_01"
scene=json.loads((ROOT/"design/street_block_01.json").read_text(encoding="utf-8"))
manifest=json.loads((HERE/"production_manifest.json").read_text(encoding="utf-8"))
review=HERE/"review";review.mkdir(exist_ok=True)
uuids=set()
for item in manifest["assets"]:
    src=ROOT/item["source"];runtime=ROOT/item["runtime"]
    assert src.read_bytes()==runtime.read_bytes(),item["id"]
    assert hashlib.sha256(src.read_bytes()).hexdigest()==item["sha256"],item["id"]
    with Image.open(src) as image:
        assert list(image.size)==item["size"] and image.mode=="RGBA",item["id"]
        alpha=image.getchannel("A")
        if item["id"]=="lc_ground_paving": assert alpha.getextrema()==(255,255)
        else:
            low,high=alpha.getextrema()
            assert low==0 and high>0,item["id"]
        assert alpha.getbbox() is not None
    meta=json.loads(Path(str(runtime)+".meta").read_text(encoding="utf-8"))
    assert meta["uuid"] not in uuids
    uuids.add(meta["uuid"])
    frame=meta["subMetas"]["f9941"]["userData"]
    assert [frame["rawWidth"],frame["rawHeight"]]==item["size"]
    assert (frame["trimX"],frame["trimY"],frame["trimX"]+frame["width"],frame["trimY"]+frame["height"])==alpha.getbbox()

order={"ground":0,"building_back":10,"street_back":20,"depth":30,"overhead":40,"target_foreground":45,"effects":50}
layers=[]
for slot in scene["artSlots"]:
    layers.append((order[slot["layer"]],-slot.get("footY",slot["center"]["y"]),slot["center"],
                   Image.open(BUNDLE/"simple2d_scene"/(slot["id"]+".png")).convert("RGBA")))
for target in scene["hiddenObjectSlots"]:
    size=target["visualWorldSize"]
    prop=Image.open(BUNDLE/"targets"/(target["id"]+".png")).convert("RGBA").resize((size["width"],size["height"]),Image.Resampling.LANCZOS)
    support=next(slot for slot in scene["artSlots"] if slot["id"]==target["supportArtSlotId"])
    layers.append((30,-support.get("footY",target["at"]["y"])+1,target["at"],prop))
for item in scene["interactiveSlots"]:
    layers.append((30,-item["depthY"],item["at"],Image.open(BUNDLE/"interactions"/(item["id"]+"_opened.png")).convert("RGBA")))

canvas=Image.new("RGBA",(1536,2048))
for _,__,at,im in sorted(layers,key=lambda v:(v[0],v[1])):
    canvas.alpha_composite(im,(round(768+at["x"]-im.width/2),round(1024-at["y"]-im.height/2)))
canvas.save(review/"full_map_authored.png",optimize=True)
for name,focus,scale in (("initial_static_444x960.png",scene["camera"]["initialFocus"],.65625),
                         ("tea_detail_static_444x960.png",{"x":-400,"y":350},1.0546875)):
    vw,vh=444/scale,960/scale
    cx,cy=768+focus["x"],1024-focus["y"]
    canvas.crop((round(cx-vw/2),round(cy-vh/2),round(cx+vw/2),round(cy+vh/2))).resize((444,960),Image.Resampling.LANCZOS).save(review/name)

sheet=Image.new("RGB",(600,4*120),"#F4ECD9");draw=ImageDraw.Draw(sheet)
targets=scene["hiddenObjectSlots"]
for i,target in enumerate(targets):
    x,y=(i%3)*200,(i//3)*120
    draw.text((x+8,y+6),target["id"],fill="#634A3B")
    im=Image.open(BUNDLE/"targets"/(target["id"]+".png")).convert("RGBA")
    sheet.paste(im.resize((66,66),Image.Resampling.LANCZOS),(x+12,y+29),im.resize((66,66),Image.Resampling.LANCZOS))
    tiny=im.resize((25,25),Image.Resampling.LANCZOS)
    sheet.paste(tiny,(x+125,y+49),tiny)
sheet.save(review/"target_contact_sheet.png")
reveals=[]
for target in targets:
    if not target.get("visibleCondition"):continue
    item=next(i for i in scene["interactiveSlots"] if i["id"]==target["visibleCondition"]["objectId"])
    size=item["visualWorldSize"];ts=target["visualWorldSize"]
    alpha=Image.open(BUNDLE/"targets"/(target["id"]+".png")).getchannel("A").resize((ts["width"],ts["height"]))
    target_mask=Image.new("L",(size["width"],size["height"]))
    x=round(size["width"]/2+target["at"]["x"]-item["at"]["x"]-ts["width"]/2)
    y=round(size["height"]/2-target["at"]["y"]+item["at"]["y"]-ts["height"]/2)
    target_mask.paste(alpha,(x,y))
    total=sum(i*n for i,n in enumerate(target_mask.histogram()))
    fractions={}
    for state in ("closed","opened"):
        cover=Image.open(BUNDLE/"interactions"/(item["id"]+"_"+state+".png")).getchannel("A")
        fraction=sum(i*n for i,n in enumerate(ImageChops.multiply(target_mask,cover).histogram()))/total
        fractions[state]=round(fraction,3)
    assert fractions["closed"]>.5,(target["id"],fractions)
    assert fractions["opened"]<.65,(target["id"],fractions)
    reveals.append({"id":target["id"],"coveredAlphaFraction":fractions})
report={"assetsChecked":len(manifest["assets"]),"sourceRuntimeMatches":True,"dimensionsAlphaHashAndMeta":True,
        "revealVisibility":reveals,"runtimeAcceptance":"pending","playerVisualApproval":"pending","wechatPhone":"not_run"}
(HERE/"qa_report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
print(json.dumps(report))

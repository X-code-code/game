"""Mechanical QA for each authored artSlot export and bundle copy."""
import hashlib
import json
from pathlib import Path
from PIL import Image

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
manifest=json.loads((HERE/'scene_manifest.json').read_text(encoding='utf-8'))
blueprint=json.loads((ROOT/'design/street_block_01.json').read_text(encoding='utf-8'))
bundle=ROOT/'assets/bundles/city_living_city_street_block_01/simple2d_scene'
expected={s['id']:s for s in blueprint['artSlots']}
assert len(manifest['assets'])==len(expected)
assert {x['id'] for x in manifest['assets']}==set(expected)
results=[]
for record in manifest['assets']:
    slot=expected[record['id']]
    path=HERE/record['filename']
    im=Image.open(path).convert('RGBA')
    dims=(slot['size']['width'],slot['size']['height'])
    assert im.size==dims,(record['id'],im.size,dims)
    alpha=im.getchannel('A')
    extrema=alpha.getextrema()
    if slot['alpha']:
        assert extrema==(0,255) or (extrema[0]==0 and extrema[1]>0),record['id']
        assert all(alpha.getpixel(pt)==0 for pt in ((0,0),(dims[0]-1,0),(0,dims[1]-1),(dims[0]-1,dims[1]-1))),record['id']
    else:
        assert extrema==(255,255),record['id']
    sha=hashlib.sha256(path.read_bytes()).hexdigest()
    assert sha==record['sha256'],record['id']
    copied=bundle/(record['id']+'.png')
    if copied.exists(): assert hashlib.sha256(copied.read_bytes()).hexdigest()==sha,record['id']
    results.append({'id':record['id'],'dimensions':list(im.size),'alphaExtrema':list(extrema),'sha256':sha,'bundleCopyMatches':copied.exists()})
report={'batchId':manifest['batchId'],'status':'mechanical_pass_visual_pending','checkedAssets':len(results),'source':'render_scene.py','processing':'2x supersample Pillow drawing, Lanczos downsample, optimized PNG RGBA','results':results}
(HERE/'qa_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f"mechanical QA passed: {len(results)} assets; bundle copies present: {sum(r['bundleCopyMatches'] for r in results)}")

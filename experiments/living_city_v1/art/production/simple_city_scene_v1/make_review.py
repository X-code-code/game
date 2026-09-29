"""Composite authored layers at blueprint coordinates for static spatial QA."""
import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
SPEC=json.loads((ROOT/'design/street_block_01.json').read_text(encoding='utf-8'))
ORDER={'ground':0,'building_back':10,'street_back':20,'depth':30,'overhead':40,'target_foreground':45,'effects':50}
canvas=Image.new('RGBA',(1536,2048),(0,0,0,0))
for slot in sorted(SPEC['artSlots'],key=lambda s:(ORDER[s['layer']],-s.get('footY',s['center']['y']))):
    png=Image.open(HERE/'png'/f"{slot['id']}.png").convert('RGBA')
    x=round(768+slot['center']['x']-png.width/2)
    y=round(1024-slot['center']['y']-png.height/2)
    canvas.alpha_composite(png,(x,y))

review=HERE/'review'
review.mkdir(exist_ok=True)
canvas.save(review/'full_map_flat.png',optimize=True)

def camera(name,focus,zoom):
    pixels_per_world=444/1536*zoom*1.62 # placeholder? derive explicit 0.656 at zoom 1.4
    pixels_per_world=0.656*zoom/1.4
    vw=round(444/pixels_per_world); vh=round(960/pixels_per_world)
    cx=768+focus[0];cy=1024-focus[1]
    box=(round(cx-vw/2),round(cy-vh/2),round(cx+vw/2),round(cy+vh/2))
    image=canvas.crop(box).resize((444,960),Image.Resampling.LANCZOS).convert('RGB')
    image.save(review/name,optimize=True)

focus=SPEC['camera']['initialFocus']
camera('initial_444x960.png',(focus['x'],focus['y']),SPEC['camera']['initialZoom'])
camera('legacy_focus_minus150_444x960.png',(-150,20),1.4)
camera('tea_detail_444x960.png',(-295,350),2.25)
camera('wide_444x960.png',(0,20),1.0)
print('review images written')

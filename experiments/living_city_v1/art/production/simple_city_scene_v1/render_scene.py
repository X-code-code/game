"""Deterministic hand-authored 2D layer renderer for street_block_01.

Every PNG has the exact dimensions and origin of its blueprint art slot. The
shapes, palettes, and placements are source art: no generated bitmap is used.
Run with the bundled Python runtime that has Pillow installed.
"""
from __future__ import annotations

import json
import hashlib
import math
import random
import shutil
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
PROD = Path(__file__).resolve().parent
BLUEPRINT = json.loads((ROOT / "design/street_block_01.json").read_text(encoding="utf-8"))
SLOTS = {s["id"]: s for s in BLUEPRINT["artSlots"]}
OUT = PROD / "png"
OUT.mkdir(parents=True, exist_ok=True)
BUNDLE_OUT = ROOT / "assets/bundles/city_living_city_street_block_01/simple2d_scene"
BUNDLE_OUT.mkdir(parents=True, exist_ok=True)
S = 2
INK = "#634A3B"
INK_LIGHT = "#8D6D55"
PAVING = "#E9DFC7"
PAVING_LIGHT = "#F1E7D3"
PAVING_SHADE = "#D9CBAF"
FEATHER = "#F3E6C6"
GOLD = "#D9AB62"
TERRACOTTA = "#B9684D"
WOOD = "#88654A"
SAGE = "#8FA789"
SLATE = "#6F8B95"
CREAM = "#F6E9C9"
DEEP = "#584739"
POT = "#B88E69"


def rgb(hex_color: str, alpha: int = 255):
    h = hex_color.strip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4)) + (alpha,)


class Art:
    def __init__(self, slot):
        self.slot = slot
        self.w = int(slot["size"]["width"])
        self.h = int(slot["size"]["height"])
        self.im = Image.new("RGBA", (self.w*S, self.h*S), rgb(PAVING) if not slot["alpha"] else (0,0,0,0))
        self.d = ImageDraw.Draw(self.im)

    @staticmethod
    def pt(p): return (round(p[0]*S), round(p[1]*S))
    def box(self, xy, fill, outline=INK, width=3, radius=0):
        q = tuple(round(v*S) for v in xy)
        f = rgb(fill) if isinstance(fill,str) else fill
        o = rgb(outline) if isinstance(outline,str) else outline
        if radius:
            self.d.rounded_rectangle(q, radius=round(radius*S), fill=f, outline=o, width=max(1,round(width*S)) if outline else 1)
        else:
            self.d.rectangle(q, fill=f, outline=o, width=max(1,round(width*S)) if outline else 1)
    def poly(self, points, fill, outline=INK, width=3):
        p=[self.pt(v) for v in points]
        self.d.polygon(p, fill=rgb(fill) if isinstance(fill,str) else fill)
        if outline:
            self.d.line(p+[p[0]], fill=rgb(outline) if isinstance(outline,str) else outline, width=max(1,round(width*S)), joint="curve")
    def line(self, points, fill=INK, width=3):
        self.d.line([self.pt(v) for v in points],fill=rgb(fill) if isinstance(fill,str) else fill,width=max(1,round(width*S)),joint="curve")
    def ellipse(self, xy, fill, outline=INK, width=3):
        q=tuple(round(v*S) for v in xy)
        self.d.ellipse(q,fill=rgb(fill) if isinstance(fill,str) else fill,outline=rgb(outline) if isinstance(outline,str) else outline,width=max(1,round(width*S)) if outline else 1)
    def arc(self, xy, start, end, fill=INK, width=2):
        self.d.arc(tuple(round(v*S) for v in xy),start,end,fill=rgb(fill),width=max(1,round(width*S)))
    def save(self,path):
        self.im.resize((self.w,self.h),Image.Resampling.LANCZOS).save(path,optimize=True)


def roof_tiles(a, x0,y0,x1,y1, color=INK_LIGHT, step=35):
    for row,y in enumerate(range(y0+12,y1-7,step)):
        a.line([(x0+5,y),(x1-5,y+2)],color,1.7)
        n=int((x1-x0-10)/26)
        for j in range(n):
            x=x0+10+j*26+(13 if row%2 else 0)
            if x<x1-8: a.line([(x,y),(x-2,y+10)],color,1.2)


def cup(a,cx,cy,scale=1,color=CREAM):
    r=8*scale
    a.ellipse((cx-r,cy-r*.55,cx+r,cy+r*.55),color,INK,1.7)
    a.arc((cx+r*.5,cy-r*.35,cx+r*1.6,cy+r*.75),300,110,INK,1.5)
    a.arc((cx-r*.4,cy-r*.2,cx+r*.4,cy+r*.2),0,180,INK_LIGHT,1)


def jar(a,x,y,w=24,h=32,color=POT):
    a.ellipse((x+2,y+h*.7,x+w-2,y+h+2),rgb(DEEP,55),None)
    a.poly([(x+4,y+8),(x+2,y+h-8),(x+7,y+h),(x+w-7,y+h),(x+w-2,y+h-8),(x+w-4,y+8)],color,INK,2)
    a.ellipse((x+4,y+2,x+w-4,y+12),CREAM,INK,2)
    a.line([(x+5,y+16),(x+w-5,y+15)],INK_LIGHT,1)


def crate(a,x,y,w,h,fill=GOLD):
    a.poly([(x,y+6),(x+w-7,y),(x+w,y+h-8),(x+8,y+h)],fill,INK,2.4)
    a.line([(x+2,y+12),(x+w-3,y+8)],INK_LIGHT,2)
    a.line([(x+8,y+h-5),(x+w-6,y+6)],INK_LIGHT,2)
    for k in [0.3,0.68]:
        q=x+w*k;a.line([(q,y+8),(q+5,y+h-4)],INK_LIGHT,1.5)


def leaf(a,x,y,r=8,color=SAGE):
    a.ellipse((x-r,y-r*.65,x+r,y+r*.65),color,INK_LIGHT,1)
    a.line([(x-r*.6,y+r*.3),(x+r*.6,y-r*.3)],INK_LIGHT,1)


def draw_ground(a):
    w,h=a.w,a.h
    # The public collision polygons include the sidewalks. The lighter traffic
    # lanes are narrower: 416 px north/south, 190 px east/west. Keeping the
    # sidewalks walkable preserves every authored NPC route.
    west,east=w/2-208,w/2+208
    north,south=h/2-94,h/2+96
    a.box((west,0,east,h),PAVING_LIGHT,None)
    a.box((0,north,w,south),PAVING_LIGHT,None)
    # Shopfront paving is a succession of small, usable doorstep spaces,
    # rather than an unbroken second road. These lie under separate props.
    for x0,x1 in ((395,west-6),(east+6,1140)):
        for y0,y1 in ((70,390),(450,north-18),(south+20,1490),(1530,1940)):
            a.box((x0,y0,x1,y1),"#E2D5BB",None)
            for yy in range(round(y0+14),round(y1-6),30):
                a.line([(x0+9,yy),(x1-9,yy+2)],"#CDBB9D",1.2)
            for yy in range(round(y0+27),round(y1-6),60):
                for xx in range(round(x0+22),round(x1-8),52):
                    a.line([(xx,yy-12),(xx+2,yy+5)],"#CCBA9D",1)
    # Pair of low curb stones follows the traffic edge, with a rounded
    # pedestrian crossing at the center. No height or collision is implied.
    for x in (west,east):
        for y0,y1 in ((20,north-10),(south+9,h-20)):
            a.line([(x,y0),(x,y1)],PAVING_SHADE,7)
            a.line([(x+3,y0),(x+3,y1)],INK_LIGHT,1)
            for yy in range(round(y0+25),round(y1-14),58):
                a.line([(x-2,yy),(x+5,yy+3)],"#BCAA8F",1)
    for y in (north,south):
        for x0,x1 in ((16,west-11),(east+11,w-16)):
            a.line([(x0,y),(x1,y)],PAVING_SHADE,7)
            a.line([(x0,y+3),(x1,y+3)],INK_LIGHT,1)
    # Small worn slabs in the travel lanes: more frequent at shop doors and
    # less contrast in the center so the moving chicks stay legible.
    rng=random.Random(43)
    for row,y in enumerate(range(30,h-20,38)):
        for x0,x1 in ((west+12,east-12),) if not north <= y <= south else ((12,w-12),):
            x=x0+(row%3)*13
            while x<x1-13:
                length=min(rng.randint(42,92),x1-x-4)
                yy=y+rng.randint(-3,3)
                a.line([(x+3,yy),(x+length-6,yy+rng.randint(-2,2))],"#D8CAB1",1.2)
                if rng.random()>.38:
                    a.line([(x+length,yy-23),(x+length+rng.randint(-3,3),yy)],"#D9CCB4",1)
                x+=length+rng.randint(4,13)
    # Shallow wheel wear is confined to the travel lane, not across shopfronts.
    for x in (w/2-82,w/2+84):
        a.line([(x,30),(x+8,north-8)],"#E3D8C2",5)
        a.line([(x+8,south+8),(x+15,h-38)],"#E3D8C2",5)
    # Paired floor-only thresholds connect the many narrow fronts to paving.
    for x0,x1 in ((22,171),(198,369),(1162,1325),(1350,1511)):
        for yy in (374,1485):
            a.poly([(x0,yy),(x1,yy),(x1-8,yy+19),(x0+7,yy+20)],"#D4C2A5",None)
            a.line([(x0+11,yy+13),(x1-12,yy+12)],"#BAA386",1.3)
    # Low ground-only puddle/wear marks stay muted at normal phone scale.
    for cx,cy,rx,ry in [(748,308,42,10),(806,1390,31,8),(383,1595,49,8),(1077,930,36,8)]:
        a.ellipse((cx-rx,cy-ry,cx+rx,cy+ry),"#DDD4C1",None)
        a.arc((cx-rx+4,cy-ry+2,cx+rx-4,cy+ry-1),190,350,"#C8BCA8",1)
    for cx,cy in [(500,588),(430,1320),(1045,735),(1150,1435),(878,1650),(286,890)]:
        for dx,dy in [(0,0),(8,3),(-5,7)]:
            a.poly([(cx+dx,cy+dy),(cx+dx+7,cy+dy+1),(cx+dx+1,cy+dy+4)],"#CFAE86",None)
    # Inlaid stone crossing marker gives the otherwise broad public lane a
    # landmark while remaining flat, walkable ground, not a fake target prop.
    cx,cy=768,1024
    a.ellipse((cx-69,cy-53,cx+69,cy+53),"#DCC9A9","#BBA787",1.7)
    a.ellipse((cx-58,cy-44,cx+58,cy+44),PAVING_LIGHT,"#C3AF91",1.5)
    a.poly([(cx,cy-35),(cx+9,cy-8),(cx+39,cy),(cx+9,cy+8),(cx,cy+33),(cx-9,cy+8),(cx-38,cy),(cx-10,cy-8)],"#BCA88E","#9F8E7B",1.5)
    a.ellipse((cx-6,cy-6,cx+6,cy+6),PAVING_LIGHT,"#A6947D",1)
    for xx,yy in [(624,1005),(652,1080),(927,1016),(892,1110),(747,852),(810,1166)]:
        a.line([(xx-17,yy),(xx+16,yy-2)],"#CBB99B",2)
        a.line([(xx+13,yy-3),(xx+18,yy-8)],"#CBB99B",1)
    # The lane child has marked a small hopping game in chalk. It is worn
    # into the road surface, so pedestrians can walk over it freely.
    for i,(x,y) in enumerate(((714,727),(714,765),(680,803),(714,803),(714,841))):
        a.poly([(x,y+3),(x+28,y),(x+31,y+32),(x+2,y+35)],None,"#D2C4A9",1.6)
        if i in (0,4):
            a.arc((x+9,y+9,x+22,y+24),205,345,"#D1C1A5",1)
    for cx,cy in ((628,870),(606,786),(745,673),(830,899),(497,1084),(876,1165)):
        for dx,dy in ((0,0),(7,-3),(-4,5)):
            a.ellipse((cx+dx-2,cy+dy-2,cx+dx+2,cy+dy+2),"#C8B89D",None)


def narrow_shop(a, role, roof_kind, wall, roof, awning):
    """A 1-door street house, authored at chick scale rather than a giant shop."""
    w,h=a.w,a.h
    a.ellipse((9,h-23,w-7,h-5),rgb(DEEP,29),None)
    a.poly([(8,78),(w-10,77),(w-11,h-25),(9,h-24)],wall,INK,2.5)
    if roof_kind=="gable":
        a.poly([(3,96),(w*.5,12),(w-3,96),(w-7,117),(8,116)],roof,INK,2.7)
        for yy in (54,70,88):
            span=(yy-10)/86*(w*.48-8)
            a.line([(w*.5-span,yy),(w*.5+span,yy)],INK_LIGHT,1)
    elif roof_kind=="shed":
        a.poly([(3,79),(w-20,27),(w-4,97),(w-10,115),(8,112)],roof,INK,2.7)
        for xx in range(24,w-12,27):
            a.line([(xx,79-(xx-3)*.28),(xx+13,104-(xx-3)*.08)],INK_LIGHT,1)
    else:
        a.poly([(3,99),(25,18),(w-30,20),(w-3,99),(w-9,118),(9,117)],roof,INK,2.7)
        roof_tiles(a,19,43,w-19,96,INK_LIGHT,21)
    a.poly([(10,110),(w-10,110),(w-13,135),(12,136)],awning,INK,2)
    a.line([(18,125),(w-19,125)],"#E5BB8C",1)
    # A glazed work window and a human/chick-sized door create a repeating
    # narrow frontage. Each house gets its own roof, plinth and trade goods.
    x0,x1=18,w-76
    a.box((x0,151,x1,h-52),"#625B50",INK,2.3,2)
    for yy in (187,227,267):
        if yy<h-62: a.line([(x0+4,yy),(x1-4,yy)],"#C5A47B",2.8)
    goods=(SAGE,TERRACOTTA,GOLD) if role in ("herb","grocer") else (SLATE,CREAM,TERRACOTTA)
    for j,xx in enumerate((x0+19,(x0+x1)/2,x1-18)):
        if role in ("cloth","ribbon"):
            a.ellipse((xx-7,160,xx+7,176),goods[j],INK_LIGHT,1)
            a.line([(xx-5,179),(xx+1,222)],goods[j],7)
            a.poly([(xx-7,236),(xx+8,234),(xx+9,255),(xx-5,257)],goods[2-j],INK_LIGHT,1)
        elif role in ("bun","grain","grocer"):
            a.ellipse((xx-10,164,xx+10,178),GOLD,INK_LIGHT,1)
            a.ellipse((xx-11,201,xx+10,219),goods[j],INK_LIGHT,1)
            a.poly([(xx-10,238),(xx+10,238),(xx+8,257),(xx-8,257)],"#C29462",INK_LIGHT,1)
        else:
            jar(a,xx-9,158,18,21,goods[j])
            jar(a,xx-8,199,17,19,goods[2-j])
            a.ellipse((xx-9,242,xx+9,258),goods[j],INK_LIGHT,1)
    a.line([(x0-3,145),(x0-3,h-47)],WOOD,3)
    a.line([(x1+3,145),(x1+3,h-47)],WOOD,3)
    dx0,dx1=w-64,w-17
    a.box((dx0,211,dx1,h-26),"#655147",INK,2.3,3)
    a.box((dx0+5,220,dx1-5,h-27),"#80624F",None)
    a.ellipse((dx1-14,h-79,dx1-9,h-74),GOLD,INK_LIGHT,1)
    a.box((14,h-34,w-14,h-22),"#BB9A76",INK_LIGHT,1.2)
    # A short shelf at ground contact signals a working frontage, without
    # baking independent target objects into the wall art.
    a.line([(21,h-43),(x1,h-44)],"#D8B793",2)
    if role=="herb":
        for xx in (27,49):
            a.ellipse((xx-8,h-73,xx+8,h-56),SAGE,INK_LIGHT,1)
            a.line([(xx,h-60),(xx,h-42)],WOOD,1)
    elif role=="ribbon":
        for j,c in enumerate((TERRACOTTA,GOLD,SAGE)):
            a.line([(dx0+6+j*10,153),(dx0+5+j*10,194)],c,4)
    elif role=="bun":
        a.ellipse((dx0+9,160,dx1-8,178),CREAM,INK_LIGHT,1)
        for xx in (dx0+15,dx0+28): a.ellipse((xx-4,164,xx+4,170),GOLD,None)
    elif role=="ceramic":
        for xx,color in ((27,TERRACOTTA),(54,SAGE)):
            jar(a,xx,h-66,20,29,color)
    elif role=="paper":
        for xx in (25,47,69):
            a.poly([(xx,h-89),(xx+12,h-89),(xx+13,h-57),(xx,h-56)],CREAM,INK_LIGHT,1)
            a.line([(xx+3,h-79),(xx+10,h-79)],INK_LIGHT,1)
    elif role=="grocer":
        a.poly([(18,h-76),(60,h-77),(55,h-39),(22,h-40)],WOOD,INK_LIGHT,1)
        for xx,yy,c in ((27,h-68,GOLD),(41,h-69,TERRACOTTA),(53,h-66,SAGE)):
            a.ellipse((xx-5,yy-5,xx+5,yy+5),c,None)
    elif role=="grain":
        for xx in (25,49):
            a.poly([(xx-8,h-82),(xx+9,h-82),(xx+12,h-39),(xx-10,h-39)],GOLD,INK_LIGHT,1)
            a.line([(xx-5,h-70),(xx+6,h-70)],"#C79A65",1)


def storefront(a,kind):
    # One former 400x560 monumental facade now contains two authored houses.
    # Their common baseline keeps curb goods/targets on their old supports.
    w,h=a.w,a.h
    roles={
        "west_north": (("herb","hip",CREAM,"#A87861",TERRACOTTA),
                       ("ceramic","gable","#EADABC",SLATE,"#A27968")),
        "east_north": (("paper","shed","#E4D7B8",SLATE,"#7C9696"),
                       ("grocer","hip",CREAM,"#A87861",TERRACOTTA)),
        "tailor": (("cloth","hip","#E7D2B3","#8A7263",SLATE),
                   ("ribbon","gable",CREAM,"#AA7A61",TERRACOTTA)),
        "food": (("bun","gable","#E5D8BC","#B77A5A",TERRACOTTA),
                 ("grain","shed","#EAD9B9","#8D8770",SLATE)),
    }[kind]
    gap=8
    unit_w=(w-24-gap)//2
    unit_h=385 if kind in ("tailor","food") else 368
    baseline=h-9
    for i,(role,roof_kind,wall,roof,awning) in enumerate(roles):
        sub=Art({"size":{"width":unit_w,"height":unit_h},"alpha":True})
        narrow_shop(sub,role,roof_kind,wall,roof,awning)
        x=8+i*(unit_w+gap)
        y=baseline-unit_h-(4 if i else 0)
        a.im.alpha_composite(sub.im,(x*S,y*S))


def south_storefront(a, kind):
    # Storefront already leaves a generous, transparent roof setback for the
    # cross street bench and for independent depth-sorted curb merchandise.
    storefront(a,kind)


def south_post_house(a):
    # A compact sorting room and narrow parcel porch, not one 400-wide hall.
    w,h=a.w,a.h
    hall_right=w-106
    a.ellipse((16,h-30,w-10,h-7),rgb(DEEP,31),None)
    a.poly([(16,94),(hall_right-3,92),(hall_right-5,h-28),(17,h-25)],"#E7D5B6",INK,2.6)
    a.poly([(7,101),(29,26),(hall_right-29,24),(hall_right+3,100),(hall_right-8,117),(15,118)],SLATE,INK,2.7)
    a.poly([(30,32),(hall_right-31,30),(hall_right-44,93),(22,95)],"#8DA5A3",None)
    roof_tiles(a,23,46,hall_right-20,93,"#607A84",25)
    a.poly([(17,110),(hall_right-7,108),(hall_right-8,128),(18,130)],"#8B7565",INK,1.8)
    # Parcel shelves fill one broad window; the door retains actor scale.
    a.box((31,155,158,h-38),"#655B4D",INK,2.2,2)
    for yy in (189,229,267):
        a.line([(36,yy),(153,yy-1)],"#D1A97D",3)
        for j,xx in enumerate((46,83,120)):
            a.poly([(xx,yy-27),(xx+25,yy-28),(xx+26,yy-7),(xx-1,yy-7)],
                   (GOLD,TERRACOTTA,SAGE)[j],INK_LIGHT,1)
            a.line([(xx+11,yy-25),(xx+12,yy-8)],"#C9A77E",1)
    a.box((193,203,266,h-30),"#665449",INK,2)
    a.ellipse((193,174,266,231),"#665449",INK,2)
    a.box((201,211,258,h-30),"#775E4A",None)
    a.ellipse((247,246,252,251),GOLD,INK_LIGHT,1)
    a.poly([(207,135),(254,135),(254,160),(207,160)],CREAM,INK_LIGHT,1)
    a.line([(208,138),(230,151),(253,138)],TERRACOTTA,1.6)
    a.box((17,h-29,hall_right-6,h-17),"#BA9A78",INK_LIGHT,1)
    # Side porch is open and lower: parcel staging rather than a second hall.
    x0=hall_right+2
    a.poly([(x0+2,144),(w-18,145),(w-20,h-24),(x0+6,h-24)],"#DCCBAB",INK,1.8)
    a.poly([(x0-8,150),(x0+12,117),(w-17,119),(w-8,151)],"#A57E69",INK,2)
    a.line([(x0+10,148),(x0+10,h-25)],WOOD,4)
    a.line([(w-21,148),(w-21,h-26)],WOOD,4)
    for xx,yy,c in ((x0+18,191,GOLD),(x0+49,184,CREAM),(x0+24,229,SAGE)):
        a.poly([(xx,yy),(xx+24,yy-1),(xx+25,yy+21),(xx-1,yy+22)],c,INK_LIGHT,1)
    a.box((x0+8,h-31,w-17,h-21),"#B39576",INK_LIGHT,1)


def south_grain_house(a):
    # Grain shop is a narrow gabled hall with an open sack-loading lean-to.
    w,h=a.w,a.h
    x0=105
    a.ellipse((15,h-31,w-13,h-7),rgb(DEEP,31),None)
    a.poly([(x0+4,99),(w-16,99),(w-18,h-25),(x0+6,h-25)],"#E6D7B9",INK,2.6)
    mid=(x0+w-15)/2
    a.poly([(x0-3,106),(mid,22),(w-9,105),(w-18,121),(x0+7,122)],"#A96F54",INK,2.7)
    for yy in (62,84,104):
        span=(yy-22)/83*((w-x0)*.48-7)
        a.line([(mid-span,yy),(mid+span,yy)],"#865C4A",1.3)
    a.poly([(x0+8,116),(w-18,115),(w-20,138),(x0+9,139)],"#B67A5A",INK,1.7)
    # Wide service arch is local to this compact hall.
    a.box((x0+56,184,w-70,h-28),"#675648",INK,2.3)
    a.ellipse((x0+56,160,w-70,214),"#675648",INK,2.3)
    a.box((x0+65,203,w-79,h-28),"#8F7155",None)
    for xx in (x0+80,x0+125,x0+170):
        a.poly([(xx-17,238),(xx+17,237),(xx+19,274),(xx-19,275)],GOLD,INK_LIGHT,1.2)
        a.line([(xx-13,248),(xx+13,248)],"#DBBF88",1)
    a.box((x0+19,166,x0+62,246),"#65594D",INK,1.8)
    for yy in (189,224):
        a.line([(x0+22,yy),(x0+59,yy)],"#C19E75",2)
    jar(a,x0+31,170,19,21,POT)
    jar(a,x0+30,201,20,20,CREAM)
    a.box((x0+8,h-29,w-17,h-18),"#B99A77",INK_LIGHT,1)
    # Lean-to for loading: much smaller roof and stacked working baskets.
    a.poly([(13,145),(x0+8,145),(x0+5,h-25),(16,h-24)],"#E0CEAF",INK,1.8)
    a.poly([(6,153),(30,112),(x0+17,122),(x0+11,156)],"#8D8770",INK,2)
    a.line([(22,153),(22,h-24)],WOOD,4)
    a.line([(x0+2,152),(x0+2,h-25)],WOOD,4)
    for xx,yy in ((30,190),(59,187),(43,228)):
        a.poly([(xx-10,yy),(xx+12,yy-2),(xx+16,yy+27),(xx-13,yy+29)],"#B68C60",INK_LIGHT,1.2)
        a.line([(xx-6,yy+11),(xx+10,yy+10)],"#D6B98E",1)
    a.box((17,h-31,x0+7,h-20),"#B99A77",INK_LIGHT,1)


def east_pottery_annex(a):
    # A roofed annex on the existing east shop, behind the separate depth
    # display. Avoid a copied storefront silhouette in this short gap.
    w,h=a.w,a.h
    a.ellipse((15,h-29,w-17,h-7),rgb(DEEP,29),None)
    a.poly([(15,63),(w-17,62),(w-18,h-22),(16,h-20)],"#DCC9A8",INK,2.5)
    a.poly([(7,72),(28,18),(w-30,16),(w-5,70),(w-15,90),(15,91)],SLATE,INK,2.5)
    roof_tiles(a,25,31,w-24,70,"#5F7A83",24)
    a.box((23,103,w-22,h-36),"#665B4C",INK,2)
    a.line([(27,133),(w-26,132)],"#C99F73",4)
    a.line([(27,165),(w-26,164)],"#C99F73",4)
    for x,y,c in ((40,112,TERRACOTTA),(81,109,CREAM),(119,112,SAGE),(158,110,POT),
                  (55,143,POT),(97,143,TERRACOTTA),(141,141,CREAM)):
        jar(a,x-8,y,18,22,c)
    a.line([(17,88),(17,h-22)],WOOD,5)
    a.line([(w-17,87),(w-17,h-22)],WOOD,5)
    a.box((13,h-26,w-13,h-17),"#AF9071",INK_LIGHT,1.2)


def tea_back(a):
    w,h=a.w,a.h
    # Open-sided timber stall, awning exported separately.
    a.poly([(8,30),(w-16,26),(w-13,164),(12,168)],"#D9C49F",INK,3)
    a.box((20,51,w-26,162),"#9B795C",INK,2)
    a.box((27,62,w-34,151),"#665647",INK,2)
    for y in (89,123): a.line([(28,y),(w-34,y)],"#D3A978",5)
    for x,y in [(47,68),(87,70),(133,68),(180,68),(70,101),(110,101),(161,101),(204,100)]:
        jar(a,x,y,23,24,[POT,CREAM,SAGE][int(x)%3])
    # A stove and larger kettle read as a usable work space.
    a.box((23,183,91,258),"#70584A",INK,3,5)
    a.ellipse((37,190,83,211),"#3D3B35",INK,2)
    a.ellipse((47,180,78,202),"#A9A29A",INK,2)
    a.arc((50,167,75,188),190,350,INK,2)
    a.line([(82,196),(94,190)],INK,2)
    for i in range(4):
        cup(a,124+(i%2)*21,208+(i//2)*22,.74)
    a.box((169,184,230,233),WOOD,INK,2)
    for k in range(4): a.line([(177,195+k*9),(222,194+k*9)],"#BC8E62",1)
    a.line([(16,166),(16,h-18)],INK,4)
    a.line([(w-18,165),(w-18,h-18)],INK,4)


def tea_counter(a):
    # Long thin service counter. x=34,y=46 is reserved for separate whistle.
    a.poly([(6,19),(42,15),(48,134),(9,143)],"#B58860",INK,2.5)
    a.poly([(9,143),(48,134),(51,163),(11,169)],WOOD,INK,2.5)
    a.line([(14,152),(46,144)],"#C49A71",2)
    a.line([(15,160),(45,153)],INK_LIGHT,1)
    # Cups live around, rather than on, the click target.
    for x,y,s in [(16,38,.7),(17,60,.65),(39,68,.68),(20,100,.72),(39,110,.67)]: cup(a,x,y,s)
    a.ellipse((17,83,30,93),SAGE,INK_LIGHT,1)
    # Same-family clutter around the whistle's reserved x34,y46 landing.
    a.ellipse((29,20,44,29),CREAM,INK_LIGHT,1)
    a.ellipse((10,118,25,127),"#C69C73",INK_LIGHT,1)
    a.line([(29,80),(39,84)],INK_LIGHT,1)
    a.line([(29,18),(28,132)],"#D0A977",1)


def tea_patio(a):
    # This is a coherent used tea setting rather than decorative icon scatter.
    # The whole furniture cluster stays south of y=100 cross-lane boundary.
    a.ellipse((15,110,150,129),rgb(DEEP,35),None)
    for x,y in ((15,65),(123,79)):
        a.ellipse((x,y+20,x+25,y+33),"#8B6E55",INK,1.5)
        a.ellipse((x-3,y,x+28,y+23),"#B68C62",INK,2)
        a.line([(x+2,y+10),(x+23,y+9)],"#D6B185",1)
    a.poly([(45,39),(121,35),(137,88),(49,95)],"#A97754",INK,2.5)
    a.poly([(51,43),(117,39),(128,81),(55,88)],"#C7A076",INK_LIGHT,1.5)
    a.line([(57,94),(58,119)],WOOD,5)
    a.line([(122,88),(125,115)],WOOD,5)
    a.ellipse((63,49,93,72),CREAM,INK_LIGHT,1.3)
    a.ellipse((67,53,89,68),"#A7B0A0",INK_LIGHT,1)
    a.ellipse((72,44,84,54),"#D4BD9C",INK,1)
    a.arc((81,44,94,58),290,115,INK,1.2)
    cup(a,109,53,.7)
    cup(a,68,80,.66)
    a.poly([(97,72),(119,70),(121,78),(99,80)],"#E4D4AE",INK_LIGHT,1)
    for x in (102,110,116): a.ellipse((x,73,x+3,76),GOLD,None)


def awning(a):
    w,h=a.w,a.h
    a.poly([(6,11),(w-13,11),(w-5,77),(11,76)],TERRACOTTA,INK,3)
    a.poly([(11,13),(w-14,13),(w-18,31),(14,32)],"#D88E65",None)
    for x in range(28,w-8,47):
        a.line([(x,17),(x+9,73)],"#9D614B",1.7)
    for x in range(16,w-8,32):
        a.poly([(x,75),(x+18,76),(x+12,89),(x+4,87)],"#D8A16F",INK_LIGHT,1)
    a.line([(13,74),(w-7,76)],INK,2)


def chestnut_cart(a):
    w,h=a.w,a.h
    a.poly([(19,39),(w-21,38),(w-12,129),(18,133)],"#B78658",INK,3)
    a.poly([(25,48),(w-28,47),(w-21,110),(23,113)],"#D1AB7B",INK_LIGHT,1.5)
    # Reserved target center ~75,80. Nuts group outside it.
    for x,y in [(39,64),(47,87),(120,61),(142,77),(124,93),(137,106),(41,104)]:
        a.ellipse((x-8,y-7,x+8,y+7),"#8F5C3E",INK,1.1)
        a.arc((x-6,y-5,x+5,y+4),200,330,"#D6A370",1)
    a.poly([(145,60),(160,55),(166,92),(151,98)],CREAM,INK,1.6)
    a.line([(149,66),(161,67)],INK_LIGHT,1)
    a.box((57,132,130,187),WOOD,INK,3)
    a.box((63,138,124,179),"#A56C4C",INK_LIGHT,1)
    a.ellipse((82,143,108,170),"#584A3C",INK,2)
    # Wheels are drawn once in the near lip depth layer, not duplicated here.
    a.line([(35,187),(149,187)],"#684E3F",2)


def chestnut_front(a):
    w,h=a.w,a.h
    a.poly([(9,18),(w-10,18),(w-18,53),(13,55)],"#9E704F",INK,3)
    a.line([(16,26),(w-17,26)],"#D5AA73",3)
    a.line([(22,44),(w-25,43)],INK_LIGHT,1)
    for x in (29,w-49):
        a.ellipse((x,53,x+34,91),"#76695A",INK,2)
        a.ellipse((x+10,64,x+24,78),GOLD,INK,1)


def tree(a):
    w,h=a.w,a.h
    a.ellipse((w*.39,h-38,w*.63,h-15),rgb(DEEP,60),None)
    a.poly([(w*.46,h-25),(w*.42,h*.56),(w*.21,h*.41),(w*.26,h*.35),(w*.49,h*.52),(w*.55,h*.52),(w*.78,h*.32),(w*.82,h*.37),(w*.61,h*.58),(w*.60,h-24)],WOOD,INK,3)
    a.line([(w*.5,h-36),(w*.5,h*.51)],"#BA9671",2)
    # Lobed transparent canopy can pass in front of a moving actor.
    for x,y,rx,ry,c in [(40,95,35,56,SAGE),(69,54,46,42,"#A1B293"),(121,37,54,34,"#91AA89"),(169,81,36,50,SAGE),(122,111,61,50,"#88A47D"),(69,139,43,39,"#9DB394")]:
        a.ellipse((x-rx,y-ry,x+rx,y+ry),c,INK,2)
        for dx,dy in [(-12,4),(10,-8)]: a.arc((x+dx-10,y+dy-8,x+dx+12,y+dy+8),190,340,"#B7C2A1",1.4)
    for x,y in [(42,87),(85,115),(149,79),(114,25),(61,35)]:
        a.ellipse((x-4,y-4,x+4,y+4),"#C68B63",None)


def planter(a):
    w,h=a.w,a.h
    a.ellipse((19,h-23,w-11,h-8),rgb(DEEP,45),None)
    a.poly([(20,64),(w-17,63),(w-29,105),(29,104)],TERRACOTTA,INK,2.5)
    a.ellipse((19,55,w-17,74),WOOD,INK,2.5)
    for x,y,r in [(32,45,17),(53,37,21),(74,48,18),(58,21,14)]: a.ellipse((x-r,y-r*.67,x+r,y+r*.67),SAGE,INK_LIGHT,1.5)
    for x,y in [(33,55),(68,54),(53,43)]: a.ellipse((x-5,y-6,x+5,y+6),"#D29A6E",INK_LIGHT,1)


def bench(a):
    w,h=a.w,a.h
    a.ellipse((10,70,w-8,87),rgb(DEEP,45),None)
    a.poly([(12,20),(w-12,17),(w-6,54),(9,57)],"#B58B61",INK,2.5)
    for y in (29,41): a.line([(18,y),(w-18,y-2)],INK_LIGHT,2)
    a.line([(27,56),(27,83)],WOOD,6);a.line([(w-28,54),(w-28,82)],WOOD,6)
    a.line([(20,83),(39,83)],INK,2);a.line([(w-39,82),(w-18,82)],INK,2)
    a.ellipse((97,28,119,43),CREAM,INK_LIGHT,1.2)


def tailor_goods(a):
    w,h=a.w,a.h
    a.ellipse((12,106,w-10,121),rgb(DEEP,45),None)
    a.poly([(9,36),(w-12,30),(w-7,101),(12,108)],"#9E755A",INK,2.5)
    for i,c in enumerate((SLATE,SAGE,TERRACOTTA)):
        x=21+i*21
        a.ellipse((x,47,x+26,66),c,INK,1.5)
        a.line([(x+12,62),(x+15,95)],c,15)
        a.line([(x+9,64),(x+11,95)],INK_LIGHT,1)
    # Sewing tray target center is x~91,y~42. Keep its center vacant.
    a.ellipse((72,23,127,67),"#C6A47D",INK,2)
    a.ellipse((78,29,120,61),"#7D6B5C",INK_LIGHT,1)
    for x,y,c in [(85,34,GOLD),(110,52,CREAM),(82,53,TERRACOTTA)]:
        a.ellipse((x-4,y-4,x+4,y+4),c,INK_LIGHT,1)
    a.ellipse((25,93,42,106),CREAM,INK_LIGHT,1)


def tailor_work_rack(a):
    w,h=a.w,a.h
    a.ellipse((5,127,w-3,146),rgb(DEEP,42),None)
    a.line([(12,29),(12,132)],WOOD,8)
    a.line([(w-13,25),(w-13,132)],WOOD,8)
    for y in (38,86):
        a.line([(10,y),(w-10,y-2)],INK,5)
        a.line([(17,y-5),(w-17,y-7)],"#C49B70",2)
    # Fabric bolts are stacked as useful inventory; the thimble stays on
    # the adjacent dedicated sewing tray, never duplicated here.
    for i,(x,c) in enumerate(((19,SLATE),(39,SAGE),(59,TERRACOTTA),(79,GOLD))):
        a.poly([(x,13+i%2*3),(x+18,12+i%2*3),(x+19,35),(x+1,36)],c,INK_LIGHT,1.3)
        a.line([(x+5,17),(x+15,17)],"#DCC9AA",1)
    for i,(x,c) in enumerate(((20,CREAM),(46,SLATE),(72,SAGE))):
        a.poly([(x,58),(x+27,56),(x+26,77),(x+2,79)],c,INK_LIGHT,1.4)
        a.line([(x+5,64),(x+21,63)],"#D9C9AA",1)
    a.poly([(27,101),(83,98),(78,135),(33,137)],"#B99169",INK,2)
    for y in (108,119,130): a.line([(32,y),(79,y-2)],INK_LIGHT,1.1)
    for x,y,c in ((40,99,TERRACOTTA),(58,97,SLATE),(72,99,CREAM)):
        a.poly([(x-10,y),(x+9,y-2),(x+8,y+11),(x-9,y+12)],c,INK_LIGHT,1)


def curb_flowers(a):
    w,h=a.w,a.h
    a.ellipse((8,111,w-8,126),rgb(DEEP,45),None)
    a.poly([(13,71),(w-15,68),(w-10,115),(17,119)],"#A97C56",INK,2.5)
    for y in (82,100): a.line([(20,y),(w-18,y-2)],"#D5AC7B",2)
    for i,(cx,cy,c) in enumerate(((34,58,SAGE),(66,49,TERRACOTTA),(96,57,GOLD))):
        a.poly([(cx-14,65),(cx+14,64),(cx+10,94),(cx-9,95)],"#B98161",INK,1.8)
        a.ellipse((cx-14,58,cx+14,72),"#785D4E",INK_LIGHT,1.2)
        for dx,dy in ((-9,-16),(0,-25),(10,-18)):
            a.line([(cx,61),(cx+dx,cy+dy)],SAGE,2)
            leaf(a,cx+dx,cy+dy+3,7,SAGE)
        for dx,dy in ((-11,-25),(2,-35),(13,-27)):
            x,y=cx+dx,cy+dy
            for ang in range(0,360,90):
                px=x+math.cos(math.radians(ang))*4
                py=y+math.sin(math.radians(ang))*4
                a.ellipse((px-4,py-4,px+4,py+4),c,INK_LIGHT,.6)
            a.ellipse((x-3,y-3,x+3,y+3),CREAM,None)
    a.poly([(12,57),(38,55),(37,63),(13,65)],"#D6C4A0",INK_LIGHT,1)


def shop_goods(a):
    w,h=a.w,a.h
    a.ellipse((10,128,w-10,146),rgb(DEEP,40),None)
    a.box((21,60,w-17,128),WOOD,INK,2.5,2)
    a.line([(24,85),(w-19,85)],"#D2A67B",4)
    for i,(x,y) in enumerate([(36,27),(66,33),(102,25),(128,34),(46,73),(84,68),(118,68)]):
        jar(a,x,y,21,29,[POT,SAGE,TERRACOTTA,CREAM][i%4])
    a.poly([(22,13),(w-24,14),(w-30,30),(29,29)],"#DDBA85",INK,2)


def pottery(a):
    a.ellipse((4,89,86,108),rgb(DEEP,45),None)
    for x,y,w,h,c in [(4,32,31,63,POT),(30,20,32,73,SAGE),(59,42,26,54,TERRACOTTA)]: jar(a,x,y,w,h,c)


def produce(a):
    a.ellipse((4,103,108,126),rgb(DEEP,45),None)
    for x,y,w,h in [(8,36,48,71),(55,30,48,79)]:
        a.poly([(x,y+15),(x+w,y+13),(x+w-6,y+h),(x+5,y+h)],GOLD,INK,2)
        for dx in (12,29,39):
            for dy in (27,44): a.ellipse((x+dx-7,y+dy-7,x+dx+7,y+dy+7),"#C9855D" if dx%2 else SAGE,INK_LIGHT,1)
        for dx in (15,32): leaf(a,x+dx,y+18,9)
        a.line([(x+6,y+58),(x+w-6,y+61)],INK_LIGHT,1)


def sign(a):
    a.ellipse((15,130,66,144),rgb(DEEP,45),None)
    a.box((34,23,43,132),WOOD,INK,2,2)
    a.poly([(11,32),(62,30),(74,43),(62,56),(12,55)],SAGE,INK,2)
    a.poly([(7,69),(56,69),(56,90),(9,91),(2,80)],SLATE,INK,2)
    a.poly([(49,37),(61,43),(49,49)],CREAM,None)
    a.poly([(18,75),(8,80),(19,86)],CREAM,None)


def lantern(a):
    w,h=a.w,a.h
    a.ellipse((23,h-31,w-22,h-9),rgb(DEEP,45),None)
    a.box((47,67,58,h-18),WOOD,INK,2,3)
    a.line([(53,78),(54,h-32)],"#B9956E",2)
    a.poly([(18,36),(84,36),(75,67),(29,67)],TERRACOTTA,INK,3)
    a.poly([(29,44),(74,44),(69,61),(34,61)],"#E4B77B",INK_LIGHT,1)
    a.poly([(15,34),(51,14),(86,34)],"#8E6852",INK,2.5)
    a.ellipse((40,47,61,62),CREAM,INK_LIGHT,1)
    for x in (31,72): a.line([(x,66),(x+2,79)],INK_LIGHT,1)


def banner(a):
    w,h=a.w,a.h
    a.line([(5,11),(w-7,8)],INK_LIGHT,2)
    a.poly([(11,16),(w-11,13),(w-17,62),(17,63)],TERRACOTTA,INK,2.5)
    a.poly([(18,20),(w-18,17),(w-24,29),(24,31)],"#D18B67",None)
    for x in range(25,w-15,35):
        a.line([(x,59),(x+2,69)],"#AF7457",1.4)
    for x in (37,82,225,370,460): a.line([(x,23),(x+6,54)],"#DDA17A",1.5)
    # Target knot at x330,y40 remains absent; fabric rails continue beneath it.
    a.ellipse((34,35,49,48),"#D7A875",INK_LIGHT,1)
    a.ellipse((445,33,459,47),"#D7A875",INK_LIGHT,1)
    for x,y,c in ((106,37,"#C57D5C"),(214,40,"#D7A875"),(400,36,"#C57D5C")):
        a.poly([(x-9,y-4),(x-2,y-5),(x+1,y),(x-4,y+5),(x-10,y+3)],c,INK_LIGHT,1)
        a.poly([(x+3,y-1),(x+11,y-7),(x+14,y+2),(x+7,y+5)],c,INK_LIGHT,1)
        a.ellipse((x-3,y-3,x+5,y+5),"#E7BD8F",INK_LIGHT,1)


def pennants(a):
    w,h=a.w,a.h
    a.line([(5,9),(w-7,8)],INK_LIGHT,2)
    for i,x in enumerate((20,68,116,169,226,282,340,400)):
        c=(TERRACOTTA,GOLD,SAGE,SLATE)[i%4]
        a.poly([(x,9),(x+28,8),(x+15,45 if i%3 else 37)],c,INK_LIGHT,1.3)
        a.line([(x+7,13),(x+16,30)],"#E7D3A6",1)


def steam(a):
    for x,ys in [(18,(88,66,43,19)),(34,(90,70,47,28)),(47,(84,57,34,16))]:
        a.line([(x,ys[0]),(x-6,ys[1]),(x+4,ys[2]),(x-1,ys[3])],rgb("#EDE8D9",145),5)


def north_herb_stand(a):
    # Narrow working annex at the shop corner, rather than a loose icon on the road.
    a.ellipse((11,166,135,185),rgb(DEEP,40),None)
    a.poly([(12,47),(129,43),(130,154),(14,158)],"#D5BE99",INK,2.5)
    a.poly([(5,42),(17,19),(121,17),(138,42),(130,56),(12,59)],SAGE,INK,2.5)
    a.line([(20,43),(123,40)],"#D9C5A4",2)
    for y in (74,111):
        a.line([(24,y),(121,y-2)],WOOD,7)
        a.line([(28,y-2),(116,y-3)],"#C09B73",2)
    for x,y,c in ((31,58,TERRACOTTA),(59,57,POT),(88,55,CREAM),(113,55,POT),
                  (37,92,POT),(70,91,TERRACOTTA),(102,90,CREAM)):
        a.poly([(x-11,y+5),(x+11,y+5),(x+8,y+26),(x-8,y+26)],c,INK_LIGHT,1.2)
        a.ellipse((x-12,y,x+12,y+9),"#7A6651",INK_LIGHT,1)
        a.line([(x,y+2),(x-2,y-17)],INK_LIGHT,1)
        leaf(a,x-7,y-13,8,"#819C75")
        leaf(a,x+5,y-19,7,SAGE)
    for x in (24,114):
        a.line([(x,53),(x,154)],WOOD,5)
    a.poly([(43,128),(105,124),(111,159),(39,163)],"#B58B60",INK,2)
    for y in (139,151): a.line([(44,y),(106,y-2)],INK_LIGHT,1.3)
    for x,y in ((53,132),(78,129),(94,132)):
        leaf(a,x,y,10,"#79946E")


def east_bun_cart_back(a):
    # A serviceable pushcart: canopy, steaming worktop, stacked bowls and kettle.
    a.ellipse((27,170,139,186),rgb(DEEP,35),None)
    a.line([(34,50),(34,165)],WOOD,6)
    a.line([(129,50),(129,165)],WOOD,6)
    a.poly([(8,54),(20,19),(130,21),(144,57),(137,71),(13,72)],"#A77D60",INK,2.5)
    a.poly([(16,52),(27,27),(125,29),(137,56)],SAGE,INK_LIGHT,1.3)
    for x in (39,72,105): a.line([(x,29),(x+7,55)],"#CAD2AE",1.5)
    a.poly([(13,70),(137,69),(131,82),(21,82)],"#D5A179",INK,1.5)
    a.box((26,107,137,151),"#9C7557",INK,2.5)
    a.poly([(23,96),(137,94),(142,111),(26,115)],"#C29B72",INK,2)
    for x,y in ((49,87),(78,81),(109,87)):
        a.ellipse((x-16,y-9,x+17,y+6),CREAM,INK_LIGHT,1)
        a.ellipse((x-11,y-11,x+12,y-1),"#D7BB90",INK_LIGHT,1)
        for dx in (-6,5): a.ellipse((x+dx-2,y-7,x+dx+2,y-3),"#A87857",None)
    a.ellipse((43,111,81,129),"#787F75",INK,2)
    a.arc((41,95,81,115),190,350,INK,2)
    a.line([(80,113),(89,109)],INK,2)
    for y in (119,129,139):
        a.ellipse((98,y,127,y+9),CREAM,INK_LIGHT,1)
    for x in (56,64,72):
        a.arc((x,65,x+10,85),185,335,"#D6D5C6",1.5)


def east_bun_cart_front(a):
    a.poly([(23,6),(139,3),(135,27),(27,32)],"#B1815C",INK,2.5)
    a.line([(31,15),(129,13)],"#DDB38A",2)
    a.poly([(36,30),(132,27),(124,53),(41,55)],WOOD,INK,2)
    for x in (50,117):
        a.ellipse((x-16,43,x+16,69),"#70665B",INK,2)
        a.ellipse((x-6,51,x+6,61),GOLD,INK_LIGHT,1)
    a.line([(18,18),(31,28)],INK_LIGHT,3)


def west_market_handcart(a):
    a.ellipse((8,87,145,105),rgb(DEEP,40),None)
    a.line([(29,24),(8,62)],WOOD,5)
    a.line([(39,31),(18,72)],WOOD,5)
    a.poly([(30,42),(120,31),(145,64),(42,80)],"#B88C61",INK,2.5)
    a.poly([(42,48),(116,39),(132,61),(49,71)],"#D2A979",INK_LIGHT,1)
    for x,y,c in ((55,36,SAGE),(80,29,TERRACOTTA),(106,26,CREAM)):
        a.poly([(x-15,y+23),(x-11,y-1),(x+10,y-4),(x+17,y+22)],c,INK_LIGHT,1.5)
        a.line([(x-11,y+8),(x+11,y+6)],"#DCC9A7",1)
        a.ellipse((x-3,y+3,x+4,y+8),GOLD,None)
    a.ellipse((53,78,83,103),"#6E665E",INK,2)
    a.ellipse((60,84,76,96),GOLD,INK_LIGHT,1)
    a.line([(112,70),(130,83)],WOOD,5)


def street_water_station(a):
    a.ellipse((8,142,99,160),rgb(DEEP,42),None)
    a.box((48,14,59,116),WOOD,INK,2)
    a.poly([(20,20),(54,8),(87,20),(81,35),(25,35)],SLATE,INK,2)
    a.line([(52,30),(52,101)],"#BDA27E",2)
    a.line([(57,59),(78,59),(78,72)],INK,3)
    a.ellipse((70,69,84,76),"#B9C2B5",INK_LIGHT,1)
    a.poly([(13,103),(93,99),(88,142),(20,146)],"#B57C60",INK,2.5)
    a.ellipse((11,94,95,117),"#D9B496",INK,2)
    a.ellipse((20,99,86,113),"#9DB3AD",INK_LIGHT,1)
    a.arc((30,100,72,111),180,350,"#DCE5D9",1)
    a.poly([(18,133),(43,134),(45,145),(19,145)],CREAM,INK_LIGHT,1)
    a.line([(23,138),(39,138)],"#D8C5A4",1)
    a.poly([(71,121),(89,119),(92,126),(74,129)],GOLD,INK_LIGHT,1)


def tea_delivery_nook(a):
    # Tea crate, refill jars and a folded drying cloth have one clear purpose.
    a.ellipse((7,78,99,94),rgb(DEEP,36),None)
    a.poly([(9,39),(92,36),(91,79),(13,83)],WOOD,INK,2)
    a.poly([(15,44),(87,42),(82,67),(17,70)],"#C6A078",INK_LIGHT,1)
    for xx in (24,43,64):
        jar(a,xx,24,18,25,[POT,CREAM,SAGE][(xx//20)%3])
    a.line([(18,56),(85,54)],"#D5B28A",1.5)
    a.line([(25,73),(25,81)],INK_LIGHT,1)
    a.line([(74,70),(74,79)],INK_LIGHT,1)
    a.poly([(49,10),(83,13),(87,31),(52,29)],CREAM,INK_LIGHT,1)
    a.line([(53,17),(83,19)],"#D4BA98",1)


def tailor_delivery_stool(a):
    # A used cutting stool and two folded bolts at the tailor's threshold.
    a.ellipse((5,67,87,84),rgb(DEEP,38),None)
    a.line([(20,48),(17,77)],WOOD,5)
    a.line([(75,47),(78,78)],WOOD,5)
    a.poly([(11,44),(82,41),(79,56),(13,59)],"#B68C63",INK,2)
    for i,(x,y,c) in enumerate(((17,29,SLATE),(29,20,SAGE),(43,12,TERRACOTTA))):
        a.poly([(x,y),(x+44,y-1),(x+47,y+15),(x+2,y+17)],c,INK_LIGHT,1.2)
        a.line([(x+5,y+6),(x+39,y+5)],"#E2CFAD",1)
    a.line([(59,18),(64,47)],GOLD,2)


def tea_whistle_foreground(a):
    # Canvas is centered exactly on the separate target node. This is the
    # visible near edge of a neighbouring cup, not another target-shaped prop.
    a.ellipse((9,26,38,35),rgb(DEEP,35),None)
    a.poly([(9,25),(38,23),(35,29),(13,31)],"#B58A62",INK_LIGHT,1.1)
    a.arc((11,21,38,29),5,175,CREAM,1.8)


def tailor_thimble_foreground(a):
    a.poly([(7,25),(38,24),(39,29),(7,30)],"#B99772",INK_LIGHT,1.1)
    a.line([(11,26),(35,25)],"#D7BA91",1)
    a.line([(32,22),(41,20)],SAGE,1.3)


def banner_knot_foreground(a):
    # One stitched fold crosses the low right ribbon tail only.
    a.poly([(20,27),(43,27),(41,35),(22,34)],"#C68161",INK_LIGHT,1.1)
    a.line([(24,29),(38,29)],"#E0A57B",1)


def chestnut_tongs_foreground(a):
    # Packet lip and one nut hide a little of the hinged lower grip.
    a.poly([(11,33),(24,31),(25,35),(14,38)],CREAM,INK_LIGHT,1.1)
    a.line([(13,34),(22,33)],"#D3B88D",1)
    a.ellipse((20,34,25,39),"#9B6749",INK_LIGHT,.8)


DRAW = {
 "lc_ground_paving":draw_ground,
 "lc_west_storefront_back":lambda a:storefront(a,"west_north"),
 "lc_east_storefront_back":lambda a:storefront(a,"east_north"),
 "lc_west_tailor_back":lambda a:south_storefront(a,"tailor"),
 "lc_east_food_shop_back":lambda a:south_storefront(a,"food"),
 "lc_tea_stall_back":tea_back,
 "lc_tea_counter_front":tea_counter,
 "lc_tea_patio_front":tea_patio,
 "lc_tea_awning_front":awning,
 "lc_chestnut_cart_back":chestnut_cart,
 "lc_chestnut_cart_front":chestnut_front,
 "lc_tree_front":tree,
 "lc_planter_front":planter,
 "lc_bench_front":bench,
 "lc_curb_flower_display":curb_flowers,
 "lc_tailor_goods":tailor_goods,
 "lc_tailor_work_rack":tailor_work_rack,
 "lc_crates_front":lambda a:(crate(a,7,13,51,55),crate(a,48,26,51,61,SAGE)),
 "lc_shop_goods_east":shop_goods,
 "lc_curb_pottery_west":pottery,
 "lc_curb_produce_east":produce,
 "lc_wayfinding_sign":sign,
 "lc_lantern_post_front":lantern,
 "lc_street_banner_front":banner,
 "lc_crossing_pennants":pennants,
 "lc_tea_steam_fx":steam,
 "lc_north_herb_stand":north_herb_stand,
 "lc_east_bun_cart_back":east_bun_cart_back,
 "lc_east_bun_cart_front":east_bun_cart_front,
 "lc_west_market_handcart":west_market_handcart,
 "lc_street_water_station":street_water_station,
 "lc_south_post_house_back":south_post_house,
 "lc_south_grain_house_back":south_grain_house,
 "lc_east_pottery_annex_back":east_pottery_annex,
 "lc_tea_delivery_nook":tea_delivery_nook,
 "lc_tailor_delivery_stool":tailor_delivery_stool,
 "lc_tea_whistle_foreground":tea_whistle_foreground,
 "lc_tailor_thimble_foreground":tailor_thimble_foreground,
 "lc_banner_knot_foreground":banner_knot_foreground,
 "lc_chestnut_tongs_foreground":chestnut_tongs_foreground,
}


def render():
    assert set(DRAW)==set(SLOTS),"Every blueprint art slot needs a renderer"
    manifest={"schemaVersion":1,"batchId":"simple_city_scene_v1","styleId":"chicken_simple_2d_v1","status":"candidate_visual_review","source":"render_scene.py","blueprint":"design/street_block_01.json","scaleFactorForAntialiasing":S,"assets":[]}
    for slot in BLUEPRINT["artSlots"]:
        id=slot["id"]
        art=Art(slot)
        DRAW[id](art)
        art.save(OUT/(id+".png"))
        png_path=OUT/(id+".png")
        shutil.copyfile(png_path,BUNDLE_OUT/(id+".png"))
        manifest["assets"].append({"id":id,"filename":f"png/{id}.png","layer":slot["layer"],"center":slot["center"],"size":slot["size"],"transparent":slot["alpha"],"authoringBrief":slot["purpose"],"generationSpec":{"method":"deterministic authored Pillow shapes","supersampleScale":S,"nativeCanvasPx":f"{slot['size']['width']*S}x{slot['size']['height']*S}"},"finalGameAssetSpec":{"format":"PNG RGBA","canvasPx":f"{slot['size']['width']}x{slot['size']['height']}","origin":"blueprint artSlot center","bundlePath":f"simple2d_scene/{id}/spriteFrame"},"sha256":hashlib.sha256(png_path.read_bytes()).hexdigest(),"status":"candidate_visual_review"})
        if "targetId" in slot:
            manifest["assets"][-1]["targetId"] = slot["targetId"]
    (PROD/"scene_manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"rendered {len(manifest['assets'])} scene layers")


if __name__=="__main__": render()

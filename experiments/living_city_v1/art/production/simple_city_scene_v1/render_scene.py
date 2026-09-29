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
    # A north/south lane and a cross lane have distinct tones and paired curbs.
    a.box((w/2-295,0,w/2+320,h),PAVING_LIGHT,None)
    a.box((0,h/2-102,w,h/2+160),PAVING_LIGHT,None)
    for x in (w/2-295,w/2+320):
        a.line([(x,0),(x,h)],PAVING_SHADE,11)
        a.line([(x+5,0),(x+5,h)],INK_LIGHT,1.5)
    for y in (h/2-102,h/2+160):
        a.line([(0,y),(w,y)],PAVING_SHADE,10)
        a.line([(0,y+4),(w,y+4)],INK_LIGHT,1.5)
    # Irregular pale stone slabs with grouped offsets, never a uniform grid.
    rng=random.Random(43)
    for row,y in enumerate(range(22,h-22,49)):
        x=-30+(row%3)*19
        while x<w+30:
            length=rng.randint(66,133)
            yy=y+rng.randint(-4,4)
            a.line([(x+3,yy),(x+length-6,yy+rng.randint(-3,3))],"#D9CCB5",1.6)
            if row%2 or rng.random()>.48:
                a.line([(x+length,yy-38),(x+length+rng.randint(-5,5),yy)],"#DDCFB8",1.4)
            x+=length+rng.randint(6,16)
    # Cross-lane wheel wear and a quiet center seam provide spatial direction.
    for x in (w/2-120,w/2+118):
        a.line([(x,35),(x+15,h-40)],"#E2D4BB",11)
    a.line([(w/2-271,43),(w/2-271,h-44)],"#CDBB9D",2)
    a.line([(w/2+290,43),(w/2+290,h-44)],"#CDBB9D",2)
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
    a.ellipse((cx-92,cy-72,cx+92,cy+72),"#DCC9A9","#BBA787",2)
    a.ellipse((cx-78,cy-61,cx+78,cy+61),PAVING_LIGHT,"#C3AF91",2)
    a.ellipse((cx-54,cy-42,cx+54,cy+42),"#E2D6BD","#C7B59B",1.5)
    a.poly([(cx,cy-51),(cx+12,cy-11),(cx+58,cy),(cx+12,cy+10),(cx,cy+48),(cx-12,cy+9),(cx-57,cy),(cx-13,cy-11)],"#BCA88E","#9F8E7B",2)
    a.ellipse((cx-9,cy-9,cx+9,cy+9),PAVING_LIGHT,"#A6947D",1.5)
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


def storefront(a,kind):
    w,h=a.w,a.h
    north=kind in ("west_north","east_north")
    wall=CREAM if kind=="west_north" else ("#E4D7B8" if kind=="east_north" else "#E7D2B3" if kind=="tailor" else "#E5D8BC")
    roof="#A87861" if kind=="west_north" else (SLATE if kind=="east_north" else ("#8A7263" if kind=="tailor" else "#B77A5A"))
    fascia=TERRACOTTA if kind in ("west_north","food") else SLATE
    # Taper only a little: parallel projection, not converging perspective.
    a.poly([(10,118),(w-12,112),(w-18,h-33),(13,h-25)],wall,INK,3)
    a.poly([(3,116),(28,16),(w-32,18),(w-5,113),(w-13,150),(13,153)],roof,INK,3)
    a.poly([(28,27),(w-33,25),(w-40,104),(22,107)],"#B9937B" if kind!="east_north" else "#8CA3A7",None)
    roof_tiles(a,20,42,w-20,112,INK_LIGHT,24)
    a.poly([(10,132),(w-10,129),(w-11,169),(13,172)],fascia,INK,2.4)
    a.line([(20,159),(w-19,156)],"#E6BC86",1.7)
    # Lintel, two windows, one door; interior shelves are visible through openings.
    a.box((w*.12,192,w*.41,h-82),"#645B50",INK,3,3)
    a.box((w*.59,193,w*.88,h-83),"#665D51",INK,3,3)
    for lo,hi in ((.12,.41),(.59,.88)):
        x0,x1=w*lo,w*hi
        a.line([(x0+5,250),(x1-5,250)],"#CFAD7B",4)
        a.line([(x0+6,318),(x1-6,318)],"#CFAD7B",4)
        for j in range(3):
            cx=x0+19+j*(x1-x0-35)/2
            if kind=="tailor":
                a.ellipse((cx-10,222,cx+12,248),[SAGE,TERRACOTTA,SLATE][j],INK,1.3)
                a.line([(cx-5,250),(cx+4,312)],[SAGE,TERRACOTTA,SLATE][j],9)
            elif kind=="food":
                a.ellipse((cx-9,225,cx+9,246),GOLD,INK,1.3)
                a.ellipse((cx-10,285,cx+11,307),"#B77A53",INK,1.3)
            else:
                jar(a,cx-9,222,18,24,[POT,SAGE,TERRACOTTA][j])
                a.ellipse((cx-8,288,cx+9,309),[GOLD,CREAM,SAGE][j],INK,1.2)
        a.line([(x0+4,190),(x0+4,h-82)],INK,2)
        a.line([(x1-4,190),(x1-4,h-82)],INK,2)
    a.box((w*.43,198,w*.57,h-22),"#624B3E",INK,2.5,4)
    a.ellipse((w*.535,h-115,w*.55,h-101),GOLD,INK,1)
    # Sidewall/plinth and finite contact shading.
    a.box((18,h-53,w-18,h-23),"#BA9A78",INK_LIGHT,1.5)
    a.line([(27,h-62),(w-28,h-62)],"#D4B791",3)
    if kind=="west_north":
        # A small built-in herb rack anchors the tea district.
        a.box((37,h-183,91,h-116),WOOD,INK,2)
        for xx in (50,72):
            a.ellipse((xx-11,h-196,xx+12,h-169),SAGE,INK_LIGHT,1)
            a.line([(xx,h-182),(xx,h-142)],INK_LIGHT,1)
    elif kind=="east_north":
        for x in (39,w-54):
            a.line([(x,183),(x,h-40)],"#9C8162",2)
    elif kind=="tailor":
        # Fabric bolts stand inside the doorway, tied to the shop.
        for j,c in enumerate((SLATE,SAGE,TERRACOTTA)):
            x=w*.44+j*13
            a.line([(x,283),(x+3,h-88)],c,9)
            a.line([(x-3,285),(x+1,h-88)],INK_LIGHT,1)
    else:
        a.box((w*.43,h-139,w*.57,h-104),"#C99262",INK,2)
        for j in range(3):
            a.ellipse((w*.455+j*13,h-133,w*.48+j*13,h-116),GOLD,INK_LIGHT,1)


def south_storefront(a, kind):
    # The south bench occupies the northern 90 px of these blueprint slots.
    # Keeping that strip transparent avoids the old greybox's bench-on-roof
    # depth error and keeps the building footprint behind its curb goods.
    top_clearance=90
    sub=Art({"size":{"width":a.w,"height":a.h-top_clearance},"alpha":True})
    storefront(sub,kind)
    a.im.alpha_composite(sub.im,(0,top_clearance*S))


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
    a.ellipse((22,162,55,198),"#776B5C",INK,2)
    a.ellipse((130,160,164,198),"#776B5C",INK,2)
    for x in (39,147): a.ellipse((x-5,177,x+5,187),GOLD,INK,1)


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

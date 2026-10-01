"""Editable clean-cartoon revision based on the user's bg-png visual direction.

No screenshot pixels or generated concept pixels enter the runtime. All layers
are painted from authored geometry, with shared palette and registered anchors.
"""
from __future__ import annotations
import hashlib, importlib.util, json, math, shutil
from pathlib import Path
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BUNDLE = ROOT / "assets/bundles/city_living_city_street_block_01"
SCENE = json.loads((ROOT / "design/street_block_01.json").read_text(encoding="utf-8"))

def module(name, file):
    spec = importlib.util.spec_from_file_location(name, HERE.parent / file)
    result = importlib.util.module_from_spec(spec); spec.loader.exec_module(result)
    return result

b = module("clean_scene_geometry", "simple_city_scene_v1/render_scene.py")
v2 = module("registered_prop_geometry", "refined_city_v2/render_refined.py")
courier = module("clean_courier_geometry", "simple_chicken_v1/render_courier.py")
SS = 3
b.S = SS
INK, SOFT = "#574954", "#84727A"
WHITE, CREAM, CORAL = "#FFF5DF", "#F6DDA0", "#EE8B7F"
GREEN, GREEN_DARK, GRASS = "#7DBB83", "#568B6C", "#C4D48C"
BLUE, BLUE_DARK, PURPLE = "#75BFC8", "#4B8D9D", "#B49BD1"
WOOD, WOOD_DARK, GOLD = "#C99064", "#9A6955", "#F2C267"
ROAD, ROAD_EDGE = "#D3D2CA", "#AAAFAA"
PAL = {
    "#634A3B":INK, "#8D6D55":SOFT, "#E9DFC7":GRASS, "#F1E7D3":ROAD,
    "#D9CBAF":ROAD_EDGE, "#F3E6C6":WHITE, "#D9AB62":GOLD, "#B9684D":CORAL,
    "#88654A":WOOD, "#8FA789":GREEN, "#6F8B95":BLUE, "#F6E9C9":WHITE,
    "#584739":INK, "#B88E69":"#E6AE80", "#E2D5BB":"#DED9CD",
    "#A87861":CORAL, "#7C9696":BLUE, "#8A7263":PURPLE, "#AA7A61":CORAL,
    "#B77A5A":CORAL, "#8D8770":GREEN_DARK, "#E7D2B3":"#EED5E8",
    "#EADABC":WHITE, "#E4D7B8":CREAM, "#E5D8BC":CREAM, "#EAD9B9":WHITE,
    "#625B50":"#745E62", "#655147":"#8F6961", "#665647":"#85685C",
    "#9B795C":WOOD, "#D9C49F":CREAM, "#D5BE99":CREAM,
    "#9E755A":WOOD_DARK, "#B58B61":WOOD, "#A97754":WOOD_DARK,
    "#B78658":WOOD, "#D1AB7B":"#EDC391", "#B58860":WOOD,
    "#9E704F":WOOD_DARK, "#A97C56":WOOD, "#B18560":WOOD,
    "#DCC9A8":CREAM, "#E7D5B6":CREAM, "#8DA5A3":BLUE,
    "#D29A6E":CORAL, "#91AA89":GREEN, "#88A47D":GREEN_DARK,
    "#A1B293":"#94C584", "#9DB394":"#94C584",
}

def color(value):
    if isinstance(value, str): return PAL.get(value.upper(), value)
    if isinstance(value, tuple) and len(value) >= 3:
        key = "#" + "".join(f"{v:02X}" for v in value[:3])
        mapped = PAL.get(key)
        if mapped: return b.rgb(mapped, value[3] if len(value) == 4 else 255)
    return value

BaseArt = b.Art
class CleanArt(BaseArt):
    def __init__(self, slot):
        super().__init__(slot)
        if not slot["alpha"]: self.d.rectangle((0,0,self.w*SS,self.h*SS),fill=GRASS)
    def box(self, xy, fill, outline=INK, width=2.4, radius=0):
        super().box(xy,color(fill),color(outline),width,radius)
    def poly(self, pts, fill, outline=INK, width=2.4):
        super().poly(pts,color(fill),color(outline),width)
    def ellipse(self, box, fill, outline=INK, width=2.4):
        super().ellipse(box,color(fill),color(outline),width)
    def line(self, pts, fill=INK, width=2):
        super().line(pts,color(fill),width)
    def arc(self, box, start, end, fill=INK, width=1.7):
        super().arc(box,start,end,color(fill),width)
    def smooth(self, pts, fill, outline=INK, width=2.4):
        # Closed Catmull-Rom outline gives each authored lobe a clean tangent.
        sampled=[]; n=len(pts)
        for i in range(n):
            p0,p1,p2,p3=[pts[j%n] for j in (i-1,i,i+1,i+2)]
            for k in range(8):
                t=k/8; t2=t*t; t3=t2*t
                sampled.append(tuple(.5*((2*p1[d])+(-p0[d]+p2[d])*t+
                    (2*p0[d]-5*p1[d]+4*p2[d]-p3[d])*t2+(-p0[d]+3*p1[d]-3*p2[d]+p3[d])*t3) for d in (0,1)))
        self.poly(sampled,fill,outline,width)
    def image(self): return self.im.resize((self.w,self.h),Image.Resampling.LANCZOS)

b.Art = CleanArt

def shrub(a, x, y, rx=24, ry=20, fill=GREEN):
    points=[]
    for i in range(28):
        t=math.tau*i/28; f=1+0.1*math.sin(t*7)
        points.append((x+rx*math.cos(t)*f,y+ry*math.sin(t)*f))
    a.smooth(points,fill,INK,1.8)
    for dx,dy in ((-rx*.4,0),(rx*.25,-ry*.3),(rx*.35,ry*.35)):
        a.arc((x+dx-4,y+dy-3,x+dx+4,y+dy+4),15,165,GREEN_DARK,1.1)

def flower(a,x,y,r=6,fill=CORAL):
    for i in range(5):
        t=math.tau*i/5
        dx,dy=math.cos(t)*r*.66,math.sin(t)*r*.66
        a.ellipse((x+dx-r*.48,y+dy-r*.48,x+dx+r*.48,y+dy+r*.48),fill,INK,.9)
    a.ellipse((x-r*.25,y-r*.25,x+r*.25,y+r*.25),GOLD,INK,.7)

def pot_plant(a,x,y,size=1,flower_color=CORAL):
    a.poly([(x-12*size,y),(x+13*size,y),(x+9*size,y+23*size),(x-8*size,y+23*size)],CORAL,INK,1.5)
    a.ellipse((x-13*size,y-4*size,x+14*size,y+5*size),WOOD_DARK,INK,1.5)
    shrub(a,x,y-9*size,19*size,17*size)
    for dx,dy in ((-9,-8),(7,-18),(13,-4)):
        flower(a,x+dx*size,y+dy*size,5*size,flower_color)

def jar(a,x,y,w=24,h=32,fill=BLUE):
    a.smooth([(x+w*.3,y+4),(x+w*.7,y+4),(x+w*.94,y+h*.4),(x+w*.83,y+h*.89),
        (x+w*.17,y+h*.89),(x+w*.06,y+h*.4)],fill,INK,1.8)
    a.ellipse((x+w*.24,y,x+w*.76,y+8),WHITE,INK,1.5)
    a.line([(x+w*.18,y+h*.68),(x+w*.82,y+h*.68)],WHITE,1.6)

b.jar=jar

def ground(a):
    w,h=a.w,a.h
    a.box((0,0,w,h),GRASS,None)
    west,east=560,976; north,south=930,1120
    a.box((west,0,east,h),ROAD,None)
    a.box((0,north,w,south),ROAD,None)
    # Two rows of clean broad tiles: no noise, hash marks or faux paper texture.
    for x0,x1 in ((395,west),(east,1140)):
        for y0,y1 in ((70,390),(450,north),(south,1490),(1530,1980)):
            a.box((x0,y0,x1,y1),"#E5DFCD",None)
            for yy in range(y0+40,y1,55): a.line([(x0+3,yy),(x1-3,yy)],"#C7C5B7",1.3)
            for row,yy in enumerate(range(y0,y1-30,55)):
                for xx in range(x0+25+row%2*35,x1-10,70): a.line([(xx,yy+3),(xx,yy+50)],"#C7C5B7",1.3)
    for x in (west,east):
        for y0,y1 in ((0,north),(south,h)):
            a.line([(x,y0),(x,y1)],"#F5F0DF",9)
            a.line([(x-5,y0),(x-5,y1)],ROAD_EDGE,1.5)
            for yy in range(y0+35,y1,65): a.line([(x-5,yy),(x+4,yy)],ROAD_EDGE,1.2)
    # Short, intentional paving clusters leave the travel lane visually quiet.
    for x,y in ((654,178),(826,467),(648,1200),(862,1450),(710,1850),(482,1025),(1040,1000)):
        for dx,dy in ((0,0),(28,0),(13,20)):
            a.box((x+dx,y+dy,x+dx+22,y+dy+14),"#C8C9C2",None,radius=3)
    # Patch borders and small grasses sit in garden ground, away from NPC paths.
    for x,y in ((75,360),(1247,520),(250,1420),(1300,1510),(335,1930),(1180,1830)):
        a.line([(x-4,y+5),(x,y-1),(x+4,y+6),(x+8,y+1)],"#A2B572",1.4)
        flower(a,x+22,y-3,4,WHITE)
    # A pedestrian crossing gives the middle of the town a readable landmark.
    for i in range(5): a.box((637+i*54,978,666+i*54,1066),"#F2EFE4",None,radius=4)
    # A small chalk hopscotch beside the child stays flat and walkable.
    for x,y in ((714,727),(714,765),(680,803),(714,803),(714,841)):
        a.box((x,y,x+28,y+32),None,"#F6F0DD",2,radius=2)

def awning_strip(a,x,y,w,h,fill=CORAL):
    a.poly([(x+4,y),(x+w-10,y),(x+w,y+h*.75),(x,y+h*.75)],fill,INK,2.4)
    for i in range(7):
        if i%2==0:
            x0=x+4+i*(w-14)/7; x1=x+4+(i+1)*(w-14)/7
            a.poly([(x0,y+2),(x1,y+2),(x1+7,y+h*.73),(x0-1,y+h*.73)],WHITE,None)
    for i in range(7):
        cx=x+(i+.5)*w/7
        a.smooth([(cx-w/14,y+h*.75),(cx-w/14,y+h*.9),(cx,y+h),(cx+w/14,y+h*.9),(cx+w/14,y+h*.75)],
            WHITE if i%2==0 else fill,INK,1.6)

def roof(a,x,y,w,h,fill=BLUE,kind="hip"):
    if kind=="gable":
        pts=[(x,y+h*.72),(x+w*.46,y),(x+w,y+h*.72),(x+w-4,y+h),(x+5,y+h)]
    else: pts=[(x,y+h*.7),(x+25,y),(x+w-26,y+3),(x+w,y+h*.7),(x+w-5,y+h),(x+5,y+h)]
    a.poly(pts,fill,INK,2.5)
    a.poly([(x+5,y+h*.77),(x+w-5,y+h*.77),(x+w-5,y+h),(x+5,y+h)],
        BLUE_DARK if fill==BLUE else "#B87473" if fill==CORAL else "#8874A9",INK,1.8)
    # Broad cylindrical roof courses, with a limited number of clear tile seams.
    for row in range(3):
        yy=y+18+row*(h-25)/3
        span=(yy-y)/(.72*h)*w*.46 if kind=="gable" else w*.45
        left=max(x+12,x+w*.46-span); right=min(x+w-12,x+w*.46+span)
        a.line([(left,yy),(right,yy)],BLUE_DARK if fill==BLUE else INK,1)
        for xx in range(round(left+12),round(right-6),24): a.arc((xx-8,yy-4,xx+8,yy+13),0,180,INK,1)
    a.line([(x+5,y+h*.75),(x+w-5,y+h*.75)],WHITE,1.3)

def shop(a,role,fill,roof_fill,roof_kind="hip"):
    w,h=a.w,a.h
    floor=h-25; top=122; side=19
    a.ellipse((8,floor-1,w-6,h-8),b.rgb(INK,42),None)
    # Visible return wall, window recess and eave form physical volume.
    a.poly([(w-side-5,top-5),(w-5,top+8),(w-5,floor-4),(w-side-5,floor+6)],"#DDC5B3",INK,2.4)
    a.box((9,top-4,w-side-4,floor+4),fill,INK,2.4,radius=3)
    window_end=w-79
    a.box((20,top+47,window_end,floor-50),"#AEE0DC",INK,2.1,radius=4)
    a.box((24,top+51,window_end-4,floor-54),"#91C7CF",None,radius=2)
    # 2 large shelves rather than a wall of identical miniature pictograms.
    for yy in (top+86,top+140):
        if yy>=floor-53: continue
        a.line([(23,yy),(window_end-3,yy)],WOOD_DARK,5)
        for j in range(2):
            xx=28+j*max(24,(window_end-50)/2)
            if role in ("cloth","ribbon"):
                a.box((xx,yy-27,xx+22,yy-3),PURPLE if j else CORAL,INK,1.5,radius=2)
                a.line([(xx+5,yy-19),(xx+18,yy-19)],WHITE,2)
            elif role in ("paper","post"):
                a.box((xx,yy-23,xx+25,yy-4),WHITE,INK,1.3)
                a.line([(xx+1,yy-21),(xx+13,yy-12),(xx+24,yy-21)],WOOD_DARK,1.2)
            elif role in ("bun","grain","grocer"):
                a.ellipse((xx,yy-22,xx+23,yy-4),GOLD,INK,1.4)
                a.line([(xx+4,yy-11),(xx+17,yy-13)],WOOD_DARK,1)
            else: jar(a,xx,yy-29,22,26,BLUE if j else WHITE)
    dx=w-69
    a.box((dx,top+84,w-29,floor+2),WOOD_DARK,INK,2,radius=7)
    a.box((dx+5,top+92,w-34,top+131),"#97D2D7",INK,1.5,radius=4)
    a.line([(dx+7,top+109),(w-36,top+109)],INK,1.3)
    a.ellipse((w-43,floor-52,w-39,floor-48),GOLD,INK,1)
    a.box((8,floor+4,w-19,floor+14),"#C5BCB1",INK,1.5,radius=2)
    a.line([(20,top+40),(20,floor-44)],WOOD_DARK,4)
    a.line([(window_end,top+40),(window_end,floor-44)],WOOD_DARK,4)
    roof(a,1,24,w-8,108,roof_fill,roof_kind)
    awning_strip(a,9,top+8,w-side-15,37,roof_fill)
    # A proper projecting trade sign makes each frontage distinct at phone size.
    a.line([(w-33,top+26),(w-11,top+26),(w-11,top+44)],INK,2)
    a.ellipse((w-27,top+41,w-1,top+67),WHITE,INK,1.7)
    if role in ("cloth","ribbon"):
        a.ellipse((w-22,top+48,w-16,top+55),PURPLE,INK,1)
        a.ellipse((w-12,top+48,w-6,top+55),PURPLE,INK,1)
        a.line([(w-18,top+53),(w-8,top+61)],INK,1)
        a.line([(w-9,top+53),(w-19,top+61)],INK,1)
    elif role in ("paper","post"):
        a.box((w-21,top+49,w-7,top+59),GOLD,INK,1)
        a.line([(w-21,top+49),(w-14,top+54),(w-7,top+49)],INK,1)
    else:
        a.ellipse((w-20,top+49,w-8,top+58),BLUE,INK,1)
        a.arc((w-11,top+50,w-4,top+58),270,90,INK,1)
    # Useful threshold props vary by trade; never duplicate task sprites.
    if role in ("herb","grocer"): pot_plant(a,39,floor-22,.62,GOLD)
    elif role in ("cloth","ribbon"):
        for j,c in enumerate((BLUE,PURPLE,CORAL)):
            a.box((22+j*19,floor-33,37+j*19,floor-6),c,INK,1.2,radius=2)
    else: jar(a,28,floor-39,20,30,BLUE)

def shop_row(a,kind):
    specs={
        "west_north": [("herb",CREAM,CORAL,"hip"),("ceramic",WHITE,BLUE,"gable")],
        "east_north": [("paper",CREAM,GREEN_DARK,"hip"),("grocer",WHITE,CORAL,"gable")],
        "tailor": [("cloth","#EDD5ED",PURPLE,"hip"),("ribbon",WHITE,CORAL,"gable")],
        "food": [("bun",CREAM,CORAL,"gable"),("grain",WHITE,BLUE,"hip")],
    }[kind]
    sw=(a.w-24)//2; sh=385 if kind in ("tailor","food") else 368
    for i,(role,fill,roof_fill,roof_kind) in enumerate(specs):
        sub=CleanArt({"size":{"width":sw,"height":sh},"alpha":True})
        shop(sub,role,fill,roof_fill,roof_kind)
        a.im.alpha_composite(sub.im,((8+i*(sw+8))*SS,(a.h-sh-9-i*4)*SS))

def tree(a):
    w,h=a.w,a.h
    a.ellipse((w*.27,h-35,w*.78,h-12),b.rgb(INK,42),None)
    a.smooth([(w*.45,h-22),(w*.45,h*.52),(w*.25,h*.39),(w*.27,h*.35),
        (w*.52,h*.51),(w*.72,h*.32),(w*.78,h*.35),(w*.57,h*.59),(w*.58,h-22)],WOOD,INK,2.8)
    a.line([(w*.5,h-36),(w*.5,h*.56)],WOOD_DARK,1.6)
    shrub(a,w*.5,h*.31,w*.46,h*.28)
    a.smooth([(w*.17,h*.42),(w*.29,h*.53),(w*.55,h*.56),(w*.82,h*.43),
        (w*.61,h*.47),(w*.38,h*.46)],GREEN_DARK,None)
    for x,y in ((55,82),(130,55),(150,100)):
        a.ellipse((x-5,y-6,x+5,y+6),CORAL,INK,1.4)
        a.line([(x,y-6),(x+2,y-10)],INK,1)

def flower_box(a):
    w,h=a.w,a.h
    a.ellipse((9,h-24,w-6,h-6),b.rgb(INK,40),None)
    a.poly([(12,73),(w-11,70),(w-13,h-16),(18,h-12)],WOOD,INK,2)
    a.line([(17,90),(w-15,87)],WOOD_DARK,1.7)
    for x,y,fill in ((30,53,CORAL),(64,42,GOLD),(98,50,PURPLE)):
        a.line([(x,84),(x,y-10)],GREEN_DARK,2)
        a.smooth([(x,y+16),(x-16,y+5),(x-21,y+13),(x-7,y+23)],GREEN,INK,1.1)
        a.smooth([(x,y+21),(x+17,y+8),(x+22,y+17),(x+5,y+26)],GREEN,INK,1.1)
        flower(a,x,y-4,9,fill)
        flower(a,x-8,y+8,7,fill)

def bamboo(a):
    w,h=a.w,a.h
    for x,y in ((w*.3,h-31),(w*.61,h-26)):
        a.box((x-3,22,x+3,y),GREEN_DARK,INK,1.3,radius=3)
        for yy in range(36,int(y),36):
            a.line([(x-4,yy),(x+4,yy)],GREEN,2.5)
            for d in (-1,1):
                a.smooth([(x,yy),(x+d*24,yy-17),(x+d*27,yy-7),(x+d*5,yy+3)],GREEN,INK,1)
    a.poly([(w*.2,h-28),(w*.78,h-28),(w*.72,h-8),(w*.27,h-8)],CORAL,INK,1.7)

def tea_back(a):
    w,h=a.w,a.h
    a.box((11,24,w-16,166),CREAM,INK,2.6,radius=3)
    a.box((27,45,w-32,146),"#A8CECA",INK,2.3,radius=3)
    for y in (85,128):
        a.line([(28,y),(w-32,y)],WOOD_DARK,5)
        for i,x in enumerate((43,89,139,190)):
            jar(a,x,y-35,24,29,(BLUE,WHITE,CORAL,WHITE)[i])
    a.box((23,183,91,258),"#686976",INK,2.5,radius=6)
    a.ellipse((34,186,83,209),INK,INK,1.8)
    a.smooth([(43,192),(42,174),(50,164),(70,165),(80,175),(80,195)],BLUE,INK,2)
    a.ellipse((44,167,79,178),WHITE,INK,1.5)
    a.arc((49,149,73,175),180,360,INK,2)
    a.poly([(78,177),(94,168),(91,182),(80,186)],BLUE,INK,1.5)
    for x,y in ((128,208),(151,208),(128,232),(151,232)): b.cup(a,x,y,.8,WHITE)
    a.box((174,184,226,236),WOOD,INK,2,radius=2)
    for y in (195,214): a.line([(176,y),(224,y)],WOOD_DARK,1.4)
    a.line([(14,161),(14,h-17)],WOOD_DARK,5)
    a.line([(w-18,161),(w-18,h-17)],WOOD_DARK,5)

def post_house(a):
    w,h=a.w,a.h
    a.ellipse((12,h-29,w-7,h-9),b.rgb(INK,40),None)
    a.box((18,92,w-104,h-26),CREAM,INK,2.6,radius=3)
    a.poly([(w-104,96),(w-86,103),(w-86,h-30),(w-104,h-26)],"#E5BB81",INK,2)
    roof(a,5,20,w-95,100,CORAL,"hip")
    a.box((38,143,155,h-61),"#A8D3D6",INK,2,radius=4)
    for y in (182,230):
        a.line([(40,y),(153,y)],WOOD_DARK,4)
        for x in (51,91,124):
            a.box((x,y-26,x+24,y-5),WHITE,INK,1.2)
            a.line([(x,y-24),(x+12,y-13),(x+24,y-24)],WOOD_DARK,1)
    a.box((185,165,249,h-25),WOOD_DARK,INK,2,radius=16)
    a.box((194,175,240,210),BLUE,INK,1.5,radius=10)
    a.line([(217,176),(217,209)],INK,1.2)
    a.ellipse((233,h-64,238,h-59),GOLD,INK,1)
    a.ellipse((191,114,242,151),WHITE,INK,2)
    a.box((201,123,232,140),GOLD,INK,1.5)
    a.line([(202,124),(217,134),(231,124)],INK,1.2)
    # Porch under the independently registered parcel chest.
    a.box((w-106,131,w-9,h-26),"#DFCBA6",INK,2)
    a.poly([(w-114,140),(w-86,91),(w-9,105),(w-4,142)],BLUE,INK,2)
    a.line([(w-97,143),(w-97,h-26)],WOOD_DARK,4)
    a.line([(w-12,141),(w-12,h-26)],WOOD_DARK,4)
    a.box((15,h-30,w-12,h-15),"#C9C2B2",INK,1.5,radius=2)

def banner(a):
    w,h=a.w,a.h
    a.line([(5,11),(w-7,8)],INK,2)
    a.poly([(11,16),(w-11,13),(w-17,62),(17,63)],CORAL,INK,2.3)
    a.line([(18,25),(w-19,22)],"#F8B5A4",2)
    # Large sparse cup medallions; all decor stays outside the separate knot.
    for x in (73,167,262,437):
        a.ellipse((x-15,29,x+15,52),WHITE,INK,1.3)
        a.ellipse((x-8,34,x+7,45),BLUE,INK,1)
        a.arc((x+4,34,x+12,46),270,90,INK,1)

def herb_stand(a):
    a.box((15,44,129,163),CREAM,INK,2,radius=2)
    awning_strip(a,6,19,132,36,GREEN)
    for y in (89,139):
        a.line([(20,y),(124,y)],WOOD_DARK,6)
        for x in (38,72,106): pot_plant(a,x,y-26,.65,WHITE if x==72 else CORAL)
    a.line([(18,56),(18,169)],WOOD_DARK,5); a.line([(126,56),(126,169)],WOOD_DARK,5)

def dispatch(a,slot):
    id=slot["id"]
    if id=="lc_ground_paving": ground(a)
    elif id=="lc_west_storefront_back": shop_row(a,"west_north")
    elif id=="lc_east_storefront_back": shop_row(a,"east_north")
    elif id=="lc_west_tailor_back": shop_row(a,"tailor")
    elif id=="lc_east_food_shop_back": shop_row(a,"food")
    elif id=="lc_south_post_house_back": post_house(a)
    elif id=="lc_tree_front": tree(a)
    elif id=="lc_tea_awning_front": awning_strip(a,6,10,a.w-12,80,CORAL)
    elif id=="lc_tea_stall_back": tea_back(a)
    elif id=="lc_curb_flower_display": flower_box(a)
    elif id=="lc_north_herb_stand": herb_stand(a)
    elif id=="lc_street_banner_front": banner(a)
    elif "flower_vine" in id: bamboo(a)
    else: b.DRAW[id](a)

def export(image,category,id,records,brief,source_svg=None):
    source=HERE/"png"/category/(id+".png");source.parent.mkdir(parents=True,exist_ok=True)
    runtime=BUNDLE/category/(id+".png");runtime.parent.mkdir(parents=True,exist_ok=True)
    image.save(source,optimize=True);shutil.copyfile(source,runtime);v2.metadata(runtime)
    record={"id":id,"source":source.relative_to(ROOT).as_posix(),"runtime":runtime.relative_to(ROOT).as_posix(),
        "size":list(image.size),"sha256":hashlib.sha256(source.read_bytes()).hexdigest(),"authoringBrief":brief,
        "status":"trial_unapproved","generationSpec":{"method":"editable authored geometry","supersample":SS if category in ("simple2d_scene","interactions") else 4},
        "finalGameAssetSpec":{"format":"PNG RGBA","canvas":list(image.size),"spriteFrame":category+"/"+id+"/spriteFrame"}}
    if source_svg:
        record["sourceSvg"]=source_svg.relative_to(ROOT).as_posix()
        record["sourceSvgSha256"]=hashlib.sha256(source_svg.read_bytes()).hexdigest()
    records.append(record)

def render_props(records):
    # Same semantic geometry, newly painted from editable source in the common palette.
    class PropPainter(v2.props.Painter):
        def polygon(self,points,fill,outline=INK,width=2.2): super().polygon(points,color(fill),color(outline),max(2.2,width))
        def line(self,points,fill=INK,width=2): super().line(points,color(fill),width)
        def ellipse(self,box,fill,outline=INK,width=2): super().ellipse(box,color(fill),color(outline),width)
        def arc(self,box,start,end,fill=INK,width=2): super().arc(box,start,end,color(fill),width)
    v2.props.Painter=PropPainter
    for t in SCENE["hiddenObjectSlots"]:
        id=t["id"]
        image=getattr(v2.props,id)() if hasattr(v2.props,id) else v2.target_image(id)
        export(image,"targets",id,records,t.get("clue",t["semanticContext"])+"; clean flat cartoon color revision.")
    # Reuse registered state geometry. Remove fine grain and random micro-foliage.
    v2.base.S=SS; v2.FineArt=CleanArt; v2.grain=lambda *args,**kwargs:None
    def leaves(a,x,y,scale=1,seed=1): shrub(a,x,y,17*scale,15*scale)
    v2.foliage=leaves
    for i in SCENE["interactiveSlots"]:
        for opened in (False,True):
            id=i["id"]+("_opened" if opened else "_closed")
            export(v2.interaction_image(i["id"],opened),"interactions",id,records,
                "Registered "+i["label"]+" state; independent flat-color layer, target painted separately.")

def render_courier(records):
    courier.EXPORT=HERE/"courier_export";courier.SOURCE=HERE/"svg_source";courier.EXPORT.mkdir(exist_ok=True)
    colors={"INK":INK,"FEATHER":WHITE,"HIGHLIGHT":WHITE,"SHADE":"#F5D79A","SHADE_PALE":"#F8E4B4",
        "VEST":BLUE,"VEST_LIGHT":"#A5DADD","VEST_DARK":BLUE_DARK,"BAG":CORAL,
        "BAG_LIGHT":"#F5AD91","LEATHER":WOOD_DARK,"BEAK":"#E6A152","BEAK_LIGHT":GOLD,
        "FOOT":"#D8955F","FOOT_LIGHT":"#EFBC75","EYE":INK}
    for key,value in colors.items(): setattr(courier,key,value)
    # Keep every frame's authored geometry and footpoint; recolor frozen defaults too.
    CP=courier.Painter
    class CourierPainter(CP):
        def path(self,commands,fill=None,stroke=INK,width=3.6):
            return super().path(commands,color(fill),color(stroke),min(width,3.2))
        def ellipse(self,box,fill,stroke=None,width=2):
            return super().ellipse(box,color(fill),color(stroke),width)
    courier.Painter=CourierPainter
    clip_manifest=json.loads((BUNDLE/"cels/messenger_customer/manifest.json").read_text(encoding="utf-8"))
    for clip,entries in clip_manifest["clips"].items():
        for i,entry in enumerate(entries):
            name=entry["asset"]
            if clip.startswith("walk_"): facing=clip.removeprefix("walk_");motion="walk";reach=0
            elif clip=="turn_nw_w": facing=("nw","w","w")[i];motion="turn";reach=0
            elif clip=="turn_w_ne": facing=("w","n","ne")[i];motion="turn";reach=0
            elif clip=="receive_w": facing="w";motion="receive";reach=(0,1,2,2,0)[i]
            else: facing="ne" if clip=="idle_ne" else "w";motion="idle";reach=0
            courier.render_frame(name,facing,i,motion,reach)
            image=Image.open(courier.EXPORT/(name+".png")).convert("RGBA")
            export(image,"cels/messenger_customer",name,records,
                "Clean cartoon courier "+clip+" frame "+str(i)+"; shared footpoint 128,215; continuous authored action.",courier.SOURCE/(name+".svg"))

def main():
    records=[]
    for slot in SCENE["artSlots"]:
        a=CleanArt(slot);dispatch(a,slot)
        brief="Independent potted bamboo and broad doorway leaves; registered to the retained planting slot." if "flower_vine" in slot["id"] else slot["purpose"]
        export(a.image(),"simple2d_scene",slot["id"],records,brief+" Clean cartoon geometry revision.")
    render_props(records);render_courier(records)
    manifest={"batchId":"clean_cartoon_v3","styleId":"chicken_clean_cartoon_v3","status":"trial_unapproved",
        "editableSource":"art/production/clean_cartoon_v3/render_clean.py",
        "sourceDependencies":["art/production/simple_city_scene_v1/render_scene.py",
            "art/production/simple_hidden_objects_v1/render_targets.py","art/production/refined_city_v2/render_refined.py",
            "art/production/simple_chicken_v1/render_courier.py"],
        "conceptReference":"lc_clean_cartoon_direction_v3_source.png","assets":records,
        "processing":["3x scene and interaction states/4x props and cels authored geometry","Lanczos to explicit final canvas",
            "lossless PNG","Cocos metadata refresh preserving UUID","no reference screenshot pixels"],
        "review":{"runtime":"pending","phone":"not_run","playerApproval":"pending"}}
    (HERE/"production_manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    source=HERE/"lc_clean_cartoon_direction_v3_source.png"
    with Image.open(source) as im:
        generation={"id":"lc_clean_cartoon_direction_v3","actualSize":list(im.size),"mode":im.mode,
            "sha256":hashlib.sha256(source.read_bytes()).hexdigest(),"status":"concept_reference_only",
            "runtimeAsset":False,"promptPath":"art/production/clean_cartoon_v3/PROMPT.md"}
    (HERE/"generation_record.json").write_text(json.dumps(generation,indent=2)+"\n",encoding="utf-8")
    print(f"Exported {len(records)} clean cartoon layers and registered cels")

if __name__=="__main__": main()

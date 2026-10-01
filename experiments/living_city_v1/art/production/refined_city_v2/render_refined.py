"""Editable refinement of the existing 2D street: material detail, foliage and search props.
AI concept is a direction reference only. Every runtime pixel is drawn here/from the v1 sources.
"""
from __future__ import annotations
import copy, hashlib, importlib.util, json, math, random, shutil
from pathlib import Path
from uuid import uuid4
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BUNDLE = ROOT / "assets/bundles/city_living_city_street_block_01"
spec = importlib.util.spec_from_file_location("street_base", HERE.parent / "simple_city_scene_v1/render_scene.py")
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
props_spec = importlib.util.spec_from_file_location("props_base", HERE.parent / "simple_hidden_objects_v1/render_targets.py")
props = importlib.util.module_from_spec(props_spec)
props_spec.loader.exec_module(props)
SCENE = json.loads((ROOT / "design/street_block_01.json").read_text(encoding="utf-8"))
INK, LIGHT, WOOD, SAGE, BLUE = "#634A3B", "#F6E9C9", "#88654A", "#8FA789", "#6F8B95"
TERRA, GOLD = "#B9684D", "#D9AB62"

class FineArt(base.Art):
    def box(self, xy, fill, outline=INK, width=3, radius=0):
        super().box(xy, fill, outline, max(.65, width*.72), radius)
    def poly(self, points, fill, outline=INK, width=3):
        super().poly(points, fill, outline, max(.65, width*.72))
    def ellipse(self, xy, fill, outline=INK, width=3):
        super().ellipse(xy, fill, outline, max(.65, width*.72))
    def line(self, points, fill=INK, width=3):
        super().line(points, fill, max(.55, width*.8))

base.Art = FineArt

def blossom(a, x, y, r=4, color=LIGHT):
    for n in range(5):
        ang=n*math.tau/5
        dx,dy=math.cos(ang)*r*.7,math.sin(ang)*r*.7
        a.ellipse((x+dx-r*.6,y+dy-r*.6,x+dx+r*.6,y+dy+r*.6),color,"#9E8662",.5)
    a.ellipse((x-r*.25,y-r*.25,x+r*.25,y+r*.25),GOLD,None)

def foliage(a,x,y,scale=1,seed=1):
    rng=random.Random(seed)
    for n in range(12):
        xx=x+rng.uniform(-16,16)*scale
        yy=y+rng.uniform(-15,13)*scale
        a.line([(x,y+15*scale),(xx,yy)],"#64795C",.9)
        r=rng.uniform(4,7)*scale
        a.poly([(xx-r,yy),(xx-2,yy-r*.7),(xx+r,yy-1),(xx+1,yy+r*.6)],
               ("#8FA789","#718B68","#ABB997")[n%3],"#6B795C",.55)
        a.line([(xx-r*.7,yy),(xx+r*.6,yy-1)],"#C1C8A4",.45)
        if n%4==0: blossom(a,xx,yy,3*scale,LIGHT if n%8 else "#DA9B74")

def grain(a,x0,y0,x1,y1,seed=1):
    rng=random.Random(seed)
    for yy in range(int(y0+4),int(y1-3),9):
        xx=x0+3+rng.uniform(0,5)
        a.line([(xx,yy),(xx+(x1-x0)*.35,yy+1),(x1-3,yy-1)],"#BB9872",.65)
    if x1-x0>25 and y1-y0>20:
        a.arc((x0+8,y0+9,x0+24,y0+16),10,290,"#715440",.8)

old_jar=base.jar
def ceramic(a,x,y,w=24,h=32,color=base.POT):
    old_jar(a,x,y,w,h,color)
    a.line([(x+6,y+13),(x+5,y+h-12)],"#D6BF94",max(.6,w*.055))
    a.line([(x+w-5,y+14),(x+w-3,y+h-10)],"#795B47",.85)
    if h>24:
        a.line([(x+6,y+h*.55),(x+w-6,y+h*.55)],LIGHT,1.1)
        for xx in range(int(x+8),int(x+w-5),6):
            a.poly([(xx,y+h*.58),(xx+2,y+h*.66),(xx-2,y+h*.66)],BLUE,None)
base.jar=ceramic
old_cup=base.cup
def glazed_cup(a,cx,cy,scale=1,color=LIGHT):
    old_cup(a,cx,cy,scale,color)
    a.arc((cx-6*scale,cy-3*scale,cx+5*scale,cy+3*scale),15,165,BLUE,.8)
    a.line([(cx-5*scale,cy-2*scale),(cx-2*scale,cy-3*scale)],"#FFF3DA",.7)
base.cup=glazed_cup

old_shop=base.narrow_shop
def refined_shop(a,role,roof_kind,wall,roof,awning):
    old_shop(a,role,roof_kind,wall,roof,awning)
    w,h=a.w,a.h
    # Fine staggered curved tiles obey the existing shallow roof silhouette.
    for row,yy in enumerate(range(48,100,15)):
        left=8
        right=w-10
        if roof_kind=="gable":
            span=(yy-12)/84*w*.48
            left=max(8,w*.5-span+3)
            right=min(w-10,w*.5+span-3)
        for xx in range(int(left+4+(row%2)*6),int(right-8),14):
            a.arc((xx,yy-5,xx+13,yy+6),10,168,"#513F36",.75)
            a.arc((xx+1,yy-4,xx+12,yy+3),15,145,"#C6A782",.65)
    a.line([(12,119),(w-13,119)],"#4F4037",3)
    # Stripe and stitch the existing fabric fascia.
    for xx in range(16,w-17,20):
        a.poly([(xx,113),(xx+7,113),(xx+6,132),(xx-1,132)],"#D9C79F",None)
        a.arc((xx-1,127,xx+17,141),0,180,"#F2DABC",.9)
    x0,x1=18,w-76
    a.box((x0+2,151,x1-2,158),"#DDB78C",None)
    for xx in (x0+4,x1-4):
        a.line([(xx,160),(xx,h-53)],"#C7A37A",1.2)
    if x1-x0>36:
        a.line([(x0+5,165),(x0+19,179)],"#AEBBAE",1.7)
        a.line([(x0+7,181),(x0+26,200)],"#829A92",.8)
        a.line([((x0+x1)/2,153),((x0+x1)/2,h-54)],"#9B7756",2)
    # Plaster masonry remains subdued below roof eaves.
    for xx,yy in ((w-59,168),(w-50,179),(w-40,169),(w-63,191),(w-31,189)):
        a.line([(xx,yy),(xx+12,yy)],"#C3AD8D",.65)
        a.line([(xx+12,yy),(xx+12,yy+5)],"#C3AD8D",.65)
    grain(a,w-59,227,w-23,h-36,7)
    a.ellipse((w-41,185,w-19,205),GOLD,INK,.85)
    # Trade symbols, no unreadable generated lettering.
    if role in ("cloth","ribbon"):
        a.line([(w-31,189),(w-31,201)],BLUE,4)
        a.line([(w-36,188),(w-26,188)],LIGHT,1.5)
        a.line([(w-36,202),(w-26,202)],LIGHT,1.5)
    elif role in ("bun","grain","grocer"):
        a.arc((w-37,190,w-22,202),180,355,LIGHT,2)
    else:
        a.line([(w-35,192),(w-25,200)],"#64795C",1)
        a.ellipse((w-36,190,w-31,195),SAGE,None)
        a.ellipse((w-28,195,w-23,200),SAGE,None)
    # A small inset doorstep planter is separate from the searchable object layer.
    a.poly([(w-73,h-63),(w-54,h-62),(w-57,h-40),(w-69,h-40)],TERRA,INK,1)
    foliage(a,w-64,h-73,.55,3)
    a.line([(16,h-25),(w-16,h-25)],LIGHT,1.1)
base.narrow_shop=refined_shop

def refined_awning(a):
    w,h=a.w,a.h
    a.poly([(6,11),(w-13,11),(w-5,72),(11,72)],TERRA,INK,1.8)
    for i,x in enumerate(range(15,w-16,31)):
        a.poly([(x,13),(x+12,13),(x+16,72),(x+3,72)],"#E0AC81" if i%2 else "#C6835D",None)
        a.line([(x+2,18),(x+7,65)],"#E7B897",.8)
        a.ellipse((x,63,x+30,89),TERRA,INK,1)
        a.arc((x+1,65,x+29,87),0,175,LIGHT,1.2)
    a.line([(10,71),(w-6,71)],"#7A4F3A",1.1)
    a.line([(7,14),(w-13,14)],"#E7B995",1.5)

def vine(a):
    w,h=a.w,a.h
    a.poly([(w*.35,h-46),(w*.72,h-45),(w*.66,h-10),(w*.4,h-9)],TERRA,INK,1.3)
    a.ellipse((w*.35,h-52,w*.73,h-38),"#775640",INK,1)
    a.line([(w*.47,h-43),(w*.58,40),(w*.3,12)],"#6B7E5E",2)
    for i in range(9):
        yy=25+i*(h-70)/8
        xx=w*.5+math.sin(i*1.7)*w*.19
        foliage(a,xx,yy,.75,i+20)
    a.line([(w*.43,h-38),(w*.4,h-17)],"#E0AE89",1.3)

def embellish(a,slot_id):
    w,h=a.w,a.h
    if slot_id=="lc_ground_paving":
        rng=random.Random(194)
        for i in range(250):
            x=rng.randrange(16,w-16);y=rng.randrange(15,h-15)
            if abs(x-w/2)>240 and abs(y-h/2)>120: continue
            a.line([(x,y),(x+3,y+1)],"#D9CBB1",.7)
        for x,y in ((545,680),(1010,800),(475,1130),(1010,1470)):
            for i in range(4):
                a.poly([(x+i*9,y+2),(x+5+i*9,y-1),(x+6+i*9,y+5),(x+1+i*9,y+6)],"#B8BB91",None)
    elif slot_id=="lc_tea_stall_back":
        grain(a,24,55,w-27,61,1)
        grain(a,174,188,225,229,2)
        for x,y in ((45,70),(86,72),(130,69)):
            a.line([(x+7,y+10),(x+13,y+10)],LIGHT,1)
        a.ellipse((31,225,82,247),"#453B32",None)
        for x in range(39,77,9): a.line([(x,228),(x,241)],"#C38B58",1.5)
        a.box((178,238,225,255),"#C6A075",INK,1)
        for x in range(181,221,8): a.line([(x,241),(x+3,253)],"#896347",.6)
    elif slot_id=="lc_tea_counter_front":
        grain(a,13,119,44,134,3)
    elif slot_id=="lc_tea_patio_front":
        grain(a,57,75,125,83,2)
        a.line([(97,48),(119,46)],LIGHT,1)
    elif "chestnut_cart" in slot_id:
        grain(a,65,min(140,h-26),122,min(174,h-10),6)
    elif slot_id=="lc_bench_front":
        for yy in (21,36,49): grain(a,19,yy,w-16,yy+7,yy)
        for x in (24,w-25):
            a.ellipse((x,28,x+3,31),"#6D5747",None)
    elif slot_id=="lc_tree_front":
        for i,(x,y) in enumerate(((50,86),(104,48),(145,80),(95,125))):
            foliage(a,x,y,1.4,i+8)
    elif slot_id in ("lc_curb_flower_display","lc_planter_front","lc_north_herb_stand"):
        for i in range(3): foliage(a,25+i*(w-50)/2,35+(i%2)*12,.65,i+2)
    elif slot_id=="lc_tailor_work_rack":
        a.line([(26,62),(47,63)],LIGHT,.7)
        for yy in range(65,79,4): a.line([(29,yy),(44,yy)],"#637F89",.55)
        a.arc((55,37,82,67),0,160,TERRA,1.2)
    elif slot_id=="lc_tailor_goods":
        for x in (29,44,58):
            a.line([(x,59),(x,98)],"#B6C5C0",.85)
        for x in (90,111): a.arc((x,17,x+14,29),0,180,LIGHT,.7)
    elif slot_id in ("lc_shop_goods_east","lc_curb_pottery_west"):
        for x in range(29,w-18,21):
            a.arc((x,75,x+14,91),0,175,LIGHT,1.1)
    elif slot_id=="lc_crossing_pennants":
        for x in range(37,w-20,65): a.line([(x,15),(x+12,34)],LIGHT,.8)
    elif slot_id=="lc_lantern_post_front":
        a.line([(34,43),(35,62)],LIGHT,1.4)
        a.ellipse((43,51,60,59),"#FFDF9A",None)
        for xx in (35,70): a.line([(xx,41),(xx-1,61)],"#AC7750",.85)
    elif slot_id=="lc_south_post_house_back":
        grain(a,80,223,185,232,3)
        for i in range(3):
            a.poly([(55+i*30,246),(77+i*30,245),(77+i*30,258),(55+i*30,258)],LIGHT,"#A58A6C",.6)
            a.line([(55+i*30,246),(66+i*30,254),(77+i*30,245)],"#A58A6C",.7)
    elif slot_id=="lc_south_grain_house_back":
        for x in (82,103,124):
            a.line([(x,250),(x-4,231)],"#B5925D",1.3)
            for yy in (233,239,245):
                a.ellipse((x-6,yy-3,x-2,yy),GOLD,None)

def refined_tea_stall(a):
    w,h=a.w,a.h
    a.poly([(12,25),(w-17,22),(w-15,167),(13,173)],"#DCCAA7",INK,2)
    # Sunlit plaster, timber joints and deeply recessed shelves.
    a.poly([(20,39),(w-26,36),(w-24,157),(20,161)],"#B79870",INK,1.7)
    a.box((29,48,w-36,146),"#51483B",INK,1.2)
    for yy in (47,82,115,146):
        a.box((25,yy,w-31,yy+5),"#AE845A",INK,.8)
        a.line([(28,yy),(w-34,yy)],"#E1BD8D",1)
        grain(a,31,yy+1,w-37,yy+4,int(yy))
    # Glazed teapots and lidded tea tins on the upper shelves.
    for i,(xx,yy,c) in enumerate(((48,66,LIGHT),(92,65,TERRA),(137,65,SAGE),(186,65,BLUE))):
        a.ellipse((xx-13,yy-10,xx+12,yy+9),c,INK,1.3)
        a.arc((xx+8,yy-8,xx+21,yy+8),255,95,INK,1)
        a.poly([(xx-11,yy-4),(xx-20,yy-8),(xx-18,yy),(xx-10,yy+3)],c,INK,1)
        a.ellipse((xx-8,yy-13,xx+8,yy-8),LIGHT,INK,.8)
        a.ellipse((xx-2,yy-16,xx+3,yy-12),GOLD,INK,.5)
        a.arc((xx-6,yy-5,xx+6,yy+7),10,160,BLUE if c!=BLUE else LIGHT,.8)
    for i,xx in enumerate((43,74,110,150,187,213)):
        ceramic(a,xx,90,19,22,(TERRA,SAGE,LIGHT)[i%3])
    for i,xx in enumerate((45,90,135,183)):
        a.box((xx,122,xx+25,144),(BLUE,SAGE,TERRA,GOLD)[i],INK,1,2)
        a.box((xx+6,129,xx+19,138),LIGHT,None)
        a.line([(xx+9,132),(xx+15,132)],"#A78C68",.8)
    a.box((18,177,96,263),"#6C5340",INK,1.8,4)
    a.poly([(19,178),(96,178),(90,188),(24,188)],"#B78B5D",INK,1)
    a.ellipse((28,192,87,219),"#463C32",INK,1)
    a.ellipse((39,179,77,210),"#637474",INK,1.3)
    a.arc((47,166,77,191),180,350,INK,1.6)
    a.poly([(72,187),(88,177),(92,183),(78,198)],"#637474",INK,1)
    a.ellipse((44,177,71,188),"#8EA19A",INK,1)
    a.line([(47,188),(47,203)],"#B4C4B9",1.3)
    a.box((32,234,80,253),"#44372E",INK,1)
    for xx in range(38,77,9): a.line([(xx,237),(xx,249)],"#B47945",1)
    for xx,yy in ((123,213),(151,216),(125,243),(155,241)):
        a.ellipse((xx-10,yy+3,xx+11,yy+8),LIGHT,INK,.8)
        glazed_cup(a,xx,yy,.9,LIGHT)
    a.box((180,187,230,239),"#AC7E53",INK,1.4,2)
    grain(a,185,193,226,233,10)
    a.ellipse((192,244,221,261),"#CAB387",INK,1.2)
    for yy in (249,254): a.line([(195,yy),(218,yy)],"#8F704F",.8)
    # Hanging herbs and warm brass cups are visibly attached to the timber.
    a.line([(20,171),(20,h-17)],"#634631",4)
    a.line([(w-18,169),(w-18,h-17)],"#634631",4)
    for xx in (111,146,181):
        a.line([(xx,153),(xx,170)],WOOD,.8)
        a.ellipse((xx-7,168,xx+7,186),GOLD,INK,.9)
        a.arc((xx+3,169,xx+12,183),260,95,INK,.7)
    a.line([(25,175),(90,175)],LIGHT,1)

def refined_herb_stand(a):
    w,h=a.w,a.h
    a.poly([(15,48),(w-11,46),(w-13,h-12),(20,h-8)],"#B29368",INK,1.6)
    for xx in (22,w-24):
        a.line([(xx,21),(xx+2,h-9)],WOOD,4)
        a.line([(xx+2,26),(xx+4,h-17)],"#D1B088",1.3)
    a.poly([(12,22),(w-9,19),(w-4,40),(10,42)],SAGE,INK,1.6)
    for xx in range(19,w-10,17):
        a.poly([(xx,23),(xx+8,22),(xx+11,41),(xx+2,41)],"#C9CAA6",None)
    for row,yy in enumerate((80,119,158)):
        a.box((18,yy,w-15,yy+8),WOOD,INK,1)
        a.line([(20,yy),(w-17,yy)],"#DCB789",1.1)
        for col in range(3):
            xx=30+col*34
            a.poly([(xx-10,yy-22),(xx+10,yy-22),(xx+7,yy-3),(xx-7,yy-2)],TERRA,INK,1)
            foliage(a,xx,yy-30,.75,row*4+col)
    a.poly([(45,163),(93,160),(88,184),(51,185)],GOLD,INK,1)
    for yy in (169,175,181): a.line([(49,yy),(90,yy-2)],"#AF8450",.8)

def refined_bun_cart(a):
    w,h=a.w,a.h
    a.poly([(13,79),(w-13,75),(w-10,165),(19,174)],"#896749",INK,1.7)
    a.poly([(17,80),(w-18,77),(w-22,96),(22,101)],"#CFA676",INK,1.4)
    a.box((22,103,w-22,147),"#6C5140",INK,1)
    for yy in (117,132): a.line([(25,yy),(w-25,yy-3)],"#CDA575",3)
    for xx in (38,68,101):
        a.ellipse((xx-10,108,xx+11,118),LIGHT,INK,.7)
        a.arc((xx-8,112,xx+8,121),0,180,BLUE,.7)
    # Separate steam basket cover is loaded by SceneInteraction above this work surface.
    a.ellipse((29,60,112,88),GOLD,INK,1.2)
    a.arc((31,63,109,83),0,180,"#B3834A",1)
    a.ellipse((19,144,60,161),GOLD,INK,1)
    for i in range(4): a.arc((23,148+i*2,56,155+i*2),0,180,"#9A734A",.7)
    for xx in (20,w-20):
        a.line([(xx,23),(xx,168)],WOOD,3)
        a.line([(xx+2,28),(xx+2,154)],"#D6AF7C",1)
    a.poly([(7,17),(w-11,14),(w-3,40),(11,43)],SAGE,INK,1.7)
    for xx in range(16,w-9,28):
        a.poly([(xx,19),(xx+12,18),(xx+17,42),(xx+3,43)],"#C9CCAA",None)
    a.line([(12,41),(w-5,39)],LIGHT,1)
    for xx in (22,62,101):
        a.ellipse((xx,36,xx+28,49),SAGE,INK,.8)
        a.arc((xx+1,38,xx+26,48),0,175,LIGHT,.8)
    grain(a,25,155,w-26,168,2)

def target_image(kind):
    p=props.Painter()
    if kind=="pocket_watch":
        p.ellipse((14,19,82,87),GOLD,INK,2)
        p.ellipse((21,26,75,80),LIGHT,INK,1.8)
        p.arc((13,7,80,36),190,350,GOLD,3)
        p.line([(48,50),(48,33)],INK,2)
        p.line([(48,50),(61,58)],INK,2)
        for n in range(12):
            t=n*math.tau/12;x,y=48+math.sin(t)*23,53+math.cos(t)*23
            p.line([(x,y),(48+math.sin(t)*19,53+math.cos(t)*19)],INK,1.1)
        p.ellipse((45,49,51,55),TERRA,None)
    elif kind=="sewing_scissors":
        p.polygon([(44,51),(77,13),(83,19),(50,64)],"#A7AAA0",INK,2)
        p.polygon([(47,53),(82,78),(77,84),(39,62)],"#858D86",INK,2)
        p.ellipse((10,50,43,81),TERRA,INK,2)
        p.ellipse((17,57,35,74),LIGHT,INK,1.6)
        p.ellipse((25,28,52,52),TERRA,INK,2)
        p.ellipse((31,33,46,46),LIGHT,INK,1.4)
        p.ellipse((42,53,49,60),GOLD,INK,1)
    elif kind=="blue_feather":
        p.polygon([(14,78),(24,44),(46,19),(70,12),(80,21),(68,49),(47,68),(24,77)],BLUE,INK,2)
        p.line([(11,85),(71,20)],LIGHT,2)
        for x,y in ((26,63),(36,51),(47,39),(59,26)):
            p.line([(x,y),(x-6,y-12)],"#9FB5B4",1)
            p.line([(x,y),(x+14,y-1)],"#4E6B74",1)
    elif kind=="sealed_letter":
        p.polygon([(9,22),(85,19),(87,73),(12,77)],LIGHT,INK,2)
        p.line([(11,24),(49,49),(83,21)],"#AA8763",1.8)
        p.line([(13,73),(39,48)],"#C3A982",1)
        p.line([(86,72),(59,47)],"#C3A982",1)
        p.ellipse((41,43,57,59),TERRA,INK,1)
        p.ellipse((46,47,51,53),GOLD,None)
    elif kind=="honey_dipper":
        p.polygon([(20,69),(66,25),(73,32),(27,76)],WOOD,INK,2)
        p.ellipse((52,11,86,46),GOLD,INK,2)
        for k in range(4): p.line([(58+k*5,16),(72+k*3,37)],"#926639",2)
        p.line([(26,68),(59,35)],"#C9A170",1.3)
    elif kind=="seed_packet":
        p.polygon([(22,12),(74,12),(76,85),(19,83)],LIGHT,INK,2)
        p.line([(25,22),(70,22)],TERRA,3)
        p.line([(46,67),(49,41)],"#64795C",2)
        p.ellipse((31,39,49,53),SAGE,INK,1)
        p.ellipse((48,32,67,47),SAGE,INK,1)
        p.ellipse((35,70,40,76),GOLD,None)
        p.ellipse((53,71,58,77),GOLD,None)
    elif kind=="orchard_apple":
        p.ellipse((14,28,59,80),TERRA,INK,2)
        p.ellipse((38,25,82,80),"#CA7956",INK,2)
        p.polygon([(42,65),(55,66),(57,80),(37,80)],TERRA,None)
        p.line([(47,32),(51,17)],WOOD,3)
        p.polygon([(52,22),(65,12),(79,17),(70,27)],SAGE,INK,1.6)
        p.arc((20,33,45,64),160,265,"#E7AB77",3)
    elif kind=="golden_bun":
        p.ellipse((13,30,85,79),"#EDD3A0",INK,2)
        p.ellipse((18,25,80,68),LIGHT,INK,1.7)
        for x in (30,42,54,64): p.line([(48,32),(x,47)],"#C7A577",1.3)
        p.ellipse((40,25,57,38),GOLD,INK,1)
        p.arc((20,40,77,75),10,170,"#D7B77B",1.5)
    return p.finish()

def interaction_image(kind,opened):
    size=next(item["visualWorldSize"] for item in SCENE["interactiveSlots"] if item["id"]==kind)
    a=FineArt({"size":size,"alpha":True})
    w,h=a.w,a.h
    if kind=="parcel_chest":
        a.poly([(10,55 if opened else 38),(86,52 if opened else 34),(91,75),(17,81)],WOOD,INK,1.8)
        grain(a,20,56,84,71,4)
        a.line([(18,74),(85,69)],"#C8A17A",2)
        if opened:
            a.poly([(12,5),(84,4),(87,29),(12,30)],"#B78C63",INK,1.8)
            a.box((19,9,78,24),"#72503C",INK,1)
            a.poly([(11,29),(21,30),(21,54),(15,58)],"#584333",INK,1)
            a.poly([(79,29),(87,28),(87,53),(80,55)],"#584333",INK,1)
        else:
            a.poly([(10,22),(83,18),(89,47),(16,51)],"#B78D63",INK,1.8)
            grain(a,18,27,82,43,8)
            for x in (25,73): a.line([(x,23),(x+3,49)],"#64716D",4)
            a.box((44,42,55,57),GOLD,INK,1,2)
    elif kind=="bun_lid":
        a.ellipse((5,23,w-5,h-5),None if opened else GOLD,INK,1.5)
        a.arc((8,25,w-8,h-9),0,180,"#A67B4C",1)
        if opened:
            a.ellipse((12,23,w-12,44),None,INK,1)
            a.poly([(7,4),(28,3),(32,26),(13,31)],LIGHT,INK,1)
            a.line([(14,8),(21,23)],BLUE,1.3)
        else:
            a.poly([(5,10),(w-8,11),(w-5,41),(w-16,48),(w-26,41),(15,44),(5,37)],LIGHT,INK,1.4)
            for x in range(15,w-10,16): a.line([(x,13),(x+4,39)],BLUE,2)
            a.line([(10,16),(w-12,17)],"#D3C09B",1)
    else:
        # Leaves open to the sides; the center window reveals the independently drawn seed packet.
        for i in range(5 if opened else 10):
            x=(9 if i%2==0 else w-10) if opened else 20+(i%3)*17
            y=13+(i//2)*12 if opened else 12+(i//3)*17
            foliage(a,x,y,.67,i+60)
        a.poly([(8,h-22),(w-8,h-24),(w-13,h-5),(14,h-4)],"#B18560",INK,1)
        a.line([(15,h-13),(w-14,h-15)],"#D0A67C",1)
    return a.im.resize((w,h),Image.Resampling.LANCZOS)

def metadata(png):
    meta=Path(str(png)+".meta")
    template=BUNDLE/"targets/tea_clay_whistle.png.meta"
    record=json.loads((meta if meta.exists() else template).read_text(encoding="utf-8"))
    uid=record["uuid"] if meta.exists() else str(uuid4())
    record["uuid"]=uid
    with Image.open(png) as image:
        rw,rh=image.size
        bounds=image.convert("RGBA").getchannel("A").getbbox()
    left,top,right,bottom=bounds
    tw,th=right-left,bottom-top
    texture=record["subMetas"]["6c48a"]
    texture["uuid"]=uid+"@6c48a";texture["displayName"]=png.stem
    texture["userData"]["imageUuidOrDatabaseUri"]=uid
    frame=record["subMetas"]["f9941"]
    frame["uuid"]=uid+"@f9941";frame["displayName"]=png.stem
    data=frame["userData"]
    data.update({"offsetX":(left-(rw-right))/2,"offsetY":((rh-bottom)-top)/2,"trimX":left,"trimY":top,
                 "width":tw,"height":th,"rawWidth":rw,"rawHeight":rh,"imageUuidOrDatabaseUri":uid+"@6c48a"})
    data["vertices"]={"rawPosition":[-tw/2,-th/2,0,tw/2,-th/2,0,-tw/2,th/2,0,tw/2,th/2,0],
                      "uv":[left,rh-top,right,rh-top,left,rh-bottom,right,rh-bottom],
                      "nuv":[left/rw,(rh-top)/rh,right/rw,(rh-top)/rh,left/rw,(rh-bottom)/rh,right/rw,(rh-bottom)/rh],
                      "minPos":[-tw/2,-th/2,0],"maxPos":[tw/2,th/2,0]}
    record["userData"]["redirect"]=uid+"@6c48a"
    meta.write_text(json.dumps(record,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

def export(image,category,asset_id,records,brief):
    source=HERE/"png"/category/(asset_id+".png")
    source.parent.mkdir(parents=True,exist_ok=True)
    runtime=BUNDLE/category/(asset_id+".png")
    runtime.parent.mkdir(parents=True,exist_ok=True)
    image.save(source,optimize=True)
    shutil.copyfile(source,runtime)
    metadata(runtime)
    records.append({"id":asset_id,"source":source.relative_to(ROOT).as_posix(),
        "runtime":runtime.relative_to(ROOT).as_posix(),"size":list(image.size),
        "sha256":hashlib.sha256(source.read_bytes()).hexdigest(),"authoringBrief":brief,
        "status":"trial_unapproved","generationSpec":{"method":"editable authored Pillow drawing","supersample":2 if category!="targets" else 4},
        "finalGameAssetSpec":{"format":"PNG RGBA","canvas":list(image.size),"spriteFrame":category+"/"+asset_id+"/spriteFrame"}})

def main():
    records=[]
    for slot in SCENE["artSlots"]:
        a=FineArt(slot)
        if "flower_vine" in slot["id"]: vine(a)
        elif slot["id"]=="lc_tea_awning_front": refined_awning(a)
        elif slot["id"]=="lc_tea_stall_back": refined_tea_stall(a)
        elif slot["id"]=="lc_north_herb_stand": refined_herb_stand(a)
        elif slot["id"]=="lc_east_bun_cart_back": refined_bun_cart(a)
        else:
            base.DRAW[slot["id"]](a)
            embellish(a,slot["id"])
        image=a.im.resize((a.w,a.h),Image.Resampling.LANCZOS)
        export(image,"simple2d_scene",slot["id"],records,slot["purpose"]+" Fine material, edge and planting revision.")
    original={"tea_clay_whistle":props.tea_clay_whistle,"tailor_thimble":props.tailor_thimble,
              "banner_knot":props.banner_knot,"chestnut_tongs":props.chestnut_tongs}
    for target in SCENE["hiddenObjectSlots"]:
        image=original[target["id"]]() if target["id"] in original else target_image(target["id"])
        export(image,"targets",target["id"],records,target.get("clue",target["semanticContext"]))
    for item in SCENE["interactiveSlots"]:
        for opened in (False,True):
            export(interaction_image(item["id"],opened),"interactions",item["id"]+("_opened" if opened else "_closed"),
                   records,item["label"]+"; same registered canvas in both states, central reveal aperture.")
    manifest={"batchId":"refined_city_v2","styleId":"chicken_simple_2d_v1","status":"trial_unapproved",
        "editableSource":"art/production/refined_city_v2/render_refined.py","conceptReference":"lc_refined_street_direction_v2_source.png",
        "assets":records,"processing":["2x/4x supersampling","Lanczos resize to explicit canvas","lossless PNG",
        "Cocos alpha trim refresh preserving existing UUIDs","source/runtime SHA match"],"review":{"runtime":"pending","phone":"not_run","playerApproval":"pending"}}
    (HERE/"production_manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    # Actual source image metadata, distinct from requested generation specifications.
    concept=HERE/"lc_refined_street_direction_v2_source.png"
    with Image.open(concept) as im:
        actual={"id":"lc_refined_street_direction_v2","actualSize":list(im.size),"mode":im.mode,
                "sha256":hashlib.sha256(concept.read_bytes()).hexdigest(),"status":"concept_reference_only",
                "runtimeAsset":False,"promptPath":"art/production/refined_city_v2/PROMPT.md"}
    (HERE/"generation_record.json").write_text(json.dumps(actual,indent=2)+"\n",encoding="utf-8")
    print(f"Exported {len(records)} aligned refined assets (44 scene layers, 12 targets, 6 interaction states).")

if __name__=="__main__": main()

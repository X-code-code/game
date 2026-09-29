"""Deterministic, editable 2-D cel renderer for the street-block courier.

All geometry below is authored in the shared 256 px canvas, not extracted from
an image model.  Run with the bundled Python/Pillow runtime.  The rendered PNGs
remain trial art until the in-game 444x960 review is accepted.
"""
from __future__ import annotations

import json
import math
import hashlib
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


HERE = Path(__file__).resolve().parent
EXPORT = HERE / "export"
SOURCE = HERE / "svg_source"
REVIEW = HERE / "review"
BUNDLE = HERE.parents[2] / "assets" / "bundles" / "city_living_city_street_block_01" / "cels" / "messenger_customer"
S = 4
PAINTED_HEIGHT = 186
INK = "#634A3B"
FEATHER = "#F3E6C6"
HIGHLIGHT = "#FFF2D7"
SHADE = "#D9AB62"
SHADE_PALE = "#E8CD93"
VEST = "#6F8B95"
VEST_LIGHT = "#8EA8A9"
VEST_DARK = "#526E77"
BAG = "#B9684D"
BAG_LIGHT = "#D58B63"
LEATHER = "#88654A"
BEAK = "#CF8C4E"
BEAK_LIGHT = "#E8A862"
FOOT = "#B06B51"
FOOT_LIGHT = "#D48662"
EYE = "#372B29"


def cubic(p0, p1, p2, p3, count=12):
    out = []
    for i in range(1, count + 1):
        t = i / count
        u = 1 - t
        out.append((u**3 * p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0],
                    u**3 * p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1]))
    return out


class Painter:
    def __init__(self):
        self.im = Image.new("RGBA", (256*S, 256*S), (0, 0, 0, 0))
        self.draw = ImageDraw.Draw(self.im)
        self.svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">']
        self.offset = (0.0, 0.0)

    def set_offset(self, x=0, y=0):
        self.offset = (x, y)

    def pts(self, commands):
        points, svg, start = [], [], None
        for op, *v in commands:
            if op == "M":
                point = (v[0], v[1]); points.append(point); start = point
                svg.append(f"M{v[0]:.2f},{v[1]:.2f}")
            elif op == "L":
                point = (v[0], v[1]); points.append(point)
                svg.append(f"L{v[0]:.2f},{v[1]:.2f}")
            elif op == "C":
                p0 = points[-1]
                points.extend(cubic(p0, (v[0],v[1]), (v[2],v[3]), (v[4],v[5])))
                svg.append("C" + " ".join(f"{v[i]:.2f},{v[i+1]:.2f}" for i in (0,2,4)))
            elif op == "Z":
                if start is not None: points.append(start)
                svg.append("Z")
        return points, " ".join(svg)

    def path(self, commands, fill=None, stroke=INK, width=3.6):
        pts, svg = self.pts(commands)
        ox, oy = self.offset
        pixels = [((x+ox)*S, (y+oy)*S) for x,y in pts]
        if fill and len(pixels) >= 3: self.draw.polygon(pixels, fill=fill)
        if stroke and len(pixels) >= 2:
            self.draw.line(pixels, fill=stroke, width=round(width*S), joint="curve")
            r = width*S/2
            for x,y in (pixels[0], pixels[-1]):
                self.draw.ellipse((x-r,y-r,x+r,y+r),fill=stroke)
        self.svg.append(f'<path d="{svg}" fill="{fill or "none"}" stroke="{stroke or "none"}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round" transform="translate({ox:.2f} {oy:.2f})"/>')

    def ellipse(self, box, fill, stroke=None, width=2):
        ox, oy = self.offset
        l,t,r,b = box
        pix = tuple(round((v + (ox if i%2==0 else oy))*S) for i,v in enumerate(box))
        self.draw.ellipse(pix, fill=fill, outline=stroke, width=round(width*S) if stroke else 1)
        self.svg.append(f'<ellipse cx="{(l+r)/2:.2f}" cy="{(t+b)/2:.2f}" rx="{(r-l)/2:.2f}" ry="{(b-t)/2:.2f}" fill="{fill}" stroke="{stroke or "none"}" stroke-width="{width}" transform="translate({ox:.2f} {oy:.2f})"/>')

    def finish(self, path_png, path_svg):
        path_png.parent.mkdir(parents=True,exist_ok=True)
        path_svg.parent.mkdir(parents=True,exist_ok=True)
        self.im.resize((256,256),Image.Resampling.LANCZOS).save(path_png)
        path_svg.write_text("\n".join(self.svg+["</svg>"]),encoding="utf-8")


def draw_foot(p, x, ankle_y, stride, near):
    """A shank pivots under the body; three toes fan around its contact point."""
    p.set_offset(0,-4)
    hipx = x - stride*.18
    heelx = x + stride
    p.path([("M",hipx-5,176),("C",hipx-4,186,heelx-5,191,heelx-4,203),
            ("C",heelx-4,208,heelx+1,210,heelx+4,205),
            ("C",heelx+4,194,hipx+6,185,hipx+5,176),("Z",)], FOOT, INK, 3.3)
    if near:
        # Contact toe reaches the common foot baseline.
        p.path([("M",heelx,201),("C",heelx-7,201,heelx-13,207,heelx-15,213),
                ("C",heelx-12,216,heelx-6,214,heelx,212),
                ("C",heelx+4,216,heelx+10,216,heelx+11,212),
                ("C",heelx+16,214,heelx+21,214,heelx+22,210),
                ("C",heelx+20,204,heelx+10,203,heelx,201),("Z",)],FOOT_LIGHT,INK,3.2)
        p.path([("M",heelx,207),("L",heelx+1,213)],None,LEATHER,1.4)
    else:
        p.path([("M",heelx,197),("C",heelx-10,198,heelx-16,203,heelx-17,207),
                ("C",heelx-13,212,heelx-4,207,heelx,207),
                ("C",heelx+6,211,heelx+14,209,heelx+16,205),
                ("C",heelx+13,201,heelx+7,198,heelx,197),("Z",)],FOOT_LIGHT,INK,3.2)
    p.set_offset()


def draw_tail(p, direction, swing):
    sign = -1 if direction in ("ne",) else 1
    if direction == "nw": sign = 1
    if direction == "w": sign = 1
    tx = 168 if sign > 0 else 88
    a = swing * 2.5
    p.path([("M",128,161),("C",tx-11*sign,147,tx+3*sign,137+a,tx+13*sign,139+a),
            ("C",tx+8*sign,149,tx+20*sign,151,tx+17*sign,159),
            ("C",tx+10*sign,165,tx+23*sign,168,tx+12*sign,174),
            ("C",tx+2*sign,178,tx-5*sign,176,128,180),("Z",)],FEATHER,INK,3.6)
    p.path([("M",tx+11*sign,147),("C",tx+8*sign,151,tx+8*sign,157,tx+12*sign,161)],None,SHADE,1.8)


def draw_body(p, bob, side, lean=0):
    p.set_offset(lean,bob)
    if side == "n":
        p.path([("M",128,100),("C",152,97,174,115,178,148),("C",181,178,162,191,132,192),
                ("C",101,193,79,180,80,149),("C",82,122,102,100,128,100),("Z",)],FEATHER,INK,4.4)
        p.path([("M",99,139),("C",109,123,146,121,159,140),("C",166,153,166,174,157,186),
                ("C",139,196,111,193,98,184),("C",90,167,91,152,99,139),("Z",)],VEST,INK,3.5)
        p.path([("M",128,130),("C",124,146,124,164,129,188)],None,VEST_DARK,2.0)
        p.ellipse((124,153,130,159),BAG_LIGHT)
        p.ellipse((126,176,132,182),BAG_LIGHT)
    else:
        p.path([("M",128,99),("C",151,96,171,111,176,145),("C",183,177,161,192,130,193),
                ("C",98,194,78,181,82,149),("C",87,116,105,101,128,99),("Z",)],FEATHER,INK,4.4)
        p.path([("M",126,113),("C",149,111,164,127,166,150),("C",167,171,157,185,141,190),
                ("C",118,190,102,180,101,158),("C",100,135,109,120,126,113),("Z",)],VEST,INK,3.5)
        p.path([("M",111,137),("C",125,127,143,128,155,138)],None,VEST_LIGHT,2.2)
        p.path([("M",119,146),("C",124,159,126,174,123,184)],None,VEST_DARK,1.8)
    # A visibly asymmetric cross-body strap and actual satchel flap.
    if side == "ne":
        p.path([("M",145,119),("C",130,133,118,148,108,176)],None,LEATHER,5.0)
        bx=105
    else:
        p.path([("M",107,119),("C",125,133,140,148,150,176)],None,LEATHER,5.0)
        bx=151
    p.path([("M",bx-13,163),("C",bx-1,157,bx+13,160,bx+17,167),("L",bx+17,182),
            ("C",bx+7,190,bx-7,190,bx-16,183),("L",bx-16,169),("Z",)],BAG,INK,3.2)
    p.path([("M",bx-15,170),("C",bx-4,176,bx+8,177,bx+17,169)],None,BAG_LIGHT,2.2)
    p.ellipse((bx-1,174,bx+5,180),SHADE,LEATHER,1.4)
    p.set_offset()


def draw_wing(p, side, swing, bob, receive=False, lean=0):
    p.set_offset(lean,bob)
    left = side == "left"
    x = 89 if left else 166
    sign = -1 if left else 1
    y = 135 + swing*2
    if receive and left:
        # Three discrete reaches: shoulder stays connected while feathers extend.
        tipx = 78 - receive*9
        tipy = 151 - receive*5
        p.path([("M",x,y-9),("C",x-14,y-15,tipx+3,tipy-13,tipx,tipy),
                ("C",tipx-3,tipy+4,tipx+1,tipy+8,tipx+7,tipy+7),
                ("C",tipx+5,tipy+13,tipx+12,tipy+15,tipx+15,tipy+10),
                ("C",x-5,y+30,x+10,y+13,x,y-9),("Z",)],FEATHER,INK,3.4)
    else:
        p.path([("M",x,y-10),("C",x+11*sign,y-14,x+19*sign,y+4,x+21*sign,y+15),
                ("C",x+21*sign,y+23,x+16*sign,y+31,x+10*sign,y+31),
                ("C",x+11*sign,y+38,x+6*sign,y+37,x+2*sign,y+31),
                ("C",x-1*sign,y+37,x-8*sign,y+31,x-8*sign,y+24),
                ("C",x-11*sign,y+11,x-8*sign,y-4,x,y-10),("Z",)],FEATHER,INK,3.6)
    p.path([("M",x+3*sign,y+8),("C",x+11*sign,y+16,x+10*sign,y+26,x+3*sign,y+29)],None,SHADE,2)
    p.path([("M",x-2*sign,y+17),("C",x+2*sign,y+22,x+2*sign,y+27,x-1*sign,y+29)],None,SHADE_PALE,1.6)
    p.set_offset()


def draw_head(p, facing, bob, blink=False, lean=0):
    p.set_offset(lean,bob)
    # Fixed tuft count (three), with one different feather on the anatomical left.
    p.path([("M",111,50),("C",107,44,107,38,111,36),("C",117,40,119,45,120,46),
            ("C",120,39,125,34,129,35),("C",132,39,133,45,134,48),
            ("C",139,43,143,42,147,45),("C",147,49,145,53,143,55),("Z",)],FEATHER,INK,3.5)
    if facing == "n":
        p.path([("M",128,49),("C",150,48,161,61,162,80),("C",165,100,149,114,130,115),
                ("C",108,116,94,103,95,82),("C",96,64,107,50,128,49),("Z",)],FEATHER,INK,4.2)
        p.path([("M",110,81),("C",116,87,125,89,131,86)],None,SHADE_PALE,1.6)
        p.path([("M",141,79),("C",146,83,149,89,147,93)],None,SHADE_PALE,1.6)
    else:
        shift = {"nw":-6,"w":-10,"ne":6}[facing]
        p.path([("M",128+shift,48),("C",150+shift,47,161+shift,61,162+shift,80),
                ("C",164+shift,99,149+shift,116,129+shift,116),
                ("C",107+shift,116,94+shift,101,95+shift,81),
                ("C",96+shift,63,109+shift,49,128+shift,48),("Z",)],FEATHER,INK,4.2)
        # cheek patch and little cheek feather irregularities keep the face warm.
        cheekx = 108+shift if facing in ("nw","w") else 146+shift
        p.ellipse((cheekx-10,82,cheekx+12,101),HIGHLIGHT)
        p.path([("M",cheekx-5,98),("C",cheekx,102,cheekx+7,103,cheekx+11,99)],None,SHADE_PALE,1.5)
        eye_x = 114+shift if facing in ("nw","w") else 144+shift
        if blink:
            p.path([("M",eye_x-4,77),("C",eye_x,80,eye_x+3,80,eye_x+6,76)],None,EYE,2.5)
        else:
            p.ellipse((eye_x-3,72,eye_x+5,82),EYE)
            p.ellipse((eye_x-1,73,eye_x+1,76),HIGHLIGHT)
        if facing == "ne":
            bx = 160+shift
            p.path([("M",bx-2,84),("C",bx+5,81,bx+13,84,bx+17,89),
                    ("C",bx+10,95,bx+2,96,bx-4,91),("Z",)],BEAK,INK,3.0)
            p.path([("M",bx+4,85),("L",bx+12,87)],None,BEAK_LIGHT,1.5)
        else:
            bx = 97+shift
            p.path([("M",bx+5,83),("C",bx-3,80,bx-11,84,bx-16,89),
                    ("C",bx-9,95,bx,96,bx+7,91),("Z",)],BEAK,INK,3.0)
            p.path([("M",bx-9,87),("L",bx-1,84)],None,BEAK_LIGHT,1.5)
    p.set_offset()


def draw_cup(p, bx, by):
    p.path([("M",bx-7,by-3),("L",bx+7,by-3),("L",bx+5,by+11),
            ("C",bx+1,by+14,bx-3,by+14,bx-5,by+11),("Z",)],HIGHLIGHT,INK,2.3)
    p.path([("M",bx+6,by),("C",bx+13,by-2,bx+14,by+7,bx+7,by+8)],None,INK,2)
    p.ellipse((bx-7,by-5,bx+7,by-1),BEAK_LIGHT,INK,1.5)


def render_frame(name, facing, phase=0, motion="walk", reach=0):
    p = Painter()
    if motion == "walk":
        # Contact, passing, opposite contact, passing. Foot anchors alternate.
        phases = [(0,-10,4,-4,1,-5),(1,-2,12,5,-4,-2),
                  (2,10,-4,4,1,5),(3,2,-12,-5,-4,2)]
        _,a,b,swing,bob,lean=phases[phase]
    else:
        a=b=swing=lean=0; bob=[0,-1,-2,-1][phase % 4]
    if motion == "turn":
        lean = (-3,-1,3)[phase]
        bob = (0,-2,-1)[phase]
    if motion == "receive":
        bob = [0,0,-2,-2,0][phase]
        swing = [0,0,1,1,0][phase]
        lean = [-2,-1,-3,1,2][phase]
    # Back-to-front drawing; no in-image ground shadow.
    draw_foot(p,111,203,a,near=(a>=b))
    draw_foot(p,146,203,b,near=(b>a))
    draw_tail(p,facing,swing)
    draw_body(p,bob,"n" if facing=="n" else facing,lean)
    wing_swing = swing if motion=="walk" else (0 if phase%2==0 else 1)
    draw_wing(p,"right",-wing_swing,bob,lean=lean)
    draw_wing(p,"left",wing_swing,bob,reach if motion=="receive" else False,lean=lean)
    draw_head(p,facing,bob-1 if motion=="walk" and phase in (1,3) else bob,
              blink=(motion=="idle" and phase==2) or (motion=="receive" and phase==3),
              lean=lean*1.25)
    if motion=="receive" and phase in (2,3):
        draw_cup(p,61,140 if phase==2 else 137)
    p.finish(EXPORT/(name+".png"),SOURCE/(name+".svg"))


def main():
    clips={}
    for d in ("n","nw","ne"):
        names=[]
        for i in range(4):
            name=f"courier_walk_{d}_{i:02d}"; render_frame(name,d,i)
            names.append({"asset":name,"durationSeconds":0.11})
        clips[f"walk_{d}"]=names
    names=[]
    for i,f in enumerate(("nw","w","w")):
        name=f"courier_turn_nw_w_{i:02d}"; render_frame(name,f,i,"turn")
        names.append({"asset":name,"durationSeconds":0.11})
    clips["turn_nw_w"]=names
    names=[]
    for i in range(3):
        name=f"courier_idle_w_{i:02d}"; render_frame(name,"w",i,"idle")
        names.append({"asset":name,"durationSeconds":0.35})
    clips["idle_w"]=names
    names=[]
    for i,reach in enumerate((0,1,2,2,0)):
        name=f"courier_receive_w_{i:02d}"; render_frame(name,"w",i,"receive",reach)
        names.append({"asset":name,"durationSeconds":(0.18 if i!=2 else 0.26)})
    clips["receive_w"]=names
    names=[]
    for i,f in enumerate(("w","n","ne")):
        name=f"courier_turn_w_ne_{i:02d}"; render_frame(name,f,i,"turn")
        names.append({"asset":name,"durationSeconds":0.11})
    clips["turn_w_ne"]=names
    names=[]
    for i in range(3):
        name=f"courier_idle_ne_{i:02d}"; render_frame(name,"ne",i,"idle")
        names.append({"asset":name,"durationSeconds":0.35})
    clips["idle_ne"]=names
    manifest={"schemaVersion":1,"actorId":"messenger_customer",
              "canvasPx":{"width":256,"height":256},"footpointPx":{"x":128,"y":215},
              "paintedHeightPx":PAINTED_HEIGHT,"clips":clips}
    (EXPORT/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    render_review(manifest)
    verify_and_record(manifest)
    print(f"Rendered {len(list(EXPORT.glob('courier_*.png')))} cels")


def render_review(manifest):
    REVIEW.mkdir(exist_ok=True)
    frames=[]
    for clip,entries in manifest["clips"].items():
        for entry in entries:
            frames.append((clip,entry["asset"]))
    # 79-pixel nominal figure: 256 canvas * (79/paintedHeight).
    cellw,cellh=144,154
    cols=7; rows=math.ceil(len(frames)/cols)
    board=Image.new("RGB",(cols*cellw,rows*cellh),(235,225,202))
    draw=ImageDraw.Draw(board)
    for j,(clip,name) in enumerate(frames):
        x=(j%cols)*cellw; y=(j//cols)*cellh
        im=Image.open(EXPORT/(name+".png")).convert("RGBA")
        im=im.resize((round(256*79/PAINTED_HEIGHT),round(256*79/PAINTED_HEIGHT)),Image.Resampling.LANCZOS)
        board.paste(im,(x+16,y+4),im)
        draw.text((x+5,y+120),name.replace("courier_",""),fill=(71,51,43))
        draw.line((x+5,y+115,x+139,y+115),fill=(170,139,111),width=1)
    board.save(REVIEW/"contact_79px.png")
    key=("courier_walk_n_00","courier_walk_nw_00","courier_walk_ne_00",
         "courier_idle_w_00","courier_receive_w_02")
    plate=Image.new("RGB",(5*220,240),(235,225,202))
    for i,name in enumerate(key):
        im=Image.open(EXPORT/(name+".png")).convert("RGBA")
        im=im.resize((210,210),Image.Resampling.LANCZOS)
        plate.paste(im,(i*220+5,2),im)
        ImageDraw.Draw(plate).text((i*220+10,216),name.replace("courier_",""),fill=(71,51,43))
    plate.save(REVIEW/"key_poses_source_scale.png")

    for height in (56,79,127):
        cellw=178; cellh=height+58
        sample=("courier_walk_n_00","courier_walk_n_01","courier_walk_n_02","courier_walk_n_03",
                "courier_walk_nw_00","courier_walk_nw_01","courier_walk_nw_02","courier_walk_nw_03",
                "courier_walk_ne_00","courier_walk_ne_01","courier_walk_ne_02","courier_walk_ne_03",
                "courier_idle_w_00","courier_receive_w_01","courier_receive_w_02","courier_receive_w_03")
        board=Image.new("RGB",(4*cellw,4*cellh),(235,225,202))
        dr=ImageDraw.Draw(board)
        scale=height/PAINTED_HEIGHT
        for j,name in enumerate(sample):
            x=(j%4)*cellw; y=(j//4)*cellh
            im=Image.open(EXPORT/(name+".png")).convert("RGBA")
            size=round(256*scale)
            im=im.resize((size,size),Image.Resampling.LANCZOS)
            board.paste(im,(x+round((cellw-size)/2),y),im)
            dr.text((x+6,y+size+5),name.replace("courier_",""),fill=(71,51,43))
        board.save(REVIEW/f"walk_and_event_{height}px.png")

    for d in ("n","nw","ne"):
        frame_names=[f"courier_walk_{d}_{i:02d}" for i in range(4)]
        gif=[]
        for name in frame_names:
            base=Image.new("RGBA",(120,120),(235,225,202,255))
            im=Image.open(EXPORT/(name+".png")).convert("RGBA")
            im=im.resize((round(256*79/PAINTED_HEIGHT),round(256*79/PAINTED_HEIGHT)),Image.Resampling.LANCZOS)
            base.alpha_composite(im,((120-im.width)//2,0))
            gif.append(base.convert("RGB"))
        gif[0].save(REVIEW/f"walk_{d}_79px.gif",save_all=True,append_images=gif[1:],
                    duration=[110]*4,loop=0,disposal=2)


def verify_and_record(manifest):
    records=[]
    for clip,entries in manifest["clips"].items():
        for frame_index,entry in enumerate(entries):
            asset_id=entry["asset"]
            png=EXPORT/(asset_id+".png")
            svg=SOURCE/(asset_id+".svg")
            with Image.open(png) as im:
                assert im.size==(256,256) and im.mode=="RGBA", asset_id
                alpha=im.getchannel("A")
                assert alpha.getextrema()==(0,255), asset_id
                bounds=alpha.getbbox()
                assert bounds and 22<=bounds[1]<=43 and 211<=bounds[3]<=216, (asset_id,bounds)
            if clip.startswith("walk_"):
                direction=clip.removeprefix("walk_")
                phase=("right foot contact and wing recoil", "passing stride with lifted body",
                       "left foot contact and opposite wing recoil", "opposite passing stride with lifted body")[frame_index]
                brief=f"Courier chicken walking {direction}; {phase}; retain 3-feather tuft, slate vest, terracotta satchel, 128,215 shared footpoint."
            elif clip=="receive_w":
                phase=("pause and look left", "extend feather wing", "cup appears at feather tips",
                       "hold cup and blink", "return wing toward torso")[frame_index]
                brief=f"West-facing courier tea handoff: {phase}; keep shoulder connected and feet registered."
            else:
                brief=f"Courier chicken {clip} pose {frame_index+1} of {len(entries)}; coherent costume, shared footpoint, no baked shadow."
            records.append({"id":asset_id,"clip":clip,"authoringBrief":brief,
                            "sourceSvg":str(svg.relative_to(HERE)).replace("\\","/"),
                            "sourceSvgSha256":hashlib.sha256(svg.read_bytes()).hexdigest(),
                            "exportPng":str(png.relative_to(HERE)).replace("\\","/"),
                            "sha256":hashlib.sha256(png.read_bytes()).hexdigest(),
                            "alphaBoundsPx":list(bounds),"reviewStatus":"trial_unapproved"})
    meta={"styleId":"chicken_simple_2d_v1","actorId":"messenger_customer",
          "authoringBrief":"Original simplified 2-D courier chick; near-top-down parallel view; 3 distinct directions; leg weight shift, wing counter-swing, breathing, blink and staged tea handoff. Warm uneven ink, cream feathers, slate short vest, terracotta satchel; no model imagery or baked shadow.",
          "sourceRenderer":"render_courier.py","canvasPx":[256,256],"footpointPx":[128,215],
          "paintedHeightPx":PAINTED_HEIGHT,
          "generationSpec":"Hand-authored Pillow geometry at 4x supersampling; SVG curves exported for every cel.",
          "finalGameAssetSpec":"256x256 straight-alpha RGBA PNG, shared footpoint, nominal painted height 186 px; Cocos SpriteFrame at 120 world-unit painted height.",
          "processing":"Draw at 1024x1024 RGBA and downsample LANCZOS once to 256x256; no automatic trim, no baked ground shadow.",
          "assets":records,"reviewStatus":"trial_unapproved_pending_game_review"}
    (HERE/"production_manifest.json").write_text(json.dumps(meta,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    BUNDLE.mkdir(parents=True,exist_ok=True)
    for png in EXPORT.glob("courier_*.png"):
        shutil.copy2(png,BUNDLE/png.name)
    shutil.copy2(EXPORT/"manifest.json",BUNDLE/"manifest.json")


if __name__=="__main__":
    main()

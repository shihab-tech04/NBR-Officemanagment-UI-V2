#!/usr/bin/env python3
"""Read-only pixel evidence for published TaxPay banner color parity.

No authentication changes or writes: only public CMS SELECT and public
Storage GET. Produces a local JSON report and original image attachments.
"""
import colorsys
import hashlib
import io
import json
import math
import pathlib
import re
import urllib.request

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "test-results" / "banner-image-pixel-evidence"
OUT.mkdir(parents=True, exist_ok=True)
workflow = (ROOT / ".github/workflows/deploy-pages.yml").read_text()
key_match = re.search(r"VITE_TAXPAY_CMS_SUPABASE_PUBLISHABLE_KEY:\s*'([^']+)'", workflow)
if not key_match:
    raise RuntimeError("Existing public CMS key not found; do not guess a project.")
api_key = key_match.group(1)
BASE = "https://eyqhoavnitkrajvyqvxn.supabase.co"
url = BASE + "/rest/v1/taxpay_site_banners?select=id,service_code,published,version,desktop_image_path,background_color,heading_color,body_color,outline_color&published=eq.true&order=sort_order.asc"
req = urllib.request.Request(url, headers={"apikey": api_key, "Accept": "application/json"})
with urllib.request.urlopen(req, timeout=30) as response:
    banners = json.load(response)
if len(banners) != 5:
    raise RuntimeError(f"Expected five active published TaxPay banners, got {len(banners)}")

def hue(hex_color):
    if not hex_color or not re.fullmatch(r"#[0-9A-Fa-f]{6}", hex_color):
        return None
    r,g,b = (int(hex_color[i:i+2],16)/255 for i in (1,3,5))
    h, s, _ = colorsys.rgb_to_hsv(r,g,b)
    return h*360 if s>.06 else None

def delta_hue(a,b):
    if a is None or b is None:
        return None
    d=abs(a-b)
    return round(min(d,360-d),1)

def hex_rgb(r,g,b):
    return "#"+"".join(f"{round(max(0,min(255,v))):02X}" for v in (r,g,b))

def lin(hex_color):
    a=[int(hex_color[i:i+2],16)/255 for i in (1,3,5)]
    a=[v/12.92 if v<=0.04045 else ((v+.055)/1.055)**2.4 for v in a]
    return .2126*a[0]+.7152*a[1]+.0722*a[2]

def ratio(a,b):
    x,y=lin(a),lin(b)
    return (max(x,y)+.05)/(min(x,y)+.05)

def from_hue(h, s, light):
    r,g,b=colorsys.hls_to_rgb((h%360)/360,light/100,s/100)
    return hex_rgb(r*255,g*255,b*255)

def usable_dark(h,bg,s,start):
    for l in range(start,7,-2):
        c=from_hue(h,s,l)
        if ratio(bg,c)>=4.5:return c
    return "#172033"

reports=[]
for row in banners:
    path=row["desktop_image_path"]
    if not path or not path.startswith("banners/"):
        raise RuntimeError(f"Invalid public banner path for {row['id']}")
    public=BASE+"/storage/v1/object/public/taxpay-banners/"+path
    with urllib.request.urlopen(public,timeout=35) as response:
        raw=response.read()
    ext=".jpg" if path.lower().endswith(".jpg") else ".png"
    (OUT/(row["id"]+ext)).write_bytes(raw)
    im=Image.open(io.BytesIO(raw)).convert("RGBA")
    original_size=im.size
    small=im.resize((144,max(1,min(144,round(144*im.height/im.width)))),Image.Resampling.LANCZOS)
    width,height=small.size
    data=list(small.getdata())
    bins=[dict(weight=0.,sin=0.,cos=0.) for _ in range(12)]
    colored=sampled=0
    for y in range(0,height,2):
        for x in range(0,width,2):
            r,g,b,a=data[y*width+x]
            if a<210:continue
            sampled+=1
            rf,gf,bf=r/255,g/255,b/255
            hi,low=max(rf,gf,bf),min(rf,gf,bf)
            d=hi-low
            light=(hi+low)/2
            sat=0 if d==0 else d/(1-abs(2*light-1))
            if sat<.12 or light<.13 or light>.92 or (light>.80 and d<.16):
                continue
            colored+=1
            h,s,v=colorsys.rgb_to_hsv(rf,gf,bf)
            degrees=h*360
            motif_weight=.18 if x<width*.42 else 1.9
            chroma=d**1.2*(.65+sat*.35)
            weight=motif_weight*chroma
            band=bins[int(degrees//30)%12]
            band["weight"]+=weight
            band["sin"]+=math.sin(math.radians(degrees))*weight
            band["cos"]+=math.cos(math.radians(degrees))*weight
    families=[dict(weight=b["weight"]+bins[(i+1)%12]["weight"],
                  sin=b["sin"]+bins[(i+1)%12]["sin"],
                  cos=b["cos"]+bins[(i+1)%12]["cos"]) for i,b in enumerate(bins)]
    dominant=max(families,key=lambda z:z["weight"])
    if dominant["weight"]<=0:
        raise RuntimeError(f"No usable hue in {row['id']} image")
    motif_hue=math.degrees(math.atan2(dominant["sin"],dominant["cos"]))%360
    edge=[]
    ew=max(1,round(width*.14))
    for y in range(0,height,2):
        for x in range(ew):
            r,g,b,a=data[y*width+x]
            if a>=210 and (max(r,g,b)+min(r,g,b))/2>=190:
                edge.append((r,g,b))
    edge_hex=hex_rgb(*[sum(p[i] for p in edge)/len(edge) for i in range(3)]) if edge else None
    bg=from_hue(motif_hue,45,96)
    if edge_hex and (dh:=delta_hue(hue(edge_hex),motif_hue)) is not None and dh<=24 and lin(edge_hex)>=.72:
        bg=edge_hex
    dark=dict(heading_color=usable_dark(motif_hue,bg,58,25),
              body_color=usable_dark(motif_hue,bg,38,31),
              outline_color=usable_dark(motif_hue,bg,60,30))
    suggested={"background_color":bg,**dark}
    current={k:row.get(k) for k in suggested}
    stats=dict(id=row["id"],version=row["version"],path=path,
               size_px=original_size,sha256=hashlib.sha256(raw).hexdigest(),
               dominant_motif_hue=round(motif_hue,1),left_edge_hex=edge_hex,
               current=current,recommended=suggested,
               background_hue_gap=delta_hue(hue(current["background_color"]),motif_hue),
               heading_hue_gap=delta_hue(hue(current["heading_color"]),motif_hue),
               original_background_edge_distance=round(sum((int(current["background_color"][i:i+2],16)-int(edge_hex[i:i+2],16))**2 for i in (1,3,5))**.5,1) if edge_hex and current["background_color"] else None,
               recommended_contrast={k:round(ratio(bg,v),2) for k,v in dark.items()})
    reports.append(stats)
    print("BANNER_IMAGE_PIXEL_AUDIT",json.dumps(stats,separators=(',',':')))
(OUT/"report.json").write_text(json.dumps(reports,indent=2))
print("Analyzed",len(reports),"published banner images from public Storage; no writes.")

"""Deterministic metric architectural diagrams, with software Z buffering.
Images are views of one authored geometry, not generated architectural guesses.
"""
from pathlib import Path
import json, math, html
import numpy as np
from PIL import Image,ImageDraw,ImageFont
R=Path(__file__).resolve().parents[1]/'design'/'scene'/'layout-reference'
G=json.loads((R.parent/'geometry.json').read_text(encoding='utf-8'))
P={s['id']:s for s in json.loads((R.parent/'placements.json').read_text(encoding='utf-8'))['scenes']}
ROOMS={r['id']:r for r in G['rooms']}
OUT=R/'views';OUT.mkdir(exist_ok=True)
def font(n):return ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',n)
def inside(x,y,p):
    v=False
    for a,b in zip(p,p[1:]+p[:1]):
        if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:v=not v
    return v
def bounds(p):return min(v[0] for v in p),min(v[1] for v in p),max(v[0] for v in p),max(v[1] for v in p)
def color(c):return np.array([int(c[i:i+2],16) for i in (1,3,5)],float)
COL={'living':'#d8c3a1','service':'#b6c9c3','guest':'#d9caba','outdoor':'#c2ceb6','circulation':'#eee0c3','wall':'#f2e9d8','wood':'#917a62','hero':'#987a9e','window':'#709eaf'}
def floorcolor(i):return COL['outdoor' if i.startswith('O') else 'guest' if i in ['U2','U3','U4','U5'] else 'service' if i in ['F5','F6','F7','F8','F9','F10','U7'] else 'circulation' if i in ['F1','S','U1','U8'] else 'living']
class Mesh:
    def __init__(self):self.faces=[];self.labels=[]
    def face(self,pts,c):
        a=np.array(pts,float);n=np.cross(a[1]-a[0],a[2]-a[0]);ln=np.linalg.norm(n)
        shade=.85 if ln<1e-10 else .77+.23*abs(np.dot(n/ln,np.array([.3,-.4,.866])))
        rgb=np.clip(color(c)*shade,0,255)
        for j in range(1,len(a)-1):self.faces.append((np.array([a[0],a[j],a[j+1]]),rgb))
    def box(self,x0,y0,z0,x1,y1,z1,c):
        if x1<=x0 or y1<=y0 or z1<=z0:return
        a=[(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0)];b=[(x,y,z1) for x,y,z in a]
        self.face(b,c)
        for j in range(4):self.face([a[j],a[(j+1)%4],b[(j+1)%4],b[j]],c)
    def label(self,p,text,c='#283e3e'):self.labels.append((p,text,c))
def build(levels=(0,),site=False,cut=True,explode=0):
    m=Mesh();rs=[r for r in G['rooms'] if r['floor'] in levels or r['floor']=='0-1' and 0 in levels or site and r['floor']=='outside']
    lines={}
    for r in rs:
        i=r['id'];p=r['polygon'];shift=explode if r['floor']==1 else 0;z=r['z']+shift
        xs=set(v[0] for v in p);ys=set(v[1] for v in p)
        if i=='U1':
            xs.update(v[0] for v in G['stair']['upper_floor_slab_opening']);ys.update(v[1] for v in G['stair']['upper_floor_slab_opening'])
        xs=sorted(xs);ys=sorted(ys)
        for a,b in zip(xs,xs[1:]):
            for c,d in zip(ys,ys[1:]):
                x,y=(a+b)/2,(c+d)/2
                if not inside(x,y,p) or i=='U1' and inside(x,y,G['stair']['upper_floor_slab_opening']):continue
                m.box(a,c,z-.12,b,d,z,floorcolor(i))
        x0,y0,x1,y1=bounds(p);cx,cy=(x0+x1)/2,(y0+y1)/2
        if not inside(cx,cy,p):cx,cy=x0+.7,y0+.7
        if i=='F1':cx,cy=1.6,1.8
        if i=='S':cx,cy=-2.8,5.4
        if i=='U1':cx,cy=5,2.15
        m.label([cx,cy,z+.045],i)
        for a,b in zip(p,p[1:]+p[:1]):
            axis='X' if a[1]==b[1] else 'Y';k=(z,axis,a[1] if axis=='X' else a[0]);u0,u1=sorted([a[0] if axis=='X' else a[1],b[0] if axis=='X' else b[1]])
            lines.setdefault(k,[]).append((u0,u1,r))
        for q in P[i]['props']:
            x0,y0,x1,y1=bounds(q['footprint']);pz=q['position'][2]+shift;h=q['size'][2];kit=q['kit']
            if not q.get('collision',True):
                if kit=='cabinet_ghost':m.box(x0,y0,z+.004,x1,y1,z+.018,COL['hero'])
                elif kit in ('breaker_box','key_box'):m.box(x0,y0,pz,x1,y1,pz+h,COL['hero'])
                continue
            if kit=='dining_set':
                cx,cy=(x0+x1)/2,(y0+y1)/2;m.box(cx-.65,cy-.4,pz+.69,cx+.65,cy+.4,pz+.78,COL['wood'])
                for dx,dy in [(-.85,0),(.85,0),(0,-.64),(0,.64)]:m.box(cx+dx-.21,cy+dy-.21,pz,cx+dx+.21,cy+dy+.21,pz+.46,'#ac9577')
            elif any(k in kit for k in ['desk','table']) and kit!='fold_table':
                m.box(x0,y0,pz+h-.07,x1,y1,pz+h,COL['wood'])
                for x,y in [(x0+.05,y0+.05),(x1-.09,y0+.05),(x1-.09,y1-.09),(x0+.05,y1-.09)]:m.box(x,y,pz,x+.05,y+.05,pz+h,COL['wood'])
            elif kit=='laundry_pole':
                for x in [x0,x1-.06]:m.box(x,(y0+y1)/2,pz,x+.06,(y0+y1)/2+.06,pz+2.1,'#827768')
                m.box(x0,(y0+y1)/2,pz+2.03,x1,(y0+y1)/2+.06,pz+2.1,'#827768')
            elif kit=='tree_bed':
                m.box(x0,y0,pz,x1,y1,pz+.4,'#a7a89a');cx,cy=(x0+x1)/2,(y0+y1)/2
                m.box(cx-.13,cy-.13,pz+.4,cx+.13,cy+.13,pz+(1.2 if cut else 3.5),'#706453')
            else:
                c='#cfcebd' if kit.startswith('bed') or kit=='sofa' else '#e3e0d4' if kit in ['washer','toilet','small_sink','shower_zone'] else COL['wood']
                m.box(x0,y0,pz,x1,y1,pz+min(h,1.2) if cut else pz+h,c)
                if kit.startswith('bed'):m.box(x0+.08,y1-.42,pz+h,x1-.08,y1-.08,pz+h+.09,'#f7f0df')
    opens=G['openings']+G['windows']+G.get('boundary_openings',[])
    for (z,axis,v),edges in lines.items():
        points=sorted(set(t for a,b,r in edges for t in [a,b]))
        for a,b in zip(points,points[1:]):
            owners=[r for aa,bb,r in edges if aa<=(a+b)/2<=bb];ids={r['id'] for r in owners}
            if not ids:continue
            outdoor=all(r['floor']=='outside' for r in owners);th=.2 if len(ids)>1 else .3
            height=.8 if cut and outdoor else 1.0 if cut else 1.9 if outdoor else max(r['height'] for r in owners)
            hh=z+height
            apert=[]
            for o in opens:
                if o['id']=='D20':continue
                oid={o['room']} if 'room' in o else {o['a'],o['b']}
                if not ids.intersection(oid) or o['axis']!=axis:continue
                c=o['center'];vv=c[1] if axis=='X' else c[0]
                if abs(vv-v)>1e-5:continue
                u=c[0] if axis=='X' else c[1];l=u-o['width']/2;rr=u+o['width']/2
                if rr<=a or l>=b:continue
                wz=ROOMS[o['room']]['z'] if 'room' in o else c[2]
                shift=z-owners[0]['z'];bot=(wz+o['sill'] if 'room' in o else c[2])+shift
                apert.append((max(a,l),min(b,rr),bot,bot+o['height'],o))
            cuts=sorted(set([a,b]+[v for ap in apert for v in ap[:2]]))
            def wall(aa,bb,zz,zt,co=COL['wall']):
                if axis=='X':m.box(aa,v-th/2,zz,bb,v+th/2,zt,co)
                else:m.box(v-th/2,aa,zz,v+th/2,bb,zt,co)
            for aa,bb in zip(cuts,cuts[1:]):
                ap=next((q for q in apert if q[0]<=(aa+bb)/2<=q[1]),None)
                if ap is None:wall(aa,bb,z,hh)
                else:
                    l,rr,bot,top,o=ap
                    wall(aa,bb,z,min(bot,hh));wall(aa,bb,max(z,top),hh)
                    if 'room' in o:
                        if not cut:wall(aa,bb,bot,top,COL['window'])
                        else:wall(aa,bb,z+.012,z+.035,COL['window'])
                    else:wall(aa,bb,z+.008,z+.026,'#b67d3d')
    if 0 in levels:
        for part in G.get('internal_partitions',[]):
            a,b=part['line'];m.box(a[0],a[1]-.1,0,b[0],b[1]+.1,1 if cut else part['height'],COL['wall'])
        st=G['stair']
        for key in ['lower_flight','upper_flight']:
            x0,y0,x1,y1=bounds(st[key]['polygon'])
            for j in range(8):
                a=x1-(j+1)*.25 if key=='lower_flight' else x0+j*.25
                top=(j+1)*.2+(0 if key=='lower_flight' else 1.8)
                m.box(a,y0,max(0,top-.18),a+.25,y1,top,'#a18b6d')
        for key in ['turning_landing','upper_landing']:
            a,b,c,d=bounds(st[key]['polygon']);zz=st[key]['z'];m.box(a,b,zz-.18,c,d,zz,'#a18b6d')
        for x,y in G['support_plan']['front_veranda_support']['columns']:
            m.box(x-.15,y-.15,0,x+.15,y+.15,1 if cut else 3.4,'#c6b79f')
    if 1 in levels:
        a,b,c,d=bounds(G['stair']['upper_floor_slab_opening']);z=3.6+explode
        for x0,y0,x1,y1 in [(a,b,c,b+.055),(a,d-.055,c,d),(a,b,a+.055,d)]:m.box(x0,y0,z+.96,x1,y1,z+1.1,'#a18b6d')
    return m
def render(m,path,title,az,elev=55,extra='剖切展示：墙体降至1m，门窗位置与家具占地保持；屋顶隐藏。'):
    W,H=2200,1600
    az=math.radians(az);el=math.radians(elev)
    right=np.array([-math.sin(az),math.cos(az),0.]);up=np.array([-math.cos(az)*math.sin(el),-math.sin(az)*math.sin(el),math.cos(el)]);toward=np.array([math.cos(az)*math.cos(el),math.sin(az)*math.cos(el),math.sin(el)])
    basis=np.stack([right,up,toward],axis=1)
    vertices=np.concatenate([v for v,c in m.faces]);proj=vertices@basis
    lo=proj[:,:2].min(0);hi=proj[:,:2].max(0);ctr=(lo+hi)/2;scale=min((W-240)/(hi[0]-lo[0]),(H-360)/(hi[1]-lo[1]))
    def project(v):
        p=np.array(v)@basis;p[...,0]=(p[...,0]-ctr[0])*scale+W/2;p[...,1]=-(p[...,1]-ctr[1])*scale+H/2+20;return p
    pix=np.empty((H,W,3),dtype=np.uint8);pix[:]=[243,240,231];depth=np.full((H,W),-1e10)
    for face,c in m.faces:
        q=project(face);x0=max(0,int(math.floor(q[:,0].min())));x1=min(W-1,int(math.ceil(q[:,0].max())));y0=max(0,int(math.floor(q[:,1].min())));y1=min(H-1,int(math.ceil(q[:,1].max())))
        if x1<x0 or y1<y0:continue
        (ax,ay,az),(bx,by,bz),(cx,cy,cz)=q;den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
        if abs(den)<1e-8:continue
        xx,yy=np.meshgrid(np.arange(x0,x1+1)+.5,np.arange(y0,y1+1)+.5)
        u=((by-cy)*(xx-cx)+(cx-bx)*(yy-cy))/den;v=((cy-ay)*(xx-cx)+(ax-cx)*(yy-cy))/den;w=1-u-v
        zz=u*az+v*bz+w*cz;dst=depth[y0:y1+1,x0:x1+1];mask=(u>=-1e-6)&(v>=-1e-6)&(w>=-1e-6)&(zz>=dst)
        dst[mask]=zz[mask];pix[y0:y1+1,x0:x1+1][mask]=c.astype(np.uint8)
    im=Image.fromarray(pix);d=ImageDraw.Draw(im)
    for point,text,c in m.labels:
        px,py,pz=project(point)
        if 30<px<W-30 and 160<py<H-90:
            box=d.textbbox((px,py),text,font=font(24),anchor='mm');box=(box[0]-7,box[1]-4,box[2]+7,box[3]+4)
            d.rounded_rectangle(box,4,fill='#f7f1e4',outline='#b9b3a4');d.text((px,py),text,font=font(24),fill=c,anchor='mm')
    d.text((55,32),title,font=font(40),fill='#2c4846');d.text((55,96),extra,font=font(22),fill='#627671')
    d.text((55,H-88),'同一米制数据生成 · X东 / Y北 / Z上 · 一层 Z=0 / 二层 Z=3.60m · 房间编号对应清单',font=font(23),fill='#3b5552')
    d.text((55,H-47),'暖米：生活/交通　灰绿：后勤　浅棕：客房　绿：院巷　蓝：窗位　棕：门槛　紫：关键证据',font=font(21),fill='#64736b')
    # Orientation key is camera-aware, so rotated plates never silently change north.
    ox,oy=W-135,180
    for vec,label,col in [(np.array([1.,0,0]),'E','#a66d3a'),(np.array([0,1.,0]),'N','#456e69')]:
        vv=vec@basis;ex,ey=ox+vv[0]*68,oy-vv[1]*68;d.line([(ox,oy),(ex,ey)],fill=col,width=4);d.text((ex,ey),label,font=font(22),fill=col)
    im.save(path)
    return {'file':str(path.relative_to(R)).replace('\\','/'),'title':title,'azimuth_degrees':math.degrees(az),'elevation_degrees':math.degrees(el),'triangles':len(m.faces)}
def main():
    views=[]
    for lev,cn in [(0,'一层室内'),(1,'二层室内')]:
        m=build((lev,),False,True)
        for direction,az in [('SW',225),('SE',315),('NE',45),('NW',135)]:
            views.append(render(m,OUT/f'floor{lev}-{direction}.png',f'《规则之间》{cn} · {direction}俯瞰',az))
    for direction,az in [('SW',225),('NE',45)]:
        views.append(render(build((0,),True,True),OUT/f'site-{direction}.png',f'总场地与一层 · {direction}俯瞰',az,62))
    views.append(render(build((0,1),True,True,5.5),OUT/'exploded-SW.png','整体楼层关系 · 向上分解示意',225,47,'二层仅为展示额外抬升5.50m，实际楼层Z=3.60m；屋顶隐藏，禁止按展示间距建模。'))
    for direction,az in [('SW',225),('NE',45)]:
        views.append(render(build((0,1),False,False),OUT/f'envelope-{direction}.png',f'两层外壳与真实窗洞 · {direction}俯瞰',az,42,'真实层高与墙高；门窗洞按数据切分；屋顶和非玩法细饰隐藏，展示外壳与开口关系。'))
    (R/'view-manifest.json').write_text(json.dumps(views,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'views':len(views),'path':str(OUT)}))
if __name__=='__main__':main()

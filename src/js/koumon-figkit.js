/* =============================================================================
 楚漢の章 —— 人物の彫刻キット（頭部・手）
 寝殿造り3D探訪 src/app/tsurezure-figures.js（徒然草の人物）の §0〜§5 と組み立て補助を移したもの。
 形は SDF（符号付き距離関数）を CPU で多角形化して作る。顔の細部は canvas の顔テクスチャ。
 単位 m / +Y 上 / +Z が顔の正面。生成は重いので、多角形は GEO_CACHE に再利用する。
 依存: THREE (r128)
 公開: window.KM_FIGKIT = { buildHead, handMesh, HANDP, lin, Res, ... }
============================================================================= */
var KM_FIGKIT = (function () {
"use strict";
if (typeof THREE === "undefined") return null;
const sq=Math.sqrt,mx=Math.max,mn=Math.min,ab=Math.abs,PI=Math.PI;
function clamp(v,a,b){return v<a?a:v>b?b:v;}
function sstep(a,b,v){const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);}
function lerp(a,b,t){return a+(b-a)*t;}
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function makeNoise(seed){
  const rnd=mulberry32(seed);const P=new Uint16Array(512);const V=new Float32Array(256);
  const perm=[];for(let i=0;i<256;i++)perm.push(i);
  for(let i=255;i>0;i--){const j=(rnd()*(i+1))|0;const t=perm[i];perm[i]=perm[j];perm[j]=t;}
  for(let i=0;i<512;i++)P[i]=perm[i&255];for(let i=0;i<256;i++)V[i]=rnd()*2-1;
  return function(x,y,z){
    const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z);
    const xf=x-xi,yf=y-yi,zf=z-zi;
    const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf),w=zf*zf*(3-2*zf);
    const X=xi&255,Y=yi&255,Z=zi&255;
    const a=P[X]+Y,aa=P[a]+Z,ab_=P[a+1]+Z,b=P[X+1]+Y,ba=P[b]+Z,bb=P[b+1]+Z;
    const c000=V[P[aa]],c100=V[P[ba]],c010=V[P[ab_]],c110=V[P[bb]],c001=V[P[aa+1]],c101=V[P[ba+1]],c011=V[P[ab_+1]],c111=V[P[bb+1]];
    const x00=c000+(c100-c000)*u,x10=c010+(c110-c010)*u,x01=c001+(c101-c001)*u,x11=c011+(c111-c011)*u;
    const y0=x00+(x10-x00)*v,y1=x01+(x11-x01)*v;
    return y0+(y1-y0)*w;
  };
}
const N1=makeNoise(1301),N2=makeNoise(7717),N3=makeNoise(4242);
function fbm(x,y,z,oct){let s=0,a=.5,f=1;for(let i=0;i<oct;i++){s+=a*N1(x*f,y*f,z*f);f*=2.03;a*=.5;}return s;}
// colors: sRGB hex -> linear [r,g,b]
function lin(hex){const r=((hex>>16)&255)/255,g=((hex>>8)&255)/255,b=(hex&255)/255;const f=c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);return[f(r),f(g),f(b)];}
function mixc(a,b,t){return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}
function mulc(a,s){return[a[0]*s,a[1]*s,a[2]*s];}

// =====================================================================================
//  1. SDF sculpting kit  (each node: {f(x,y,z)->signed distance, bs:[cx,cy,cz,R] bounding sphere, k?:blend})
// =====================================================================================
function smin(a,b,k){if(k<=0)return a<b?a:b;const h=k-ab(a-b);return h>0?(a<b?a:b)-h*h*.25/k:(a<b?a:b);}
function smax(a,b,k){return -smin(-a,-b,k);}
function sSphere(c,r){const cx=c[0],cy=c[1],cz=c[2];return{f:(x,y,z)=>{const dx=x-cx,dy=y-cy,dz=z-cz;return sq(dx*dx+dy*dy+dz*dz)-r;},bs:[cx,cy,cz,r],pt:1,pp:[cx,cy,cz,r]};}
// rotation matrix (local->world), Rz*Ry*Rx, row-major 3x3
function rotM(rx,ry,rz){const cx=Math.cos(rx),sx=Math.sin(rx),cy=Math.cos(ry),sy=Math.sin(ry),cz=Math.cos(rz),sz=Math.sin(rz);
  return[cy*cz,cz*sx*sy-cx*sz,cx*cz*sy+sx*sz, cy*sz,cx*cz+sx*sy*sz,-cz*sx+cx*sy*sz, -sy,cy*sx,cx*cy];}
function mulM(A,B){const C=new Array(9);for(let i=0;i<3;i++)for(let j=0;j<3;j++){C[i*3+j]=A[i*3]*B[j]+A[i*3+1]*B[3+j]+A[i*3+2]*B[6+j];}return C;}
function apM(M,v){return[M[0]*v[0]+M[1]*v[1]+M[2]*v[2],M[3]*v[0]+M[4]*v[1]+M[5]*v[2],M[6]*v[0]+M[7]*v[1]+M[8]*v[2]];}
function add3(a,b){return[a[0]+b[0],a[1]+b[1],a[2]+b[2]];}
function sub3(a,b){return[a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
function scl3(a,s){return[a[0]*s,a[1]*s,a[2]*s];}
function len3(a){return sq(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]);}
function nrm3(a){const l=len3(a)||1;return[a[0]/l,a[1]/l,a[2]/l];}
function dot3(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function cross3(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function lerp3(a,b,t){return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}
// ellipsoid (IQ bound), optional rotation M (local->world)
function sEll(c,r,M){const cx=c[0],cy=c[1],cz=c[2],rx=r[0],ry=r[1],rz=r[2];
  const f=M?(x,y,z)=>{const px=x-cx,py=y-cy,pz=z-cz;
      const ax=(M[0]*px+M[3]*py+M[6]*pz)/rx,ay=(M[1]*px+M[4]*py+M[7]*pz)/ry,az=(M[2]*px+M[5]*py+M[8]*pz)/rz;
      const k0=sq(ax*ax+ay*ay+az*az),bx=ax/rx,by=ay/ry,bz=az/rz,k1=sq(bx*bx+by*by+bz*bz);return k1>1e-12?k0*(k0-1)/k1:-mn(rx,ry,rz);}
    :(x,y,z)=>{const ax=(x-cx)/rx,ay=(y-cy)/ry,az=(z-cz)/rz;
      const k0=sq(ax*ax+ay*ay+az*az),bx=ax/rx,by=ay/ry,bz=az/rz,k1=sq(bx*bx+by*by+bz*bz);return k1>1e-12?k0*(k0-1)/k1:-mn(rx,ry,rz);};
  return{f,bs:[cx,cy,cz,mx(rx,ry,rz)],pt:M?3:2,pp:M?[cx,cy,cz,rx,ry,rz,M[0],M[1],M[2],M[3],M[4],M[5],M[6],M[7],M[8]]:[cx,cy,cz,rx,ry,rz]};}
// round cone a(r1) -> b(r2)
function sCone(a,b,r1,r2){
  const ax=a[0],ay=a[1],az=a[2];const bax=b[0]-ax,bay=b[1]-ay,baz=b[2]-az;
  const l2=mx(bax*bax+bay*bay+baz*baz,1e-12),rr=r1-r2,a2=l2-rr*rr,il2=1/l2;
  const f=(x,y,z)=>{const pax=x-ax,pay=y-ay,paz=z-az;
    const yy=pax*bax+pay*bay+paz*baz,z_=yy-l2;
    const qx=pax*l2-bax*yy,qy=pay*l2-bay*yy,qz=paz*l2-baz*yy;const x2=qx*qx+qy*qy+qz*qz;
    const y2=yy*yy*l2,z2=z_*z_*l2;const k=(rr>0?1:rr<0?-1:0)*rr*rr*x2;
    if((z_>0?1:z_<0?-1:0)*a2*z2>k)return sq(x2+z2)*il2-r2;
    if((yy>0?1:yy<0?-1:0)*a2*y2<k)return sq(x2+y2)*il2-r1;
    return(sq(x2*a2*il2)+yy*rr)*il2-r1;};
  return{f,bs:[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,sq(l2)/2+mx(r1,r2)],pt:5,pp:[ax,ay,az,bax,bay,baz,l2,rr,a2,il2,r1,r2]};}
function sCap(a,b,r){const ax=a[0],ay=a[1],az=a[2],bx=b[0]-ax,by=b[1]-ay,bz=b[2]-az;const l2=mx(bx*bx+by*by+bz*bz,1e-12);
  return{f:(x,y,z)=>{const px=x-ax,py=y-ay,pz=z-az;let t=(px*bx+py*by+pz*bz)/l2;t=t<0?0:t>1?1:t;const dx=px-bx*t,dy=py-by*t,dz=pz-bz*t;return sq(dx*dx+dy*dy+dz*dz)-r;},
    bs:[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,sq(l2)/2+r],pt:4,pp:[ax,ay,az,bx,by,bz,l2,r]};}
// rounded box: center, half extents, M local->world, rounding radius
function sBox(c,h,M,rr){const cx=c[0],cy=c[1],cz=c[2],hx=h[0]-rr,hy=h[1]-rr,hz=h[2]-rr;
  const f=(x,y,z)=>{let px=x-cx,py=y-cy,pz=z-cz;
    if(M){const lx=M[0]*px+M[3]*py+M[6]*pz,ly=M[1]*px+M[4]*py+M[7]*pz,lz=M[2]*px+M[5]*py+M[8]*pz;px=lx;py=ly;pz=lz;}
    const qx=ab(px)-hx,qy=ab(py)-hy,qz=ab(pz)-hz;const ox=qx>0?qx:0,oy=qy>0?qy:0,oz=qz>0?qz:0;
    return sq(ox*ox+oy*oy+oz*oz)+mn(mx(qx,qy,qz),0)-rr;};
  return{f,bs:[cx,cy,cz,sq(h[0]*h[0]+h[1]*h[1]+h[2]*h[2])]};}
// polyline tube (round cones), smooth-joined with k
function sTube(pts,rad,k){const parts=[];for(let i=0;i<pts.length-1;i++)parts.push(sCone(pts[i],pts[i+1],rad[i],rad[i+1]));return U(parts,k||0);}
// ribbon: polyline pts with per-point outward normals nr; rounded-rectangle cross-section (halfW across, halfT along normal)
function sRibbon(pts,nr,halfW,halfT,rr){const segs=[];
  for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1];const t=sub3(b,a);const L=len3(t);const tt=scl3(t,1/L);
    let n=nrm3(lerp3(nr[i],nr[i+1],.5));n=nrm3(sub3(n,scl3(tt,dot3(n,tt))));const w=cross3(tt,n);
    const hw=Array.isArray(halfW)?[halfW[i],halfW[i+1]]:[halfW,halfW];segs.push({a,tt,n,w,L,hw});}
  const f=(x,y,z)=>{let best=1e9;
    for(const g of segs){const px=x-g.a[0],py=y-g.a[1],pz=z-g.a[2];const u=px*g.tt[0]+py*g.tt[1]+pz*g.tt[2];
      const uc=u<0?u:u>g.L?u-g.L:0;const fr=clamp(u/g.L,0,1);const hw=g.hw[0]+(g.hw[1]-g.hw[0])*fr;
      const qa=ab(px*g.w[0]+py*g.w[1]+pz*g.w[2])-(hw-rr),qn=ab(px*g.n[0]+py*g.n[1]+pz*g.n[2])-(halfT-rr),qu=ab(uc);
      const ox=qa>0?qa:0,oy=qn>0?qn:0;const d=sq(ox*ox+oy*oy+qu*qu)+mn(mx(qa,qn),0)-rr;if(d<best)best=d;}
    return best;};
  const bb=encl(pts.map(p=>({bs:[p[0],p[1],p[2],0]})));bb[3]+=(Array.isArray(halfW)?mx(...halfW):halfW)+halfT;return{f,bs:bb};}
function encl(list){let x0=1e9,y0=1e9,z0=1e9,x1=-1e9,y1=-1e9,z1=-1e9;
  for(const c of list){const b=c.bs;x0=mn(x0,b[0]-b[3]);y0=mn(y0,b[1]-b[3]);z0=mn(z0,b[2]-b[3]);x1=mx(x1,b[0]+b[3]);y1=mx(y1,b[1]+b[3]);z1=mx(z1,b[2]+b[3]);}
  const cx=(x0+x1)/2,cy=(y0+y1)/2,cz=(z0+z1)/2;let R=0;
  for(const c of list){const b=c.bs;const d=sq((b[0]-cx)**2+(b[1]-cy)**2+(b[2]-cz)**2)+b[3];if(d>R)R=d;}
  return[cx,cy,cz,R];}
// monomorphic primitive evaluator (avoids megamorphic closure calls in hot loops)
function primEval(t,q,o,x,y,z){
  if(t===1){const dx=x-q[o],dy=y-q[o+1],dz=z-q[o+2];return sq(dx*dx+dy*dy+dz*dz)-q[o+3];}
  if(t===2){const rx=q[o+3],ry=q[o+4],rz=q[o+5];const ax=(x-q[o])/rx,ay=(y-q[o+1])/ry,az=(z-q[o+2])/rz;
    const k0=sq(ax*ax+ay*ay+az*az),bx=ax/rx,by=ay/ry,bz=az/rz,k1=sq(bx*bx+by*by+bz*bz);return k1>1e-12?k0*(k0-1)/k1:-mn(rx,ry,rz);}
  if(t===3){const px=x-q[o],py=y-q[o+1],pz=z-q[o+2],rx=q[o+3],ry=q[o+4],rz=q[o+5];
    const ax=(q[o+6]*px+q[o+9]*py+q[o+12]*pz)/rx,ay=(q[o+7]*px+q[o+10]*py+q[o+13]*pz)/ry,az=(q[o+8]*px+q[o+11]*py+q[o+14]*pz)/rz;
    const k0=sq(ax*ax+ay*ay+az*az),bx=ax/rx,by=ay/ry,bz=az/rz,k1=sq(bx*bx+by*by+bz*bz);return k1>1e-12?k0*(k0-1)/k1:-mn(rx,ry,rz);}
  if(t===4){const px=x-q[o],py=y-q[o+1],pz=z-q[o+2],bx=q[o+3],by=q[o+4],bz=q[o+5];let tt=(px*bx+py*by+pz*bz)/q[o+6];tt=tt<0?0:tt>1?1:tt;
    const dx=px-bx*tt,dy=py-by*tt,dz=pz-bz*tt;return sq(dx*dx+dy*dy+dz*dz)-q[o+7];}
  // t===5 round cone
  const pax=x-q[o],pay=y-q[o+1],paz=z-q[o+2],bax=q[o+3],bay=q[o+4],baz=q[o+5],l2=q[o+6],rr=q[o+7],a2=q[o+8],il2=q[o+9],r1=q[o+10],r2=q[o+11];
  const yy=pax*bax+pay*bay+paz*baz,z_=yy-l2;const qx=pax*l2-bax*yy,qy=pay*l2-bay*yy,qz=paz*l2-baz*yy;const x2=qx*qx+qy*qy+qz*qz;
  const y2=yy*yy*l2,z2=z_*z_*l2;const k=(rr>0?1:rr<0?-1:0)*rr*rr*x2;
  if((z_>0?1:z_<0?-1:0)*a2*z2>k)return sq(x2+z2)*il2-r2;
  if((yy>0?1:yy<0?-1:0)*a2*y2<k)return sq(x2+y2)*il2-r1;
  return(sq(x2*a2*il2)+yy*rr)*il2-r1;}
function packPrims(list){const n=list.length;const PT=new Int8Array(n),PO=new Int32Array(n);let tot=0;for(const c of list)tot+=c.pt?c.pp.length:0;const PQ=new Float64Array(mx(tot,1));let o=0;
  for(let i=0;i<n;i++){const c=list[i];if(c.pt){PT[i]=c.pt;PO[i]=o;PQ.set(c.pp,o);o+=c.pp.length;}else PT[i]=0;}return{PT,PO,PQ};}
// smooth union (child.k overrides k)
function U(list,k){list=list.filter(Boolean);const n=list.length;const K=new Float64Array(n),B=new Float64Array(n*4),F=[];
  for(let i=0;i<n;i++){K[i]=list[i].k!=null?list[i].k:(k||0);for(let j=0;j<4;j++)B[i*4+j]=list[i].bs[j];F.push(list[i].f);}
  const f=(x,y,z)=>{let d=1e9;
    for(let i=0;i<n;i++){const i4=i*4,dx=x-B[i4],dy=y-B[i4+1],dz=z-B[i4+2],kk=K[i];
      const lim=d+kk+B[i4+3];if(lim>0&&dx*dx+dy*dy+dz*dz>lim*lim)continue;
      const di=F[i](x,y,z);
      if(kk<=0){if(di<d)d=di;}else{const h=kk-ab(d-di);d=h>0?(d<di?d:di)-h*h*.25/kk:(d<di?d:di);}}
    return d;};
  return{f,bs:n?encl(list):[0,0,0,0]};}
// smooth subtraction
function S(base,cutters,k){cutters=cutters.filter(Boolean);const n=cutters.length;const K=cutters.map(c=>c.k!=null?c.k:(k||0));const bf=base.f;
  const f=(x,y,z)=>{let d=bf(x,y,z);
    for(let i=0;i<n;i++){const c=cutters[i],b=c.bs,kk=K[i];const dx=x-b[0],dy=y-b[1],dz=z-b[2];
      const lim=-d+kk+b[3];if(lim>0&&dx*dx+dy*dy+dz*dz>lim*lim)continue;
      d=smax(d,-c.f(x,y,z),kk);}
    return d;};
  return{f,bs:base.bs};}
function Isect(a,b,k){const fa=a.f,fb=b.f;return{f:(x,y,z)=>smax(fa(x,y,z),fb(x,y,z),k||0),bs:a.bs};}
// displacement (outward = positive disp)
function D(child,disp,amp){const cf=child.f;const lim=amp*1.6+.004;
  return{f:(x,y,z)=>{const d=cf(x,y,z);if(d>lim||d<-lim)return d;return d-disp(x,y,z,d)*sstep(lim,lim*.6,ab(d));},bs:[child.bs[0],child.bs[1],child.bs[2],child.bs[3]+amp]};}
// rigid transform: node defined in local frame; M local->world rotation, t world translation
function T(child,M,t){const cf=child.f;const tx=t[0],ty=t[1],tz=t[2];
  const f=(x,y,z)=>{const px=x-tx,py=y-ty,pz=z-tz;return cf(M[0]*px+M[3]*py+M[6]*pz,M[1]*px+M[4]*py+M[7]*pz,M[2]*px+M[5]*py+M[8]*pz);};
  const b=child.bs;const w=apM(M,b);return{f,bs:[w[0]+tx,w[1]+ty,w[2]+tz,b[3]],k:child.k};}
function K(node,k){node.k=k;return node;}
function mirrorX(node){const cf=node.f;const b=node.bs;return{f:(x,y,z)=>cf(-x,y,z),bs:[-b[0],b[1],b[2],b[3]],k:node.k};}

// =====================================================================================
//  2. polygonizer: hierarchical narrow band + surface nets (+ newton projection, gradient normals)
// =====================================================================================
const EDG=[[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
// edges as (axis, corner offsets) for neighbour tracking
const EDGA=[];for(let ax=0;ax<3;ax++)for(let o1=0;o1<2;o1++)for(let o2=0;o2<2;o2++)EDGA.push([ax,o1,o2]);
let POLY_STATS={evals:0};
function polygonize(F0,bmin,bmax,h,opt){opt=opt||{};
  let evals=0;const F=(x,y,z)=>{evals++;return F0(x,y,z);};
  const Lip=opt.lip||1.2,L=opt.levels!=null?opt.levels:3,ST=1<<L;
  const ncx=Math.ceil((bmax[0]-bmin[0])/h/ST),ncy=Math.ceil((bmax[1]-bmin[1])/h/ST),ncz=Math.ceil((bmax[2]-bmin[2])/h/ST);
  const NX=ncx*ST+1,NY=ncy*ST+1,NZ=ncz*ST+1;
  const ox=(bmin[0]+bmax[0])/2-(NX-1)*h/2,oy=(bmin[1]+bmax[1])/2-(NY-1)*h/2,oz=(bmin[2]+bmax[2])/2-(NZ-1)*h/2;
  const NXY=NX*NY;const val=new Float32Array(NX*NY*NZ).fill(NaN);
  const ev=(i,j,k)=>{const id=i+NX*j+NXY*k;let v=val[id];if(v!==v){v=F(ox+i*h,oy+j*h,oz+k*h);val[id]=v;}return v;};
  let cells=[];
  // a cell of size s contains surface only if some corner is within half-diagonal (exact SDF); Lip pads for inexact fields
  const testCell=(i,j,k,s,fin)=>{const thr=s*h*.8660254*Lip;let neg=false,pos=false,m=1e9;
    for(let c=0;c<8;c++){const v=ev(i+(c&1?s:0),j+(c&2?s:0),k+(c&4?s:0));if(v<0)neg=true;else pos=true;const a=v<0?-v:v;if(a<m)m=a;}
    return fin?(neg&&pos):((neg&&pos)||m<thr);};
  for(let k=0;k<NZ-1;k+=ST)for(let j=0;j<NY-1;j+=ST)for(let i=0;i<NX-1;i+=ST)if(testCell(i,j,k,ST,false))cells.push(i,j,k);
  const stopS=opt.seedS||2;
  for(let s=ST>>1;s>=stopS;s>>=1){const nc=[];
    for(let c=0;c<cells.length;c+=3){const i0=cells[c],j0=cells[c+1],k0=cells[c+2];
      for(let q=0;q<8;q++){const i=i0+(q&1?s:0),j=j0+(q&2?s:0),k=k0+(q&4?s:0);if(testCell(i,j,k,s,false))nc.push(i,j,k);}}
    cells=nc;}
  const CX=NX-1,CY=NY-1,CZ=NZ-1,CXY=CX*CY;const vid=new Int32Array(CX*CY*CZ).fill(-1);const vis=new Uint8Array(CX*CY*CZ);
  const P=[],VC=[],VF=[];let nv=0;const cv=new Float64Array(8);const queue=[];
  const makeVert=(i,j,k)=>{const cid=i+CX*j+CXY*k;if(vid[cid]>=0)return vid[cid];
    let neg=false,pos=false;
    for(let c=0;c<8;c++){const v=ev(i+(c&1),j+(c>>1&1),k+(c>>2&1));cv[c]=v;if(v<0)neg=true;else pos=true;}
    if(!(neg&&pos))return -1;
    let sx=0,sy=0,sz=0,cnt=0;
    for(let e=0;e<12;e++){const a=EDG[e][0],b=EDG[e][1];const va=cv[a],vb=cv[b];if((va<0)===(vb<0))continue;
      const t=va/(va-vb);sx+=(a&1)+((b&1)-(a&1))*t;sy+=(a>>1&1)+((b>>1&1)-(a>>1&1))*t;sz+=(a>>2&1)+((b>>2&1)-(a>>2&1))*t;cnt++;}
    P.push(ox+(i+sx/cnt)*h,oy+(j+sy/cnt)*h,oz+(k+sz/cnt)*h);VC.push(i,j,k);VF.push(sx/cnt,sy/cnt,sz/cnt);vid[cid]=nv;return nv++;};
  const visit=(i,j,k)=>{if(i<0||j<0||k<0||i>=CX||j>=CY||k>=CZ)return;const cid=i+CX*j+CXY*k;if(vis[cid])return;vis[cid]=1;
    if(makeVert(i,j,k)>=0)queue.push(i,j,k);};
  // seeds: along every edge (of active stopS-cells) whose end signs differ, locate the fine sign change and visit its 4 cells
  const S2=stopS;
  for(let c=0;c<cells.length;c+=3){const i0=cells[c],j0=cells[c+1],k0=cells[c+2];
    for(let e=0;e<12;e++){const ax=EDGA[e][0],o1=EDGA[e][1]*S2,o2=EDGA[e][2]*S2;
      let pi=i0,pj=j0,pk=k0;if(ax===0){pj+=o1;pk+=o2;}else if(ax===1){pi+=o1;pk+=o2;}else{pi+=o1;pj+=o2;}
      let prev=ev(pi,pj,pk);
      for(let t=1;t<=S2;t++){const qi=pi+(ax===0?t:0),qj=pj+(ax===1?t:0),qk=pk+(ax===2?t:0);const cur=ev(qi,qj,qk);
        if((prev<0)!==(cur<0)){const si=ax===0?qi-1:qi,sj=ax===1?qj-1:qj,sk=ax===2?qk-1:qk;
          for(let p1=-1;p1<=0;p1++)for(let p2=-1;p2<=0;p2++){if(ax===0)visit(si,sj+p1,sk+p2);else if(ax===1)visit(si+p1,sj,sk+p2);else visit(si+p1,sj+p2,sk);}
          break;}
        prev=cur;}}}
  // flood along sign-change edges
  const vcell=[];
  for(let qi=0;qi<queue.length;qi+=3){const i=queue[qi],j=queue[qi+1],k=queue[qi+2];vcell.push(i,j,k);
    for(let e=0;e<12;e++){const ax=EDGA[e][0],o1=EDGA[e][1],o2=EDGA[e][2];
      let a0,a1,b0,b1;// edge endpoints
      if(ax===0){a0=ev(i,j+o1,k+o2);a1=ev(i+1,j+o1,k+o2);}else if(ax===1){a0=ev(i+o1,j,k+o2);a1=ev(i+o1,j+1,k+o2);}else{a0=ev(i+o1,j+o2,k);a1=ev(i+o1,j+o2,k+1);}
      if((a0<0)===(a1<0))continue;
      for(let p1=-1;p1<=0;p1++)for(let p2=-1;p2<=0;p2++){
        if(ax===0)visit(i,j+o1+p1,k+o2+p2);else if(ax===1)visit(i+o1+p1,j,k+o2+p2);else visit(i+o1+p1,j+o2+p2,k);}}}
  const idx=[];
  const quad=(a,b,c,d,flip)=>{if(a<0||b<0||c<0||d<0)return;
    if(flip){const t=b;b=d;d=t;}
    const d1=(P[a*3]-P[c*3])**2+(P[a*3+1]-P[c*3+1])**2+(P[a*3+2]-P[c*3+2])**2,d2=(P[b*3]-P[d*3])**2+(P[b*3+1]-P[d*3+1])**2+(P[b*3+2]-P[d*3+2])**2;
    if(d1<=d2)idx.push(a,b,c,a,c,d);else idx.push(a,b,d,b,c,d);};
  const gv=(i,j,k)=>(i<0||j<0||k<0)?-1:vid[i+CX*j+CXY*k];
  for(let c=0;c<vcell.length;c+=3){const i=vcell[c],j=vcell[c+1],k=vcell[c+2];const v0=ev(i,j,k);
    if(j>0&&k>0){const v1=ev(i+1,j,k);if((v0<0)!==(v1<0))quad(gv(i,j,k),gv(i,j,k-1),gv(i,j-1,k-1),gv(i,j-1,k),v0<0);}
    if(i>0&&k>0){const v1=ev(i,j+1,k);if((v0<0)!==(v1<0))quad(gv(i,j,k),gv(i-1,j,k),gv(i-1,j,k-1),gv(i,j,k-1),v0<0);}
    if(i>0&&j>0){const v1=ev(i,j,k+1);if((v0<0)!==(v1<0))quad(gv(i,j,k),gv(i,j-1,k),gv(i-1,j-1,k),gv(i-1,j,k),v0<0);}}
  const n=P.length/3;const pos=new Float32Array(P);const nrm=new Float32Array(n*3);const e=h*.3,refine=opt.refine!=null?opt.refine:0;
  const nmode=opt.normals||"grid",meshN=nmode==="mesh"||nmode==="grid";
  if(nmode==="grid"){// central differences on the grid, trilinear at the vertex
    const gr=new Float64Array(24);const ci=(a,lo,hi)=>a<lo?lo:a>hi?hi:a;
    for(let v=0;v<n;v++){const i=VC[v*3],j=VC[v*3+1],k=VC[v*3+2],fx=VF[v*3],fy=VF[v*3+1],fz=VF[v*3+2];
      for(let c=0;c<8;c++){const a=i+(c&1),b=j+(c>>1&1),d=k+(c>>2&1);
        gr[c*3]=ev(ci(a+1,0,NX-1),b,d)-ev(ci(a-1,0,NX-1),b,d);gr[c*3+1]=ev(a,ci(b+1,0,NY-1),d)-ev(a,ci(b-1,0,NY-1),d);gr[c*3+2]=ev(a,b,ci(d+1,0,NZ-1))-ev(a,b,ci(d-1,0,NZ-1));}
      let gx=0,gy=0,gz=0;for(let c=0;c<8;c++){const w=(c&1?fx:1-fx)*(c>>1&1?fy:1-fy)*(c>>2&1?fz:1-fz);gx+=w*gr[c*3];gy+=w*gr[c*3+1];gz+=w*gr[c*3+2];}
      const l=sq(gx*gx+gy*gy+gz*gz)||1;nrm[v*3]=gx/l;nrm[v*3+1]=gy/l;nrm[v*3+2]=gz/l;}}
  for(let v=0;v<n&&(refine>0||nmode==="grad");v++){let x=pos[v*3],y=pos[v*3+1],z=pos[v*3+2];const x0=x,y0=y,z0=z;let gx=0,gy=1,gz=0;
    for(let it=0;it<=refine;it++){if(meshN&&it===refine)break;
      const a=F(x+e,y-e,z-e),b=F(x-e,y-e,z+e),c=F(x-e,y+e,z-e),d=F(x+e,y+e,z+e);
      gx=(a-b-c+d)/(4*e);gy=(-a-b+c+d)/(4*e);gz=(-a+b-c+d)/(4*e);const g2=gx*gx+gy*gy+gz*gz||1e-12;
      if(it===refine){const gl=sq(g2);gx/=gl;gy/=gl;gz/=gl;break;}
      const dv=(a+b+c+d)*.25/g2;x-=gx*dv;y-=gy*dv;z-=gz*dv;
      const ddx=x-x0,ddy=y-y0,ddz=z-z0,dl=sq(ddx*ddx+ddy*ddy+ddz*ddz);if(dl>h*.6){const s=h*.6/dl;x=x0+ddx*s;y=y0+ddy*s;z=z0+ddz*s;}}
    pos[v*3]=x;pos[v*3+1]=y;pos[v*3+2]=z;if(nmode==="grad"){nrm[v*3]=gx;nrm[v*3+1]=gy;nrm[v*3+2]=gz;}}
  if(nmode==="mesh"){nrm.fill(0);for(let i=0;i<idx.length;i+=3){const a=idx[i]*3,b=idx[i+1]*3,c=idx[i+2]*3;
      const ux=pos[b]-pos[a],uy=pos[b+1]-pos[a+1],uz=pos[b+2]-pos[a+2],vx=pos[c]-pos[a],vy=pos[c+1]-pos[a+1],vz=pos[c+2]-pos[a+2];
      const cx=uy*vz-uz*vy,cy=uz*vx-ux*vz,cz=ux*vy-uy*vx;
      nrm[a]+=cx;nrm[a+1]+=cy;nrm[a+2]+=cz;nrm[b]+=cx;nrm[b+1]+=cy;nrm[b+2]+=cz;nrm[c]+=cx;nrm[c+1]+=cy;nrm[c+2]+=cz;}
    for(let v=0;v<n;v++){const l=sq(nrm[v*3]**2+nrm[v*3+1]**2+nrm[v*3+2]**2)||1;nrm[v*3]/=l;nrm[v*3+1]/=l;nrm[v*3+2]/=l;}}
  POLY_STATS.evals+=evals;
  return{pos,nrm,idx:n>65535?new Uint32Array(idx):new Uint16Array(idx),n,evals};
}
// ambient occlusion from an SDF (G = combined scene), per vertex
function bakeAO(poly,G,step,cnt,str){const n=poly.n,p=poly.pos,q=poly.nrm,ao=new Float32Array(n);
  for(let v=0;v<n;v++){const x=p[v*3],y=p[v*3+1],z=p[v*3+2],nx=q[v*3],ny=q[v*3+1],nz=q[v*3+2];let occ=0,w=1,ws=0;
    for(let i=1;i<=cnt;i++){const d=step*i;const s=G(x+nx*d,y+ny*d,z+nz*d);occ+=w*mx(0,d-s)/d;ws+=w;w*=.7;}
    ao[v]=clamp(1-str*occ/ws,0,1);}
  return ao;}
// per-vertex paint: fn(x,y,z,nx,ny,nz,i) -> [r,g,b] linear
function paint(poly,fn,ao,aoMin){const n=poly.n,p=poly.pos,q=poly.nrm,col=new Float32Array(n*3);aoMin=aoMin==null?0:aoMin;
  for(let v=0;v<n;v++){const c=fn(p[v*3],p[v*3+1],p[v*3+2],q[v*3],q[v*3+1],q[v*3+2],v);const a=ao?aoMin+(1-aoMin)*ao[v]:1;
    col[v*3]=c[0]*a;col[v*3+1]=c[1]*a;col[v*3+2]=c[2]*a;}
  poly.col=col;return col;}
function toGeom(poly){const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.BufferAttribute(poly.pos,3));g.setAttribute("normal",new THREE.BufferAttribute(poly.nrm,3));
  if(poly.col)g.setAttribute("color",new THREE.BufferAttribute(poly.col,3));
  if(poly.uv)g.setAttribute("uv",new THREE.BufferAttribute(poly.uv,2));
  g.setIndex(new THREE.BufferAttribute(poly.idx,1));g.computeBoundingSphere();return g;}

// =====================================================================================
//  3. resource tracking (per figure) & materials
// =====================================================================================
function Res(){const L=[];return{add(o){L.push(o);return o;},dispose(){for(const o of L){try{o.dispose();}catch(e){}}L.length=0;}};}
function canvasTex(R,w,h,draw,opts){const c=document.createElement("canvas");c.width=w;c.height=h;const g=c.getContext("2d");draw(g,w,h);
  const t=new THREE.CanvasTexture(c);t.encoding=opts&&opts.linear?THREE.LinearEncoding:THREE.sRGBEncoding;
  t.wrapS=t.wrapT=opts&&opts.clamp?THREE.ClampToEdgeWrapping:THREE.RepeatWrapping;t.anisotropy=4;t.needsUpdate=true;R.add(t);return t;}
function skinMat(R,o){o=o||{};const m=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:o.rough!=null?o.rough:.62,metalness:0});R.add(m);return m;}
function eyeTexture(R,iris,o){o=o||{};return canvasTex(R,256,256,(g,w,h)=>{
  // polar layout: canvas y = angle from gaze axis (top=center of iris), x = azimuth
  // o.irisR / o.pupilR: angular radii (fractions of pi); o.sclera: [r,g,b] of the white; o.catchlight: painted highlights
  const IR=o.irisR||.163,PU=o.pupilR||.056,LIM=IR+.027,SC=o.sclera||[214,204,190];
  for(let y=0;y<h;y++){const a=y/h;let col;
    if(a<PU)col=[8,6,6];
    else if(a<IR){const t=(a-PU)/(IR-PU);const base=iris;col=[base[0]*(0.75+0.5*t),base[1]*(0.75+0.45*t),base[2]*(0.8+0.3*t)];if(t>.82){const k=(t-.82)/.18;col=mixc(col,[20,14,12],k*.85);}}
    else if(a<LIM){const t=(a-IR)/(LIM-IR);col=mixc(mixc([120,104,96],SC,.25),SC,t);}
    else{const t=(a-LIM)/(1-LIM);col=mixc(mixc(SC,[206,196,184],.25),[180,140,130],sstep(.0,.5,t));}
    g.fillStyle="rgb("+(col[0]|0)+","+(col[1]|0)+","+(col[2]|0)+")";g.fillRect(0,y,w,1);}
  // upper-lid shadow (azimuth 0.75 = up)
  const sg=g.createLinearGradient(0,0,w,0);sg.addColorStop(0,"rgba(40,25,20,0)");sg.addColorStop(.55,"rgba(40,25,20,0)");sg.addColorStop(.75,"rgba(40,25,20,.55)");sg.addColorStop(.95,"rgba(40,25,20,0)");sg.addColorStop(1,"rgba(40,25,20,0)");
  g.fillStyle=sg;g.fillRect(0,h*.10,w,h*.9);
  // iris fibres
  const rnd=mulberry32(99);g.globalAlpha=.25;
  for(let i=0;i<220;i++){const x=rnd()*w;g.strokeStyle=rnd()<.5?"rgba(30,18,10,1)":"rgba(150,105,60,1)";g.lineWidth=1+rnd()*1.5;g.beginPath();g.moveTo(x,h*PU);g.lineTo(x+(rnd()-.5)*4,h*IR*.98);g.stroke();}
  g.globalAlpha=.18;for(let i=0;i<60;i++){const x=rnd()*w;g.strokeStyle="rgba(170,60,50,1)";g.lineWidth=1;g.beginPath();g.moveTo(x,h*.98);g.lineTo(x+(rnd()-.5)*30,h*(LIM+.1+rnd()*.3));g.stroke();}
  g.globalAlpha=1;
  // 重瞳（項羽「亦重瞳子」）：一つの虹彩の中に、瞳をもう一つ描く
  if(o.double){const a0=PU*2.05,az0=.5,r=PU*.86,ymax=Math.ceil((a0+r+.01)*h);
    const cx=a0*Math.cos(2*PI*az0),cy=a0*Math.sin(2*PI*az0);
    for(let y=0;y<ymax;y++){const a=y/h;for(let x=0;x<w;x++){const az=x/w;const px=a*Math.cos(2*PI*az)-cx,py=a*Math.sin(2*PI*az)-cy;const d=Math.sqrt(px*px+py*py);
      if(d<r*1.15){const k=d<r?1:1-(d-r)/(r*.15);g.fillStyle="rgba(8,6,6,"+k.toFixed(3)+")";g.fillRect(x,y,1,1);}}}}
  // painted catchlights (upper one at azimuth .75 = up, a small one below): keeps the eyes alive in any light
  if(o.catchlight){const spot=(az,a,rx,ry,al)=>{g.save();g.translate(w*az,h*a);g.scale(rx*w,ry*h);const gr=g.createRadialGradient(0,0,0,0,0,1);
      gr.addColorStop(0,"rgba(255,255,255,"+al+")");gr.addColorStop(.6,"rgba(255,255,255,"+al*.8+")");gr.addColorStop(1,"rgba(255,255,255,0)");
      g.fillStyle=gr;g.beginPath();g.arc(0,0,1,0,7);g.fill();g.restore();};
    spot(.80,IR*.52,.07,.030,.95);spot(.30,IR*.62,.04,.016,.55);}
  },{clamp:true});}

// =====================================================================================
//  4. HEAD  (head-local frame: origin = midpoint between ear canals, +Z face forward, +Y up; meters)
// =====================================================================================
// P: {seed, eyeOpenU/L, eyeTilt, gazePitch (>0 looks down), gazeYaw (>0 toward the figure's left), smile, age, thin, ...}
function gauss(d,w){const t=d/w;return t*t>16?0:Math.exp(-t*t);}
function dPoly2(u,v,pts){let best=1e9,bt=0,bs=0,acc=0,tot=0;for(let i=0;i<pts.length-1;i++)tot+=Math.hypot(pts[i+1][0]-pts[i][0],pts[i+1][1]-pts[i][1]);
  for(let i=0;i<pts.length-1;i++){const ax=pts[i][0],ay=pts[i][1],bx=pts[i+1][0]-ax,by=pts[i+1][1]-ay,l2=bx*bx+by*by,L=sq(l2);
    let t=((u-ax)*bx+(v-ay)*by)/l2;t=t<0?0:t>1?1:t;const dx=u-ax-bx*t,dy=v-ay-by*t,d=sq(dx*dx+dy*dy);
    if(d<best){best=d;bt=(acc+t*L)/tot;bs=bx*dy-by*dx>0?1:-1;}acc+=L;}
  return[best,bt,bs];}
// shared planar (x,y) facial curves — used by geometry relief AND face textures
function faceCurves(P){
  const smile=P.smile||0,MW=P.mouthW||.0235;
  const ys=x=>-.0481+(.0006+smile*.0016)*(x/MW)*(x/MW);
  const yU=x=>{const t=clamp(x/MW,-1,1);return ys(x)+(P.lipU||.0046)*Math.pow(mx(0,1-t*t),.45)-.0008*gauss(x,.0030)+.0003*gauss(ab(x)-.0042,.0022);};
  const yL=x=>{const t=clamp(x/(MW*.92),-1,1);return ys(x)-(P.lipL||.0062)*Math.pow(mx(0,1-t*t),.6);};
  const W=P.eyeW||.0142,aU=P.eyeOpenU!=null?P.eyeOpenU:.0046,aL=P.eyeOpenL!=null?P.eyeOpenL:.0029,tilt=P.eyeTilt!=null?P.eyeTilt:.10,yc=P.eyeApY||0;
  const EX=.0315,EY=.0245;
  // the lids follow the vertical gaze (upper lid fully, lower lid by half; the corners stay put): with fixed lids a
  // downward look rolls the iris behind the lower lid and leaves a blank white eye (gazePitch > 0 looks down)
  const sDn=(P.eyeR||.0118)*Math.sin(clamp(P.gazePitch||0,-.7,.7))*.9;
  // eye s (-1 right eye at -x, +1 left eye): returns [u (toward temple), yUpper, yLower] at planar x
  const eye=(s,x)=>{const u=(x-s*EX)*s,t=clamp(u/W,-1,1),q=mx(0,1-t*t),lf=Math.sqrt(q);
    const lo=EY+yc-aL*Math.pow(q,.7)*(1+.1*t)+tilt*.55*u-sDn*.5*lf;
    return[u,mx(EY+yc+aU*Math.pow(q,.55)*(1-.22*t)+tilt*u-sDn*lf,lo+.0008*q),lo];};
  const nlf=[[.0195,-.0195],[.0262,-.0350],[.0300,-.0500],[.0335,-.0640]];
  const alar=[[.0098,-.0142],[.0172,-.0150],[.0216,-.0195],[.0210,-.0255],[.0172,-.0290]];
  const brow=t=>{// t 0..1 inner->outer ; returns [x(abs), y]
    const x=.0105+.047*t;return[x,.0425+(P.browY||0)+.0062*Math.sin(clamp(t,0,1)*PI*.85)-(P.browDrop||.010)*t*t];};
  return{ys,yU,yL,MW,eye,W,EX,EY,nlf,alar,brow};
}
// geometric relief: only features >= ~4mm wide (finer detail lives in the face textures)
function faceRelief(P,C){
  const ag=clamp(((P.age!=null?P.age:50)-25)/45,0,1.2),MW=C.MW,kidK=1-.85*(P.kid||0);
  return(x,y,z)=>{const ax=ab(x);let d=-(P.thin||0)*(.0025*gauss(ax-.050,.012)*gauss(y+.036,.016)+.0018*gauss(ax-.068,.010)*gauss(y-.042,.014))*sstep(-.03,.0,z);
    if(z<.045)return d;
    const zw=sstep(.052,.074,z);
    if(y<-.026&&y>-.080&&ax<.05&&zw>0){
      const s=C.ys(x),a=C.yU(x),b=C.yL(x);const ef=sstep(MW+.0010,MW-.0045,ax)*zw;
      if(v_in(y,s-.0005,a+.002)){const t=clamp((y-s)/(a-s),0,1);d+=ef*(P.lipUvol||.0017)*Math.pow(Math.sin(PI*clamp(t*.8+.12,0,1)),.8)*sstep(a+.0022,a-.0006,y);}
      if(v_in(y,b-.002,s+.0005)){const t=clamp((s-y)/(s-b),0,1);d+=ef*(P.lipLvol||.0023)*Math.pow(Math.sin(PI*clamp(t*.75+.15,0,1)),.7)*sstep(b-.0022,b+.0006,y);}
      d-=.0009*gauss(y-s,.0011)*sstep(MW+.003,MW-.002,ax)*zw;
      d-=.0010*gauss(ax-MW-.0006,.0026)*gauss(y-s,.0030)*zw;
      if(y>a-.001&&y<-.0300){const vf=sstep(-.0300,-.0335,y)*sstep(a-.0004,a+.0020,y)*zw;d-=.0005*gauss(x,.0022)*vf;d+=.0003*gauss(ax-.0042,.0017)*vf;}
      d-=(.0009+.0007*ag)*gauss(y-(b-.0092),.0028)*gauss(x,.0125)*zw;
      if(ag>0){const q=dPoly2(ax,y,[[MW+.0008,s-.0015],[MW+.0035,-.067]]);d-=.0007*ag*gauss(q[0],.0022)*(1-q[1]*.6)*zw;}}
    if(y<-.010&&y>-.072&&ax>.008&&ax<.05&&zw>0){
      const q=dPoly2(ax,y,C.nlf);const fade=(1-sstep(.75,1,q[1]))*sstep(0,.1,q[1])*zw*sstep(.050,.040,ax)*sstep(-.072,-.064,y);
      d-=(.0006+.0010*ag)*kidK*gauss(q[0],.0021+.0004*ag)*fade;
      if(q[2]<0)d+=(.0004+.0008*ag)*kidK*gauss(q[0]-.0040,.0038)*fade;
      const r=dPoly2(ax,y,C.alar);d-=.0008*gauss(r[0],.0016)*zw*sstep(.006,.0105,ax)*sstep(-.010,-.013,y);}
    for(const s of[-1,1]){const e=C.eye(s,x);const u=e[0];if(ab(u)<.02&&y>.0&&y<.021&&zw>0){
      d-=(.0003+.0005*ag)*kidK*gauss(y-(e[2]-.0050-.0006*u/.014),.0019)*sstep(.016,.006,ab(u))*zw*sstep(.0,.004,y);
      d-=.0006*ag*gauss(y-(C.EY-.0128+.0035*(u/.014)*(u/.014)),.0022)*sstep(.018,.004,ab(u+.002))*zw*sstep(.0,.004,y)*sstep(.021,.016,y);}}
    return d;};
}
function v_in(v,a,b){return v>a&&v<b;}
// child face: the part below the eyes is compressed vertically (shorter mid/lower face, smaller chin, shorter neck).
// W(y) maps a warped (actual) head-local y back to the canonical face position; C1-smooth around y0.
function kidWarpFn(P){const k=P.kidWarp,y0=P.kidWarpY!=null?P.kidWarpY:.012,b=.02;if(!k||k>=1)return null;const kI=1/k-1;
  return y=>{const d=y0-y;if(d<=0)return y;const h=d>=b?d-b*.5:d*d/(2*b);return y-kI*h;};}
function headSDF(P){
  const er=P.eyeR||.0118;const eyes=[[-.0315,.0245,.0735],[.0315,.0245,.0735]];
  const C=faceCurves(P);
  // shape multipliers: cran [sx,sy,sz] & cranOff, jaw, nose, brow, cheekFat, neckR
  const cr=P.cran||[1,1,1],co=P.cranOff||[0,0,0],jw=P.jaw||1,ns=P.nose||1,bw=P.browK||1,nk=P.neckR||1;// browK: brow-ridge size (P.brow is the eyebrow colour)
  const cE=(c,r)=>sEll([c[0]*cr[0]+co[0],c[1]*cr[1]+co[1],c[2]*cr[2]+co[2]],[r[0]*cr[0],r[1]*cr[1],r[2]*cr[2]]);
  const JC=[0,-.020,.050],J=p=>[JC[0]+(p[0]-JC[0])*jw,JC[1]+(p[1]-JC[1])*jw,JC[2]+(p[2]-JC[2])*(1-(1-jw)*.6)];
  const NC=[0,-.010,.092],N=p=>[NC[0]+(p[0]-NC[0])*ns,NC[1]+(p[1]-NC[1])*ns,NC[2]+(p[2]-NC[2])*ns];
  const cran=U([K(cE([0,.044,-.010],[.0765,.084,.095]),0),K(cE([0,.040,.030],[.064,.070,.066]),.035),K(cE([0,.020,-.045],[.068,.064,.058]),.035)]);
  const fp=[K(sEll([0,.004,.050],[.066,.044,.048]),0),K(sEll(J([0,-.047,.040]),[.047*jw,.046*jw,.051]),.03),
    K(sEll(J([0,-.044,.071]),[.030*jw,.022*jw,.031]),.02),K(sEll(J([0,-.080,.081]),[.018*jw,.016*jw,.016*jw]),.018),
    K(sEll(J([0,-.047,.0915]),[.022*jw,.0105,.0085]),.010)];
  for(const s of[-1,1]){
    fp.push(K(sCap(J([s*.0485,-.060,.0]),J([s*.019,-.089,.071]),.0100*jw),.025));
    fp.push(K(sCap(J([s*.0485,-.060,.0]),[s*.058,-.015,-.008],.010),.02));
    fp.push(K(sEll([s*.047,.007,.064],[.023,.013,.019],rotM(0,s*.45,0)),.02));
    fp.push(K(sCap([s*.058,.006,.050],[s*.070,.004,.008],.008),.02));
    fp.push(K(sCap([s*.050,.040,.074],[0,.042,.093],.0085*bw),.02));
    fp.push(K(sEll([s*.034,.001,.078],[.017,.012,.011]),.016));
    fp.push(K(sEll([s*.029,-.027,.081],[.012,.015,.010]),.013));
    // child: round "apple" cheeks high under the eyes, and the buccal fat filling the side of the face
    // (no hollow under the cheekbone, no bulge beside the mouth)
    if(P.kid){const cf=P.cheekFat||1;fp.push(K(sEll([s*.038,-.008,.064],[.024*cf,.023*cf,.021*cf]),.03),K(sEll([s*.050,-.022,.036],[.016,.022,.028]),.035));}
    else if(P.cheekFat)fp.push(K(sEll([s*.036,-.022,.070],[.026*P.cheekFat,.026*P.cheekFat,.020*P.cheekFat]),.02));
  }
  let F=U([cran,K(U(fp),.025)]);
  F=S(F,[K(sEll([-.0185,.0255,.0885],[.0062,.0075,.0065]),.007),K(sEll([.0185,.0255,.0885],[.0062,.0075,.0065]),.007)]);
  const nose=U([K(sCone(N([0,.029,.0905]),N([0,-.007,.1035]),.0058*ns,.0070*ns),0),K(sEll(N([0,-.013,.0915]),[.0120*ns,.0130*ns,.0110*ns]),.008),
    K(sSphere(N([0,-.0165,.1030]),.0093*ns),.004),
    K(sEll(N([-.0140,-.0210,.0930]),[.0062*ns,.0058*ns,.0074*ns]),.0045),K(sEll(N([.0140,-.0210,.0930]),[.0062*ns,.0058*ns,.0074*ns]),.0045),
    K(sCap(N([0,-.0238,.1010]),N([0,-.0296,.0952]),.0033*ns),.0024)]);
  const lids=[];
  for(const ec of eyes){const s=ec[0]<0?-1:1;
    lids.push(K(sSphere(ec,er+.0021),0));
    lids.push(K(sEll([s*.0335,.0330,.0790],[.0140,.0042*(P.hood||1),.0070],rotM(0,0,s*-.08)),.006));
    lids.push(K(sEll([s*.0310,.0140,.0802],[.0105,.0030,.0050]),.004));}
  // (a child's neck is a smooth column: no sternocleidomastoid cords, no larynx)
  const neck=P.kid?U([K(sCone([0,-.035,-.020],[0,-.165,-.008],.049*nk,.052*nk),0)]):U([K(sCone([0,-.035,-.020],[0,-.165,-.008],.049*nk,.052*nk),0),
    K(sCap([-.050*nk,-.040,-.030],[-.012,-.160,.032],.010*nk),.018),K(sCap([.050*nk,-.040,-.030],[.012,-.160,.032],.010*nk),.018),
    K(sEll([0,-.108,.036],[.008,.011,.008*nk]),.012)]);
  F=U([F,K(nose,.006),K(U(lids),.0045),K(neck,.03)]);
  const cuts=[];
  for(const ec of eyes){const s=ec[0]<0?-1:1;
    cuts.push(K(eyeAperture(ec,s,C),.0011));
    cuts.push(K(sEll(N([s*.0080,-.0283,.0950]),[.0029*ns,.0021*ns,.0039*ns],rotM(-.15,s*.40,0)),.0012));}
  F=S(F,cuts);
  F=D(F,faceRelief(P,C),.0030);
  const ears=[];
  for(const s of[-1,1]){const e=earSDF(P);const M=mulM(rotM(0,-(P.earYaw!=null?P.earYaw:.42),0),rotM(-.12,0,0));
    let node=T(e,M,[.0715*cr[0]+co[0]*0,.004+co[1]*.3,-.006+co[2]*.5]);if(s<0)node=mirrorX(node);ears.push(node);}
  if(!P.noEars)F=U([F,K(U(ears),.0035)]); // noEars: hidden under a bob anyway (would poke through it)
  const W=kidWarpFn(P);
  if(W){const F0=F.f;F={f:(x,y,z)=>F0(x,W(y),z)*.9,bs:F.bs};}
  return{F,eyes,er,C,W};
}
function eyeAperture(ec,s,C){const ex=ec[0],ez=ec[2],W=C.W;
  return{f:(x,y,z)=>{const e=C.eye(s,x);return mx(mx(y-e[1],e[2]-y,ab(e[0]+.0004)-W),-(z-ez-.002));},bs:[ex,ec[1],ez+.02,.03]};}
function earSDF(P){
  // ear-local: x outward (thickness), y up, z forward. origin at attachment
  const L=P.earL||1;const sc=v=>[v[0],v[1]*L,v[2]*L];
  const parts=[];
  parts.push(K(sEll([.003,.004*L,-.006*L],[.0042,.031*L,.0165*L]),0));
  // helix rim
  parts.push(K(sTube([sc([.004,.022,.006]),sc([.0062,.031,.000]),sc([.0072,.034,-.010]),sc([.0072,.027,-.020]),sc([.0068,.012,-.0235]),sc([.0062,-.004,-.0215]),sc([.0055,-.016,-.014])],[.0026,.003,.0033,.0034,.0033,.003,.0028]),.0035));
  // lobe
  parts.push(K(sEll(sc([.0035,-.024,-.0055]),[.0042,.0105*L,.0082*L]),.006));
  // antihelix
  parts.push(K(sTube([sc([.0056,.024,-.012]),sc([.0062,.012,-.0145]),sc([.0058,-.002,-.0125]),sc([.005,-.010,-.008])],[.0018,.0024,.0024,.0018]),.003));
  // tragus
  parts.push(K(sEll(sc([.0055,-.005,.0055]),[.003,.0042,.0028]),.003));
  let F=U(parts);
  F=S(F,[K(sEll(sc([.0095,-.004,-.003]),[.0055,.0095*L,.0072*L]),.0028),K(sEll(sc([.0082,.019,-.006]),[.0035,.0055*L,.0065*L]),.002)]);
  return F;}

// ---- broad vertex paint (skin tone, redness, scalp stubble, AO); fine facial detail is in the face textures ----
function headPainter(P,H){
  const skin=lin(P.skin||0xcfa58a),skinR=lin(P.skinRed||0xc98a74),stub=lin(P.stubble||0x5d5f66);
  return(x,y,z,nx,ny,nz,i,fw)=>{
    let c=skin.slice();
    const cheek=Math.exp(-(((ab(x)-.040)/.020)**2+((y+.006)/.022)**2))*(z>.05?1:0);
    const nose=Math.exp(-((x/.012)**2+((y+.016)/.015)**2+((z-.106)/.012)**2));
    const ear=sstep(.062,.075,ab(x))*sstep(.0,.02,-z+.02);
    c=mixc(c,skinR,clamp(cheek*(.30+.25*(P.kid||0))+nose*.40+ear*.35,0,1));
    const az=Math.atan2(x,z),aaz=ab(az);
    const yb=aaz<.6?lerp(.090,.074,aaz/.6):aaz<1.15?lerp(.074,.047,(aaz-.6)/.55):aaz<1.55?lerp(.047,.036,(aaz-1.15)/.4):aaz<2.0?lerp(.036,-.008,(aaz-1.55)/.45):lerp(-.008,-.052,(aaz-2.0)/(PI-2.0));
    let hair=sstep(yb-.005,yb+.006,y);
    // keep only the ear itself clear (a soft-edged ellipse around it; the temple hair comes down in front of and above the ear)
    if(ab(x)>.060){const e=((y-.002)/.031)**2+((z+.007)/.027)**2;if(e<1.5)hair*=sstep(.80,1.5,e);}
    if(P.scalp==="stubble"){const sp=.6+.4*N2(x*700,y*700,z*700);c=mixc(c,stub,hair*(P.stubAmt||.32)*sp);}
    else if(P.scalp==="hair"){const st=.80+.20*N2(x*90,y*900,z*90)+.08*N1(x*400,y*60,z*400);c=mixc(c,mulc(lin(P.hairC||0xd8d3ca),st),hair*.96);}
    else if(P.scalp==="dark"){c=mixc(c,lin(P.hairC||0x1c1714),hair*.85);}
    if(P.beard==="stubble"){// jaw sides (outside face texture)
      const jaw=sstep(.012,-.010,y)*sstep(-.115,-.092,y)*sstep(-.015,.01,z);const sp=.6+.4*N2(x*900,y*900,z*900);
      c=mixc(c,lin(0x8a8580),jaw*.22*sp*(1-fw));}
    const mo=1+.04*N1(x*260,y*260,z*260)+.03*N3(x*70,y*70,z*70);c=mulc(c,mo);
    return c;};
}
// ---- face textures: color detail (multiplicative, white = neutral) + bump, in planar face space ----
const FX0=-.08,FX1=.08,FY0=-.11,FY1=.08;
function faceTextures(R,P,C){
  const S=1024,X=x=>(x-FX0)/(FX1-FX0)*S,Y=y=>(FY1-y)/(FY1-FY0)*S,PX=S/(FX1-FX0);
  const skin=lin(P.skin||0xcfa58a);
  // ratio color string (target/skin) encoded sRGB, for multiplicative tinting
  const rel=(hex,k)=>{const t=lin(hex);const e=c=>{c=clamp(c,0,1);return Math.round(255*(c<=.0031308?c*12.92:1.055*Math.pow(c,1/2.4)-.055));};
    const r=[t[0]/skin[0],t[1]/skin[1],t[2]/skin[2]].map(v=>1+(v-1)*(k==null?1:k));return"rgb("+e(r[0])+","+e(r[1])+","+e(r[2])+")";};
  const ag=clamp(((P.age!=null?P.age:50)-25)/45,0,1.2),kid=P.kid||0;
  const path=(g,f,x0,x1,n)=>{g.beginPath();for(let i=0;i<=n;i++){const x=x0+(x1-x0)*i/n;const y=f(x);if(i)g.lineTo(X(x),Y(y));else g.moveTo(X(x),Y(y));}};
  const soft=(g,draw,w,color,alpha,passes)=>{passes=passes||4;g.strokeStyle=color;g.lineCap="round";g.lineJoin="round";
    for(let i=passes-1;i>=0;i--){g.lineWidth=w*(1+i*.9);g.globalAlpha=alpha*(i===0?1:.28/i);draw();g.stroke();}g.globalAlpha=1;};
  const polyXY=(g,pts,sx)=>{g.beginPath();pts.forEach((p,i)=>{const x=X(p[0]*sx),y=Y(p[1]);if(i)g.lineTo(x,y);else g.moveTo(x,y);});};
  const draw=(g,mode)=>{// mode 0 = color, 1 = bump
    const rnd=mulberry32((P.seed||5)*31+mode);
    g.fillStyle=mode?"rgb(128,128,128)":"#fff";g.fillRect(0,0,S,S);
    // pores / mottling
    for(let i=0;i<(mode?26000:9000)*(1-.85*kid);i++){const x=rnd()*S,y=rnd()*S,r=mode?.8+rnd()*1.2:1.5+rnd()*5;
      g.fillStyle=mode?(rnd()<.5?"rgba(100,100,100,.35)":"rgba(160,160,160,.25)"):(rnd()<.6?"rgba(200,150,130,.05)":"rgba(255,235,220,.05)");g.beginPath();g.arc(x,y,r,0,7);g.fill();}
    // child: rosy apples of the cheeks and a little warmth on the nose tip and chin
    if(kid&&!mode){const blush=(x,y,rx,ry,al)=>{g.save();g.translate(X(x),Y(y));g.scale(rx*PX,ry*PX);const gr=g.createRadialGradient(0,0,0,0,0,1);
        gr.addColorStop(0,rel(P.blushC||0xe98a7c,1));gr.addColorStop(1,rel(P.blushC||0xe98a7c,0));g.globalAlpha=al*kid;g.fillStyle=gr;g.beginPath();g.arc(0,0,1,0,7);g.fill();g.restore();g.globalAlpha=1;};
      for(const sx of[-1,1])blush(sx*.041,-.008,.027,.021,.42);blush(0,-.012,.010,.008,.22);blush(0,-.072,.012,.008,.18);}
    // ---------- lips ----------
    const MW=C.MW;
    if(!mode){
      g.fillStyle=rel(P.lip||0x9c6156);
      g.save();g.globalAlpha=.9;
      // upper
      g.beginPath();for(let i=0;i<=60;i++){const x=-MW+2*MW*i/60;const y=C.yU(x);if(i)g.lineTo(X(x),Y(y));else g.moveTo(X(x),Y(y));}
      for(let i=60;i>=0;i--){const x=-MW+2*MW*i/60;g.lineTo(X(x),Y(C.ys(x)));}g.closePath();g.shadowColor=g.fillStyle;g.shadowBlur=3;g.fill();
      g.fillStyle=rel(P.lipColL||P.lip||0x9c6156,.85);
      g.beginPath();for(let i=0;i<=60;i++){const x=-MW*.97+2*MW*.97*i/60;const y=C.yL(x);if(i)g.lineTo(X(x),Y(y));else g.moveTo(X(x),Y(y));}
      for(let i=60;i>=0;i--){const x=-MW*.97+2*MW*.97*i/60;g.lineTo(X(x),Y(C.ys(x)));}g.closePath();g.fill();
      g.restore();g.shadowBlur=0;
      // stomion
      soft(g,()=>path(g,C.ys,-MW*1.02,MW*1.02,50),2.2,rel(0x3a201a),.9,3);
      // corners
      for(const sx of[-1,1]){g.fillStyle=rel(0x6a4034,.7);g.globalAlpha=.5;g.beginPath();g.arc(X(sx*MW),Y(C.ys(sx*MW)),5,0,7);g.fill();g.globalAlpha=1;}
    }
    // lip vertical lines (both maps)
    for(let i=0;i<70*(1-.7*kid);i++){const x=(rnd()*2-1)*MW*.9;const up=rnd()<.45;const y0=C.ys(x),y1=up?C.yU(x):C.yL(x);
      g.strokeStyle=mode?"rgba(80,80,80,.5)":rel(0x7a4a40,.6);g.globalAlpha=(mode?.6:.25)*(1-.6*kid);g.lineWidth=1;g.beginPath();g.moveTo(X(x),Y(lerp(y0,y1,.15)));g.lineTo(X(x+(rnd()-.5)*.001),Y(lerp(y0,y1,.85)));g.stroke();}
    g.globalAlpha=1;
    if(mode){soft(g,()=>path(g,C.ys,-MW,MW,50),2.5,"rgb(40,40,40)",.8,3);}
    // ---------- brows ----------
    if(kid&&!mode)for(const sx of[-1,1]){g.save();g.globalAlpha=.22*kid;g.lineCap="round";g.strokeStyle=rel(P.brow||0x3a3431,.8);
      for(let k=3;k>=0;k--){g.lineWidth=(.0024+k*.0012)*PX*(P.browW||1);g.globalAlpha=.22*kid*(k?.35:1);g.beginPath();
        for(let i=0;i<=20;i++){const b=C.brow(i/20*.92);if(i)g.lineTo(X(sx*b[0]),Y(b[1]));else g.moveTo(X(sx*b[0]),Y(b[1]));}g.stroke();}g.restore();}
    for(const sx of[-1,1]){const n=P.browHairs||260;
      for(let i=0;i<n;i++){const t=Math.pow(rnd(),.85);const b=C.brow(t);const w=(.0032-.0016*t)*(P.browW||1);const off=(rnd()-.5)*w;
        const x=sx*b[0],y=b[1]+off;const ang=t<.15?1.2-t*3:.18-.15*t+(rnd()-.5)*.25;// flow up at inner end, then outward
        const L=(.0035+rnd()*.003)*PX;const dx=Math.cos(ang)*L*sx,dy=-Math.sin(ang)*L;
        g.strokeStyle=mode?"rgba(175,175,175,.5)":rel(P.brow||0x3a3431,.95);g.globalAlpha=mode?.5:(.35+.45*rnd())*(P.browAmt||1);g.lineWidth=mode?1.2:1+rnd()*.8;
        g.beginPath();g.moveTo(X(x),Y(y));g.quadraticCurveTo(X(x)+dx*.6,Y(y)+dy*.6-.8,X(x)+dx,Y(y)+dy+.6);g.stroke();}}
    g.globalAlpha=1;
    // ---------- eyes ----------
    for(const s of[-1,1]){
      const xi=s*C.EX-s*C.W,xo=s*C.EX+s*C.W;const x0=mn(xi,xo),x1=mx(xi,xo);
      const up=x=>C.eye(s,x)[1],lo=x=>C.eye(s,x)[2];
      if(!mode){
        // lid pigmentation
        g.save();g.globalAlpha=.16*(1-.7*kid);g.fillStyle=rel(0x8e6a5a);g.beginPath();path(g,x=>up(x)+.0005,x0,x1,30);
        for(let i=30;i>=0;i--){const x=x0+(x1-x0)*i/30;g.lineTo(X(x),Y(up(x)+.0075+.002*Math.sin(PI*i/30)));}g.closePath();g.shadowColor=g.fillStyle;g.shadowBlur=6;g.fill();g.restore();
        // under eye
        g.save();g.globalAlpha=.18*(.5+ag)*(1-.8*kid);g.fillStyle=rel(0x8a6050);g.beginPath();path(g,x=>lo(x)-.0006,x0,x1,30);
        for(let i=30;i>=0;i--){const x=x0+(x1-x0)*i/30;g.lineTo(X(x),Y(lo(x)-.006*Math.sin(PI*i/30)-.0008));}g.closePath();g.shadowColor=g.fillStyle;g.shadowBlur=8;g.fill();g.restore();
      }
      // lash line upper (thicker toward outer corner) & lower
      const lash=mode?"rgb(150,150,150)":rel(0x1e1612);
      for(let i=0;i<40;i++){const t0=i/40,t1=(i+1)/40;const xa=lerp(xi,xo,t0),xb=lerp(xi,xo,t1);g.strokeStyle=lash;g.lineCap="round";
        g.globalAlpha=mode?.5:.95;g.lineWidth=(1.6+3.2*Math.sin(PI*clamp(t0*1.1,0,1))*(.55+.45*t0))*(P.lash||1);g.beginPath();g.moveTo(X(xa),Y(up(xa)+.0004));g.lineTo(X(xb),Y(up(xb)+.0004));g.stroke();}
      g.globalAlpha=mode?.3:.45;soft(g,()=>path(g,x=>lo(x)-.0003,x0,x1,24),1.2,lash,mode?.3:.4,2);
      // lid crease (softer at inner corner = epicanthic)
      soft(g,()=>path(g,x=>up(x)+.0052+.0012*Math.sin(PI*clamp((x-x0)/(x1-x0),0,1)),s<0?lerp(x0,x1,.0):lerp(x0,x1,.25),s<0?lerp(x0,x1,.75):x1,24),1.6,mode?"rgb(70,70,70)":rel(0x7a5444),(mode?.5:.35)*(1-.6*kid),3);
      // crow's feet & under-eye lines
      if(ag>0)for(let k=0;k<4;k++){const ox=s*(C.EX+C.W+.0015),oy=C.EY+.0015;const a=(-.55+k*.38)+(rnd()-.5)*.15;const L=.006+rnd()*.006;
        g.beginPath();g.moveTo(X(ox),Y(oy+Math.sin(a)*.001));g.quadraticCurveTo(X(ox+s*Math.cos(a)*L*.5),Y(oy+Math.sin(a)*L*.5+.0005),X(ox+s*Math.cos(a)*L),Y(oy+Math.sin(a)*L));
        g.strokeStyle=mode?"rgb(70,70,70)":rel(0x8a6050);g.globalAlpha=(mode?.45:.14)*ag;g.lineWidth=mode?2.2:1.6;g.stroke();}
      if(ag>0){g.globalAlpha=1;soft(g,()=>path(g,x=>C.EY-.0115-.0012*Math.cos(PI*(x-s*C.EX)/.024),x0+s*.002,x1+s*.002,20),1.3,mode?"rgb(80,80,80)":rel(0x8a6050),(mode?.45:.30)*ag,3);}
      g.globalAlpha=1;
    }
    // ---------- forehead & glabella ----------
    if(ag>0){for(const ly of[.058,.066,.0745,.083]){const segs=2+((rnd()*2)|0);
        for(let k=0;k<segs;k++){const xa=-.044+rnd()*.03+k*.03,xb=xa+.02+rnd()*.025;
          soft(g,()=>path(g,x=>ly+.0028*Math.cos(x*52)+.0012*Math.sin(x*140+k),xa,mn(xb,.046),20),mode?3.2:2.2,mode?"rgb(70,70,70)":rel(0x8f6652),(mode?.45:.10)*ag,4);}}
      for(const sx of[-1,1])soft(g,()=>{g.beginPath();g.moveTo(X(sx*.0045),Y(.035));g.lineTo(X(sx*.0050),Y(.045));},mode?2.6:2,mode?"rgb(80,80,80)":rel(0x8f6652),(mode?.35:.08)*ag,4);}
    // ---------- nasolabial / marionette ----------
    for(const sx of[-1,1]){soft(g,()=>polyXY(g,C.nlf.slice(0,3),sx),3.5,mode?"rgb(90,90,90)":rel(0x8a5a48),(mode?.30:.10)*(.4+ag)*(1-kid),4);
      if(ag>.3)soft(g,()=>{g.beginPath();g.moveTo(X(sx*(MW+.0008)),Y(C.ys(sx*MW)-.0015));g.lineTo(X(sx*(MW+.0035)),Y(-.067));},1.3,mode?"rgb(80,80,80)":rel(0x8a5a48),(mode?.4:.22)*ag,3);
      soft(g,()=>polyXY(g,C.alar,sx),3,mode?"rgb(90,90,90)":rel(0x7a5040),(mode?.30:.12)*(1-.6*kid),3);}
    // ---------- beard stubble & whiskers ----------
    if(P.beard==="stubble"){
      const dens=(x,y)=>{const ax=ab(x);const mous=gauss(y-(C.yU(x)+.0045),.0035)*gauss(x,.020)*(y>C.yU(x)+.0008?1:0);
        const chin=gauss(y+.082,.014)*gauss(x,.020)*(y<C.yL(x)-.002?1:0);const jaw=sstep(-.06,-.085,y)*sstep(.03,.05,ax)*.7;const lowerlip=gauss(y-(C.yL(x)-.006),.004)*gauss(x,.012)*(y<C.yL(x)-.0015?1:0);
        return clamp(mous*.9+chin*1.0+jaw*.6+lowerlip*.7,0,1);};
      for(let i=0;i<26000;i++){const x=(rnd()*2-1)*.06,y=-.03-rnd()*.075;const d=dens(x,y);if(rnd()>d)continue;
        g.fillStyle=mode?"rgba(170,170,170,.6)":rel(P.stubbleFace||0x6c6762,.85);g.globalAlpha=mode?.5:.55;g.fillRect(X(x),Y(y),1.4,1.4);}
      // sparse whiskers (moustache down-outward, chin downward)
      for(let i=0;i<(P.whiskers||140);i++){const chin=rnd()<.55;let x,y,ang;
        if(chin){x=(rnd()*2-1)*.014;y=-.072-rnd()*.020;ang=-PI/2+(rnd()-.5)*.5+x*20;}else{const sx=rnd()<.5?-1:1;x=sx*(.002+rnd()*.016);y=C.yU(x)+.0015+rnd()*.0045;ang=-PI/2-sx*(.5+rnd()*.5);}
        const L=(.003+rnd()*.006)*PX;g.strokeStyle=mode?"rgba(190,190,190,.6)":rel(P.whiskerC||0x8a8580,.9);g.globalAlpha=mode?.5:.6;g.lineWidth=1;
        g.beginPath();g.moveTo(X(x),Y(y));g.lineTo(X(x)+Math.cos(ang)*L,Y(y)-Math.sin(ang)*L);g.stroke();}
      g.globalAlpha=1;}
    // ---------- age spots ----------
    if(!mode)for(let i=0;i<(P.spots||0);i++){const sx=rnd()<.5?-1:1;const x=sx*(.035+rnd()*.035),y=-.01+rnd()*.07;
      g.fillStyle=rel(0x9a6e52,.6);g.globalAlpha=.35;g.beginPath();g.ellipse(X(x),Y(y),2+rnd()*5,2+rnd()*4,rnd()*3,0,7);g.shadowColor=g.fillStyle;g.shadowBlur=4;g.fill();g.shadowBlur=0;}
    g.globalAlpha=1;
  };
  const map=canvasTex(R,S,S,(g)=>draw(g,0),{clamp:true});
  const bump=canvasTex(R,S,S,(g)=>draw(g,1),{clamp:true,linear:true});
  return{map,bump};
}
function faceSkinMat(R,map,bump,o){o=o||{};
  const m=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:o.rough!=null?o.rough:.58,metalness:0,map,bumpMap:bump,bumpScale:o.bumpScale||.0009});
  m.onBeforeCompile=sh=>{
    sh.vertexShader=sh.vertexShader.replace("#include <common>","#include <common>\nattribute float frontW;\nvarying float vFrontW;").replace("#include <begin_vertex>","#include <begin_vertex>\nvFrontW=frontW;");
    sh.fragmentShader=sh.fragmentShader.replace("#include <common>","#include <common>\nvarying float vFrontW;")
      .replace("#include <map_fragment>","#ifdef USE_MAP\n vec4 texelColor=mapTexelToLinear(texture2D(map,vUv));\n diffuseColor.rgb*=mix(vec3(1.0),texelColor.rgb,vFrontW);\n#endif")
      .replace("dHdxy_fwd(), faceDirection","dHdxy_fwd()*vFrontW, faceDirection");};
  m.customProgramCacheKey=()=>"tsureFaceSkin";R.add(m);return m;}
// ---- hair pieces (head-local): long white beard + moustache + bushy brows (roujin) ----
function beardSDF(P){const parts=[];const L=P.beardLen||.13,bw=P.beardW||1,wk=P.whiskers3||1;
  // chin beard: tapering flattened mass from chin downward（bw で幅、劉邦の「美須髯」は広く長く）
  parts.push(K(sEll([0,-.090,.080],[.026*bw,.022,.016]),0));
  parts.push(K(sCone([0,-.095,.080],[0,-.095-L*.55,.084+.006*(bw-1)],.020*bw,.014*bw),.02));
  parts.push(K(sCone([0,-.095-L*.55,.084+.006*(bw-1)],[0,-.095-L,.080],.014*bw,.004),.015));
  for(const s of[-1,1]){// jaw beard & sideburns（髯＝頬ひげ）
    parts.push(K(sCap([s*.050,-.040,.012],[s*.040,-.072,.050],.0075*wk),.012));parts.push(K(sCap([s*.040,-.072,.050],[s*.016,-.092,.076],.0095*wk),.012));
    if(bw>1.15)parts.push(K(sCone([s*.03,-.085,.07],[s*.024*bw,-.095-L*.6,.074],.012,.005),.016));
    // moustache tufts drooping past mouth corners
    parts.push(K(sTube([[s*.003,-.0345,.1005],[s*.014,-.0400,.0990],[s*.025,-.0490,.0920],[s*.030,-.0640,.0860],[s*.031,-.0760,.0840]],[.0040,.0042,.0036,.0026,.0014]),.004));
    // brows: thick, drooping outer ends
    parts.push(K(sTube([[s*.011,.0455,.0950],[s*.026,.0490,.0920],[s*.042,.0470,.0840],[s*.056,.0400,.0720],[s*.062,.0320,.0660]],[.0030,.0040,.0040,.0034,.0018]),.003));}
  let F=U(parts);
  // keep the mouth slit free
  F=S(F,[K(sEll([0,-.0505,.100],[.020,.0042,.012]),.003)]);
  const nz=makeNoise(55);
  F=D(F,(x,y,z)=>{const fl=y<-.07?Math.sin(x*780+nz(x*60,y*20,z*60)*2.2):Math.sin((x*.6+y)*720+nz(x*50,y*50,z*50)*2);return .0011*fl;},.0012);
  return F;}
// tate-eboshi (lacquered gauze cap), head-local
function eboshiSDF(P){const h=P.eboH||.27;
  const parts=[K(sEll([0,.090,-.006],[.0800,.060,.0985]),0),K(sEll([0,.150,-.016],[.066,.075,.088]),.05),K(sEll([0,.090+h*.55,-.032],[.046,h*.30,.076]),.07),
    K(sEll([0,.090+h*.86,-.046],[.032,h*.15,.058]),.05)];
  let F=U(parts);
  // base edge: lower at the back, above the ears
  const base={f:(x,y,z)=>{const a=Math.atan2(x,z),ca=Math.cos(a);const yb=lerp(.026,.074,(ca+1)/2)+.010*Math.sin(ab(a));return yb-y;},bs:[0,.05,0,.2]};
  F=Isect(F,base,.004);
  // front crease (mayu) & side dents
  F=D(F,(x,y,z)=>{let d=0;if(z>.03)d-=.0045*gauss(x,.0045)*sstep(.10,.16,y)*sstep(.36,.28,y);d-=.0025*gauss(ab(x)-.03,.010)*sstep(.20,.26,y)*(z>0?1:0);
      d+=.0007*N1(x*90,y*35,z*90);return d;},.005);
  return F;}
const HEADT={};
function buildHead(R,P,q){
  const H=headSDF(P);
  const h=q==="low"?.0048:q==="medium"?.0036:.0028;
  const key="head|"+JSON.stringify(P)+"|"+q;
  let poly=GEO_CACHE.get(key);
  const tA=performance.now();
  if(!poly){poly=polygonize(H.F.f,[-.105,-.172,-.115],[.105,.140,.135],h,{levels:3,lip:1.2,seedS:4,refine:0,normals:"grid"});poly.fresh=true;}
  else poly={pos:poly.pos,nrm:poly.nrm,idx:poly.idx,n:poly.n,uv:poly.uv,col:poly.col,fw:poly.fw};
  HEADT.poly=performance.now()-tA;
  const n=poly.n,pp=poly.pos,nn=poly.nrm;
  if(poly.fresh){
  // front weight + planar UV
  const fw=new Float32Array(n),uv=new Float32Array(n*2);
  const Wk=H.W||(y=>y);
  for(let v=0;v<n;v++){const x=pp[v*3],y=Wk(pp[v*3+1]),z=pp[v*3+2],nz=nn[v*3+2];
    let w=sstep(.18,.45,nz)*sstep(.030,.052,z)*sstep(.078,.066,ab(x))*sstep(-.115,-.100,y);
    fw[v]=w;uv[v*2]=(x-FX0)/(FX1-FX0);uv[v*2+1]=(y-FY0)/(FY1-FY0);}
  poly.uv=uv;poly.fw=fw;
  const ao=bakeAO(poly,H.F.f,.0035,3,1.3);
  const pf=headPainter(P,H);
  paint(poly,(x,y,z,a,b,c,i)=>pf(x,Wk(y),z,a,b,c,i,fw[i]),ao,.30);
  GEO_CACHE.set(key,{pos:poly.pos,nrm:poly.nrm,idx:poly.idx,n:poly.n,uv:poly.uv,col:poly.col,fw:poly.fw});}
  const g=R.add(toGeom(poly));g.setAttribute("frontW",new THREE.BufferAttribute(poly.fw,1));
  HEADT.aopaint=performance.now()-tA;
  const tex=faceTextures(R,P,H.C);HEADT.tex=performance.now()-tA;
  const grp=new THREE.Group();
  const mesh=new THREE.Mesh(g,faceSkinMat(R,tex.map,tex.bump,{rough:P.rough}));mesh.castShadow=true;mesh.receiveShadow=true;grp.add(mesh);
  const etex=eyeTexture(R,P.iris||[70,46,30],{irisR:P.irisR,pupilR:P.pupilR,sclera:P.sclera,catchlight:P.catchlight,double:P.doublePupil});
  const em=R.add(new THREE.MeshStandardMaterial({map:etex,roughness:.10,metalness:0}));
  const eg=[];for(const e of H.eyes){const sg=new THREE.SphereGeometry(H.er,28,20);sg.rotateX(PI/2);
    sg.rotateX((P.gazePitch||0));sg.rotateY((P.gazeYaw||0));sg.translate(e[0],e[1],e[2]);eg.push(sg);} // gazePitch > 0 looks down
  const emesh=new THREE.Mesh(mergeGeoms(R,eg),em);grp.add(emesh);
  const hq=q==="low"?.004:q==="medium"?.003:.0024;
  if(P.beard==="long"){const B=beardSDF(P);const hc=lin(P.hairC||0xd8d3ca);
    const bp=cachePoly("beard|"+q+"|"+(P.beardLen||.13)+"|"+(P.beardW||1)+"|"+(P.whiskers3||1),()=>{const pl=polygonize(B.f,[-.08,-.25,.0],[.08,.065,.125],hq,{levels:3,lip:1.4,seedS:2});
      const ao=bakeAO(pl,(x,y,z)=>mn(B.f(x,y,z),H.F.f(x,y,z)),.004,3,1.2);paint(pl,(x,y,z)=>mulc(hc,.86+.14*N2(x*300,y*80,z*300)-.10*sstep(-.11,-.2,y)),ao,.35);return pl;});
    const bm=new THREE.Mesh(R.add(toGeom(bp)),R.add(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.62,metalness:0})));bm.castShadow=true;bm.receiveShadow=true;grp.add(bm);}
  if(P.eboshi){const E=eboshiSDF(P);
    const ep=cachePoly("eboshi|"+q+"|"+(P.eboH||.27),()=>{const pl=polygonize(E.f,[-.10,0,-.13],[.10,.44,.12],q==="low"?.007:.0045,{levels:3,lip:1.4,seedS:2});
      const ao=bakeAO(pl,(x,y,z)=>mn(E.f(x,y,z),H.F.f(x,y,z)),.008,3,1.0);paint(pl,(x,y,z)=>mulc(lin(0x1a1816),.85+.3*N2(x*60,y*220,z*60)),ao,.4);return pl;});
    const emat=R.add(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.36,metalness:.08}));
    const eb=new THREE.Mesh(R.add(toGeom(ep)),emat);eb.castShadow=true;eb.receiveShadow=true;grp.add(eb);}
  return{group:grp,mesh,H,poly};
}
function mergeGeoms(R,list){let nv=0,ni=0;for(const g of list){nv+=g.attributes.position.count;ni+=g.index?g.index.count:g.attributes.position.count;}
  const pos=new Float32Array(nv*3),nor=new Float32Array(nv*3),uv=list[0].attributes.uv?new Float32Array(nv*2):null,col=list[0].attributes.color?new Float32Array(nv*3):null;
  const idx=nv>65535?new Uint32Array(ni):new Uint16Array(ni);let vo=0,io=0;
  for(const g of list){const n=g.attributes.position.count;pos.set(g.attributes.position.array,vo*3);nor.set(g.attributes.normal.array,vo*3);
    if(uv&&g.attributes.uv)uv.set(g.attributes.uv.array,vo*2);if(col&&g.attributes.color)col.set(g.attributes.color.array,vo*3);
    if(g.index){const a=g.index.array;for(let i=0;i<a.length;i++)idx[io+i]=a[i]+vo;io+=a.length;}else{for(let i=0;i<n;i++)idx[io+i]=vo+i;io+=n;}
    vo+=n;g.dispose();}
  const G=new THREE.BufferGeometry();G.setAttribute("position",new THREE.BufferAttribute(pos,3));G.setAttribute("normal",new THREE.BufferAttribute(nor,3));
  if(uv)G.setAttribute("uv",new THREE.BufferAttribute(uv,2));if(col)G.setAttribute("color",new THREE.BufferAttribute(col,3));
  G.setIndex(new THREE.BufferAttribute(idx,1));G.computeBoundingSphere();return R.add(G);}

// =====================================================================================
//  5. HANDS & FEET
// =====================================================================================
// two-bone IK: shoulder S, target T, lengths a,b, pole direction hint -> elbow
function ik2(S,T,a,b,pole){let d=sub3(T,S);let L=len3(d);const Lc=clamp(L,ab(a-b)+1e-4,a+b-1e-4);const dir=scl3(d,1/L);
  const ca=(a*a+Lc*Lc-b*b)/(2*a*Lc),sa=sq(mx(0,1-ca*ca));let pp=sub3(pole,scl3(dir,dot3(pole,dir)));pp=nrm3(pp);
  const E=add3(S,add3(scl3(dir,a*ca),scl3(pp,a*sa)));return{E,T:L>a+b?add3(S,scl3(dir,a+b-1e-4)):T};}
// basis matrix (local->world) from local Y axis (fwd) and local Z axis hint (dorsal)
function basisYZ(Y,Zh){Y=nrm3(Y);let Z=sub3(Zh,scl3(Y,dot3(Zh,Y)));Z=nrm3(Z);const X=cross3(Y,Z);return[X[0],Y[0],Z[0],X[1],Y[1],Z[1],X[2],Y[2],Z[2]];}
function basisZY(Zf,Yh){Zf=nrm3(Zf);let Y=sub3(Yh,scl3(Zf,dot3(Yh,Zf)));Y=nrm3(Y);const X=cross3(Y,Zf);return[X[0],Y[0],Zf[0],X[1],Y[1],Zf[1],X[2],Y[2],Zf[2]];}
// RIGHT hand, local: origin wrist, +Y fingers, +Z dorsal, thumb toward -X. pose:{curl:[i,m,r,l], spread, thumb:[abd,flex,opp], fl:[[mcp,pip,dip]x4] optional}
const FING=[{m:[-.0238,.092,.002],L:[.040,.024,.019],r:[.0080,.0070,.0060],sp:-.10},{m:[-.0075,.095,.002],L:[.045,.027,.020],r:[.0083,.0073,.0062],sp:-.02},
  {m:[.0088,.091,.001],L:[.042,.026,.019],r:[.0078,.0068,.0058],sp:.06},{m:[.0232,.083,-.001],L:[.033,.020,.017],r:[.0069,.0061,.0053],sp:.15}];
function fingerPts(f,flex,spread){const pts=[f.m];let a=0,p=f.m;const sp=f.sp*(1+spread)+(spread*.06);
  for(let i=0;i<3;i++){a+=flex[i];const dir=[Math.sin(sp)*Math.cos(a),Math.cos(sp)*Math.cos(a),-Math.sin(a)];p=add3(p,scl3(dir,f.L[i]));pts.push(p);}
  return pts;}
function handData(pose){const curl=pose.curl||[.25,.3,.35,.4],spread=pose.spread||0;const fings=[];
  for(let i=0;i<4;i++){const c=curl[i];const fl=pose.fl&&pose.fl[i]?pose.fl[i]:[.20+c*1.25,.25+c*1.55,.12+c*.95];fings.push(fingerPts(FING[i],fl,spread));}
  const th=pose.thumb||[.35,.3,.4];const abd=th[0],fx=th[1],opp=th[2];
  const cmc=[-.020,.020,-.008];
  // metacarpal direction: out (−x) & forward (+y), rotated toward palm (−z) by abd
  let d0=nrm3([-.78*Math.cos(abd),.62,-Math.sin(abd)*.9-.1]);
  const mcp=add3(cmc,scl3(d0,.044));
  // phalanges bend toward palm/fingers: rotate direction toward +x & −z
  const bend=(d,a)=>nrm3([d[0]*Math.cos(a)+Math.sin(a)*(.55+.45*opp),d[1]*Math.cos(a)+.1*Math.sin(a),d[2]*Math.cos(a)-Math.sin(a)*(.6+.3*opp)]);
  const d1=bend(d0,.25+fx*.6),ip=add3(mcp,scl3(d1,.032)),d2=bend(d1,.15+fx*.7),tip=add3(ip,scl3(d2,.025));
  return{fings,thumb:[cmc,mcp,ip,tip]};}
function handSDF(pose,o){o=o||{};const hd=handData(pose);const bony=o.bony||0;
  const parts=[K(sBox([-.001,.052,-.001],[.0315,.043,.0098],null,.0090),0),K(sEll([-.0175,.030,-.0080],[.015,.023,.0108]),.012),
    K(sEll([.0215,.040,-.006],[.0115,.032,.0095]),.010),K(sEll([0,.003,-.001],[.0275,.026,.0175]),.014),K(sCap([0,-.005,0],[0,-.06,0],.0235),.012)];
  for(let i=0;i<4;i++){const P=hd.fings[i],f=FING[i];
    parts.push(K(sTube(P,[f.r[0]*1.06,f.r[0],f.r[1],f.r[2]*.92],.003),.0065));
    parts.push(K(sSphere(add3(P[0],[0,0,.0045]),f.r[0]*.82),.004));
    parts.push(K(sSphere(P[1],f.r[0]*.93+bony*.0006),.002));parts.push(K(sSphere(P[2],f.r[1]*.92+bony*.0005),.002));}
  const T_=hd.thumb;parts.push(K(sTube(T_,[.0125,.0110,.0094,.0080],.003),.010));
  let F=U(parts);
  return{F,hd};}
function nailPaint(hd){// returns fn(x,y,z)-> nail weight (local coords)
  const tips=hd.fings.map((P,i)=>[P[3],nrm3(sub3(P[3],P[2])),FING[i].r[2]]);tips.push([hd.thumb[3],nrm3(sub3(hd.thumb[3],hd.thumb[2])),.0078]);
  return(x,y,z,nx,ny,nz)=>{let w=0;for(const t of tips){const c=sub3(t[0],scl3(t[1],t[2]*1.1));const dx=x-c[0],dy=y-c[1],dz=z-c[2];const d=sq(dx*dx+dy*dy+dz*dz);
      if(d<t[2]*1.6){// dorsal side: normal pointing +z-ish relative to finger
        w=mx(w,sstep(t[2]*1.55,t[2]*1.0,d)*sstep(.2,.6,nz*1.0));}}return w;};}
// RIGHT bare foot, local: origin ankle joint, +Z toes, +Y up, big toe toward +X (medial)
function footSDF(o){o=o||{};const sc=o.scale||1;const parts=[
  K(sEll([0,-.046,-.030],[.030,.027,.034]),0),K(sEll([.004,-.044,.045],[.038,.026,.058]),.03),K(sEll([.008,-.054,.116],[.045,.017,.030]),.025),
  K(sCap([0,-.012,.0],[.006,-.040,.105],.021),.025),K(sCone([0,.0,-.004],[0,.14,-.012],.031,.036),.02),
  K(sSphere([-.027,-.002,-.006],.012),.012),K(sSphere([.024,.004,-.002],.011),.012)];
  const toes=[[.025,.150,.191,.0125],[.007,.146,.176,.0085],[-.008,.140,.168,.0078],[-.021,.133,.158,.0072],[-.033,.124,.146,.0068]];
  for(const t of toes)parts.push(K(sCap([t[0],-.052,t[1]],[t[0]*1.06,-.054,t[2]],t[3]),.004));
  let F=U(parts);F=S(F,[K(sEll([.035,-.074,.050],[.016,.016,.040]),.012)]);
  return F;}

// =====================================================================================
const HANDP={
  relax:{curl:[.30,.36,.42,.48],spread:.05,thumb:[.35,.35,.35]},
  rest:{curl:[.18,.22,.28,.34],spread:.10,thumb:[.25,.2,.2]},
  brush:{curl:[.45,.62,.95,1.05],spread:-.05,thumb:[.65,.55,.9],fl:[[.55,.55,.35],[.75,.9,.5],[1.3,1.6,.9],[1.4,1.7,.9]]},
  book:{curl:[.15,.12,.15,.2],spread:.18,thumb:[.05,.15,.1]},
  lap:{curl:[.25,.3,.38,.45],spread:.05,thumb:[.3,.3,.3]},
  grasp:{curl:[.75,.85,.9,.95],spread:-.05,thumb:[.6,.6,.8]},
  fan:{curl:[.8,.9,.95,1.0],spread:-.08,thumb:[.55,.45,.85]},
  hold:{curl:[.35,.4,.45,.5],spread:.12,thumb:[.4,.25,.3]},
  reach:{curl:[.08,.06,.08,.1],spread:.35,thumb:[.25,.1,.05]},
};
function m4(M,t){const m=new THREE.Matrix4();m.set(M[0],M[1],M[2],t[0],M[3],M[4],M[5],t[1],M[6],M[7],M[8],t[2],0,0,0,1);return m;}
function placeObj(o,M,t){const m=m4(M,t);m.decompose(o.position,o.quaternion,o.scale);}
// polygonize a local-space SDF part, AO against world SDF G through (M,t)
const GEO_CACHE=new Map();// key -> poly typed arrays (CPU only; GPU resources are created per figure)
function cachePoly(key,make){if(key&&GEO_CACHE.has(key))return GEO_CACHE.get(key);const p=make();if(key){GEO_CACHE.set(key,p);if(GEO_CACHE.size>40)GEO_CACHE.delete(GEO_CACHE.keys().next().value);}return p;}
function buildPart(F,bmin,bmax,h,M,t,G,aoStep,aoStr,painter,opt){opt=opt||{};
  const key=opt.key?opt.key+"|"+h:null;
  if(key&&GEO_CACHE.has(key)){const c=GEO_CACHE.get(key);return{pos:c.pos,nrm:c.nrm,idx:c.idx,n:c.n,col:c.col};}
  const poly=polygonize(F.f,bmin,bmax,h,{levels:opt.levels!=null?opt.levels:3,lip:1.25,seedS:opt.seedS||4,refine:opt.refine||0,normals:opt.normals||"grid"});
  const n=poly.n,p=poly.pos,q=poly.nrm;let ao=null;
  if(G){ao=new Float32Array(n);const I=M||[1,0,0,0,1,0,0,0,1],T_=t||[0,0,0];
    for(let v=0;v<n;v++){const lx=p[v*3],ly=p[v*3+1],lz=p[v*3+2],nx=q[v*3],ny=q[v*3+1],nz=q[v*3+2];
      const x=I[0]*lx+I[1]*ly+I[2]*lz+T_[0],y=I[3]*lx+I[4]*ly+I[5]*lz+T_[1],z=I[6]*lx+I[7]*ly+I[8]*lz+T_[2];
      const wx=I[0]*nx+I[1]*ny+I[2]*nz,wy=I[3]*nx+I[4]*ny+I[5]*nz,wz=I[6]*nx+I[7]*ny+I[8]*nz;
      let occ=0,w=1,ws=0;const ns=opt.aoN||4;for(let i=1;i<=ns;i++){const d=aoStep*i;const sd=G(x+wx*d,y+wy*d,z+wz*d);occ+=w*mx(0,d-sd)/d;ws+=w;w*=.7;}
      ao[v]=clamp(1-aoStr*occ/ws,0,1);}}
  paint(poly,painter,ao,opt.aoMin!=null?opt.aoMin:.18);
  if(key)GEO_CACHE.set(key,{pos:poly.pos,nrm:poly.nrm,idx:poly.idx,n:poly.n,col:poly.col});
  return poly;}
function mergePolys(list){let n=0,ni=0;for(const p of list){n+=p.n;ni+=p.idx.length;}
  const pos=new Float32Array(n*3),nrm=new Float32Array(n*3),col=new Float32Array(n*3),idx=n>65535?new Uint32Array(ni):new Uint16Array(ni);let vo=0,io=0;
  for(const p of list){pos.set(p.pos,vo*3);nrm.set(p.nrm,vo*3);if(p.col)col.set(p.col,vo*3);for(let i=0;i<p.idx.length;i++)idx[io+i]=p.idx[i]+vo;io+=p.idx.length;vo+=p.n;}
  return{pos,nrm,col,idx,n};}
function meshOf(R,poly,mat,cast){const g=R.add(toGeom(poly));const m=new THREE.Mesh(g,mat);m.castShadow=cast!==false;m.receiveShadow=true;return m;}
function skinPainter(P,kind,hd){const skin=lin(P.skin||0xc49a78),red=lin(P.skinRed||0xbd7b64),light=lin(P.skinLight||0xd8b498),nail=lin(0xd9b4a2);
  const nw=hd?nailPaint(hd):null;
  return(x,y,z,nx,ny,nz)=>{let c=skin.slice();
    if(kind==="hand"){c=mixc(c,light,sstep(.1,-.6,nz)*.55);// palm side lighter
      c=mixc(c,red,.25*sstep(.3,.9,nz)*sstep(.07,.10,y));if(nw){const w=nw(x,y,z,nx,ny,nz);c=mixc(c,nail,w*.85);}}
    if(kind==="foot"){c=mixc(c,light,sstep(-.2,-.7,ny)*.6);c=mixc(c,red,.25*sstep(.15,.19,z));}
    const mo=1+.05*N1(x*200,y*200,z*200);return mulc(c,mo);};}
/** 髪（頭皮の上にかぶさる髪の層と、頭頂の髻）。頭部と同じ SDF から作るので額や耳ぎわの線が頭の形に沿う。
    P.hairThick: 髪の厚み(m) / P.topknot: 髻の大きさ（0 で無し）/ P.hairC: 色 / P.hairGloss: つや */
function hairMesh(R,P,q){
  const H=headSDF(P),hf=H.F.f,th=P.hairThick||.006,tk=P.topknot==null?.034:P.topknot;
  // 生え際の高さ（後ろ -0.065 → 前 0.05）。耳の上は耳を出す
  const yh=(x,y,z)=>{const t=clamp((z+.03)/.12,0,1);let v=-.07+t*t*.122;if(ab(x)>.05&&z>-.035&&z<.05)v=mx(v,.012+(.05-z)*.1);
    // こめかみの剃り込み（額の角を少し後退させる）
    v+=.008*sstep(.025,.05,ab(x))*sstep(.04,.07,z);return v;};
  const knot=tk>0?sSphere([0,.122+tk*.4,-.04],tk):null;
  const F={f:(x,y,z)=>{let d=mx(hf(x,y,z)-th,yh(x,y,z)-y);
      // 頭皮側へ食い込みすぎないよう、頭の内側は切る（中が詰まっていても見えない）
      if(knot){const kd=knot.f(x,y,z);d=smin(d,kd,.012);}
      // 櫛目：前から髻へ流れる細かい凹凸
      const a=Math.atan2(x,z+.04);d+=.00025*Math.sin(a*60+N1(x*40,y*40,z*40)*2);
      return d;},bs:[0,.03,0,.2]};
  const h=q==="low"?.0045:q==="medium"?.0034:.0028;
  const key="hair|"+(P.seed||0)+"|"+th+"|"+tk+"|"+q;
  const poly=cachePoly(key,()=>{const pl=polygonize(F.f,[-.115,-.13,-.135],[.115,.2,.13],h,{levels:3,lip:1.3,seedS:3});
    const hc=lin(P.hairC||0x17130f);
    paint(pl,(x,y,z)=>{const a=Math.atan2(x,z+.04);const st=.92+.045*Math.sin(a*150+N2(x*60,y*30,z*60)*3)+.025*N1(x*120,y*120,z*120);const grey=P.hairGrey||0;
      // 白髪はこめかみと鬢から混じる細い筋として（まだらにしない）
      let c=mulc(hc,st);if(grey>0){const temple=sstep(.035,.075,ab(x))*sstep(-.06,.02,z);const streak=sstep(.55,.95,Math.sin(a*170+N2(x*50,y*25,z*50)*4)*.5+.5);
        c=mixc(c,lin(0xb0aaa2),streak*grey*(.35+.65*temple));}return c;},null,0);
    return pl;});
  const m=new THREE.Mesh(R.add(toGeom(poly)),R.add(new THREE.MeshStandardMaterial({vertexColors:true,roughness:P.hairGloss!=null?1-P.hairGloss:.5,metalness:0})));
  m.castShadow=true;m.receiveShadow=true;return m;}

/** 片手の多角形（関節は曲げた形で彫る）。side "R"|"L"。pose は HANDP のキー */
function handMesh(R,pose,side,P,q){
  const hp=HANDP[pose]||HANDP.relax;const hs=handSDF(hp,{});let F=hs.F;if(side==="L")F=mirrorX(F);
  const h=q==="low"?.0042:q==="medium"?.0032:.0025;
  const poly=buildPart(F,[-.07,-.08,-.06],[.07,.20,.07],h,null,null,F.f,.004,1.1,skinPainter(P||{},"hand",hs.hd),{key:"hand|"+pose+"|"+side+"|"+(P&&P.skin||0)});
  return meshOf(R,poly,skinMat(R,{rough:.6}));}
return {buildHead,handMesh,hairMesh,handSDF,HANDP,polygonize,bakeAO,paint,toGeom,Res,lin,mixc,mulc,canvasTex,skinMat,mirrorX,meshOf,buildPart,
  mulberry32,makeNoise,N1,N2,GEO_CACHE,headSDF,HEADT,sSphere,sEll,sCap,sCone,sTube,U,S,K,D};
})();
if (typeof window !== "undefined") window.KM_FIGKIT = KM_FIGKIT;

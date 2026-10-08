// GLSL for the 3D garden. One shared prelude gives every layer the same growth, wither, wind and
// pointer behaviour (technique after example-1's moss/blossom generator). All shaders output LINEAR
// colour; the final post pass encodes sRGB. Everything rendered is premultiplied alpha.

export const PRELUDE = /* glsl */`
uniform float uTime;
uniform float uBirth;
uniform float uDeath;
uniform float uDeathDur;
uniform float uDeathStagger;
uniform float uFadeMode;
uniform float uGrowDur;
uniform float uDelayScale;
uniform float uWind;
uniform float uBreath;
uniform vec3 uPointer;
uniform float uPointerStrength;
uniform float uPointerRadius;
uniform vec3 uLightDir;
uniform vec3 uGravity;    // unit "down" in the screen plane: (0,-1,0) upright, follows the phone's tilt on touch devices
uniform float uHang;      // 0 → 1 once the phone's sensors are on: leaves hang and branches sag towards uGravity
uniform float uShake;   // 0..1, a phone shake that decays: plants rattle fast, independent of the wind
varying float vFade;

vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float easeOutBack(float a){ float c1=1.70158; float c3=c1+1.0; float b=a-1.0; return 1.0+c3*b*b*b+c1*b*b; }
// 0 → 1 with a small overshoot, staggered outward from the glyph centre by the instance's delay
float growth(float delay){ return easeOutBack(clamp((uTime-uBirth-delay*uDelayScale)/uGrowDur,0.0,1.0)); }
float deathT(float delay){ return clamp((uTime-uDeath-delay*0.15*uDeathStagger)/uDeathDur,0.0,1.0); }
// backspace: outer instances shrink first · clear/fade: everything eases a little and dissolves
float survival(float delay){ float d=deathT(delay); return uFadeMode>0.5 ? 1.0-0.12*d : 1.0-d*d; }
float fadeAlpha(float delay){ return uFadeMode>0.5 ? 1.0-smoothstep(0.0,1.0,deathT(delay)) : 1.0; }
// rolling breeze, correlated in space so gusts travel across the letters as waves
vec3 windSway(vec3 w){
  float t=uTime; vec2 p=w.xy*1.3;
  float nx=snoise(vec3(p+vec2(-t*0.55,0.0),t*0.22));
  float ny=snoise(vec3(p+vec2(13.7,-t*0.35),t*0.22+9.1));
  float gust=pow(0.5+0.5*sin(t*0.8-w.x*0.9),10.0)*(0.6+0.4*sin(t*0.13));
  vec3 rattle=vec3(sin(t*31.0+w.x*7.0+w.y*3.0),cos(t*27.0+w.y*6.0-w.x*2.0),0.0)*uShake*1.8;
  return vec3(nx+0.35+gust*1.6,ny*0.8,0.0)*uWind+rattle;
}
// click pulse: a ring that expands from the click point and pushes everything outward as it passes
uniform vec4 uPulse; // xy world centre, z start time, w strength
uniform float uPulseK; // world units per em (ring speed / width follow the text scale)
vec2 pulsePush(vec3 w){
  float age=uTime-uPulse.z;
  if(age<0.0||age>2.5||uPulse.w<=0.0) return vec2(0.0);
  vec2 d=w.xy-uPulse.xy; float dist=length(d), R=age*3.2*uPulseK, wd=0.35*uPulseK;
  float wave=exp(-pow((dist-R)/wd,2.0))*exp(-age*1.6)*uPulse.w;
  return d/(dist+1e-4)*wave;
}
// plants lean away from the pointer (negative strength = lean towards it, used by "Reach") + the click pulse
vec2 pointerPush(vec3 w){
  vec2 d=w.xy-uPointer.xy; float r=uPointerRadius;
  float f=uPointerStrength*exp(-dot(d,d)/(r*r));
  return normalize(d+vec2(1e-4))*f+pulsePush(w);
}
mat3 basisFromNormal(vec3 n){
  vec3 up=abs(n.y)<0.98?vec3(0.0,1.0,0.0):vec3(1.0,0.0,0.0);
  vec3 t=normalize(cross(up,n)); vec3 b=cross(n,t);
  return mat3(t,n,b);
}
float wrapLight(vec3 n){ return clamp((dot(normalize(n),uLightDir)+0.55)/1.55,0.0,1.0); }
`;

const FRAG_HEAD = /* glsl */`
varying float vFade;
float ign(vec2 p){ return fract(52.9829189*fract(dot(p,vec2(0.06711056,0.00583715)))); }
`;
const DISSOLVE = `if(vFade<1.0 && vFade<=ign(gl_FragCoord.xy)) discard;`;

// ---- stems: shared by stems, flower heads, attached leaves and cards ----
const STEM = /* glsl */`
attribute vec3 iPos;
attribute vec3 iDir;
attribute vec4 iStem; // x len, y droop, z bend, w seed
attribute vec4 iOwn;  // x size, y roll, z delay, w seed
attribute vec2 iU;    // x position along the stem, y side
attribute vec3 iColA;
attribute vec3 iColB;
attribute vec3 iColC;

float stemGrowth(){ return growth(iOwn.z)*survival(iOwn.z*0.2); }
vec3 stemSway(){
  vec4 world=modelMatrix*vec4(iPos,1.0);
  float t=uTime;
  vec3 s=windSway(world.xyz)*0.75;
  s.xy+=vec2(sin(t*0.9+iStem.w*31.0),cos(t*0.7+iStem.w*17.0))*0.18*uWind;
  s.xy+=pointerPush(world.xyz)*1.6;
  return s;
}
vec3 stemPoint(float h, float gs, vec3 sway){
  float len=iStem.x*gs;
  vec3 d=normalize(iDir);
  vec3 side=abs(d.z)<0.98?normalize(cross(d,vec3(0.0,0.0,1.0))):vec3(1.0,0.0,0.0);
  vec3 p=iPos+d*len*h;
  p+=uGravity*(iStem.y+uHang*0.18)*len*h*h;
  p+=side*iStem.z*len*sin(h*3.14159)*0.35;
  return p+sway*h*h*len*0.55;
}
vec3 stemTangent(float h, float gs, vec3 sway){
  return normalize(stemPoint(min(h+0.03,1.0),gs,sway)-stemPoint(max(h-0.03,0.0),gs,sway)+vec3(0.0,1e-5,0.0));
}
`;

export const stemVert = PRELUDE + STEM + /* glsl */`
varying float vH; varying float vLight; varying vec3 vA; varying vec3 vB;
void main(){
  float gs=stemGrowth();
  vFade=fadeAlpha(iOwn.z*0.2);
  vec3 sway=stemSway();
  float h=position.y;
  vec3 c=stemPoint(h,gs,sway);
  mat3 B=basisFromNormal(stemTangent(h,gs,sway));
  float r=iOwn.x*(1.0-0.45*h)*min(gs*1.5,1.0);
  vec3 local=c+B*vec3(position.x,0.0,position.z)*r;
  gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(local,1.0);
  vLight=wrapLight(B*vec3(position.x,0.0,position.z)+vec3(0.0,0.0,0.4));
  vH=h; vA=iColA; vB=iColB;
}`;
export const stemFrag = FRAG_HEAD + /* glsl */`
varying float vH; varying float vLight; varying vec3 vA; varying vec3 vB;
void main(){ ${DISSOLVE}
  vec3 col=mix(vA,vB,smoothstep(0.0,0.6,vH));
  gl_FragColor=vec4(col*(0.5+0.75*vLight),1.0);
}`;

export const flowerVert = PRELUDE + STEM + /* glsl */`
attribute float aR; attribute float aCenter;
varying float vR; varying float vCenter; varying float vLight; varying float vJit; varying vec3 vA; varying vec3 vB; varying vec3 vC;
void main(){
  float gs=stemGrowth();
  float gh=easeOutBack(clamp((uTime-uBirth-iOwn.z*uDelayScale-uGrowDur*0.25)/(uGrowDur*0.9),0.0,1.0))*survival(0.0);
  vFade=fadeAlpha(0.0);
  vec3 sway=stemSway();
  vec3 tip=stemPoint(1.0,gs,sway);
  vec3 face=normalize(stemTangent(1.0,gs,sway)*0.55+vec3(0.0,0.0,0.85)+sway*0.35);
  mat3 B=basisFromNormal(face);
  vec3 p=position;
  float c=cos(iOwn.y), s=sin(iOwn.y); p.xz=mat2(c,-s,s,c)*p.xz;
  float open=1.0+0.09*sin(uTime*0.55+iOwn.w*29.0)*(0.4+uBreath);
  p.xz*=mix(1.0,open,aR);
  p.y+=aR*aR*0.3*(1.25-open);
  p*=iOwn.x*gh;
  gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(tip+B*p,1.0);
  vLight=wrapLight(face); vR=aR; vCenter=aCenter; vJit=fract(iOwn.w*7.31);
  vA=iColA; vB=iColB; vC=iColC;
}`;
export const flowerFrag = FRAG_HEAD + /* glsl */`
varying float vR; varying float vCenter; varying float vLight; varying float vJit; varying vec3 vA; varying vec3 vB; varying vec3 vC;
void main(){ ${DISSOLVE}
  vec3 petal=mix(vA,vB,smoothstep(0.15,1.0,vR)*(0.6+0.4*vJit));
  vec3 col=mix(petal,vC,step(0.5,vCenter));
  gl_FragColor=vec4(col*(0.7+0.4*vLight),1.0);
}`;

// base point + direction for anything that may hang off a stem (leaves, cards)
const ATTACH = /* glsl */`
void attach(out vec3 base, out vec3 dir, out float g){
  vec3 sway=stemSway();
  if(iStem.x>0.0){
    float gs=stemGrowth();
    base=stemPoint(iU.x,gs,sway);
    vec3 T=stemTangent(iU.x,gs,sway);
    vec3 side=normalize(cross(T,vec3(0.0,0.0,1.0))+vec3(1e-4,0.0,0.0));
    dir=normalize(T*0.6+side*iU.y+vec3(0.0,0.0,0.15));
    g=growth(iOwn.z)*survival(iOwn.z)*step(iU.x,gs+0.02);
  } else {
    base=iPos; dir=normalize(iDir);
    g=growth(iOwn.z)*survival(iOwn.z);
  }
  dir=normalize(dir+uGravity*uHang*(iStem.x>0.0 ? 1.6 : 0.45)); // leaves on stems hang towards gravity; ones on the surface only lean
}
`;

export const leafVert = PRELUDE + STEM + ATTACH + /* glsl */`
varying float vMid; varying float vLight; varying float vH; varying vec3 vA; varying vec3 vB;
void main(){
  vec3 base, d; float g; attach(base,d,g);
  vFade=fadeAlpha(iOwn.z);
  vec4 world=modelMatrix*vec4(base,1.0);
  vec3 side=normalize(abs(d.z)<0.98?cross(d,vec3(0.0,0.0,1.0)):vec3(1.0,0.0,0.0));
  float c=cos(iOwn.y), s=sin(iOwn.y);
  vec3 n=cross(side,d); side=side*c+n*s; n=cross(side,d);
  vec3 p=position;
  float curl=p.x*p.x*1.2-p.y*0.12;
  vec3 sway=windSway(world.xyz)*0.6+vec3(pointerPush(world.xyz)*1.4,0.0);
  float br=1.0+0.06*uBreath*sin(uTime*0.6+iOwn.w*31.0);
  vec3 local=base+(d*p.y+side*p.x+n*curl)*iOwn.x*g*br+sway*p.y*p.y*iOwn.x*0.45*g;
  gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(local,1.0);
  vLight=wrapLight(n+vec3(0.0,0.0,0.5)); vMid=abs(p.x); vH=p.y; vA=iColA; vB=iColB;
}`;
export const leafFrag = FRAG_HEAD + /* glsl */`
varying float vMid; varying float vLight; varying float vH; varying vec3 vA; varying vec3 vB;
void main(){ ${DISSOLVE}
  vec3 col=vA*(0.75+0.35*vH);
  col=mix(col,vB,(1.0-smoothstep(0.0,0.03,vMid))*0.7);
  gl_FragColor=vec4(col*(0.5+0.8*vLight),1.0);
}`;

// species cards: atlas sprites that mostly face the camera, tilt with wind, bob when they are critters
export const cardVert = PRELUDE + STEM + ATTACH + /* glsl */`
attribute vec4 iAtlas; attribute float iMode; // 0 centred bloom · 1 leaf (pivot at stem) · 2 critter (walks/hovers)
varying vec2 vUv; varying float vLight;
void main(){
  vec3 base, d; float g; attach(base,d,g);
  vFade=fadeAlpha(iOwn.z);
  vec4 world=modelMatrix*vec4(base,1.0);
  vec2 push=pointerPush(world.xyz);
  vec3 sway=windSway(world.xyz)*0.5+vec3(push,0.0);
  float rot=iOwn.y+sway.x*0.35;
  if(iMode>0.5 && iMode<1.5) rot=atan(d.y,d.x)-1.5708+sway.x*0.25;
  vec2 R=vec2(cos(rot),sin(rot)), U=vec2(-sin(rot),cos(rot));
  vec3 p=position;
  if(iMode>0.5 && iMode<1.5) p.y+=0.5;
  float sz=iOwn.x*g*(1.0+0.04*uBreath*sin(uTime*1.1+iOwn.w*20.0));
  vec3 off=vec3(R*p.x*sz+U*p.y*sz,0.02);
  if(iMode>1.5){ // critters: slow walk loop + hover for flyers
    float t=uTime*0.35+iOwn.w*40.0;
    off.xy+=vec2(sin(t),sin(t*1.3))*iOwn.x*0.35;
    off.z+=0.06*iOwn.x*(1.0+sin(uTime*2.0+iOwn.w*9.0));
  }
  vec3 local=base+off+sway*0.15*iOwn.x*(p.y+0.5);
  gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(local,1.0);
  vUv=iAtlas.xy+uv*iAtlas.zw; vLight=0.92+0.08*sin(uTime*0.7+iOwn.w*13.0);
}`;
export const cardFrag = FRAG_HEAD + /* glsl */`
uniform sampler2D uAtlas;
varying vec2 vUv; varying float vLight;
void main(){ ${DISSOLVE}
  vec4 t=texture2D(uAtlas,vUv);
  float a=clamp((t.a-0.5)/max(fwidth(t.a),1e-4)+0.5,0.0,1.0);
  if(a<0.01) discard;
  gl_FragColor=vec4(t.rgb/max(t.a,1e-3)*vLight*a,a);
}`;

// moss: instanced tufts standing on the surface normal
export const mossVert = PRELUDE + /* glsl */`
uniform float uHeight; uniform float uShimmer;
attribute float aH;
attribute vec3 iPos; attribute vec3 iNormal; attribute vec4 iData; // x scale, y rot, z delay, w seed
attribute vec3 iColA; attribute vec3 iColB; attribute vec3 iColC;
varying float vH; varying float vLight; varying float vJit; varying vec3 vA; varying vec3 vB; varying vec3 vC;
void main(){
  float g=growth(iData.z)*survival(iData.z);
  vFade=fadeAlpha(iData.z);
  float seed=iData.w;
  float breath=1.0+0.035*uBreath*sin(uTime*1.15+seed*43.0);
  vec3 p=position;
  float c=cos(iData.y), s=sin(iData.y); p.xz=mat2(c,-s,s,c)*p.xz;
  p*=iData.x*g*breath; p.y*=uHeight;
  mat3 B=basisFromNormal(normalize(iNormal));
  vec3 local=iPos+B*p;
  vec4 world=modelMatrix*vec4(iPos,1.0);
  float hh=aH*aH;
  local+=windSway(world.xyz)*hh*iData.x*0.45*uHeight*g;
  local.xy+=pointerPush(world.xyz)*hh*iData.x*1.2*g;
  gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(local,1.0);
  float shimmer=1.0+uShimmer*snoise(vec3(world.xy*0.8,uTime*0.12));
  vLight=wrapLight(iNormal+B*normalize(position+vec3(0.0,0.01,0.0))*0.6)*shimmer;
  vH=aH; vJit=fract(seed*13.37); vA=iColA; vB=iColB; vC=iColC;
}`;
export const mossFrag = FRAG_HEAD + /* glsl */`
uniform float uGlow;
varying float vH; varying float vLight; varying float vJit; varying vec3 vA; varying vec3 vB; varying vec3 vC;
void main(){ ${DISSOLVE}
  vec3 col=mix(vA,vB,smoothstep(0.0,0.6,vH));
  col=mix(col,vC,smoothstep(0.5,1.0,vH)*(0.55+0.45*vJit));
  col*=0.82+0.36*vJit;
  float ao=mix(0.42,1.0,smoothstep(0.0,0.8,vH));
  vec3 lit=col*ao*(0.42+0.95*vLight);
  lit+=vC*(0.12+uGlow*0.9*vJit)*smoothstep(0.7,1.0,vH);
  gl_FragColor=vec4(lit,1.0);
}`;

// letter body: pops in on birth, shrinks/dissolves with the glyph
// letter body. Two reveals:
//  pop      → scales in with a small overshoot at uBirth
//  dissolve → the letter condenses where the formation particles land: a speckled noise threshold sweeps
//             from 0 → 1 over the second half of the formation, with a glowing edge in the particle colour
export const bodyVert = PRELUDE + /* glsl */`
uniform float uForm; uniform float uFormDur; uniform float uReveal;
varying vec3 vN; varying vec3 vLocal; varying float vReveal;
void main(){
  float a=clamp((uTime-uBirth)/0.35,0.0,1.0);
  float s=(uReveal>0.5 ? step(0.0,uTime-uForm) : easeOutBack(a))*(1.0-0.08*deathT(0.0));
  vReveal=uReveal>0.5 ? clamp((uTime-uForm-uFormDur*0.4)/(uFormDur*0.7),0.0,1.0) : 1.0;
  vFade=uFadeMode>0.5 ? fadeAlpha(0.0) : 1.0-deathT(0.0);
  vN=normalize(normalMatrix*normal);
  vLocal=position;
  vec3 p=position; p.xy*=s;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
}`;
export const bodyFrag = FRAG_HEAD + /* glsl */`
uniform vec3 uColor; uniform vec3 uSide; uniform vec3 uGlowCol;
uniform float uWood; uniform vec3 uWoodA; uniform vec3 uWoodB; uniform vec3 uLichen; uniform vec4 uGrain; // grain: seed in w
uniform sampler2D uBark; uniform vec3 uBarkBox; // bark map (see geometry.js barkMap) + its glyph-space box (x0, y0, size)
uniform vec3 uLightDir;
varying vec3 vN; varying vec3 vLocal; varying float vReveal;
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
// bark: furrows run along each stroke (from the bark map), the face is shaded as a rounded limb, the
// furrows are bump-lit and darkened, lichen grows in patches
vec3 bark(vec3 n){
  vec4 T=texture2D(uBark,(vLocal.xy-uBarkBox.xy)/uBarkBox.z);
  float th=atan(T.a*2.0-1.0,T.b*2.0-1.0)*0.5; vec2 dir=vec2(cos(th),sin(th));
  vec2 q=vec2(dot(vLocal.xy,vec2(-dir.y,dir.x)),dot(vLocal.xy,dir));
  float fine=vn(q*vec2(150.0,22.0)+uGrain.w), h=T.r*0.85+fine*0.15;
  float px=length(dFdx(vLocal.xy))+length(dFdy(vLocal.xy))+1e-6;
  vec2 gh=vec2(dFdx(h),dFdy(h))/px, gd=vec2(dFdx(T.g),dFdy(T.g))/px;
  if(n.z>0.6){ // rounded limb: lean the normal out towards the nearest edge, more the closer it is
    float dn=clamp(T.g/0.45,0.0,1.0);
    n=normalize(vec3(-normalize(gd+1e-5)*(1.0-dn)*1.4,0.3+dn));
  }
  n=normalize(n+vec3(-gh*0.0035,0.0));
  float ridge=smoothstep(0.3,0.5,h)*(0.75+0.25*smoothstep(0.55,0.8,h)), L=max(dot(n,uLightDir),0.0); // plates, cracked by dark furrows
  vec3 c=mix(uWoodB,uWoodA,ridge)*(0.85+0.3*fine);
  float lichen=smoothstep(0.78,0.86,vn(vLocal.xy*6.0+uGrain.w*3.1))*smoothstep(0.45,0.7,vn(vLocal.xy*60.0+uGrain.w))*ridge;
  c=mix(c,uLichen,lichen*0.6);
  return c*mix(0.4,1.0,ridge)*(0.3+0.95*L);
}
void main(){ ${DISSOLVE}
  vec3 n=normalize(vN);
  vec3 col=n.z>0.6 ? uColor : uSide*(0.7+0.3*abs(n.x));
  if(uWood>0.5) col=bark(n);
  if(vReveal<1.0){
    // fine speckle (single landed particles) over soft clumps (where many have gathered)
    float k=vn(vLocal.xy*16.0)*0.5+vn(vLocal.xy*70.0)*0.2+h21(floor(vLocal.xy*320.0))*0.3;
    if(k>vReveal*1.08) discard;
    float edge=1.0-smoothstep(0.0,0.12,vReveal*1.08-k);
    col=mix(col,uGlowCol,edge*0.85);
  }
  gl_FragColor=vec4(col,1.0);
}`;

// falling petals: analytic in age — drift with the breeze, flutter, tumble, a little gravity
export const petalVert = /* glsl */`
uniform float uTime; uniform float uWind; uniform vec3 uGravity;
attribute vec3 iSpawn; attribute vec3 iVel; attribute vec4 iLife; attribute vec3 iCol;
varying vec3 vCol; varying float vShade; varying float vA;
mat3 rotAxis(vec3 a, float t){
  a=normalize(a); float c=cos(t), s=sin(t), ic=1.0-c;
  return mat3(c+a.x*a.x*ic, a.y*a.x*ic+a.z*s, a.z*a.x*ic-a.y*s,
              a.x*a.y*ic-a.z*s, c+a.y*a.y*ic, a.z*a.y*ic+a.x*s,
              a.x*a.z*ic+a.y*s, a.y*a.z*ic-a.x*s, c+a.z*a.z*ic);
}
void main(){
  float age=uTime-iLife.x, life=iLife.y, t=clamp(age/life,0.0,1.0), seed=iLife.w;
  float alive=step(0.0,age)*step(age,life);
  vec3 p=iSpawn+iVel*age;
  p.x+=uWind*0.12*age*age;
  p+=uGravity*0.07*age*age*min(age,1.0); // falls along gravity (straight down when upright)
  p+=vec3(sin(age*3.1+seed*40.0)*0.05, cos(age*2.3+seed*23.0)*0.04, sin(age*1.7+seed*9.0)*0.05)*min(age,1.0);
  mat3 R=rotAxis(vec3(fract(seed*7.1)-0.5,fract(seed*3.3)-0.5,0.4), age*(1.5+seed*3.0)+seed*6.28);
  float s=iLife.z*smoothstep(0.0,0.12,t)*(1.0-smoothstep(0.7,1.0,t))*alive;
  gl_Position=projectionMatrix*viewMatrix*vec4(p+R*(position*s),1.0);
  vec3 n=R*vec3(0.0,0.0,1.0);
  vShade=0.7+0.3*abs(n.z)+0.15*position.x; vCol=iCol; vA=alive;
}`;
export const petalFrag = /* glsl */`
varying vec3 vCol; varying float vShade; varying float vA;
void main(){ if(vA<0.5) discard; gl_FragColor=vec4(vCol*vShade,1.0); }`;

// pollen / spores: soft bokeh points rising slowly, defocused away from the focus plane
export const sporeVert = /* glsl */`
uniform float uTime; uniform float uPixelRatio; uniform vec3 uBox; uniform float uFocus;
attribute vec4 aSeed;
varying float vAlpha; varying float vBlur;
void main(){
  float t=uTime; vec3 p=(aSeed.xyz-0.5)*uBox;
  float speed=0.05+aSeed.w*0.08;
  p.y=mod(p.y+uBox.y*0.5+t*speed,uBox.y)-uBox.y*0.5;
  p.x+=sin(t*0.4+aSeed.w*30.0)*0.15; p.z+=cos(t*0.3+aSeed.y*20.0)*0.1;
  vec4 mv=viewMatrix*vec4(p,1.0);
  gl_Position=projectionMatrix*mv;
  float dist=-mv.z, blur=clamp(abs(dist-uFocus)*0.25,0.0,1.0);
  gl_PointSize=uPixelRatio*(2.0+blur*14.0+aSeed.w*2.0)*(10.0/dist);
  float edge=smoothstep(0.5,0.35,abs(p.y/uBox.y));
  vAlpha=edge*(0.9-blur*0.65)*(0.5+0.5*sin(t*1.7+aSeed.x*50.0)); vBlur=blur;
}`;
export const sporeFrag = /* glsl */`
uniform vec3 uColor; uniform float uAmount;
varying float vAlpha; varying float vBlur;
void main(){
  float d=length(gl_PointCoord-0.5)*2.0, soft=mix(0.15,0.95,vBlur);
  float a=(1.0-smoothstep(1.0-soft,1.0,d))*vAlpha*uAmount;
  gl_FragColor=vec4(uColor*a,a);
}`;

// ---- post ----
export const fullVert = /* glsl */`varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`;
// separable tilt-shift blur on premultiplied colour; focus band is in FULL-image space so print tiles match the preview
export const tiltFrag = /* glsl */`
uniform sampler2D tDiffuse; uniform vec2 uDir; uniform vec2 uTexel; uniform float uAmount;
uniform float uFocusCenter; uniform float uFocusBand; uniform vec2 uFull; uniform vec2 uOrigin;
varying vec2 vUv;
void main(){
  float y=(uOrigin.y+gl_FragCoord.y)/uFull.y;
  float d=max(abs(y-uFocusCenter)-uFocusBand,0.0);
  float px=uAmount*smoothstep(0.0,0.35,d);
  if(px<0.3){ gl_FragColor=texture2D(tDiffuse,vUv); return; }
  vec4 acc=vec4(0.0); float wsum=0.0;
  for(int i=-6;i<=6;i++){ float f=float(i)/6.0; float w=exp(-f*f*2.5); acc+=texture2D(tDiffuse,vUv+uDir*uTexel*f*px)*w; wsum+=w; }
  gl_FragColor=acc/wsum;
}`;
export const outFrag = /* glsl */`
uniform sampler2D tDiffuse; varying vec2 vUv;
vec3 enc(vec3 c){ return mix(c*12.92, 1.055*pow(max(c,0.0),vec3(1.0/2.4))-0.055, step(0.0031308,c)); }
void main(){ vec4 c=texture2D(tDiffuse,vUv); vec3 rgb=c.a>0.0?c.rgb/c.a:vec3(0.0); gl_FragColor=vec4(enc(rgb)*c.a,c.a); }`;

// letter formation: particles pulled out of the background blobs swirl in and settle on the glyph
// face; they fade as the letter body pops in and the flora starts growing (uBirth = uForm + uFormDur)
export const formVert = /* glsl */`
uniform float uTime; uniform float uForm; uniform float uFormDur; uniform float uPixelRatio; uniform float uReveal;
attribute vec3 aFrom; attribute vec4 aSeed; attribute vec3 aCol; // seed: x delay, y size(px), z swirl, w phase
varying vec3 vCol; varying float vAlpha; varying float vGlow;
void main(){
  float tt=uTime-uForm, d=aSeed.x*0.35*uFormDur;
  float t=clamp((tt-d)/(uFormDur*0.7),0.0,1.0);
  float e=t<0.5 ? 4.0*t*t*t : 1.0-pow(-2.0*t+2.0,3.0)/2.0;
  vec3 p=mix(aFrom,position,e);
  float sw=(1.0-e)*e*4.0;
  p.x+=sin(t*6.2832+aSeed.w)*0.28*sw*aSeed.z;
  p.y+=cos(t*5.0+aSeed.w*1.3)*0.28*sw*aSeed.z;
  p.z+=sw*0.35;
  vec4 mv=modelViewMatrix*vec4(p,1.0);
  gl_Position=projectionMatrix*mv;
  gl_PointSize=uPixelRatio*aSeed.y*(1.0+1.6*(1.0-e))*(10.0/-mv.z);
  float fadeOut=uReveal>0.5 ? 1.0-smoothstep(uFormDur*0.55,uFormDur*1.15,tt) : 1.0-smoothstep(uFormDur,uFormDur+0.6,tt);
  vAlpha=step(0.0,tt-d)*smoothstep(0.0,0.12,t)*fadeOut;
  vCol=aCol; vGlow=1.0-e;
}`;
export const formFrag = /* glsl */`
varying vec3 vCol; varying float vAlpha; varying float vGlow;
void main(){
  float d=length(gl_PointCoord-0.5)*2.0;
  float a=(1.0-smoothstep(0.35,1.0,d))*vAlpha;
  if(a<0.004) discard;
  gl_FragColor=vec4(vCol*(1.0+0.6*vGlow)*a,a);
}`;

// caterpillars crawl round a small ellipse on the letter face: the head moves in pulses and a hump
// travels from tail to head on each pulse (inchworm-ish); body segments trail the head along the path
export const caterVert = PRELUDE + /* glsl */`
attribute float aSeg;
attribute vec3 iPos; attribute vec3 iDir; attribute vec4 iStem; attribute vec4 iOwn; // iStem: x semi-major, y semi-minor, z pace, w direction · iOwn: x radius, y phase, z delay, w seed
attribute vec3 iColA; attribute vec3 iColB; attribute vec3 iColC;
varying vec3 vNrm; varying float vSeg; varying vec3 vA; varying vec3 vB; varying vec3 vC;
const float SEGS=8.0; // geometry.js CATER_SEGS
vec2 path(float ph){ vec2 d=normalize(iDir.xy), n=vec2(-d.y,d.x); return d*iStem.x*cos(ph)+n*iStem.y*sin(ph); }
void main(){
  float g=growth(iOwn.z)*survival(iOwn.z);
  vFade=fadeAlpha(iOwn.z);
  float r=iOwn.x, peri=3.1416*(iStem.x+iStem.y), tt=uTime*iStem.z+iOwn.w*7.0;
  float head=iOwn.y+iStem.w*(tt-sin(6.2832*tt)/6.2832)*r*2.2/peri*6.2832;
  float k=aSeg, ph=head-iStem.w*k*r*1.15/peri*6.2832;
  vec2 c=path(ph), t=normalize(path(ph+0.01*iStem.w)-c);
  float lift=max(0.0,sin(6.2832*tt+k*0.7))*r*0.9*smoothstep(0.0,2.0,k)*(1.0-k/SEGS*0.5);
  float rk=r*(k<0.5 ? 1.08 : 1.0-0.35*smoothstep(SEGS*0.55,SEGS-1.0,k))*g;
  vec3 p=position; vec2 side=vec2(-t.y,t.x);
  vec3 off=vec3(t*p.x*1.25+side*p.y,p.z*0.9)*rk;
  vec3 local=iPos+vec3(c,rk+lift)+off;
  gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(local,1.0);
  vNrm=normalize(vec3(t*p.x+side*p.y,p.z)); vSeg=k; vA=iColA; vB=iColB; vC=iColC;
}`;
export const caterFrag = FRAG_HEAD + /* glsl */`
uniform vec3 uLightDir;
varying vec3 vNrm; varying float vSeg; varying vec3 vA; varying vec3 vB; varying vec3 vC;
void main(){ ${DISSOLVE}
  vec3 n=normalize(vNrm);
  vec3 col=vSeg<0.5 ? vC : mix(vA,vB,step(0.5,fract(vSeg*0.5)));
  col=mix(col,vec3(1.0,0.95,0.8),smoothstep(0.75,0.95,n.z)*step(0.5,vSeg)*0.35*step(0.5,fract(vSeg*0.5+0.5))); // pale dorsal dots
  float L=max(dot(n,uLightDir),0.0), rim=pow(1.0-abs(n.z),3.0);
  gl_FragColor=vec4(col*(0.35+0.85*L)+col*rim*0.25,1.0);
}`;

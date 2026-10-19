'use strict';
const $ = id => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d');
const config = window.CANVAS_CONFIG;
const palette = ['#292b36','#ed6549','#f1ba49','#659d80','#608dc2','#a080bf','#ffffff'];
let view = {x:0,y:0,z:1}, tool = 'pen', color = palette[0], width = 4;
let strokes = new Map(), pending = new Map(), current = null, space = false;
let pointers = new Map(), gesture = null, drawingPointer = null;
let W = innerWidth, H = innerHeight, busy = false, sending = false, revision = 0, toastTimer;
const bound = n => Math.max(-999000000, Math.min(999000000,n));
const point = (x,y) => [bound(view.x+(x-W/2)/view.z),bound(view.y+(y-H/2)/view.z)];
try {for (const s of JSON.parse(localStorage.getItem('unknown-canvas-outbox') || '[]')) pending.set(s.id,s);} catch {}
function stash(){try{localStorage.setItem('unknown-canvas-outbox',JSON.stringify([...pending.values()]));}catch{toast('Device storage is full. Keep this tab open until your marks sync.');}}
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),4000);}
function connection(ok,message){$('dot').className=ok?'live':'';$('status').textContent=message;}
function dismiss(){$('intro').hidden=true;}
function drawStroke(s){
 if(!s.points?.length)return;
 ctx.strokeStyle=s.color;ctx.fillStyle=s.color;ctx.lineWidth=s.width;ctx.lineCap='round';ctx.lineJoin='round';
 ctx.beginPath();ctx.moveTo(...s.points[0]);
 if(s.points.length===1){ctx.arc(...s.points[0],s.width/2,0,Math.PI*2);ctx.fill();}
 else{for(let i=1;i<s.points.length;i++)ctx.lineTo(...s.points[i]);ctx.stroke();}
}
function render(){
 const dpr=Math.min(devicePixelRatio||1,2);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#f6f3ec';ctx.fillRect(0,0,W,H);
 const gap=80*view.z;
 if(gap>15){ctx.fillStyle='#dad7d0';const ox=((W/2-view.x*view.z)%gap+gap)%gap,oy=((H/2-view.y*view.z)%gap+gap)%gap;for(let x=ox;x<W;x+=gap)for(let y=oy;y<H;y+=gap){ctx.beginPath();ctx.arc(x,y,1,0,Math.PI*2);ctx.fill();}}
 ctx.translate(W/2,H/2);ctx.scale(view.z,view.z);ctx.translate(-view.x,-view.y);
 for(const s of strokes.values())drawStroke(s);
 for(const s of pending.values())if(!strokes.has(s.id))drawStroke(s);
 if(current)drawStroke(current);
 $('coords').textContent=`${Math.round(view.x).toLocaleString()}, ${Math.round(view.y).toLocaleString()}`;
 $('zoom').textContent=`${Math.round(view.z*100)}%`;
}
function resize(){W=innerWidth;H=innerHeight;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=W*dpr;canvas.height=H*dpr;render();revision++;}
function hash(){history.replaceState(null,'',`#${Math.round(view.x)},${Math.round(view.y)},${view.z.toFixed(3)}`);}
function readHash(){const v=location.hash.slice(1).split(',').map(Number);if(v.length===3&&v.every(Number.isFinite)&&v[2]>0){view={x:bound(v[0]),y:bound(v[1]),z:Math.max(.08,Math.min(5,v[2]))};dismiss();}revision++;render();}
function selectTool(t){tool=t;for(const id of ['pen','hand']){$(id).classList.toggle('active',id===t);$(id).setAttribute('aria-pressed',String(id===t));}canvas.style.cursor=t==='hand'?'grab':'crosshair';}
function changeZoom(factor,x=W/2,y=H/2){const p=point(x,y);view.z=Math.max(.08,Math.min(5,view.z*factor));view.x=bound(p[0]-(x-W/2)/view.z);view.y=bound(p[1]-(y-H/2)/view.z);revision++;render();hash();}
for(const c of palette){const b=document.createElement('button');b.className='swatch'+(c===color?' active':'');b.style.background=c;b.title=c;b.setAttribute('aria-label',`Brush color ${c}`);b.onclick=()=>{color=c;$('color').value=c;document.querySelectorAll('.swatch').forEach(e=>e.classList.toggle('active',e===b));};$('colors').append(b);}
$('color').oninput=e=>{color=e.target.value;document.querySelectorAll('.swatch').forEach(b=>b.classList.remove('active'));};
$('size').oninput=e=>{width=Number(e.target.value);$('sizeText').textContent=width;};
$('pen').onclick=()=>selectTool('pen');$('hand').onclick=()=>selectTool('hand');$('dismiss').onclick=dismiss;
$('help').onclick=()=>$('dialog').showModal();$('close').onclick=()=>$('dialog').close();
$('plus').onclick=()=>changeZoom(1.3);$('minus').onclick=()=>changeZoom(1/1.3);$('zoom').onclick=()=>changeZoom(1/view.z);
$('home').onclick=()=>{view={x:0,y:0,z:1};revision++;render();hash();sync();};
$('share').onclick=async()=>{hash();try{await navigator.clipboard.writeText(location.href);toast('Spot copied. Send someone into the mystery.');}catch{toast('Copy the page address to share this spot.');}};
$('save').onclick=()=>{const a=document.createElement('a');a.download='unknown-canvas.png';a.href=canvas.toDataURL('image/png');a.click();};
async function api(path,options={}){const r=await fetch(config.url+'/rest/v1/'+path,{...options,headers:{apikey:config.key,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('Canvas service '+r.status);const text=await r.text();return text?JSON.parse(text):null;}
function finish(){if(!current)return;const s=current;current=null;drawingPointer=null;pending.set(s.id,s);stash();render();flush();}
function startStroke(p){current={id:crypto.randomUUID(),color,width,points:[p]};}
canvas.addEventListener('pointerdown',e=>{
 if(e.button!==0&&e.button!==1)return;dismiss();canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pointers.size===2){finish();const [a,b]=[...pointers.values()];gesture={distance:Math.hypot(b.x-a.x,b.y-a.y),mid:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};return;}
 if(tool==='pen'&&!space&&e.button===0){drawingPointer=e.pointerId;startStroke(point(e.clientX,e.clientY));render();}
});
canvas.addEventListener('pointermove',e=>{
 const prev=pointers.get(e.pointerId);if(!prev)return;
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pointers.size>=2){const [a,b]=[...pointers.values()];const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},distance=Math.hypot(b.x-a.x,b.y-a.y);if(gesture){view.x=bound(view.x-(mid.x-gesture.mid.x)/view.z);view.y=bound(view.y-(mid.y-gesture.mid.y)/view.z);changeZoom(distance/Math.max(1,gesture.distance),mid.x,mid.y);}gesture={distance,mid};return;}
 if(current&&drawingPointer===e.pointerId){const p=point(e.clientX,e.clientY),last=current.points.at(-1);if(Math.hypot(p[0]-last[0],p[1]-last[1])*view.z<1)return;current.points.push(p);if(current.points.length>=350){finish();startStroke(p);drawingPointer=e.pointerId;}render();}
 else{view.x=bound(view.x-(e.clientX-prev.x)/view.z);view.y=bound(view.y-(e.clientY-prev.y)/view.z);revision++;render();}
});
function release(e){if(e.pointerId===drawingPointer)finish();pointers.delete(e.pointerId);gesture=null;hash();}
canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',e=>{if(pointers.has(e.pointerId))release(e);});
canvas.addEventListener('wheel',e=>{e.preventDefault();dismiss();changeZoom(Math.exp(-e.deltaY*.0015),e.clientX,e.clientY);},{passive:false});
addEventListener('keydown',e=>{if(e.target.matches('input')||$('dialog').open)return;if(e.code==='Space'){e.preventDefault();space=true;canvas.style.cursor='grab';}if(e.key.toLowerCase()==='b')selectTool('pen');if(e.key.toLowerCase()==='h')selectTool('hand');if(e.key==='0')$('home').click();});
addEventListener('keyup',e=>{if(e.code==='Space'){space=false;selectTool(tool);}});addEventListener('blur',()=>{space=false;finish();pointers.clear();gesture=null;selectTool(tool);});
async function flush(){
 if(sending||!pending.size)return;sending=true;
 try{for(const s of [...pending.values()]){await api('unknown_canvas_strokes?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(s)});strokes.set(s.id,s);pending.delete(s.id);stash();}connection(true,'Shared canvas');}
 catch{connection(false,`${pending.size} marks waiting to sync`);}finally{sending=false;render();}
}
async function sync(){
 if(busy||document.hidden)return;busy=true;const version=revision,margin=100/view.z;
 const x0=view.x-W/2/view.z-margin,x1=view.x+W/2/view.z+margin,y0=view.y-H/2/view.z-margin,y1=view.y+H/2/view.z+margin;
 try{const all=[];let full=false;for(let offset=0;offset<10000;offset+=1000){const q=new URLSearchParams({select:'id,seq,color,width,points',min_x:`lte.${x1+80}`,max_x:`gte.${x0-80}`,min_y:`lte.${y1+80}`,max_y:`gte.${y0-80}`,order:'seq.asc',limit:'1000',offset:String(offset)});const page=await api('unknown_canvas_strokes?'+q);all.push(...page);if(page.length<1000)break;if(offset===9000)full=true;}
 if(version!==revision)return;
 strokes=new Map(all.map(s=>[s.id,s]));if(all.length)dismiss();connection(true,full?'Busy spot · zoom in':'Shared canvas');render();
 }catch{connection(false,pending.size?'Marks saved on this device':'Reconnecting…');}finally{busy=false;}
}
$('wander').onclick=async()=>{dismiss();try{const rows=await api('unknown_canvas_strokes?select=min_x,max_x,min_y,max_y&order=seq.desc&limit=1000');if(rows.length){const s=rows[Math.floor(Math.random()*rows.length)];view={x:(s.min_x+s.max_x)/2,y:(s.min_y+s.max_y)/2,z:1};}else{view={x:Math.round(Math.random()*12000-6000),y:Math.round(Math.random()*12000-6000),z:1};}revision++;render();hash();sync();toast(rows.length?'Someone left a mark here.':'Unclaimed territory. You found it first.');}catch{toast('Cannot wander while disconnected. Try again shortly.');}};
addEventListener('resize',resize);addEventListener('hashchange',()=>{readHash();sync();});addEventListener('online',()=>{flush();sync();});addEventListener('visibilitychange',()=>{if(!document.hidden){flush();sync();}});
resize();readHash();sync();flush();setInterval(()=>{flush();sync();},2500);

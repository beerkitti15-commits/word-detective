const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000,DATA=process.env.DATA_DIR||path.join(__dirname,'data'),FILE=path.join(DATA,'sets.json');
const ADMIN=process.env.ADMIN_PASSWORD||'',KEY=process.env.ANTHROPIC_API_KEY||'',MODEL=process.env.ANTHROPIC_MODEL||'claude-sonnet-5-5';
const SUBJ=['M','S','SS','L'];
fs.mkdirSync(DATA,{recursive:true});
const load=()=>{try{return JSON.parse(fs.readFileSync(FILE,'utf8'))}catch(e){return{sets:[]}}};
const save=d=>{const t=FILE+'.tmp';fs.writeFileSync(t,JSON.stringify(d));fs.renameSync(t,FILE)};
const send=(res,c,o)=>{res.writeHead(c,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(o))};
const body=req=>new Promise((ok,no)=>{let b='';req.on('data',c=>{b+=c;if(b.length>1e6){no(new Error('ข้อมูลใหญ่เกินไป'));req.destroy()}});req.on('end',()=>{try{ok(b?JSON.parse(b):{})}catch(e){no(new Error('JSON ไม่ถูกต้อง'))}})});
const authed=req=>{if(!ADMIN)return false;const a=Buffer.from(String(req.headers['x-admin-password']||'')),b=Buffer.from(ADMIN);return a.length===b.length&&crypto.timingSafeEqual(a,b)};
const shuffle=a=>a.map(x=>[Math.random(),x]).sort((p,q)=>p[0]-q[0]).map(x=>x[1]);
function clean(arr){const seen=new Set(),out=[];for(const x of Array.isArray(arr)?arr:[]){const w=String(x.w||'').trim().toLowerCase(),th=String(x.th||'').trim().slice(0,60),s=String(x.s||'').trim().toUpperCase();if(!/^[a-z][a-z' -]{0,29}$/.test(w)||!th||!SUBJ.includes(s)||seen.has(w))continue;seen.add(w);out.push({w,th,s})}return out.slice(0,300)}
function check(text,words){
 if(typeof text!=='string'||text.length<20)return 'passage ว่างหรือสั้นเกินไป';
 const f=[...text.matchAll(/\[(\d+)\]/g)].map(m=>+m[1]);
 if(f.length!==words.length||f.some((v,i)=>v!==i+1))return `ต้องมีช่องว่าง [1]–[${words.length}] อย่างละ 1 ครั้ง เรียงตามลำดับ`;
 const rest=text.replace(/\[\d+\]/g,' ');
 for(const x of words)if(new RegExp('\\b'+x.w.replace(/[-\/\\^$*+?.()|[\]{}]/g,'\\$&')+'\\b','i').test(rest))return `คำว่า "${x.w}" โผล่ใน passage ทั้งที่ต้องเป็นช่องว่าง`;
 return '';
}
async function claude(system,user){
 if(!KEY)throw new Error('ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY บนเซิร์ฟเวอร์');
 const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':KEY,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:MODEL,max_tokens:3000,system,messages:[{role:'user',content:user}]})});
 const j=await r.json();if(!r.ok)throw new Error((j.error&&j.error.message)||('AI error '+r.status));
 return (j.content||[]).map(c=>c.text||'').join('');
}
async function generate(set){
 const all=set.words;if(all.length<12)throw new Error('ต้องมีคำศัพท์อย่างน้อย 12 คำ (ตอนนี้มี '+all.length+')');
 const sh=shuffle(all),pick=(n,from)=>from.length>=n?from.slice(0,n):shuffle(all).slice(0,n);
 let g1,g2,g3;
 if(all.length>=24){g1=sh.slice(0,12);g2=sh.slice(12,20);g3=sh.slice(20,24)}else{g1=sh.slice(0,12);g2=pick(8,shuffle(all));g3=pick(4,shuffle(all))}
 const fmt=g=>JSON.stringify(g.map((x,i)=>({n:i+1,word:x.w,thai:x.th,subject:{M:'Mathematics',S:'Science',SS:'Social Studies',L:'Language'}[x.s]})));
 const system='You are a fun English teacher writing detective-themed reading passages (Detective Dot vs. a masked thief) for Thai students. Reply with valid JSON only, no markdown.';
 let err='';
 for(let t=0;t<3;t++){
  const user=`Student level: ${set.level||'upper primary (A2)'}.
Write three passages. In each, replace the target words with blanks [1]..[n], in ascending order, each exactly once, in the same numbering as the word list.
Rules: the target word must NOT appear anywhere else in that passage; give clear context clues near each blank (definition, example, related keywords from the word's subject) so a student can deduce the word; use simple short sentences; choose the grammar so the base form of the word fits exactly.
m1 (12 blanks, 12-15 sentences): ${fmt(g1)}
m2 (8 blanks, 8-10 sentences): ${fmt(g2)}
m3 (4 blanks, 4-5 simple sentences): ${fmt(g3)}
${err?'Previous attempt failed: '+err+'. Fix it.\n':''}Return exactly {"m1":"...","m2":"...","m3":"..."}`;
  try{
   const raw=await claude(system,user),j=JSON.parse(raw.slice(raw.indexOf('{'),raw.lastIndexOf('}')+1));
   const pairs=[['m1',g1],['m2',g2],['m3',g3]];
   for(const [k,g] of pairs){const e=check(j[k],g);if(e)throw new Error(k+': '+e)}
   return{m1:{words:g1,text:j.m1.trim()},m2:{words:g2,text:j.m2.trim()},m3:{words:g3,text:j.m3.trim()}};
  }catch(e){err=e.message;if(!KEY||/ANTHROPIC|AI error|api/i.test(err)&&t===2)throw e}
 }
 throw new Error('AI สร้าง passage ไม่ผ่านเงื่อนไข: '+err+' (ลองกดสร้างอีกครั้ง)');
}
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{
 const u=req.url.split('?')[0];
 try{
  if(u.startsWith('/api/')){
   const d=load(),m=req.method;let x;
   if(m==='GET'&&u==='/api/sets')return send(res,200,d.sets.filter(s=>s.content).map(s=>({id:s.id,name:s.name,level:s.level||''})));
   if(m==='GET'&&(x=u.match(/^\/api\/sets\/(\w+)$/))){const s=d.sets.find(s=>s.id===x[1]&&s.content);return s?send(res,200,{id:s.id,name:s.name,content:s.content}):send(res,404,{error:'ไม่พบชุดคำศัพท์'})}
   if(!u.startsWith('/api/admin'))return send(res,404,{error:'not found'});
   if(!ADMIN)return send(res,503,{error:'ยังไม่ได้ตั้งค่า ADMIN_PASSWORD บนเซิร์ฟเวอร์'});
   if(!authed(req))return send(res,401,{error:'รหัสผ่านไม่ถูกต้อง'});
   if(m==='GET'&&u==='/api/admin/ping')return send(res,200,{ok:true,ai:!!KEY,model:MODEL});
   if(m==='GET'&&u==='/api/admin/sets')return send(res,200,d.sets);
   if(m==='POST'&&u==='/api/admin/sets'){const b=await body(req),w=clean(b.words);const s={id:crypto.randomBytes(4).toString('hex'),name:String(b.name||'ชุดใหม่').slice(0,80),level:String(b.level||'').slice(0,40),words:w,content:null,skipped:(b.words||[]).length-w.length,updated:Date.now()};d.sets.push(s);save(d);return send(res,200,s)}
   if(x=u.match(/^\/api\/admin\/sets\/(\w+)(\/generate)?$/)){
    const s=d.sets.find(s=>s.id===x[1]);if(!s)return send(res,404,{error:'ไม่พบชุดคำศัพท์'});
    if(m==='DELETE'){d.sets=d.sets.filter(q=>q!==s);save(d);return send(res,200,{ok:true})}
    if(m==='POST'&&x[2]){s.content=await generate(s);s.updated=Date.now();save(d);return send(res,200,s)}
    if(m==='PUT'){const b=await body(req);
     if(b.words){const w=clean(b.words);if(JSON.stringify(w)!==JSON.stringify(s.words)){s.words=w;s.content=null}s.skipped=b.words.length-w.length}
     if(b.name!==undefined)s.name=String(b.name).slice(0,80);if(b.level!==undefined)s.level=String(b.level).slice(0,40);
     if(b.texts&&s.content){for(const k of['m1','m2','m3']){const e=check(b.texts[k],s.content[k].words);if(e)return send(res,400,{error:k+': '+e});s.content[k].text=b.texts[k].trim()}}
     s.updated=Date.now();save(d);return send(res,200,s)}
   }
   return send(res,404,{error:'not found'});
  }
  let p=u==='/admin'?'/admin.html':(u==='/'||!path.extname(u))?'/index.html':u;
  const f=path.join(__dirname,path.normalize(p).replace(/^(\.\.[\/\\])+/,''));
  if(/(^|[\/\\])(data|server\.js|package\.json)/.test(path.relative(__dirname,f))){res.writeHead(404);return res.end('Not found')}
  fs.readFile(f,(e,b)=>{if(e){res.writeHead(404);return res.end('Not found')}res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});res.end(b)});
 }catch(e){send(res,500,{error:e.message||'server error'})}
}).listen(PORT,'0.0.0.0',()=>console.log('Word Detective on :'+PORT+' | admin '+(ADMIN?'on':'OFF (set ADMIN_PASSWORD)')+' | AI '+(KEY?'on':'OFF (set ANTHROPIC_API_KEY)')));

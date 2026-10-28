// 零依赖构建脚本：读取 content/*-weekly-*.md，生成 dist/。
// 每期仍是一篇周报（type: weekly）。全文按区域拆开：
// p/{slug}-cn.html、p/{slug}-intl.html 各放一组条目和来源。
// p/{slug}.html 只做枢纽，链到这两页，不再同时放下两组全文。
// ## 国内 / ## 国际 的栏目列表仍是 cn.html、intl.html。
// 旧路径 eu.html、jpkr.html 跳转到 intl.html。
import fs from 'node:fs'; import path from 'node:path';
const SRC='content', OUT='dist';
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const TYPE={weekly:'周报',cn:'国内新闻',intl:'国际新闻'};
const REGIONS=[
  {key:'cn', label:'国内新闻', test:/国内/},
  {key:'intl', label:'国际新闻', test:/国际/},
];
const NAV=[{id:'home', href:'index.html', label:'首页'}, ...REGIONS.map(r=>({id:r.key, href:r.key+'.html', label:r.label}))];
const NAME=/^(\d{4}-\d{2}-\d{2})-weekly-(\d{4})\.md$/;
function regionKey(title){const r=REGIONS.find(x=>x.test.test(String(title))); return r?r.key:'';}
function parse(file){
  const nm=file.match(NAME); if(!nm) throw new Error('文件名须为 YYYY-MM-DD-weekly-HHMM.md: '+file);
  const raw=fs.readFileSync(path.join(SRC,file),'utf8');
  const m=raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/); if(!m) throw new Error('缺少 frontmatter: '+file);
  const fm={}; for(const l of m[1].split('\n')){const i=l.indexOf(':'); if(i<0)continue;
    let v=l.slice(i+1).trim(); if(v.startsWith('"')) v=JSON.parse(v); fm[l.slice(0,i).trim()]=v;}
  for(const k of ['date','slot','type','headline','summary']) if(!fm[k]) throw new Error(`${file} 缺少字段 ${k}`);
  if(fm.type!=='weekly') throw new Error(`${file} 的 type 须为 weekly`);
  if(fm.date!==nm[1]) throw new Error(`${file} 的 date 与文件名不一致`);
  if(String(fm.slot)!==nm[2]) throw new Error(`${file} 的 slot 与文件名不一致`);
  fm.items=Number(fm.items||0); fm.slug=file.replace(/\.md$/,''); fm.body=m[2].trim();
  fm.time=fm.time||`${String(fm.slot).slice(0,2)}:${String(fm.slot).slice(2)}`;
  fm.title=fm.title||`工控自动化周报｜${fm.date} ${fm.time}`; return fm;
}
// 按 ## 区域标题切开，再按 ### 拆成条目。空组说明等非区域标题不进栏目页。
function splitSections(body){
  const out=[]; let sec=null, item=null;
  const push=()=>{ if(sec&&item){ sec.chunks.push(item); item=null; } };
  for(const raw of body.split('\n')){
    const line=raw.replace(/\r$/,'');
    const h2=line.match(/^##\s+(.*)$/);
    if(h2){
      push();
      const title=h2[1].trim(), key=regionKey(title);
      sec=key?{key, title, chunks:[]}:null;
      if(sec) out.push(sec);
      else if(!/空组/.test(title)) console.warn('未识别的分组标题，不会进入栏目页: '+title);
      continue;
    }
    if(!sec) continue;
    const h3=line.match(/^###\s+(.*)$/);
    if(h3){ push(); item=[h3[1].trim()]; continue; }
    if(item) item.push(line);
  }
  push();
  return out.map(sec=>({key:sec.key, title:sec.title, items:sec.chunks.map((chunk,i)=>{
    const heading=chunk[0];
    const rawBody=chunk.slice(1).join('\n').trim();
    const num=(heading.match(/^(\d+)\s*[.．、]/)||[])[1]||String(i+1);
    const title=heading.replace(/^\d+\s*[.．、]\s*/,'');
    const paras=rawBody.split('\n').map(s=>s.trim()).filter(Boolean);
    const srcLines=paras.filter(p=>/^(来源|官方博客|仓库|中文报道|转载|路透)[：:]/.test(p)||/^https?:\/\//.test(p));
    const urls=[...rawBody.matchAll(/https?:\/\/[^\s<，。）)]+/g)].map(x=>x[0]);
    let summary=paras.find(p=>!srcLines.includes(p))||'';
    if(summary.length>120) summary=summary.slice(0,120)+'…';
    return {heading, title, summary, src:srcLines.join(' '), urls, id:`${sec.key}-${num}`};
  })}));
}
const linkify=s=>esc(s).replace(/(https?:\/\/[^\s<，。）)]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>');
// only: 只输出该区域全文。hub: 跳过各区域条目，留下导语和空组说明。
function renderBody(t, opt={}){
  let region='', n=0, skip=!!opt.only;
  const html=[];
  for(const raw of t.split(/\n/)){
    const l=raw.trim();
    if(!l) continue;
    const hm=l.match(/^(#{1,3})\s+(.*)$/);
    if(hm && hm[1].length===2){
      const text=hm[2], key=regionKey(text);
      region=key; n=0;
      if(opt.only) skip=key!==opt.only;
      else if(opt.hub) skip=!!key;
      if(skip) continue;
      html.push(key?`<h3 id="${key}" class="sec-${key}">${linkify(text)}</h3>`:`<h3>${linkify(text)}</h3>`);
      continue;
    }
    if(l==='---'){ if(!opt.only && !skip) html.push('<hr>'); continue; }
    if(skip) continue;
    if(hm){
      const text=hm[2];
      if(hm[1].length===3 && region){
        n+=1;
        const num=(text.match(/^(\d+)\s*[.．、]/)||[])[1]||String(n);
        html.push(`<h3 id="${region}-${num}">${linkify(text)}</h3>`);
        continue;
      }
      html.push(`<h3>${linkify(text)}</h3>`);
      continue;
    }
    if(/^(来源|官方博客|仓库|中文报道|转载|路透)[：:]|^https?:\/\//.test(l)){ html.push(`<p class="src">${linkify(l)}</p>`); continue; }
    if(/^【.*】$/.test(l)||/^[一二三四五六七八九十]+、/.test(l)||(l.length<=24&&!/[。；，]/.test(l))){ html.push(`<h3>${linkify(l)}</h3>`); continue; }
    if(l.length<=60&&!/。$/.test(l)&&!/[。]/.test(l)){ html.push(`<h4>${linkify(l)}</h4>`); continue; }
    html.push(`<p>${linkify(l)}</p>`);
  }
  return html.join('\n');
}
const fmtDate=d=>{const [y,m,dd]=d.split('-');return `${y}年${+m}月${+dd}日`};
const fmtMD=d=>{const [,m,dd]=d.split('-');return `${+m}月${+dd}日`;};
const CSS=fs.readFileSync('src/style.css','utf8');
const page=(title,active,inner,root='')=>`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="${root}style.css"></head><body>
<header class="top"><div class="wrap nav"><a class="brand" href="${root}index.html">工控周报</a><nav>
${NAV.map(n=>`<a href="${root}${n.href}"${active===n.id?' class="on"':''}>${n.label}</a>`).join('')}</nav></div></header>
<main class="wrap">${inner}</main><footer class="wrap foot">每周更新（上海时间）约周一 10:00 · 内容由浩存整理</footer></body></html>`;
const card=(p,withDate=false)=>`<a class="card" href="${p.root||''}p/${p.slug}.html"><div class="meta"><span class="tag ${p.type}">${TYPE[p.type]||p.type}</span><span class="when">${withDate?fmtMD(p.date)+' ':''}${p.time}</span></div><h3>${esc(p.headline)}</h3><p>${esc(p.summary)}</p><div class="cf"><span>${p.items} 条</span><span class="read">阅读 →</span></div></a>`;
function grouped(list){const g={};for(const p of list)(g[p.date]??=[]).push(p);
  return Object.keys(g).sort().reverse().map(d=>`<section class="day"><h2 class="dh">${fmtDate(d)}</h2><div class="grid">${g[d].map(p=>card(p,false)).join('')}</div></section>`).join('');}
function heroPoints(body){
  const secs=splitSections(body), picked=[];
  for(const r of REGIONS){const s=secs.find(x=>x.key===r.key); if(s) for(const it of s.items.slice(0,2)) picked.push(it.title);}
  if(picked.length) return picked.slice(0,6);
  const plain=body.split('\n').map(s=>s.trim().replace(/^#{1,3}\s+/,''));
  let points=plain.filter(l=>/^\d+\.\s*/.test(l)).map(l=>l.replace(/^\d+\.\s*/,'').split('。')[0]);
  if(!points.length) points=plain.filter(l=>l.length>8&&l.length<=60&&!/[。：:]/.test(l)&&!/^https?:/.test(l)&&l!=='---');
  return points.slice(0,6);
}
function regionStrip(post){
  const secs=splitSections(post.body);
  if(!secs.length) return '';
  return `<div class="regions">${REGIONS.map(r=>{
    const n=(secs.find(s=>s.key===r.key)?.items.length)||0;
    return `<a class="${r.key}" href="${r.key}.html"><strong>${r.label}</strong><span>本周 ${n} 条</span></a>`;
  }).join('')}</div>`;
}
function regionHref(post, region){ return `p/${post.slug}-${region.key}.html`; }
function itemCard(post, region, it){
  const href=`${regionHref(post, region)}#${it.id}`;
  return `<article class="card"><div class="meta"><span class="tag ${region.key}">${region.label}</span><span class="when">${fmtMD(post.date)} ${post.time}</span></div><h3>${esc(it.title)}</h3><p>${esc(it.summary)}</p>${it.src?`<p class="src">${linkify(it.src)}</p>`:''}<div class="cf"><span>${it.urls.length} 个来源</span><span class="read">阅读 →</span></div><a class="stretch" href="${href}" aria-label="${esc(it.title)}"></a></article>`;
}
function regionPage(region, posts){
  let total=0;
  const blocks=posts.map(p=>{
    const sec=splitSections(p.body).find(s=>s.key===region.key);
    if(!sec||!sec.items.length) return '';
    total+=sec.items.length;
    return `<section class="day"><h2 class="dh">${fmtDate(p.date)} · ${sec.items.length} 条 · <a href="${regionHref(p, region)}">本期全文</a></h2><div class="grid">${sec.items.map(it=>itemCard(p,region,it)).join('')}</div></section>`;
  }).filter(Boolean).join('');
  const inner=`<h1 class="ph1 ${region.key}">${region.label}</h1><p class="lede">从各期周报抽出的${region.label}条目，共 ${total} 条。来源在卡片上，点进卡片阅读该栏目全文。</p>${blocks||'<p class="lede">暂无该分组内容。</p>'}`;
  return page(`${region.label} · 工控周报`, region.key, inner);
}
function jumps(post){
  const secs=splitSections(post.body);
  const links=REGIONS.filter(r=>secs.some(s=>s.key===r.key&&s.items.length)).map(r=>{
    const n=secs.find(s=>s.key===r.key).items.length;
    return `<a class="${r.key}" href="${post.slug}-${r.key}.html">${r.label} · ${n} 条</a>`;
  }).join('');
  return links?`<div class="jumps">${links}</div>`:'';
}
const posts=fs.readdirSync(SRC).filter(f=>f.endsWith('.md')).map(parse)
  .sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
if(!posts.length) throw new Error('content/ 下没有 markdown');
fs.rmSync(OUT,{recursive:true,force:true}); fs.mkdirSync(OUT+'/p',{recursive:true});
fs.writeFileSync(OUT+'/style.css',CSS);
const [top,...rest]=posts; const subs=rest.slice(0,2);
const points=heroPoints(top.body);
const home=`<section class="hero"><div class="kicker">本周头条 · ${fmtDate(top.date)} ${top.time} · ${TYPE[top.type]}</div>
<h1><a href="p/${top.slug}.html">${esc(top.headline)}</a></h1><p class="lede">${esc(top.summary)}</p>
${points.length?`<div class="points"><div class="ph">要点</div><ul>${points.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}
${regionStrip(top)}</section>
${subs.length?`<div class="subs">${subs.map(p=>card(p,true)).join('')}</div>`:''}<h2 class="sec">最新周报</h2>${grouped(posts)}`;
fs.writeFileSync(OUT+'/index.html',page('工控周报','home',home));
for(const r of REGIONS) fs.writeFileSync(`${OUT}/${r.key}.html`, regionPage(r, posts));
const redirect=href=>`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${href}"><link rel="canonical" href="${href}"><title>转到${esc(href)}</title></head><body><p><a href="${href}">${esc(href)}</a></p></body></html>`;
fs.writeFileSync(OUT+'/eu.html', redirect('intl.html'));
fs.writeFileSync(OUT+'/jpkr.html', redirect('intl.html'));
for(const p of posts){
  fs.writeFileSync(`${OUT}/p/${p.slug}.html`, page(p.title,'',`<article class="post"><div class="meta"><span class="tag ${p.type}">${TYPE[p.type]}</span><span>${fmtDate(p.date)} ${p.time}（上海时间）</span><span>${p.items} 条</span></div><h1>${esc(p.headline)}</h1><div class="sub">${esc(p.title)}</div><p class="lede">${esc(p.summary)}</p>${jumps(p)}<div class="body">${renderBody(p.body,{hub:true})}</div><a class="back" href="../index.html">← 返回首页</a></article>`,'../'));
  for(const r of REGIONS){
    const sec=splitSections(p.body).find(s=>s.key===r.key);
    const n=sec?sec.items.length:0;
    if(!n) continue;
    const inner=`<article class="post"><div class="meta"><span class="tag ${r.key}">${r.label}</span><span>${fmtDate(p.date)} ${p.time}（上海时间）</span><span>${n} 条</span></div><h1>${esc(p.headline)}</h1><div class="sub">${esc(r.label)} · ${esc(p.title)}</div><div class="body">${renderBody(p.body,{only:r.key})}</div><a class="back" href="../${r.key}.html">← 返回${r.label}</a></article>`;
    fs.writeFileSync(`${OUT}/p/${p.slug}-${r.key}.html`, page(`${r.label} · ${p.title}`, r.key, inner, '../'));
  }
}

function assertSite(){
  const html=f=>fs.readFileSync(path.join(OUT,f),'utf8');
  const home=html('index.html');
  for(const label of ['首页','国内新闻','国际新闻','工控周报']) if(!home.includes(label)) throw new Error('首页缺少 '+label);
  if(home.includes('品牌')) throw new Error('首页仍有品牌字样');
  if(!home.includes('每周更新（上海时间）约周一 10:00 · 内容由浩存整理')) throw new Error('页脚文案变了');
  for(const old of ['eu.html','jpkr.html']){
    const pageHtml=html(old);
    if(!pageHtml.includes('url=intl.html')) throw new Error(old+' 未跳转到 intl.html');
  }
  for(const p of posts){
    const hub=html(`p/${p.slug}.html`);
    if(!hub.includes('空组说明')&&p.body.includes('空组说明')) throw new Error('丢失空组说明');
    if(/id="(?:cn|intl)-\d+"/.test(hub)) throw new Error('枢纽页仍含栏目全文');
    const secs=splitSections(p.body);
    const expect={cn:0,intl:0}; let key='';
    for(const line of p.body.split('\n')){
      const h2=line.match(/^##\s+(.*)$/);
      if(h2){ key=regionKey(h2[1].trim()); continue; }
      if(key&&/^###\s+/.test(line)) expect[key]++;
    }
    const seen=new Set();
    let total=0;
    for(const r of REGIONS){
      const s=secs.find(x=>x.key===r.key);
      const n=s?s.items.length:0;
      if(n!==expect[r.key]) throw new Error(`${p.slug} ${r.key} 条目 ${n} != ${expect[r.key]}`);
      total+=n;
      const region=html(`${r.key}.html`);
      if(region.includes('品牌')) throw new Error(r.key+' 页仍有品牌字样');
      if(!n) continue;
      const detailName=`p/${p.slug}-${r.key}.html`;
      const detail=html(detailName);
      if(!hub.includes(`${p.slug}-${r.key}.html`)) throw new Error('枢纽未链到 '+detailName);
      if(!detail.includes(`id="${r.key}"`)) throw new Error(detailName+' 缺少区域标题');
      if(detail.includes('空组说明')) throw new Error(detailName+' 不该放空组说明');
      const other=REGIONS.find(x=>x.key!==r.key);
      const otherItems=(secs.find(x=>x.key===other.key)?.items)||[];
      for(const it of otherItems) if(detail.includes(esc(it.title))) throw new Error(`${detailName} 混入 ${it.title}`);
      for(const it of s.items){
        const mark=it.summary.replace(/…$/,'').slice(0,40);
        if(!region.includes(esc(it.title))) throw new Error(`${r.key} 缺少条目 ${it.title}`);
        if(!region.includes(regionHref(p, r))) throw new Error(`${r.key} 卡片未链到栏目全文`);
        if(!detail.includes(`id="${it.id}"`)) throw new Error(detailName+' 缺少锚点 '+it.id);
        if(mark.length>=20 && !detail.includes(esc(mark))) throw new Error(detailName+' 缺少正文 '+it.title);
        if(mark.length>=20 && (hub.includes(mark)||hub.includes(esc(mark)))) throw new Error('枢纽页仍含正文 '+it.title);
        for(const u of it.urls){
          if(!detail.includes(u)&&!detail.includes(esc(u))) throw new Error(`${detailName} 缺少来源 ${u}`);
          if(!region.includes(u)&&!region.includes(esc(u))) throw new Error(`${r.key} 缺少来源 ${u}`);
          seen.add(u);
        }
      }
    }
    const urls=[...p.body.matchAll(/https?:\/\/[^\s<，。）)]+/g)].map(x=>x[0]);
    for(const u of urls){
      const onHub=hub.includes(u)||hub.includes(esc(u));
      if(!seen.has(u)&&!onHub) throw new Error('来源丢失 '+u);
    }
    if(p.items&&total!==p.items) throw new Error(`${p.slug} 抽出 ${total} 条，frontmatter 为 ${p.items}`);
  }
}
assertSite();
const counts=Object.fromEntries(REGIONS.map(r=>[r.key, posts.reduce((n,p)=>n+(splitSections(p.body).find(s=>s.key===r.key)?.items.length||0),0)]));
console.log(`构建完成：${posts.length} 期 → ${OUT}/ ；栏目 ${REGIONS.map(r=>r.label+counts[r.key]).join(' / ')}`);

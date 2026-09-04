(() => {
"use strict";
const cfg = window.APP_CONFIG || {};
const app = document.querySelector("#app");
const TOKEN_KEY = "chemical_admin_token";
let adminToken = sessionStorage.getItem(TOKEN_KEY) || "";
let sb = null;
const $=(s,e=document)=>e.querySelector(s), $$=(s,e=document)=>[...e.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const fmt=n=>Number(n||0).toLocaleString("th-TH",{maximumFractionDigits:3});
const today=()=>new Date().toISOString().slice(0,10);
const daysLeft=d=>Math.ceil((new Date(d+"T23:59:59")-new Date())/86400000);
const addMonths=(dateText,months)=>{if(!dateText||!(months>=0))return"";const d=new Date(`${dateText}T12:00:00`),day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+Number(months));const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,last));return d.toISOString().slice(0,10);};
const shelfMonths=value=>{const m=String(value||"").match(/\d+/);return m?Number(m[0]):0;};

const MSL_SEARCH_HISTORY_KEY = "msl_search_history_v1";
let pendingLookup = null;

function normalizeCode(value){return String(value||"").trim().toUpperCase();}
function readSearchHistory(){try{return JSON.parse(sessionStorage.getItem(MSL_SEARCH_HISTORY_KEY)||"[]");}catch(_e){return [];}}
function saveSearchHistory(type,value){
  const v=normalizeCode(value); if(!v)return;
  const rows=readSearchHistory().filter(x=>!(x.type===type&&x.value===v));
  rows.unshift({type,value:v,at:new Date().toISOString()});
  sessionStorage.setItem(MSL_SEARCH_HISTORY_KEY,JSON.stringify(rows.slice(0,8)));
}
function displayDate(value){if(!value)return"—";const d=new Date(value);return Number.isNaN(d.getTime())?esc(value):d.toLocaleString("th-TH",{dateStyle:"short",timeStyle:"short"});}
function calcGeneralExpiry(mfgDate,profile){
  if(!mfgDate||!profile||profile.expiry_calculation_mode!=="FIXED_MONTHS"||!(Number(profile.shelf_life_months)>0))return null;
  const mfg=new Date(`${mfgDate}T12:00:00`); if(Number.isNaN(mfg.getTime()))return null;
  const now=new Date(); if(mfg>now)return {error:"MFG_DATE_IN_FUTURE"};
  const expiry=addMonths(mfgDate,Number(profile.shelf_life_months));
  const expDate=new Date(`${expiry}T23:59:59`);
  const totalDays=Math.max(1,Math.ceil((new Date(`${expiry}T12:00:00`)-mfg)/86400000));
  const remainingDays=Math.ceil((expDate-now)/86400000);
  const remainingPercent=Math.max(0,Math.min(100,Math.round((Math.max(0,remainingDays)/totalDays)*100)));
  let status="VALID";
  if(remainingDays<0||remainingPercent<10)status="EXPIRED";
  else if(remainingPercent<=30)status="EXPIRING_SOON";
  return {expiry,remainingDays,remainingPercent,status};
}
function statusMeta(status){
  if(status==="VALID")return {label:"VALID",thai:"ใช้งานได้",cls:"ok",icon:"✓"};
  if(status==="EXPIRING_SOON")return {label:"EXPIRING SOON",thai:"ใกล้หมดอายุ",cls:"warn",icon:"!"};
  if(status==="EXPIRED")return {label:"EXPIRED",thai:"HOLD / QUALITY REVIEW REQUIRED",cls:"bad",icon:"!"};
  if(status==="PROFILE_VERIFICATION_REQUIRED")return {label:"PROFILE VERIFICATION",thai:"ต้องยืนยัน Storage Profile",cls:"warn",icon:"!"};
  return {label:"NOT CALCULATED",thai:"ยังไม่ได้คำนวณ",cls:"neutral",icon:"–"};
}
async function mslLookupCode(code){
  const {data,error}=await sb.rpc("msl_lookup_material_code",{p_material_code:normalizeCode(code)});
  if(error)throw error; return data;
}
async function mslLookupGroup(group){
  const {data,error}=await sb.rpc("msl_lookup_material_group",{p_group_code:normalizeCode(group)});
  if(error)throw error; return data;
}
async function tableCount(table,filter){
  let q=sb.from(table).select("*",{count:"exact",head:true});
  if(filter)q=q.eq(filter.column,filter.value);
  const {count,error}=await q;if(error)throw error;return count||0;
}
async function getMslCounts(){
  const [groups,codes,profiles,rules,issues]=await Promise.all([
    tableCount("msl_material_groups"),tableCount("msl_material_codes"),tableCount("msl_storage_profiles"),tableCount("msl_warehouse_rules"),tableCount("msl_data_issues",{column:"status",value:"OPEN"})
  ]);
  return {groups,codes,profiles,rules,issues};
}
function navIcon(name){return ({dashboard:"⌂",lookup:"⌕",incoming:"▣",warehouse:"▤",alerts:"♢",report:"▦",master:"☷",settings:"⚙",receive:"⇩",issue:"⇧",stock:"▣",history:"↻"}[name]||"•");}
function closeMobileNav(){document.querySelector(".sidebar")?.classList.remove("open");document.querySelector(".nav-overlay")?.classList.remove("show");}
function setPage(name){render(name);}
function profileRows(profile){
  if(!profile)return '<div class="empty-state">ยังไม่มี Storage Profile ที่เลือกได้อย่างปลอดภัย</div>';
  return `<div class="detail-grid compact">
    <div><span>Shelf Life</span><b>${esc(profile.shelf_life_text||"—")}</b></div>
    <div><span>Storage Temperature</span><b>${esc(profile.storage_temperature||"—")}</b></div>
    <div><span>Storage Humidity</span><b>${esc(profile.storage_humidity||"—")}</b></div>
    <div><span>Packaging</span><b>${esc(profile.packaging||"—")}</b></div>
    <div class="wide"><span>Remark</span><b>${esc(profile.remark||"—")}</b></div>
  </div>`;
}
function allProfilesHtml(profiles=[]){
  if(!profiles.length)return '<div class="empty-state">No requirement found in master</div>';
  return profiles.map(p=>`<article class="profile-card"><div class="profile-head"><b>Storage Profile ${esc(p.profile_no)}</b><span class="chip">${esc(p.shelf_life_text||"—")}</span></div>${profileRows(p)}</article>`).join("");
}
function groupInfoHtml(groupResult){
  if(!groupResult?.found)return '<div class="empty-state">Material Group Not Found</div>';
  const g=groupResult.group||{},codes=groupResult.material_codes||[];
  return `<div class="group-layout"><div class="detail-grid compact">
    <div><span>Material Group</span><b>${esc(groupResult.material_group)}</b></div>
    <div><span>Material Type</span><b>${esc(g.material_type_en||g.material_type_th||"—")}</b></div>
    <div><span>Main Category</span><b>${esc(g.main_category_en||g.main_category_th||"—")}</b></div>
    <div><span>Sub Category</span><b>${esc(g.sub_category_en||g.sub_category_th||"—")}</b></div>
  </div><div class="code-list"><b>Material Code in Group</b><div>${codes.slice(0,120).map(c=>`<button class="code-pill" data-code="${esc(c)}">${esc(c)}</button>`).join("")||'<span class="muted">ไม่มี Material Code</span>'}</div>${codes.length>120?`<small>แสดง 120 จาก ${fmt(codes.length)} รายการ</small>`:""}</div></div>`;
}
function recentSearchHtml(){
  const rows=readSearchHistory();
  if(!rows.length)return '<div class="empty-state">ยังไม่มีประวัติการค้นหาใน Session นี้</div>';
  return rows.map(x=>`<button class="history-row" data-history-type="${x.type}" data-history-value="${esc(x.value)}"><b>${esc(x.value)}</b><span>${x.type==="group"?"Material Group":"Material Code"}</span><small>${displayDate(x.at)}</small></button>`).join("");
}
function bindHistoryButtons(){
  $$('[data-history-value]').forEach(b=>b.onclick=()=>{pendingLookup={type:b.dataset.historyType,value:b.dataset.historyValue};render("lookup");});
  $$('[data-code]').forEach(b=>b.onclick=()=>{pendingLookup={type:"code",value:b.dataset.code};render("lookup");});
}

function parseChemicalQr(raw){
  const text=String(raw||"").trim();if(!text)return null;
  try{const j=JSON.parse(text);return {supplier:j.supplier_code||j.supplier||j.SupplierCode||j.Supplier,code:j.material_code||j.material||j.MaterialCode||j.Material,lot:j.lot||j.lot_no||j.Lot,mfg:j.mfg_date||j.mfg||j.MFGDate||j.MFG};}catch(_error){}
  const result={};
  text.split(/[\n;]+/).forEach(part=>{const p=part.split(/[:=]/);if(p.length<2)return;const k=p.shift().trim().toLowerCase().replace(/[\s_-]/g,""),v=p.join(":").trim();if(/supplier|vendor/.test(k))result.supplier=v;else if(/material|matcode|item/.test(k))result.code=v;else if(/lot|batch/.test(k))result.lot=v;else if(/mfg|manufactur|productiondate/.test(k))result.mfg=v;});
  if(!result.supplier||!result.code||!result.lot||!result.mfg){const p=text.split(/[_|,\t]/).map(x=>x.trim()).filter(Boolean);if(p.length>=4)return {supplier:p[0],code:p[1],lot:p[2],mfg:p[3]};}
  return result.supplier&&result.code&&result.lot&&result.mfg?result:null;
}
function normalizeQrDate(value){const v=String(value||"").trim();if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;let m=v.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);if(m)return `${m[3]}-${m[2]}-${m[1]}`;m=v.match(/^(\d{4})(\d{2})(\d{2})$/);if(m)return `${m[1]}-${m[2]}-${m[3]}`;m=v.match(/^(\d{2})(\d{2})(\d{2})$/);return m?`20${m[1]}-${m[2]}-${m[3]}`:"";}

function tokenIsValid(token){
  try{
    const payload=JSON.parse(atob(token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
    return Number(payload.exp||0)*1000>Date.now()+30000;
  }catch(_error){
    return false;
  }
}

function createDatabaseClient(token){
  if(!cfg.SUPABASE_URL || !cfg.SUPABASE_PUBLISHABLE_KEY){
    throw new Error("ยังไม่ได้ตั้งค่า Supabase ใน config.js");
  }
  return window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_PUBLISHABLE_KEY,
    {
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
      global:{headers:{Authorization:`Bearer ${token}`}}
    }
  );
}

async function init(){
  if(adminToken && tokenIsValid(adminToken)){
    sb=createDatabaseClient(adminToken);
    mount();
  }else{
    sessionStorage.removeItem(TOKEN_KEY);
    adminToken="";
    login();
  }
}
function login(){
  document.title="Material Shelf-Life & Storage Control System";
  app.innerHTML=`<main class="login login-split">
    <section class="login-showcase" aria-label="Material Shelf-Life & Storage Control System">
      <div class="login-showcase-inner">
        <div class="login-logo">MSL</div>
        <div class="login-message">
          <div class="login-kicker">MATERIAL CONTROL</div>
          <h1>Material Shelf-Life<br>&amp; Storage Control<br>System.</h1>
          <p>ระบบควบคุมอายุการเก็บรักษาและการจัดเก็บวัสดุ</p>
        </div>
        <div class="login-steps" aria-label="System process">
          <span>SEARCH</span><i></i><span>VERIFY</span><i></i><span>CONTROL</span>
        </div>
      </div>
    </section>
    <section class="login-access">
      <div class="login-access-card">
        <div class="login-access-kicker">SECURE ACCESS</div>
        <h2>Sign in to system</h2>
        <p class="login-access-copy">เข้าสู่ระบบเพื่อใช้งาน Material Shelf-Life &amp; Storage Control System</p>
        <form id="login" class="login-form">
          <label>Username
            <input id="username" autocomplete="username" placeholder="Enter username" required>
          </label>
          <label>Password
            <div class="password-control">
              <input id="password" type="password" autocomplete="current-password" placeholder="Enter password" required>
              <button id="togglePassword" type="button" class="password-toggle" aria-label="แสดงรหัสผ่าน">Show</button>
            </div>
          </label>
          <button id="loginSubmit" class="login-submit" type="submit">Continue to System <span>→</span></button>
          <div id="err" class="login-error" role="alert"></div>
        </form>
        <div class="login-status"><span class="status-light"></span>Production mode · Secure server-side authentication</div>
        <div class="login-reference">TH-MM-R-007-2025</div>
      </div>
    </section>
  </main>`;
  $("#togglePassword").onclick=()=>{
    const input=$("#password"),show=input.type==="password";
    input.type=show?"text":"password";
    $("#togglePassword").textContent=show?"Hide":"Show";
    $("#togglePassword").setAttribute("aria-label",show?"ซ่อนรหัสผ่าน":"แสดงรหัสผ่าน");
  };
  $("#login").onsubmit=async e=>{
    e.preventDefault();
    const button=$("#loginSubmit");const err=$("#err");button.disabled=true;button.innerHTML="กำลังเข้าสู่ระบบ...";err.textContent="";
    try{
      const response=await fetch("/.netlify/functions/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:$("#username").value.trim(),password:$("#password").value})});
      const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||"Login failed");
      adminToken=result.access_token;sessionStorage.setItem(TOKEN_KEY,adminToken);sb=createDatabaseClient(adminToken);mount();
    }catch(error){console.error(error);err.textContent="ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";}
    finally{button.disabled=false;button.innerHTML='Continue to System <span>→</span>';}
  };
}
function mount(){
  document.title="Material Shelf-Life & Storage Control System";
  app.innerHTML=`<div class="system-shell">
    <header class="system-header">
      <button id="mobileMenu" class="header-menu" aria-label="เปิดเมนู">☰</button>
      <div class="header-mark">M</div>
      <div class="header-title"><b>Material Shelf-Life &amp; Storage Control System</b><span>ระบบควบคุมอายุการเก็บรักษาและการจัดเก็บวัสดุ</span></div>
      <div class="header-ref">TH-MM-R-007-2025</div>
      <button class="header-icon" data-page="alerts" title="Expiry Alert">♢</button>
      <button class="profile-button" data-page="settings" title="Settings">A</button>
    </header>
    <div class="system-body">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <span class="sidebar-brand-mark">M</span>
          <div><b>Material Control</b><small>Production System</small></div>
        </div>
        <nav class="side-nav primary-nav" aria-label="Main navigation">
          <button data-page="dashboard">${navIcon("dashboard")}<span>Dashboard</span></button>
          <button data-page="lookup">${navIcon("lookup")}<span>Search / Lookup</span></button>
          <button data-page="incoming">${navIcon("incoming")}<span>Incoming Check</span></button>
          <button data-page="warehouse">${navIcon("warehouse")}<span>Warehouse Check</span></button>
          <button data-page="alerts">${navIcon("alerts")}<span>Expiry Alert</span></button>
        </nav>

        <details class="nav-group" id="chemicalNav">
          <summary><span class="nav-group-icon">⚗</span><span>Chemical Inventory</span><i>⌄</i></summary>
          <nav class="side-nav nested-nav">
            <button data-page="receive">${navIcon("receive")}<span>Receiving</span></button>
            <button data-page="issue">${navIcon("issue")}<span>Issue</span></button>
            <button data-page="stock">${navIcon("stock")}<span>Stock</span></button>
            <button data-page="history">${navIcon("history")}<span>Movement History</span></button>
          </nav>
        </details>

        <details class="nav-group" id="systemNav">
          <summary><span class="nav-group-icon">☷</span><span>Reports &amp; System</span><i>⌄</i></summary>
          <nav class="side-nav nested-nav">
            <button data-page="report">${navIcon("report")}<span>Reports</span></button>
            <button data-page="master">${navIcon("master")}<span>Master Data</span></button>
            <button data-page="settings">${navIcon("settings")}<span>Settings</span></button>
          </nav>
        </details>

        <div class="master-reference"><b>Master Data</b><span>Read-only for normal users</span></div>
      </aside>
      <div class="nav-overlay"></div>
      <main class="content-shell">
        <div class="page-heading">
          <div class="page-heading-copy"><span class="eyebrow" id="sectionLabel">MATERIAL CONTROL</span><h1 id="title">Dashboard</h1><p id="pageSubtitle"></p></div>
          <div class="page-badge">PRODUCTION</div>
        </div>
        <section id="page" class="page"></section>
      </main>
    </div>
    <footer class="system-footer"><span>Material Shelf-Life &amp; Storage Control System</span><span>Version 1.1 UI Refined</span></footer>
  </div>`;
  $("#mobileMenu").onclick=()=>{$(".sidebar").classList.toggle("open");$(".nav-overlay").classList.toggle("show");};
  $(".nav-overlay").onclick=closeMobileNav;
  $$('[data-page]').forEach(b=>b.onclick=()=>{render(b.dataset.page);closeMobileNav();});
  render("dashboard");
}
async function render(name){
  const titles={dashboard:"Material Shelf-Life & Storage Control System",lookup:"Search / Lookup",incoming:"Incoming Check",warehouse:"Warehouse Check",alerts:"Expiry Alert",report:"Reports",master:"Master Data",settings:"Settings",receive:"Chemical Receiving",issue:"Chemical Issue",stock:"Chemical Stock",history:"Chemical Movement History",more:"Chemical Tools"};
  const section=["receive","issue","stock","history","more"].includes(name)?"CHEMICAL INVENTORY":"MATERIAL CONTROL";
  $("#title").textContent=titles[name]||name;$("#sectionLabel").textContent=section;
  $("#pageSubtitle").textContent=name==="dashboard"?"ระบบควบคุมอายุการเก็บรักษาและการจัดเก็บวัสดุ":"";
  $$(".side-nav button").forEach(b=>b.classList.toggle("active",b.dataset.page===name));
  if(["receive","issue","stock","history"].includes(name))$("#chemicalNav").open=true;
  if(["report","master","settings"].includes(name))$("#systemNav").open=true;
  $("#page").innerHTML='<div class="loading"><span class="spinner"></span>กำลังโหลด...</div>';
  try{await ({dashboard,lookup,incoming,warehouse,alerts,report,master:masterData,settings,receive,issue,stock,history,more}[name]||dashboard)();}
  catch(e){console.error(e);$("#page").innerHTML=`<div class="panel error-panel"><b>ไม่สามารถโหลดข้อมูลได้</b><div>${esc(e.message)}</div></div>`;}
}
async function getLots(){const {data,error}=await sb.from("chemical_lots").select("*,materials(*)").eq("is_active",true).order("received_date");if(error)throw error;return data||[];}
function lotCard(l){const d=daysLeft(l.expiry_date),c=d<0||d<=30?"red":d<=180?"orange":"green";return `<div class="item"><div class="row"><div><b>${esc(l.materials?.material_code)} — ${esc(l.materials?.material_name)}</b><div class="muted">Lot ${esc(l.lot_no)}</div></div><span class="badge ${c}">${d<0?`หมดอายุ ${Math.abs(d)} วัน`:`เหลือ ${d} วัน`}</span></div><div class="row"><span>คงเหลือ ${fmt(l.remaining_qty)} ${esc(l.unit||l.materials?.unit)}</span><span>Exp ${esc(l.expiry_date)}</span></div></div>`;}
async function dashboard(){
  const [counts,lots]=await Promise.all([getMslCounts(),getLots()]);
  const active=lots.filter(x=>+x.remaining_qty>0),near=active.filter(x=>daysLeft(x.expiry_date)<=180&&daysLeft(x.expiry_date)>=0),expired=active.filter(x=>daysLeft(x.expiry_date)<0);
  $("#page").innerHTML=`
    <section class="dashboard-overview">
      <div class="overview-copy"><span class="overview-label">SYSTEM OVERVIEW</span><h2>ตรวจสอบข้อมูลวัสดุได้จากจุดเดียว</h2><p>ค้นหา Material Code เพื่อดู Shelf Life, Storage Condition และสถานะการหมดอายุจาก Production Master</p></div>
      <button class="primary overview-action" data-go="lookup">ค้นหา Material <span>→</span></button>
    </section>

    <div class="dashboard-metrics-clean">
      <article class="dashboard-stat"><span class="stat-icon">▣</span><div><small>Material Codes</small><b>${fmt(counts.codes)}</b><p>Mapped in Production Master</p></div></article>
      <article class="dashboard-stat"><span class="stat-icon">☷</span><div><small>Material Groups</small><b>${fmt(counts.groups)}</b><p>Shelf-Life &amp; Storage Master</p></div></article>
      <article class="dashboard-stat ${counts.issues?"needs-attention":""}"><span class="stat-icon">!</span><div><small>Data Attention</small><b>${fmt(counts.issues)}</b><p>${counts.issues?"รายการที่ต้องตรวจสอบ Master":"Master data ready"}</p></div></article>
    </div>

    <div class="dashboard-main-grid">
      <section class="panel quick-lookup-panel">
        <div class="panel-head"><div><span class="panel-icon">⌕</span><b>Quick Material Lookup</b></div><span class="chip">GENERAL MATERIAL</span></div>
        <div class="search-inline"><input id="dashCode" placeholder="กรอก Material Code เช่น SD000197" autocomplete="off"><button id="dashSearch" class="primary">Search</button></div>
        <p class="helper">ระบบจะแสดง Material Group, Shelf Life, Temperature, Humidity, Packaging และ Remark จาก Master</p>
      </section>

      <section class="panel chemical-status-panel">
        <div class="panel-head"><div><span class="panel-icon">⚗</span><b>Chemical Inventory</b></div><button class="link-btn" data-go="stock">View Stock</button></div>
        <div class="chemical-status-list">
          <div><span><i class="status-dot active"></i>Active Lots</span><b>${fmt(active.length)}</b></div>
          <div><span><i class="status-dot near"></i>Expiring ≤ 180 Days</span><b>${fmt(near.length)}</b></div>
          <div><span><i class="status-dot expired"></i>Expired</span><b>${fmt(expired.length)}</b></div>
        </div>
      </section>
    </div>

    <section class="quick-actions-panel">
      <div class="quick-actions-title"><b>Quick Actions</b><span>เข้าถึงงานหลักได้เร็วขึ้น</span></div>
      <div class="quick-actions-grid">
        <button data-go="lookup"><span>⌕</span><b>Search</b><small>ค้นหาข้อมูลวัสดุ</small></button>
        <button data-go="incoming"><span>▣</span><b>Incoming Check</b><small>ตรวจสอบก่อนรับเข้า</small></button>
        <button data-go="warehouse"><span>▤</span><b>Warehouse Check</b><small>ตรวจเงื่อนไขจัดเก็บ</small></button>
        <button data-go="alerts"><span>♢</span><b>Expiry Alert</b><small>ติดตามสถานะหมดอายุ</small></button>
      </div>
    </section>`;
  bindGo();
  $("#dashSearch").onclick=()=>{const value=$("#dashCode").value.trim();if(!value)return;pendingLookup={type:"code",value};render("lookup");};
  $("#dashCode").onkeydown=e=>{if(e.key==="Enter")$("#dashSearch").click();};
}
async function receive(){
  $("#page").innerHTML=`<div class="form">
    <div class="scanner"><b>สแกน QR Label — 4 ส่วน</b><div class="muted tiny">Supplier Code • Material Code • Lot • MFG Date</div><button id="scan" class="secondary">เปิดกล้องสแกน</button><div id="reader"></div><div id="scanResult" class="tiny muted"></div></div>
    <div class="inline"><label>Supplier Code<input id="supplier"></label><label>Material Code<input id="code"></label></div>
    <label>Lot<input id="lot"></label>
    <div id="master" class="card muted">สแกนหรือกรอก Material Code</div>
    <label>Material Name<input id="materialName" placeholder="กรอกชื่อ Material"></label>
    <div class="inline"><label>Product Name (ใส่ NA ได้)<input id="productName" placeholder="เช่น Cleaner X100 หรือ NA"></label><label>Brand<input id="brand" placeholder="เช่น 3M, TOA หรือ NA"></label></div>
    <div class="inline"><label>Shelf Life<input id="shelfLife" inputmode="numeric" placeholder="เช่น 24 เดือน"></label><label>Storage Condition<input id="storage" placeholder="เช่น เก็บในที่แห้ง"></label></div>
    <button id="saveMaster" class="secondary hidden">บันทึก Material Master</button>
    <div class="inline"><label>Qty (จำนวนรับเข้า)<input id="qty" type="number" min="0.001" step="0.001"></label><label>Unit (หน่วย)<input id="unit" placeholder="กรอกเอง เช่น Bottle"></label></div>
    <label>Package Size<input id="packageSize" placeholder="เช่น 20 L / Can"></label>
    <div class="inline"><label>Receive Date (วันที่รับเข้า)<input id="rdate" type="date" value="${today()}"></label><label>MFG Date from QR (วันที่ผลิตจาก QR ส่วนที่ 4)<input id="mfgQr" type="date"></label></div>
    <label>MFG Date from Product Label (วันที่ผลิตจากฉลากสินค้า)<input id="mfgLabel" type="date"></label>
    <div id="mfgWarning" class="card warning hidden"><b>วันที่ผลิตไม่ตรงกัน</b><div>กรุณาเลือกวันที่ที่จะใช้คำนวณและระบบจะบันทึก Log</div><label><input type="radio" name="mfgSource" value="QR"> ใช้วันที่จาก QR</label><label><input type="radio" name="mfgSource" value="LABEL"> ใช้วันที่จากฉลากสินค้า</label></div>
    <label>Expiry Date (วันหมดอายุ) = MFG Date + Shelf Life<input id="exp" type="date" readonly></label>
    <label>Location<input id="location" placeholder="เช่น Chemical Room / Rack A-01"></label>
    <button id="save" class="primary">บันทึกรับเข้าสารเคมี</button>
  </div>`;
  let mat=null;
  const lookup=async()=>{const code=$("#code").value.trim();if(!code)return;const {data,error}=await sb.from("materials").select("*").eq("material_code",code).maybeSingle();if(error)throw error;mat=data;if(mat){$("#master").className="card";$("#master").innerHTML="<b>พบ Material Master — แก้ไขข้อมูลได้</b>";$("#materialName").value=mat.material_name||"";$("#shelfLife").value=mat.shelf_life_months?`${mat.shelf_life_months} เดือน`:"";$("#storage").value=mat.storage_condition||"";$("#saveMaster").classList.add("hidden");}else{$("#master").className="card warning";$("#master").innerHTML="Material Code ใหม่ — กรุณากรอกข้อมูลและบันทึก Material Master";$("#materialName").value="";$("#shelfLife").value="";$("#storage").value="";$("#saveMaster").classList.remove("hidden");}calculate();};
  const masterPayload=()=>({material_code:$("#code").value.trim(),material_name:$("#materialName").value.trim(),shelf_life_months:shelfMonths($("#shelfLife").value),storage_condition:$("#storage").value.trim(),supplier:$("#supplier").value.trim()||null});
  const saveMaster=async(showMessage=true)=>{const p=masterPayload();if(!p.material_code||!p.material_name||!(p.shelf_life_months>0)||!p.storage_condition)throw new Error("กรอก Material Name, Shelf Life และ Storage Condition ให้ครบ");const {data,error}=await sb.from("materials").upsert(p,{onConflict:"material_code"}).select().single();if(error)throw error;mat=data;$("#saveMaster").classList.add("hidden");$("#master").className="card";$("#master").innerHTML="<b>บันทึก Material Master แล้ว — ยังแก้ไขได้</b>";if(showMessage)alert("บันทึก Material Master แล้ว");return data;};
  const chosenMfg=()=>{const q=$("#mfgQr").value,l=$("#mfgLabel").value;if(q&&l&&q!==l){const s=$("input[name=mfgSource]:checked")?.value;return s==="QR"?q:s==="LABEL"?l:"";}return l||q;};
  const calculate=()=>{$("#exp").value=addMonths(chosenMfg(),shelfMonths($("#shelfLife").value));};
  const checkMfg=()=>{const q=$("#mfgQr").value,l=$("#mfgLabel").value,mismatch=q&&l&&q!==l;$("#mfgWarning").classList.toggle("hidden",!mismatch);if(!mismatch)$$('input[name="mfgSource"]').forEach(x=>x.checked=false);calculate();};
  $("#code").onchange=lookup;$("#shelfLife").oninput=calculate;$("#mfgQr").onchange=checkMfg;$("#mfgLabel").onchange=checkMfg;$$('input[name="mfgSource"]').forEach(x=>x.onchange=calculate);$("#saveMaster").onclick=async()=>{try{await saveMaster();}catch(e){alert(e.message);}};
  $("#scan").onclick=()=>scan("reader",async raw=>{const q=parseChemicalQr(raw);if(!q)return alert("อ่าน QR ไม่สำเร็จ: QR ต้องมี Supplier Code, Material Code, Lot และ MFG Date");$("#supplier").value=q.supplier;$("#code").value=q.code;$("#lot").value=q.lot;$("#mfgQr").value=normalizeQrDate(q.mfg);$("#scanResult").textContent=`สแกนสำเร็จ: ${q.supplier} • ${q.code} • ${q.lot} • ${q.mfg}`;await lookup();checkMfg();});
  $("#save").onclick=async()=>{try{const code=$("#code").value.trim(),supplier=$("#supplier").value.trim(),lot=$("#lot").value.trim(),qty=+$("#qty").value,unit=$("#unit").value.trim(),product=$("#productName").value.trim(),brand=$("#brand").value.trim(),pack=$("#packageSize").value.trim(),rd=$("#rdate").value,q=$("#mfgQr").value,l=$("#mfgLabel").value,mfg=chosenMfg(),ex=$("#exp").value,location=$("#location").value.trim();if(!code||!supplier||!lot||!(qty>0)||!unit||!product||!brand||!pack||!rd||!q||!mfg||!ex||!location)return alert("กรอกข้อมูลให้ครบ (Product Name และ Brand ใส่ NA ได้)");if(q&&l&&q!==l&&!$("input[name=mfgSource]:checked"))return alert("วันที่ผลิตไม่ตรงกัน กรุณาเลือกวันที่ที่จะใช้");await saveMaster(false);const {data:lotId,error}=await sb.rpc("receive_stock_v1",{p_material_id:mat.id,p_supplier_code:supplier,p_lot_no:lot,p_qty:qty,p_unit:unit,p_product_name:product,p_brand:brand,p_package_size:pack,p_received_date:rd,p_mfg_qr_date:q,p_mfg_label_date:l||null,p_mfg_used_date:mfg,p_mfg_source:q&&l&&q!==l?$("input[name=mfgSource]:checked").value:"QR",p_expiry_date:ex,p_location:location});if(error)throw error;let message="บันทึกรับเข้าสารเคมีแล้ว";try{const alertResult=await triggerExpiryAlertNow(lotId);if(alertResult.sent)message=`บันทึกรับเข้าแล้ว และแจ้ง DingTalk ระดับ ${alertResult.level} เดือนแล้ว`;}catch(alertError){console.error("DingTalk alert failed",alertError);message=`บันทึกรับเข้าแล้ว แต่ส่ง DingTalk ไม่สำเร็จ: ${alertError.message}`;}alert(message);render("dashboard");}catch(e){console.error(e);alert(`บันทึกไม่สำเร็จ: ${e.message}`);}};
}
async function issue(){
  $("#page").innerHTML=`<div class="form"><div class="scanner"><b>สแกนบาร์โค้ด</b><button id="scan" class="secondary">เปิดกล้องสแกน</button><div id="reader"></div></div><label>Material Code<input id="code"></label><div id="fifo" class="card muted">ระบบจะแนะนำ Lot ตาม FIFO</div><label>เลือก Lot<select id="lot"><option value="">—</option></select></label><label>จำนวนเบิก<input id="qty" type="number" min="0.001" step="0.001"></label><label>เหตุผลกรณีเปลี่ยน Lot<input id="note"></label><button id="save" class="success">บันทึกเบิกจ่าย</button></div>`;
  let lots=[];const lookup=async()=>{const {data,error}=await sb.from("chemical_lots").select("*,materials!inner(*)").eq("materials.material_code",$("#code").value.trim()).eq("is_active",true).gt("remaining_qty",0).order("received_date");if(error)throw error;lots=data||[];$("#lot").innerHTML='<option value="">— เลือก Lot —</option>'+lots.map((l,i)=>`<option value="${l.id}">${i===0?"⭐ FIFO • ":""}${esc(l.lot_no)} • เหลือ ${fmt(l.remaining_qty)} ${esc(l.unit||l.materials.unit)} • รับ ${esc(l.received_date)}</option>`).join("");if(lots[0])$("#lot").value=lots[0].id;$("#fifo").innerHTML=lots.length?`<div class="fifo card"><b>แนะนำ Lot ตาม FIFO: ${esc(lots[0].lot_no)}</b><div>รับเข้าก่อนสุด ${esc(lots[0].received_date)}</div></div>`:"ไม่พบ Stock";};
  $("#code").onchange=lookup;$("#scan").onclick=()=>scan("reader",v=>{$("#code").value=v;lookup();});
  $("#save").onclick=async()=>{
    const chosen=lots.find(x=>x.id===$("#lot").value),qty=+$("#qty").value,note=$("#note").value.trim();
    if(!chosen||!(qty>0))return alert("กรอกข้อมูลให้ครบ");
    if(qty>+chosen.remaining_qty)return alert("จำนวนมากกว่าคงเหลือ");
    const fifo=chosen.id===lots[0].id;
    if(!fifo&&!note)return alert("กรุณาระบุเหตุผลเมื่อไม่เลือก Lot FIFO");
    if(!fifo&&!confirm("Lot นี้ไม่ใช่ Lot แนะนำตาม FIFO ยืนยันต่อหรือไม่?"))return;
    const button=$("#save"),originalText=button.textContent,moveNote=fifo?"FIFO":`ไม่ตาม FIFO: ${note}`;
    button.disabled=true;button.textContent="กำลังบันทึก...";
    try{
      // ใช้ RPC เดิมก่อน เพื่อรักษา flow ของโปรเจกต์ Work ไว้เหมือนเดิม
      const rpcResult=await sb.rpc("issue_stock",{p_lot_id:chosen.id,p_qty:qty,p_note:moveNote});
      if(rpcResult.error){
        console.warn("issue_stock RPC failed; using safe authenticated fallback",rpcResult.error);
        // Fallback ใช้ Supabase client เดิม + JWT เดิมจากหน้าเว็บ ไม่ต้องเพิ่ม ENV/Function/SQL
        const {data:fresh,error:freshError}=await sb.from("chemical_lots").select("id,material_id,remaining_qty").eq("id",chosen.id).single();
        if(freshError)throw freshError;
        const before=Number(fresh.remaining_qty||0);
        if(qty>before)throw new Error("จำนวนมากกว่าคงเหลือปัจจุบัน");
        const after=Number((before-qty).toFixed(3));
        const {data:updated,error:updateError}=await sb.from("chemical_lots").update({remaining_qty:after}).eq("id",chosen.id).eq("remaining_qty",before).select("id,remaining_qty");
        if(updateError)throw updateError;
        if(!updated||updated.length!==1)throw new Error("Stock มีการเปลี่ยนแปลงจากอุปกรณ์อื่น กรุณาลองใหม่");
        const {error:moveError}=await sb.from("stock_movements").insert({movement_type:"OUT",material_id:fresh.material_id,lot_id:chosen.id,qty:qty,note:moveNote,performed_by:null});
        if(moveError){
          const {error:rollbackError}=await sb.from("chemical_lots").update({remaining_qty:before}).eq("id",chosen.id).eq("remaining_qty",after);
          if(rollbackError)console.error("Stock rollback failed",rollbackError);
          throw moveError;
        }
      }
      alert("บันทึกเบิกจ่ายแล้ว");
      render("stock");
    }catch(error){
      console.error("Issue stock failed",error);
      alert(`บันทึกเบิกจ่ายไม่สำเร็จ: ${error?.message||"เกิดข้อผิดพลาด"}`);
    }finally{
      button.disabled=false;button.textContent=originalText;
    }
  };
}
async function stock(){const lots=(await getLots()).filter(x=>+x.remaining_qty>0);$("#page").innerHTML=`<label>ค้นหา<input id="search" placeholder="Material / Lot"></label><div class="list" style="margin-top:12px">${lots.length?lots.map(l=>`<div class="item s" data-search="${esc(l.materials.material_code)} ${esc(l.materials.material_name)} ${esc(l.lot_no)}"><div class="row"><b>${esc(l.materials.material_code)} — ${esc(l.materials.material_name)}</b><strong>${fmt(l.remaining_qty)} ${esc(l.unit||l.materials.unit)}</strong></div><div class="muted">Lot ${esc(l.lot_no)} • รับ ${esc(l.received_date)} • Exp ${esc(l.expiry_date)}</div><div class="lot-actions"><button class="secondary edit-lot" data-id="${l.id}">แก้ไข</button><button class="danger cancel-lot" data-id="${l.id}">ลบรายการ</button></div></div>`).join(""):'<div class="card muted">ยังไม่มี Stock</div>'}</div>`;$("#search").oninput=e=>$$(".s").forEach(x=>x.classList.toggle("hidden",!x.dataset.search.toLowerCase().includes(e.target.value.toLowerCase())));$$('.edit-lot').forEach(b=>b.onclick=()=>editStockLot(lots.find(x=>x.id===b.dataset.id)));$$('.cancel-lot').forEach(b=>b.onclick=()=>cancelStockLot(lots.find(x=>x.id===b.dataset.id)));}

async function editStockLot(l){
  $("#title").textContent="แก้ไขรายการคงคลัง";
  $("#page").innerHTML=`<div class="form">
    <div class="card warning"><b>การแก้ไขจะถูกบันทึกประวัติ</b><div>จำนวนคงเหลือจะคำนวณใหม่โดยหักจำนวนที่เคยเบิกแล้ว</div></div>
    <div class="inline"><label>Supplier Code<input id="eSupplier" value="${esc(l.supplier_code||l.materials?.supplier||"")}"></label><label>Material Code<input id="eCode" value="${esc(l.materials?.material_code||"")}"></label></div>
    <label>Material Name<input id="eMaterialName" value="${esc(l.materials?.material_name||"")}"></label>
    <div class="inline"><label>Shelf Life<input id="eShelf" inputmode="numeric" value="${l.materials?.shelf_life_months?esc(l.materials.shelf_life_months)+" เดือน":""}" placeholder="เช่น 24 เดือน"></label><label>Storage Condition<input id="eStorage" value="${esc(l.materials?.storage_condition||"")}" placeholder="เช่น เก็บในที่แห้ง"></label></div>
    <div class="inline"><label>Lot<input id="eLot" value="${esc(l.lot_no)}"></label><label>Qty รับเข้าทั้งหมด<input id="eQty" type="number" min="0.001" step="0.001" value="${esc(l.received_qty)}"></label></div>
    <div class="inline"><label>Product Name<input id="eProduct" value="${esc(l.product_name||"NA")}"></label><label>Brand<input id="eBrand" value="${esc(l.brand||"NA")}"></label></div>
    <div class="inline"><label>Unit<input id="eUnit" value="${esc(l.unit||l.materials?.unit||"")}"></label><label>Package Size<input id="ePack" value="${esc(l.package_size||"")}"></label></div>
    <div class="inline"><label>Receive Date (วันที่รับเข้า)<input id="eReceive" type="date" value="${esc(l.received_date||"")}"></label><label>MFG Date from QR<input id="eMfgQr" type="date" value="${esc(l.mfg_qr_date||l.mfg_used_date||"")}"></label></div>
    <label>MFG Date from Product Label<input id="eMfgLabel" type="date" value="${esc(l.mfg_label_date||"")}"></label>
    <label>Expiry Date (วันหมดอายุ) = MFG Date + Shelf Life<input id="eExpiry" type="date" value="${esc(l.expiry_date||"")}" readonly></label>
    <label>Location<input id="eLocation" value="${esc(l.storage_location||"")}"></label>
    <label>เหตุผลที่แก้ไข<input id="eReason" placeholder="เช่น กรอก Lot หรือจำนวนผิด"></label>
    <div class="actions"><button id="eBack" class="secondary">ยกเลิก</button><button id="eSave" class="primary">บันทึกการแก้ไข</button></div>
  </div>`;
  const recalculateEditExpiry=()=>{const q=$("#eMfgQr").value,label=$("#eMfgLabel").value,mfg=label||q,months=shelfMonths($("#eShelf").value);$("#eExpiry").value=addMonths(mfg,months);};
  $("#eShelf").oninput=recalculateEditExpiry;$("#eMfgQr").onchange=recalculateEditExpiry;$("#eMfgLabel").onchange=recalculateEditExpiry;
  $("#eBack").onclick=()=>render("stock");
  $("#eSave").onclick=async()=>{try{const code=$("#eCode").value.trim(),reason=$("#eReason").value.trim(),materialName=$("#eMaterialName").value.trim(),months=shelfMonths($("#eShelf").value),storage=$("#eStorage").value.trim();if(!reason)return alert("กรุณาระบุเหตุผลที่แก้ไข");if(!materialName||!(months>0)||!storage)return alert("กรอก Material Name, Shelf Life และ Storage Condition ให้ครบ");const {data:mat,error:matError}=await sb.from("materials").select("id").eq("material_code",code).maybeSingle();if(matError)throw matError;if(!mat)return alert("ไม่พบ Material Code นี้ใน Material Master");const {error:masterError}=await sb.from("materials").update({material_name:materialName,shelf_life_months:months,storage_condition:storage,supplier:$("#eSupplier").value.trim()||null}).eq("id",mat.id);if(masterError)throw masterError;const q=$("#eMfgQr").value,label=$("#eMfgLabel").value,used=label||q,source=label&&q&&label!==q?"LABEL":"QR";recalculateEditExpiry();const {error}=await sb.rpc("update_chemical_lot_v1",{p_lot_id:l.id,p_material_id:mat.id,p_supplier_code:$("#eSupplier").value.trim(),p_lot_no:$("#eLot").value.trim(),p_received_qty:+$("#eQty").value,p_unit:$("#eUnit").value.trim(),p_product_name:$("#eProduct").value.trim()||"NA",p_brand:$("#eBrand").value.trim()||"NA",p_package_size:$("#ePack").value.trim(),p_received_date:$("#eReceive").value,p_mfg_qr_date:q||null,p_mfg_label_date:label||null,p_mfg_used_date:used||null,p_mfg_source:source,p_expiry_date:$("#eExpiry").value,p_location:$("#eLocation").value.trim(),p_reason:reason});if(error)throw error;let message="แก้ไขรายการแล้ว";try{const alertResult=await triggerExpiryAlertNow(l.id);if(alertResult.sent)message=`แก้ไขแล้ว และแจ้ง DingTalk ระดับ ${alertResult.level} เดือนแล้ว`;}catch(alertError){console.error("DingTalk alert failed",alertError);message=`แก้ไขรายการแล้ว แต่ส่ง DingTalk ไม่สำเร็จ: ${alertError.message}`;}alert(message);render("stock");}catch(e){console.error(e);alert("แก้ไขไม่สำเร็จ: "+e.message);}};
}

async function triggerExpiryAlertNow(lotId=null){
  const response=await fetch("/.netlify/functions/check-expiry-now",{method:"POST",headers:{Authorization:`Bearer ${adminToken}`,"Content-Type":"application/json","X-Supabase-Key":cfg.SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify({lot_id:lotId})});
  const result=await response.json();
  if(!response.ok||!result.ok)throw new Error(result.error||"ส่งแจ้งเตือนไม่สำเร็จ");
  return result;
}

async function cancelStockLot(l){
  if(!l||!confirm(`ยืนยันลบรายการ ${l.materials?.material_code} • Lot ${l.lot_no} ออกจากคงคลัง?`))return;
  const reason=prompt("ระบุเหตุผลที่ลบรายการ เช่น บันทึกผิด");
  if(!reason||!reason.trim())return alert("ต้องระบุเหตุผลก่อนลบ");
  try{const {error}=await sb.rpc("cancel_chemical_lot_v1",{p_lot_id:l.id,p_reason:reason.trim()});if(error)throw error;alert("ลบรายการออกจากคงคลังแล้ว และเก็บประวัติไว้");render("stock");}catch(e){console.error(e);alert("ลบไม่สำเร็จ: "+e.message);}
}
async function alerts(){
  const lots=(await getLots()).filter(x=>+x.remaining_qty>0&&daysLeft(x.expiry_date)<=184).sort((a,b)=>a.expiry_date.localeCompare(b.expiry_date));
  $("#page").innerHTML=`<div class="dashboard-columns"><section class="panel"><div class="panel-head"><div><span class="panel-icon">□</span><b>General Material Expiry Check</b></div><span class="chip">LOOKUP ONLY</span></div><p class="helper">General Material ไม่มี Stock Tracking ในระบบนี้ จึงไม่มี Fake Automatic Alert ต้องตรวจจาก Material Code + MFG Date ณ จุดใช้งาน</p><div class="verify-search"><input id="alertCode" placeholder="Material Code"><input id="alertMfg" type="date"><button id="alertCheck" class="primary">Check</button></div><div id="alertGeneralResult" class="result-space"><div class="empty-state">กรอก Material Code และ MFG Date</div></div></section><section class="panel"><div class="panel-head"><div><span class="panel-icon">⚗</span><b>Chemical Automatic Expiry Alert</b></div><button id="send" class="primary small-btn">ส่ง DingTalk ตอนนี้</button></div><div class="list">${lots.length?lots.slice(0,30).map(lotCard).join(""):'<div class="empty-state">ไม่มีรายการเข้าเงื่อนไข</div>'}</div>${lots.length>30?`<div class="helper">แสดง 30 จาก ${fmt(lots.length)} รายการ</div>`:""}</section></div>`;
  $("#send").onclick=async()=>{try{const j=await triggerExpiryAlertNow();alert(j.sent?`ส่ง DingTalk แล้ว ${j.count} รายการ`:"ตรวจแล้ว ไม่มีรายการใหม่ที่ต้องแจ้ง");}catch(e){alert(`ส่งไม่สำเร็จ: ${e.message}`);}};
  $("#alertCheck").onclick=async()=>{const code=normalizeCode($("#alertCode").value),mfg=$("#alertMfg").value;if(!code||!mfg)return;const r=await mslLookupCode(code);if(!r?.found){$("#alertGeneralResult").innerHTML=`<div class="notice danger">MATERIAL_CODE_NOT_FOUND</div>`;return;}if(r.profile_verification_required){$("#alertGeneralResult").innerHTML=`<div class="notice warning"><b>PROFILE VERIFICATION REQUIRED</b><span>ไม่สามารถคำนวณ Expiry ก่อนยืนยัน Profile</span></div>`;return;}const c=calcGeneralExpiry(mfg,r.selected_profile);if(!c||c.error){$("#alertGeneralResult").innerHTML='<div class="notice danger">ไม่สามารถคำนวณ Expiry ได้</div>';return;}const m=statusMeta(c.status);$("#alertGeneralResult").innerHTML=`<div class="expiry-result ${m.cls}"><b>${m.label}</b><span>Expiry ${esc(c.expiry)} • Remaining ${fmt(c.remainingDays)} Days • ${c.remainingPercent}%</span><small>${esc(m.thai)}</small></div>`;};
}
async function history(){const {data,error}=await sb.from("stock_movements").select("*,materials(*),chemical_lots(*)").order("created_at",{ascending:false}).limit(500);if(error)throw error;$("#page").innerHTML=`<div class="list">${(data||[]).map(m=>`<div class="item"><div class="row"><b>${m.movement_type==="IN"?"รับเข้า":"เบิกจ่าย"} ${esc(m.materials?.material_code)}</b><span>${new Date(m.created_at).toLocaleString("th-TH")}</span></div><div>Lot ${esc(m.chemical_lots?.lot_no)} • ${fmt(m.qty)} ${esc(m.materials?.unit)}</div><div class="muted">${esc(m.note||"")}</div></div>`).join("")||'<div class="card muted">ยังไม่มีประวัติ</div>'}</div>`;}
async function report(){
  const counts=await getMslCounts();
  $("#page").innerHTML=`<div class="metric-grid report-metrics"><div class="metric-card"><span>Material Codes</span><b>${fmt(counts.codes)}</b></div><div class="metric-card"><span>Material Groups</span><b>${fmt(counts.groups)}</b></div><div class="metric-card"><span>Storage Profiles</span><b>${fmt(counts.profiles)}</b></div><div class="metric-card attention"><span>Open Issues</span><b>${fmt(counts.issues)}</b></div></div>
  <div class="dashboard-columns"><section class="panel"><div class="panel-head"><div><span class="panel-icon">▦</span><b>General Material Report Scope</b></div></div><div class="check-list"><span>• Master coverage</span><span>• Material Group / Storage Requirement</span><span>• Missing mapping / Data Issues</span><span>• Lookup history is Session-only</span></div><div class="notice info"><b>ไม่มี General Material Stock Report</b><span>ระบบนี้ไม่สร้างข้อมูล Stock ปลอมและไม่ duplicate WMS</span></div></section>
  <section class="panel form"><div class="panel-head"><div><span class="panel-icon">⚗</span><b>Chemical Inventory Export</b></div></div><p class="helper">Export Stock, Receiving, Issue และ Expiry Alert จาก Chemical Database เดิม</p><button id="export" class="success">📗 Export Chemical Excel</button></section></div>`;
  $("#export").onclick=exportExcel;
}
async function exportExcel(){const lots=await getLots();const {data:mov,error}=await sb.from("stock_movements").select("*,materials(*),chemical_lots(*)").order("created_at");if(error)throw error;const wb=XLSX.utils.book_new();const stock=lots.map(l=>({Material:l.materials.material_code,Name:l.materials.material_name,ProductName:l.product_name,Brand:l.brand,Lot:l.lot_no,MFGDate:l.mfg_used_date,ReceivedDate:l.received_date,ExpiryDate:l.expiry_date,PackageSize:l.package_size,Location:l.storage_location,ReceivedQty:l.received_qty,RemainingQty:l.remaining_qty,Unit:l.unit||l.materials.unit,Supplier:l.supplier_code||l.materials.supplier}));const rec=(mov||[]).filter(x=>x.movement_type==="IN").map(mapMov),iss=(mov||[]).filter(x=>x.movement_type==="OUT").map(mapMov),al=lots.filter(x=>+x.remaining_qty>0&&daysLeft(x.expiry_date)<=180).map(l=>({...stock.find(s=>s.Material===l.materials.material_code&&s.Lot===l.lot_no),DaysLeft:daysLeft(l.expiry_date)}));[["Stock",stock],["Receiving",rec],["Issue",iss],["Expiry_Alert",al]].forEach(([n,r])=>XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(r),n));XLSX.writeFile(wb,`Chemical_Inventory_${today()}.xlsx`);}
function mapMov(m){return {Date:m.created_at,Type:m.movement_type,Material:m.materials?.material_code,Name:m.materials?.material_name,Lot:m.chemical_lots?.lot_no,Qty:m.qty,Unit:m.chemical_lots?.unit||m.materials?.unit,Note:m.note};}

async function lookup(){
  $("#page").innerHTML=`<div class="lookup-top"><section class="panel search-panel"><div class="search-tabs"><button id="tabCode" class="active">Material Code</button><button id="tabGroup">Material Group</button></div><div id="searchFields"><label>Material Code<div class="search-inline"><input id="lookupValue" placeholder="เช่น SD000197"><button id="lookupBtn" class="primary">⌕ Search</button></div></label><div class="helper">ตัวอย่าง: SD000197, FC057407, B0KI0271</div></div></section><section id="statusSummary" class="status-summary neutral"><div class="status-orb">–</div><div><span>Status</span><b>NOT CALCULATED</b><small>ยังไม่ได้คำนวณ</small></div><div><span>Expiry Date</span><b>—</b></div><div><span>Remaining</span><b>—</b></div><div><span>Remaining %</span><b>—</b></div></section></div><div id="lookupResult"><div class="welcome-card"><b>ค้นหา Material Code หรือ Material Group</b><span>ระบบจะดึงข้อมูลจาก Production Master โดยตรง และจะไม่เดาข้อมูลที่ไม่มีใน Master</span></div></div>`;
  let mode="code";
  const setMode=m=>{mode=m;$("#tabCode").classList.toggle("active",m==="code");$("#tabGroup").classList.toggle("active",m==="group");$("#searchFields").innerHTML=`<label>${m==="code"?"Material Code":"Material Group"}<div class="search-inline"><input id="lookupValue" placeholder="${m==="code"?"เช่น SD000197":"เช่น S003D0"}"><button id="lookupBtn" class="primary">⌕ Search</button></div></label><div class="helper">${m==="code"?"ค้นหา Code → Group → Storage Requirement":"ค้นหา Group → Storage Requirement + Material Codes ในกลุ่ม"}</div>`;bindSearch();};
  const bindSearch=()=>{$("#lookupBtn").onclick=doSearch;$("#lookupValue").onkeydown=e=>{if(e.key==="Enter")doSearch();};};
  const doSearch=async()=>{const value=normalizeCode($("#lookupValue").value);if(!value)return;$("#lookupBtn").disabled=true;$("#lookupBtn").textContent="Searching...";try{if(mode==="code"){const r=await mslLookupCode(value);saveSearchHistory("code",value);if(!r?.found){renderLookupNotFound(r);return;}const g=await mslLookupGroup(r.material_group);renderMaterialLookup(r,g);}else{const g=await mslLookupGroup(value);saveSearchHistory("group",value);renderGroupLookup(g);}}catch(e){console.error(e);$("#lookupResult").innerHTML=`<div class="panel error-panel"><b>Lookup Error</b><div>${esc(e.message)}</div></div>`;}finally{const b=$("#lookupBtn");if(b){b.disabled=false;b.textContent="⌕ Search";}}};
  $("#tabCode").onclick=()=>setMode("code");$("#tabGroup").onclick=()=>setMode("group");bindSearch();
  if(pendingLookup){const p=pendingLookup;pendingLookup=null;setMode(p.type==="group"?"group":"code");$("#lookupValue").value=p.value;await doSearch();}
}
function renderLookupNotFound(r){
  $("#statusSummary").className="status-summary bad";$("#statusSummary").innerHTML=`<div class="status-orb">!</div><div><span>Status</span><b>NOT FOUND</b><small>Material Group Not Found</small></div><div><span>Material Code</span><b>${esc(r?.material_code||"—")}</b></div><div><span>Rule</span><b>NO GUESS</b></div><div><span>Action</span><b>Check Master</b></div>`;
  $("#lookupResult").innerHTML=`<div class="panel error-panel"><b>MATERIAL_CODE_NOT_FOUND</b><p>ไม่พบ Material Code <strong>${esc(r?.material_code||"")}</strong> ใน Mapping Master ระบบจะไม่เดา Material Group ให้</p></div><div class="panel"><div class="panel-head"><div><span class="panel-icon">↻</span><b>Recent Search</b></div></div>${recentSearchHtml()}</div>`;bindHistoryButtons();
}
function renderMaterialLookup(r,g){
  const profile=r.selected_profile||null,needsVerify=!!r.profile_verification_required;
  const status=needsVerify?statusMeta("PROFILE_VERIFICATION_REQUIRED"):statusMeta(null);
  $("#statusSummary").className=`status-summary ${status.cls}`;$("#statusSummary").innerHTML=`<div class="status-orb">${status.icon}</div><div><span>Status</span><b id="summaryStatus">${status.label}</b><small id="summaryThai">${status.thai}</small></div><div><span>Expiry Date</span><b id="summaryExpiry">—</b></div><div><span>Remaining</span><b id="summaryDays">—</b></div><div><span>Remaining %</span><b id="summaryPercent">—</b></div>`;
  const gr=r.group||{};
  $("#lookupResult").innerHTML=`<div class="lookup-main-grid"><section class="panel"><div class="panel-head"><div><span class="panel-icon">▣</span><b>Material Information</b></div><span class="chip">${esc(r.requirement_status)}</span></div><div class="detail-grid"><div><span>Material Code</span><b>${esc(r.material_code)}</b></div><div><span>Material Group</span><b>${esc(r.material_group)}</b></div><div><span>Material Type</span><b>${esc(gr.material_type_en||gr.material_type_th||"—")}</b></div><div><span>Main Category</span><b>${esc(gr.main_category_en||gr.main_category_th||"—")}</b></div></div>${needsVerify?`<div class="notice warning"><b>Multiple Storage Profiles — Require Verification</b><span>พบ ${fmt(r.profile_count)} Profiles ระบบไม่เลือกแทนผู้ใช้จนกว่าจะมีหลักฐานยืนยัน Material-specific Profile</span></div>`:profileRows(profile)}<div class="reference-bar">Reference / Requirement : TH-MM-R-007-2025</div></section>
  <section class="panel expiry-panel"><div class="panel-head"><div><span class="panel-icon">□</span><b>Expiry Calculation</b></div></div><div class="expiry-layout"><div class="expiry-form"><label>Manufacturing Date / Date Code<input id="generalMfg" type="date" ${profile?'':'disabled'}></label><div class="readonly-row"><span>Expiry Date (MFG Date + Shelf Life)</span><b id="calcExpiry">—</b></div><div class="readonly-row"><span>Remaining Days</span><b id="calcDays">—</b></div><div class="readonly-row"><span>Remaining %</span><div class="progress-line"><div class="progress"><i id="calcBar" style="width:0%"></i></div><b id="calcPercent">—</b></div></div><div class="readonly-row"><span>Status</span><b id="calcStatus" class="status-text">NOT CALCULATED</b></div><div id="calcHint" class="helper">${needsVerify?"ต้องยืนยัน Storage Profile ก่อนคำนวณ":"กรอก Manufacturing Date เพื่อคำนวณ"}</div></div><div class="status-definition"><b>Status Definition</b><span><i class="dot ok"></i><strong>VALID</strong><small>อายุคงเหลือมากกว่า 30%</small></span><span><i class="dot warn"></i><strong>EXPIRING SOON</strong><small>อายุคงเหลือ 10% - 30%</small></span><span><i class="dot bad"></i><strong>EXPIRED</strong><small>ต่ำกว่า 10% หรือเกินวันหมดอายุ</small></span></div></div></section></div>
  ${needsVerify?`<section class="panel"><div class="panel-head"><div><span class="panel-icon">!</span><b>Storage Profiles for Verification</b></div></div><div class="profile-grid">${allProfilesHtml(r.storage_profiles)}</div></section>`:""}
  <div class="lookup-bottom-grid"><section class="panel"><div class="panel-head"><div><span class="panel-icon">☷</span><b>Material Group Information (${esc(r.material_group)})</b></div></div>${groupInfoHtml(g)}</section><section class="panel"><div class="panel-head"><div><span class="panel-icon">↻</span><b>Recent Search</b></div></div>${recentSearchHtml()}</section><section class="panel howto"><div class="panel-head"><div><span class="panel-icon">i</span><b>How to Use</b></div></div><div class="how-list"><div><b>ค้นหาด้วย Material Code</b><span>ดู Group และ Storage Requirement</span></div><div><b>ตรวจสอบอายุ</b><span>กรอก MFG Date เมื่อ Profile ถูกยืนยันแล้ว</span></div><div><b>กรณีหลาย Profile</b><span>ระบบจะไม่เดาและจะแจ้งให้ Verify</span></div></div></section></div>`;
  bindHistoryButtons();
  if(profile){$("#generalMfg").onchange=()=>updateGeneralExpiryUi(profile,$("#generalMfg").value);}
}
function updateGeneralExpiryUi(profile,mfg){
  const calc=calcGeneralExpiry(mfg,profile);if(!calc)return;
  if(calc.error){$("#calcHint").textContent="MFG Date ต้องไม่เป็นวันที่ในอนาคต";return;}
  const meta=statusMeta(calc.status);$("#calcExpiry").textContent=calc.expiry;$("#calcDays").textContent=calc.remainingDays<0?`เกิน ${Math.abs(calc.remainingDays)} วัน`:`${fmt(calc.remainingDays)} Days`;$("#calcPercent").textContent=`${calc.remainingPercent}%`;$("#calcBar").style.width=`${calc.remainingPercent}%`;$("#calcBar").className=meta.cls;$("#calcStatus").textContent=meta.label;$("#calcStatus").className=`status-text ${meta.cls}`;$("#calcHint").textContent=meta.thai;
  const summary=$("#statusSummary");summary.className=`status-summary ${meta.cls}`;$("#summaryStatus").textContent=meta.label;$("#summaryThai").textContent=meta.thai;$("#summaryExpiry").textContent=calc.expiry;$("#summaryDays").textContent=calc.remainingDays<0?`-${fmt(Math.abs(calc.remainingDays))} Days`:`${fmt(calc.remainingDays)} Days`;$("#summaryPercent").textContent=`${calc.remainingPercent}%`;
}
function renderGroupLookup(g){
  const ok=!!g?.found;$("#statusSummary").className=`status-summary ${ok?"neutral":"bad"}`;$("#statusSummary").innerHTML=`<div class="status-orb">${ok?"✓":"!"}</div><div><span>Status</span><b>${ok?esc(g.requirement_status):"NOT FOUND"}</b><small>${ok?"Material Group Master":"Material Group Not Found"}</small></div><div><span>Material Group</span><b>${esc(g?.material_group||"—")}</b></div><div><span>Material Codes</span><b>${ok?fmt((g.material_codes||[]).length):"—"}</b></div><div><span>Profiles</span><b>${ok?fmt((g.storage_profiles||[]).length):"—"}</b></div>`;
  if(!ok){$("#lookupResult").innerHTML='<div class="panel error-panel"><b>MATERIAL_GROUP_NOT_FOUND</b><p>ไม่พบ Material Group ใน Master และระบบจะไม่เดาข้อมูลให้</p></div>';return;}
  $("#lookupResult").innerHTML=`<div class="lookup-main-grid"><section class="panel"><div class="panel-head"><div><span class="panel-icon">☷</span><b>Material Group Information</b></div></div>${groupInfoHtml(g)}</section><section class="panel"><div class="panel-head"><div><span class="panel-icon">▤</span><b>Storage Requirements</b></div><span class="chip">${fmt((g.storage_profiles||[]).length)} Profile(s)</span></div><div class="profile-grid">${allProfilesHtml(g.storage_profiles)}</div></section></div><section class="panel"><div class="panel-head"><div><span class="panel-icon">↻</span><b>Recent Search</b></div></div>${recentSearchHtml()}</section>`;bindHistoryButtons();
}

async function incoming(){
  $("#page").innerHTML=`<div class="page-intro"><div><h2>General Material Incoming Check</h2><p>ตรวจสอบ Material Group, Shelf Life และ Storage Requirement โดยไม่สร้าง Receiving/Stock ซ้ำกับ WMS</p></div><button class="secondary" data-go="receive">เปิด Chemical Receiving</button></div><section class="panel"><div class="panel-head"><div><span class="panel-icon">▣</span><b>Lookup / Verification</b></div><span class="chip">NO STOCK TRANSACTION</span></div><div class="verify-search"><input id="incomingCode" placeholder="Material Code"><input id="incomingMfg" type="date" title="Manufacturing Date / Date Code"><button id="incomingCheck" class="primary">Check</button></div><div id="incomingResult" class="result-space"><div class="empty-state">กรอก Material Code เพื่อเริ่มตรวจสอบ</div></div></section>`;bindGo();
  const run=async()=>{const code=normalizeCode($("#incomingCode").value);if(!code)return;try{const r=await mslLookupCode(code);if(!r?.found){$("#incomingResult").innerHTML=`<div class="notice danger"><b>MATERIAL_CODE_NOT_FOUND</b><span>${esc(code)} ไม่มี Mapping — ห้ามเดา Group</span></div>`;return;}const p=r.selected_profile,mfg=$("#incomingMfg").value,calc=calcGeneralExpiry(mfg,p);$("#incomingResult").innerHTML=`<div class="verification-result"><div class="detail-grid"><div><span>Material Code</span><b>${esc(r.material_code)}</b></div><div><span>Material Group</span><b>${esc(r.material_group)}</b></div><div><span>Profile Status</span><b>${esc(r.profile_selection_status)}</b></div><div><span>Requirement</span><b>${esc(r.requirement_status)}</b></div></div>${r.profile_verification_required?`<div class="notice warning"><b>PROFILE VERIFICATION REQUIRED</b><span>พบหลาย Storage Profiles — ยังไม่อนุญาตให้ระบบเลือกหรือคำนวณ Expiry</span></div><div class="profile-grid">${allProfilesHtml(r.storage_profiles)}</div>`:`${profileRows(p)}${calc&&!calc.error?`<div class="expiry-result ${statusMeta(calc.status).cls}"><b>${statusMeta(calc.status).label}</b><span>Expiry ${esc(calc.expiry)} • Remaining ${fmt(calc.remainingDays)} Days • ${calc.remainingPercent}%</span></div>`:(mfg?'<div class="notice danger">MFG Date ไม่ถูกต้องหรือไม่สามารถคำนวณได้</div>':'<div class="notice info">กรอก MFG Date เพื่อคำนวณ Expiry</div>')}`}</div>`;}catch(e){$("#incomingResult").innerHTML=`<div class="notice danger">${esc(e.message)}</div>`;}};
  $("#incomingCheck").onclick=run;$("#incomingCode").onkeydown=e=>{if(e.key==="Enter")run();};
}

async function notifyGeneralMaterialDingTalk(payload){
  const response=await fetch("/.netlify/functions/notify-general-material",{
    method:"POST",
    headers:{Authorization:`Bearer ${adminToken}`,"Content-Type":"application/json"},
    body:JSON.stringify(payload)
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.ok)throw new Error(result.error||`HTTP ${response.status}`);
  return result;
}

async function warehouse(){
  const {data:rules,error}=await sb.from("msl_warehouse_rules").select("rule_code,clause,title_th,action_text").eq("is_active",true).order("rule_code");if(error)throw error;
  $("#page").innerHTML=`<div class="page-intro"><div><h2>Warehouse Check</h2><p>ตรวจสอบเงื่อนไขจัดเก็บและอายุวัสดุจากของจริงหน้างาน โดยไม่สร้าง Stock หรือ Receiving ซ้ำกับ WMS</p></div></div><div class="dashboard-columns"><section class="panel"><div class="panel-head"><div><span class="panel-icon">⌕</span><b>Material Storage & Expiry Check</b></div></div><div class="wh-check-grid"><input id="whCode" placeholder="Material Code"><input id="whMfg" type="date" title="MFG Date / Date Code"><button id="whCheck" class="primary">Check</button></div><div id="whResult" class="result-space"><div class="empty-state">กรอก Material Code และ MFG Date เพื่อดู Storage Requirement และสถานะอายุวัสดุ</div></div></section><section class="panel"><div class="panel-head"><div><span class="panel-icon">▤</span><b>Warehouse General Rules</b></div><span class="chip">${fmt((rules||[]).length)} Rules</span></div><div class="rule-list">${(rules||[]).map(x=>`<div><b>${esc(x.title_th)}</b><span>${esc(x.action_text)}</span>${x.clause?`<small>${esc(x.clause)}</small>`:""}</div>`).join("")}</div></section></div>`;

  let lastCheck=null;
  const run=async()=>{
    const code=normalizeCode($("#whCode").value),mfg=$("#whMfg").value;
    if(!code)return;
    try{
      const r=await mslLookupCode(code);
      lastCheck=null;
      if(!r?.found){$("#whResult").innerHTML=`<div class="notice danger"><b>MATERIAL_CODE_NOT_FOUND</b><span>${esc(code)} ไม่มี Mapping ใน Master — ระบบจะไม่เดา Group</span></div>`;return;}
      const profile=r.selected_profile;
      const calc=calcGeneralExpiry(mfg,profile);
      const profileBlock=r.profile_verification_required
        ? `<div class="notice warning"><b>PROFILE VERIFICATION REQUIRED</b><span>พบหลาย Storage Profiles — ห้ามเลือกเงื่อนไขเอง และยังไม่อนุญาตให้คำนวณ Expiry</span></div><div class="profile-grid">${allProfilesHtml(r.storage_profiles)}</div>`
        : profileRows(profile);
      let expiryBlock='<div class="notice info"><b>Expiry Verification</b><span>กรอก MFG Date / Date Code เพื่อคำนวณวันหมดอายุและเปิดปุ่มแจ้ง DingTalk</span></div>';
      let notifyBlock='';
      if(mfg&&!r.profile_verification_required){
        if(calc?.error){expiryBlock='<div class="notice danger"><b>MFG DATE INVALID</b><span>MFG Date ต้องไม่เป็นวันที่ในอนาคต</span></div>';}
        else if(calc){
          const meta=statusMeta(calc.status);
          expiryBlock=`<div class="expiry-result ${meta.cls}"><b>${meta.label} — ${esc(meta.thai)}</b><span>Expiry ${esc(calc.expiry)} • Remaining ${fmt(calc.remainingDays)} Days • ${calc.remainingPercent}%</span></div>`;
          notifyBlock=`<div class="ding-alert-box ${meta.cls}"><div><b>แจ้งเตือนหน้างานไปยัง DingTalk</b><span>ใช้เมื่อ Warehouse พบวัสดุใกล้หมดอายุ หมดอายุ หรือมีเหตุให้ต้องการ Quality/IQC ตรวจสอบ</span></div><textarea id="whAlertRemark" rows="3" placeholder="Warehouse Remark / จุดที่พบ / Lot หรือ Location (ถ้ามี)"></textarea><button id="whNotifyDing" class="${calc.status==='EXPIRED'?'danger':'ding-btn'}">${calc.status==='EXPIRED'?'แจ้ง DingTalk & HOLD':'แจ้งเตือน DingTalk'}</button><small id="whNotifyState">จะส่ง Material Code, Group, MFG, Expiry, Remaining Days, Status และ Remark</small></div>`;
          lastCheck={material_code:r.material_code,material_group:r.material_group,mfg_date:mfg,expiry_date:calc.expiry,remaining_days:calc.remainingDays,remaining_percent:calc.remainingPercent,status:calc.status,profile_no:profile?.profile_no||null,shelf_life:profile?.shelf_life_text||null,storage_temperature:profile?.storage_temperature||null,storage_humidity:profile?.storage_humidity||null,packaging:profile?.packaging||null};
        }
      }
      $("#whResult").innerHTML=`<div class="detail-grid"><div><span>Material Code</span><b>${esc(r.material_code)}</b></div><div><span>Material Group</span><b>${esc(r.material_group)}</b></div><div><span>Profile Status</span><b>${esc(r.profile_selection_status)}</b></div><div><span>Warehouse Action</span><b>${r.profile_verification_required?"VERIFY PROFILE":"FOLLOW MASTER"}</b></div></div>${profileBlock}${expiryBlock}${notifyBlock}<div class="notice info"><b>Expired Material Control</b><span>หาก EXPIRED ให้ Warehouse Segregate / Identify / HOLD และส่ง Quality/IQC ตรวจตัดสิน ไม่ให้ Warehouse ตัดสิน Pass/Fail เอง</span></div>`;
      const notifyBtn=$("#whNotifyDing");
      if(notifyBtn&&lastCheck){
        notifyBtn.onclick=async()=>{
          const remark=$("#whAlertRemark")?.value.trim()||"";
          if(!remark)return alert("กรุณาระบุ Warehouse Remark / จุดที่พบก่อนส่ง DingTalk");
          if(!confirm(`ยืนยันส่งแจ้งเตือน DingTalk สำหรับ ${lastCheck.material_code} (${lastCheck.status}) ?`))return;
          notifyBtn.disabled=true;notifyBtn.textContent="กำลังส่ง...";
          const state=$("#whNotifyState");
          try{
            const result=await notifyGeneralMaterialDingTalk({...lastCheck,remark,source:"WAREHOUSE_CHECK"});
            notifyBtn.textContent="ส่ง DingTalk แล้ว ✓";notifyBtn.className="success";
            if(state)state.textContent=`ส่งสำเร็จ ${new Date(result.sent_at||Date.now()).toLocaleString("th-TH")}`;
          }catch(e){
            notifyBtn.disabled=false;notifyBtn.textContent=lastCheck.status==='EXPIRED'?"แจ้ง DingTalk & HOLD":"แจ้งเตือน DingTalk";
            if(state)state.textContent=`ส่งไม่สำเร็จ: ${e.message}`;
            alert(`ส่ง DingTalk ไม่สำเร็จ: ${e.message}`);
          }
        };
      }
    }catch(e){$("#whResult").innerHTML=`<div class="notice danger"><b>CHECK FAILED</b><span>${esc(e.message)}</span></div>`;}
  };
  $("#whCheck").onclick=run;$("#whCode").onkeydown=e=>{if(e.key==="Enter")run();};$("#whMfg").onchange=()=>{if($("#whCode").value.trim())run();};
}

async function masterData(){
  const counts=await getMslCounts();const [{data:issues,error:e1},{data:groups,error:e2}]=await Promise.all([sb.from("msl_data_issues").select("issue_key,issue_type,material_code,group_code,status,detail").order("created_at",{ascending:false}).limit(50),sb.from("msl_material_groups").select("group_code,material_type_en,material_type_th,has_storage_master").order("group_code").limit(100)]);if(e1)throw e1;if(e2)throw e2;
  $("#page").innerHTML=`<div class="notice info"><b>Read-only Master Data</b><span>ผู้ใช้ทั่วไปใช้สำหรับอ้างอิงเท่านั้น การแก้ Master ต้องทำผ่าน SQL/Admin process ที่ควบคุมและมีหลักฐาน</span></div><div class="metric-grid"><div class="metric-card"><span>Groups</span><b>${fmt(counts.groups)}</b></div><div class="metric-card"><span>Codes</span><b>${fmt(counts.codes)}</b></div><div class="metric-card"><span>Profiles</span><b>${fmt(counts.profiles)}</b></div><div class="metric-card attention"><span>Open Issues</span><b>${fmt(counts.issues)}</b></div></div><div class="dashboard-columns master-columns"><section class="panel"><div class="panel-head"><div><span class="panel-icon">☷</span><b>Material Groups</b></div><span class="chip">Showing 100</span></div><div class="table-wrap"><table><thead><tr><th>Group</th><th>Material Type</th><th>Storage Master</th></tr></thead><tbody>${(groups||[]).map(x=>`<tr><td><b>${esc(x.group_code)}</b></td><td>${esc(x.material_type_en||x.material_type_th||"—")}</td><td>${x.has_storage_master?'<span class="badge green">FOUND</span>':'<span class="badge orange">MISSING</span>'}</td></tr>`).join("")}</tbody></table></div></section><section class="panel"><div class="panel-head"><div><span class="panel-icon">!</span><b>Data Issues</b></div><span class="chip">${fmt((issues||[]).length)} shown</span></div><div class="issue-list">${(issues||[]).map(x=>`<div><b>${esc(x.issue_type)}</b><span>${esc(x.material_code||x.group_code||x.issue_key)}</span><small>${esc(x.status)}</small></div>`).join("")||'<div class="empty-state">No data issues</div>'}</div></section></div>`;
}

async function settings(){
  $("#page").innerHTML=`<div class="settings-grid"><section class="panel"><div class="panel-head"><div><span class="panel-icon">⚙</span><b>System Configuration</b></div></div><div class="setting-row"><span>System</span><b>Material Shelf-Life & Storage Control</b></div><div class="setting-row"><span>Database</span><b>Existing Chemical Supabase Project</b></div><div class="setting-row"><span>General Material</span><b>Read-only Lookup / Verification</b></div><div class="setting-row"><span>Chemical Material</span><b>Existing Tracking + Alert Flow</b></div><div class="setting-row"><span>Reference</span><b>TH-MM-R-007-2025</b></div></section><section class="panel"><div class="panel-head"><div><span class="panel-icon">✓</span><b>Production Guardrails</b></div></div><div class="check-list"><span>✓ No fake/demo material data</span><span>✓ No General Material stock creation</span><span>✓ No WMS duplicate transaction</span><span>✓ Missing mapping = Not Found</span><span>✓ Multiple profiles = Verification Required</span><span>✓ Chemical tables and DingTalk flow preserved</span></div><button id="settingsLogout" class="danger ghost-danger">ออกจากระบบ</button></section></div>`;
  $("#settingsLogout").onclick=()=>{sessionStorage.removeItem(TOKEN_KEY);adminToken="";sb=null;login();};
}

async function more(){
  $("#page").innerHTML=`<div class="menu"><button data-go="history">🕘 Chemical Movement History</button><button data-go="alerts">🔔 Expiry Alert</button><button data-go="report">📊 Reports / Export</button><button id="import">📥 Import Chemical Material Master from Excel</button><input id="file" class="hidden" type="file" accept=".xlsx,.xls,.csv"></div>`;bindGo();$("#import").onclick=()=>$("#file").click();$("#file").onchange=importBom;
}
async function importBom(e){const file=e.target.files[0];if(!file)return;const wb=XLSX.read(await file.arrayBuffer()),rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});const pick=(r,names)=>{for(const n of names){const k=Object.keys(r).find(x=>x.trim().toLowerCase()===n.toLowerCase());if(k)return r[k]}return""};const list=rows.map(r=>({material_code:String(pick(r,["Material Code","Material","Code","รหัสวัสดุ"])).trim(),material_name:String(pick(r,["Material Name","Name","Description","ชื่อวัสดุ"])).trim(),unit:String(pick(r,["Unit","UOM","หน่วย"])).trim(),supplier:String(pick(r,["Supplier","ผู้ขาย"])).trim(),barcode:String(pick(r,["Barcode","บาร์โค้ด"])).trim()||null})).filter(x=>x.material_code&&x.material_name);const {error}=await sb.from("materials").upsert(list,{onConflict:"material_code"});if(error)throw error;alert(`Import BOM สำเร็จ ${list.length} รายการ`);}
function bindGo(){$$("[data-go]").forEach(b=>b.onclick=()=>{render(b.dataset.go);closeMobileNav();});}
async function scan(id,cb){const q=new Html5Qrcode(id);try{await q.start({facingMode:"environment"},{fps:10,qrbox:{width:240,height:120}},async t=>{cb(t.trim());await q.stop();$("#"+id).innerHTML="";});}catch(e){alert("เปิดกล้องไม่ได้: "+e.message);}}
init();
})();

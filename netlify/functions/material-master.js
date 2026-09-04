const { getStore } = require('@netlify/blobs');
const jwt = require('jsonwebtoken');

const STORE_NAME = 'material-control-master';
const MAPPING_KEY = 'material-mapping';
const SHELF_KEY = 'shelf-life-master';

exports.handler = async (event) => {
  if (!['GET','POST'].includes(event.httpMethod)) return reply(405,{ok:false,error:'Method not allowed'});
  const auth = verifyToken(event);
  if (!auth.ok) return reply(401,{ok:false,error:'Unauthorized'});

  try {
    const store = getStore(STORE_NAME);
    if (event.httpMethod === 'GET') {
      const q = normalize(event.queryStringParameters?.q || '');
      const action = String(event.queryStringParameters?.action || 'lookup').toLowerCase();
      const mapping = (await store.get(MAPPING_KEY,{type:'json',consistency:'strong'})) || {};
      const master = (await store.get(SHELF_KEY,{type:'json',consistency:'strong'})) || {};

      if (action === 'stats') {
        return reply(200,{ok:true,mapping_count:Object.keys(mapping).length,group_count:Object.keys(master).length,updated_at:master.__updated_at || mapping.__updated_at || null});
      }
      if (!q) return reply(400,{ok:false,error:'กรุณาระบุ Material Code หรือ Material Group'});

      const directGroup = mapping[q] || null;
      const requestedGroup = directGroup || q;
      const resolved = resolveGroup(master, requestedGroup);
      if (!resolved) {
        return reply(200,{ok:true,found:false,input:q,material_code:directGroup?q:null,material_group:directGroup || (looksLikeGroup(q)?q:null),message:'ไม่พบข้อกำหนดใน Master'});
      }

      const groupKey = resolved.key;
      const records = Array.isArray(resolved.record) ? resolved.record : [resolved.record];
      const groupCanonical = canonicalGroup(groupKey);
      const materialCodes = Object.entries(mapping)
        .filter(([code,group]) => code !== '__updated_at' && canonicalGroup(group) === groupCanonical)
        .map(([code])=>code)
        .sort();

      return reply(200,{
        ok:true,
        found:true,
        input:q,
        search_type:directGroup?'material_code':'material_group',
        material_code:directGroup?q:null,
        material_group:groupKey,
        mapped_group:directGroup || null,
        material_codes:materialCodes,
        record:records[0] || null,
        records
      });
    }

    const body = JSON.parse(event.body || '{}');
    const action = String(body.action || '').toLowerCase();
    if (action === 'replace_mapping') {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      const mapping = {};
      for (const row of rows) {
        const code = normalize(row.material_code);
        const group = normalize(row.material_group);
        if (!code || !group || code.endsWith('-P')) continue;
        mapping[code] = group;
      }
      Object.defineProperty(mapping,'__updated_at',{value:new Date().toISOString(),enumerable:true});
      await store.setJSON(MAPPING_KEY,mapping);
      return reply(200,{ok:true,count:Object.keys(mapping).filter(k=>k!=='__updated_at').length});
    }

    if (action === 'replace_shelf_master') {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      const master = {};
      for (const row of rows) {
        const group = normalize(row.material_group);
        if (!group) continue;
        const record = {
          main_category_th:clean(row.main_category_th),
          main_category_en:clean(row.main_category_en),
          sub_category_th:clean(row.sub_category_th),
          sub_category_en:clean(row.sub_category_en),
          material_type_th:clean(row.material_type_th),
          material_type_en:clean(row.material_type_en),
          packaging:clean(row.packaging),
          shelf_life:clean(row.shelf_life),
          shelf_life_months:parseShelfLifeMonths(row.shelf_life),
          temperature:clean(row.temperature),
          humidity:clean(row.humidity),
          moisture_sensitive:clean(row.moisture_sensitive),
          remark:clean(row.remark),
          source:clean(row.source) || 'Shelf-Life Master'
        };
        if (!master[group]) master[group] = [];
        master[group].push(record);
      }
      Object.defineProperty(master,'__updated_at',{value:new Date().toISOString(),enumerable:true});
      await store.setJSON(SHELF_KEY,master);
      return reply(200,{ok:true,count:Object.keys(master).filter(k=>k!=='__updated_at').length});
    }

    if (action === 'export') {
      const mapping = (await store.get(MAPPING_KEY,{type:'json',consistency:'strong'})) || {};
      const master = (await store.get(SHELF_KEY,{type:'json',consistency:'strong'})) || {};
      return reply(200,{ok:true,mapping,master});
    }
    return reply(400,{ok:false,error:'Unknown action'});
  } catch (error) {
    console.error('material-master error',error);
    return reply(500,{ok:false,error:error?.message || 'Material master service error'});
  }
};

function verifyToken(event){
  const token=String(event.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!token || !process.env.SUPABASE_JWT_SECRET) return {ok:false};
  try{jwt.verify(token,process.env.SUPABASE_JWT_SECRET,{algorithms:['HS256']});return {ok:true};}catch(_e){return {ok:false};}
}
function normalize(v){return String(v||'').trim().toUpperCase().replace(/\s+/g,'');}
function clean(v){const s=String(v==null?'':v).trim();return s || null;}
function canonicalGroup(value){
  const s=normalize(value);
  const m=s.match(/^([A-Z]+)(\d+)([A-Z0-9]+)$/);
  if(!m)return s;
  return `${m[1]}${Number(m[2])}${m[3]}`;
}
function resolveGroup(master,group){
  const g=normalize(group);
  if(master[g])return {key:g,record:master[g]};
  const target=canonicalGroup(g);
  for(const [key,record] of Object.entries(master)){
    if(key==='__updated_at')continue;
    if(canonicalGroup(key)===target)return {key,record};
  }
  return null;
}
function looksLikeGroup(v){return /^[A-Z]+\d+[A-Z0-9]+$/.test(normalize(v));}
function parseShelfLifeMonths(value){
  const s=String(value||'').trim().toLowerCase().replace(/\s+/g,'');
  if(!s)return null;
  if(/ครึ่งปี|半年/.test(s))return 6;
  if(/สองปี/.test(s))return 24;
  if(/สามปี/.test(s))return 36;
  let m=s.match(/(\d+(?:\.\d+)?)ปี/); if(m)return Math.round(Number(m[1])*12);
  m=s.match(/(\d+(?:\.\d+)?)เดือน/); if(m)return Math.round(Number(m[1]));
  m=s.match(/(\d+(?:\.\d+)?)month/); if(m)return Math.round(Number(m[1]));
  m=s.match(/(\d+(?:\.\d+)?)year/); if(m)return Math.round(Number(m[1])*12);
  return null;
}
function reply(statusCode,body){return {statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(body)};}

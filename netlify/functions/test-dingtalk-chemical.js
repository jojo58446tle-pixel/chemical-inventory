const jwt = require("jsonwebtoken");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405,{ok:false,error:"Method not allowed"});
  try {
    const token=(event.headers.authorization||"").replace(/^Bearer\s+/i,"");
    if(!token)return reply(401,{ok:false,error:"Unauthorized"});
    try{jwt.verify(token,process.env.SUPABASE_JWT_SECRET,{algorithms:["HS256"]});}
    catch(_e){return reply(401,{ok:false,error:"Unauthorized"});}

    JSON.parse(event.body || "{}");
    const webhook=process.env.DINGTALK_WEBHOOK_URL;
    if(!webhook)throw new Error("ยังไม่ได้ตั้งค่า DINGTALK_WEBHOOK_URL");

    const now=new Intl.DateTimeFormat("th-TH",{timeZone:"Asia/Bangkok",dateStyle:"medium",timeStyle:"medium"}).format(new Date());
    const content=[
      "แจ้งเตือนสารเคมี",
      "Chemical DingTalk Connection Test",
      "Material Shelf-Life & Storage Control System",
      `Time: ${now}`
    ].join("\n");

    const headers={"Content-Type":"text/plain; charset=utf-8"};
    const requestBody=content;

    const r=await fetch(webhook,{method:"POST",headers,body:requestBody});
    const text=await r.text();
    if(!r.ok)throw new Error(`DingTalk HTTP ${r.status}: ${text.slice(0,500)}`);

    let parsed=null;
    try{parsed=JSON.parse(text);}catch(_e){}
    if(parsed && "errcode" in parsed && Number(parsed.errcode)!==0){
      throw new Error(`DingTalk error ${parsed.errcode}: ${parsed.errmsg||"Unknown error"}`);
    }

    return reply(200,{
      ok:true,
      accepted:true,
      sent_at:new Date().toISOString(),
      http_status:r.status,
      response:text.slice(0,600),
      workflow_text:true
    });
  } catch(e){
    console.error("Chemical DingTalk test error:",e);
    return reply(500,{ok:false,error:e.message||"DingTalk test failed"});
  }
};

function reply(statusCode,body){return{statusCode,headers:{"Content-Type":"application/json","Cache-Control":"no-store"},body:JSON.stringify(body)}}

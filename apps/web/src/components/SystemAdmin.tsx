import React, { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function SystemAdmin({ onClose }: { onClose: () => void }) {
  const [connections,setConnections]=useState<any[]>([]);
  const [health,setHealth]=useState<any>(null);
  const [backups,setBackups]=useState<any[]>([]);

  async function load() {
    const [c,h,b] = await Promise.all([
      api("/admin/connections"),
      api("/admin/system/health"),
      api("/admin/system/backups")
    ]);
    setConnections(c); setHealth(h); setBackups(b);
  }

  useEffect(()=>{load()},[]);

  async function configure(c:any) {
    const config:any = {};
    if(c.kind==="AI"){config.apiKey=prompt("API Key")||"";config.baseUrl=prompt("Base URL اختياري")||""}
    if(c.kind==="PAYMENT"){config.clientId=prompt("Client ID / Merchant ID")||"";config.secret=prompt("Secret")||"";config.webhookSecret=prompt("Webhook Secret")||""}
    if(c.kind==="EMAIL"){config.host=prompt("SMTP Host")||"";config.port=Number(prompt("SMTP Port")||587);config.user=prompt("SMTP User")||"";config.pass=prompt("SMTP Password")||""}
    if(c.kind==="STORAGE"){config.bucket=prompt("Bucket")||"";config.endpoint=prompt("Endpoint")||"";config.accessKey=prompt("Access Key")||"";config.secretKey=prompt("Secret Key")||""}
    if(c.kind==="CACHE"){config.url=prompt("Redis URL")||""}

    await api(`/admin/connections/${c.code}`,{
      method:"PUT",
      body:JSON.stringify({name:c.name,kind:c.kind,enabled:true,mode:"test",config,publicSettings:{}})
    });
    await load();
  }

  async function test(code:string){
    try{
      const d=await api(`/admin/connections/${code}/test`,{method:"POST"});
      alert(`نجح الاتصال خلال ${d.latencyMs}ms`);
    }catch(e:any){alert(e.message)}
    await load();
  }

  async function backup(){
    await api("/admin/system/backup",{method:"POST"});
    alert("تم إنشاء مهمة نسخ احتياطي");
    await load();
  }

  return <div className="adminPage">
    <header className="pageHead"><h1>النظام والاتصالات</h1><button onClick={onClose}>رجوع</button></header>

    <div className="stats">
      {health?.checks?.map((x:any)=><div className="stat" key={x.component}><span>{x.component}</span><b>{x.status}</b><small>{x.latencyMs?`${x.latencyMs}ms`:""}</small></div>)}
    </div>

    <div className="grid2">
      <div className="card">
        <h2>الخدمات الخارجية</h2>
        {connections.map(c=><div className="row" key={c.id}>
          <div><b>{c.name}</b><small> — {c.status} / {c.mode}</small></div>
          <div className="buttonRow"><button onClick={()=>configure(c)}>إعداد</button><button className="secondary" onClick={()=>test(c.code)}>اختبار</button></div>
        </div>)}
      </div>

      <div className="card">
        <h2>النسخ الاحتياطي</h2>
        <button onClick={backup}>إنشاء نسخة احتياطية</button>
        {backups.map(b=><div className="row" key={b.id}><span>{b.type}</span><b>{b.status}</b></div>)}
      </div>
    </div>
  </div>
}

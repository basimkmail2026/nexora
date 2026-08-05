import React, { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function AdminBilling({ onClose }: { onClose: () => void }) {
  const [overview, setOverview] = useState<any>(null);
  const [gateways, setGateways] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [code, setCode] = useState("");
  const [value, setValue] = useState(10);

  async function load() {
    const [o, g, c] = await Promise.all([
      api("/admin/billing/overview"),
      api("/admin/gateways"),
      api("/admin/billing/coupons")
    ]);
    setOverview(o); setGateways(g); setCoupons(c);
  }

  useEffect(()=>{load()},[]);

  async function createCoupon() {
    await api("/admin/billing/coupons", {
      method:"POST",
      body: JSON.stringify({ code, type:"PERCENT", value })
    });
    setCode(""); await load();
  }

  async function configureGateway(g:any) {
    const clientId = prompt(`Client ID / API Key لـ ${g.name}`) || "";
    const secret = prompt(`Secret لـ ${g.name}`) || "";
    const webhookSecret = prompt(`Webhook Secret لـ ${g.name}`) || "";
    await api(`/admin/billing/gateways/${g.id}/config`, {
      method:"PUT",
      body: JSON.stringify({
        enabled:true,
        config:{ clientId, secret, webhookSecret },
        settings:{ mode:"test" }
      })
    });
    await load();
  }

  return <div className="adminPage">
    <header className="pageHead"><h1>الإدارة المالية</h1><button onClick={onClose}>رجوع</button></header>

    <div className="stats">
      {overview && Object.entries(overview).map(([k,v])=><div className="stat" key={k}><span>{k}</span><b>{String(v)}</b></div>)}
    </div>

    <div className="grid2">
      <div className="card">
        <h2>بوابات الدفع</h2>
        {gateways.map(g=><div className="row" key={g.id}><span>{g.name} — {g.enabled?"مفعلة":"متوقفة"}</span>
          <button onClick={()=>configureGateway(g)}>إعداد</button></div>)}
      </div>

      <div className="card">
        <h2>كوبونات الخصم</h2>
        <input placeholder="CODE" value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/>
        <input type="number" value={value} onChange={e=>setValue(Number(e.target.value))}/>
        <button onClick={createCoupon}>إنشاء كوبون</button>
        {coupons.map(c=><div className="row" key={c.id}><span>{c.code}</span><b>{c.value.toString()}%</b></div>)}
      </div>
    </div>
  </div>;
}

import React, { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function Analytics({ assistantId, onClose }: { assistantId?: string; onClose: () => void }) {
  const [assistants,setAssistants]=useState<any[]>([]);
  const [selected,setSelected]=useState(assistantId||"");
  const [data,setData]=useState<any>(null);

  useEffect(()=>{api("/assistants").then(setAssistants)},[]);
  useEffect(()=>{if(selected) api(`/analytics/assistants/${selected}?days=30`).then(setData)},[selected]);

  return <div className="adminPage">
    <header className="pageHead"><h1>التحليلات</h1><button onClick={onClose}>رجوع</button></header>
    <div className="card">
      <select value={selected} onChange={e=>setSelected(e.target.value)}>
        <option value="">اختر مساعدًا</option>
        {assistants.map(a=><option value={a.id} key={a.id}>{a.name}</option>)}
      </select>
    </div>
    {data && <>
      <div className="stats">
        {Object.entries(data.totals).map(([k,v])=><div className="stat" key={k}><span>{k}</span><b>{String(v)}</b></div>)}
      </div>
      <div className="card">
        <h2>آخر 30 يوم</h2>
        <div className="chartBars">
          {data.rows.map((r:any)=><div className="barWrap" key={r.id} title={`${r.messages} رسالة`}>
            <div className="bar" style={{height:`${Math.max(8,Math.min(180,r.messages*8))}px`}}></div>
            <small>{new Date(r.date).getUTCDate()}</small>
          </div>)}
        </div>
      </div>
    </>}
  </div>;
}

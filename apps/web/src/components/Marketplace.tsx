import React, { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function Marketplace({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState("");

  async function load() {
    setItems(await api(`/marketplace?q=${encodeURIComponent(q)}`));
  }

  useEffect(() => { load(); }, []);

  async function install(id: string) {
    try {
      const data = await api(`/marketplace/${id}/install`, { method: "POST" });
      alert(data.assistant ? "تم تثبيت القالب وإنشاء مساعد جديد" : "تم التثبيت");
    } catch (e: any) { alert(e.message); }
  }

  return <div className="adminPage">
    <header className="pageHead"><h1>Marketplace</h1><button onClick={onClose}>رجوع</button></header>
    <div className="card searchBar">
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="ابحث عن قالب أو مساعد"/>
      <button onClick={load}>بحث</button>
    </div>
    <div className="marketGrid">
      {items.map(item => <div className="card marketItem" key={item.id}>
        <span className="badge">{item.category}</span>
        <h2>{item.nameAr}</h2>
        <p>{item.descriptionAr}</p>
        <div className="row"><span>⭐ {item.ratingAverage.toFixed(1)}</span><span>{item.downloads} تثبيت</span></div>
        <div className="price">{Number(item.price) === 0 ? "مجاني" : `${item.price} ${item.currency}`}</div>
        <button onClick={()=>install(item.id)}>تثبيت</button>
      </div>)}
    </div>
  </div>;
}

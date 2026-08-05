import React, { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function WhiteLabel({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<any>({
    brandName:"Nexora",primaryColor:"#6d4aff",secondaryColor:"#17b890",
    hideNexoraBrand:false,logoUrl:"",faviconUrl:"",customDomain:"",
    emailFromName:"",emailFromAddress:"",customCss:""
  });

  useEffect(()=>{api("/white-label").then(d=>d&&setForm({...form,...d}))},[]);

  async function save() {
    const body = {...form};
    ["logoUrl","faviconUrl","customDomain","emailFromName","emailFromAddress","customCss"].forEach(k=>{
      if(body[k]==="") body[k]=null;
    });
    await api("/white-label",{method:"PUT",body:JSON.stringify(body)});
    alert("تم حفظ الهوية");
  }

  return <div className="adminPage">
    <header className="pageHead"><h1>White Label</h1><button onClick={onClose}>رجوع</button></header>
    <div className="grid2">
      <div className="card">
        <h2>الهوية</h2>
        <input value={form.brandName} onChange={e=>setForm({...form,brandName:e.target.value})} placeholder="اسم العلامة"/>
        <input value={form.logoUrl||""} onChange={e=>setForm({...form,logoUrl:e.target.value})} placeholder="رابط الشعار"/>
        <input value={form.faviconUrl||""} onChange={e=>setForm({...form,faviconUrl:e.target.value})} placeholder="رابط الأيقونة"/>
        <label>اللون الأساسي<input type="color" value={form.primaryColor} onChange={e=>setForm({...form,primaryColor:e.target.value})}/></label>
        <label>اللون الثانوي<input type="color" value={form.secondaryColor} onChange={e=>setForm({...form,secondaryColor:e.target.value})}/></label>
        <label><input type="checkbox" checked={form.hideNexoraBrand} onChange={e=>setForm({...form,hideNexoraBrand:e.target.checked})}/> إخفاء علامة نكسورا</label>
      </div>
      <div className="card">
        <h2>الدومين والبريد</h2>
        <input value={form.customDomain||""} onChange={e=>setForm({...form,customDomain:e.target.value})} placeholder="app.example.com"/>
        <input value={form.emailFromName||""} onChange={e=>setForm({...form,emailFromName:e.target.value})} placeholder="اسم المرسل"/>
        <input value={form.emailFromAddress||""} onChange={e=>setForm({...form,emailFromAddress:e.target.value})} placeholder="support@example.com"/>
        <textarea rows={8} value={form.customCss||""} onChange={e=>setForm({...form,customCss:e.target.value})} placeholder="CSS مخصص"/>
        <button onClick={save}>حفظ</button>
      </div>
    </div>
  </div>;
}

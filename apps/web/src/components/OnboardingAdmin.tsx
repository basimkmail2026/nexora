import React, { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function OnboardingAdmin() {
  const [items, setItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [reply, setReply] = useState("");
  async function loadList() { setItems(await api("/onboarding/admin/requests")); }
  async function open(id: string) { setSelected(await api(`/onboarding/admin/requests/${id}`)); }
  useEffect(() => { loadList(); }, []);
  async function send() { if (!reply.trim() || !selected) return; await api(`/onboarding/admin/requests/${selected.id}/messages`, { method: "POST", body: JSON.stringify({ content: reply.trim() }) }); setReply(""); await open(selected.id); await loadList(); }
  async function update(patch: any) { const row = await api(`/onboarding/admin/requests/${selected.id}`, { method: "PATCH", body: JSON.stringify(patch) }); setSelected({ ...selected, ...row }); await loadList(); }
  return <div className="onboardingAdmin">
    <aside className="onboardingQueue"><div className="contentHead"><div><span className="eyebrow">ONBOARDING</span><h2>طلبات المساعدين</h2></div></div>{items.map(item => <button key={item.id} className={selected?.id === item.id ? "active" : ""} onClick={() => open(item.id)}><b>{item.companyName}</b><span>{item.assistantName}</span><small>{item.status} · {item._count.messages} رسائل</small></button>)}</aside>
    <section className="onboardingCase">{!selected ? <div className="emptyState"><h3>اختر طلبًا للمراجعة</h3></div> : <>
      <div className="contentHead"><div><span className="eyebrow">{selected.id}</span><h2>{selected.companyName} — {selected.assistantName}</h2><p>{selected.fullName} · {selected.email} · {selected.websiteUrl}</p></div><select value={selected.status} onChange={e => update({ status: e.target.value })}><option>PENDING_REVIEW</option><option>NEEDS_INFO</option><option>IN_PROGRESS</option><option>READY_FOR_TEST</option><option>ACTIVE</option><option>REJECTED</option><option>CLOSED</option></select></div>
      <div className="caseDetails"><p>{selected.businessDescription}</p>{selected.files?.map((file: any) => <a key={file.id} href={`/api/onboarding/admin/files/${file.id}`} target="_blank" rel="noreferrer">📎 {file.originalName}</a>)}</div>
      <div className="caseMessages">{selected.messages.map((m: any) => <div key={m.id} className={`caseMessage ${m.sender.toLowerCase()}`}><b>{m.sender === "SUPPORT" ? "موظف الدعم" : m.sender === "CUSTOMER" ? "العميل" : "النظام"}</b><p>{m.content}</p></div>)}</div>
      <div className="agentComposer"><textarea value={reply} onChange={e => setReply(e.target.value)} placeholder="اكتب ردًا للعميل…"/><button className="primaryAction" onClick={send}>إرسال</button></div>
      <div className="activationPanel"><input placeholder="Public Key" value={selected.assistantPublicKey || ""} onChange={e => setSelected({ ...selected, assistantPublicKey: e.target.value })}/><textarea placeholder="كود التثبيت" value={selected.embedCode || ""} onChange={e => setSelected({ ...selected, embedCode: e.target.value })}/><button onClick={() => update({ assistantPublicKey: selected.assistantPublicKey || null, embedCode: selected.embedCode || null, status: "ACTIVE" })}>حفظ وتفعيل</button></div>
    </>}</section>
  </div>;
}

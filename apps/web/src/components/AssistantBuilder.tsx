import React, { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function AssistantBuilder({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [name, setName] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [testReply, setTestReply] = useState("");
  const [apiKey, setApiKey] = useState("");

  async function load() {
    setItems(await api("/assistants"));
  }

  async function open(id: string) {
    setSelected(await api(`/assistants/${id}`));
  }

  useEffect(() => { load(); }, []);

  async function create() {
    const item = await api("/assistants", {
      method: "POST",
      body: JSON.stringify({ name, language: "ar" })
    });
    setName("");
    await load();
    await open(item.id);
  }

  async function save() {
    const updated = await api(`/assistants/${selected.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: selected.name,
        description: selected.description,
        systemPrompt: selected.systemPrompt,
        temperature: Number(selected.temperature),
        maxOutputTokens: Number(selected.maxOutputTokens),
        fallbackMessage: selected.fallbackMessage
      })
    });
    setSelected({ ...selected, ...updated });
    alert("تم الحفظ");
  }

  async function addFaq() {
    await api(`/assistants/${selected.id}/faqs`, {
      method: "POST",
      body: JSON.stringify({ question, answer })
    });
    setQuestion(""); setAnswer("");
    await open(selected.id);
  }

  async function uploadFile(file: File) {
    const token = localStorage.getItem("accessToken");
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`/api/assistants/${selected.id}/documents`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "فشل الرفع");
    await open(selected.id);
  }

  async function test() {
    const data = await api(`/assistants/${selected.id}/test-chat`, {
      method: "POST",
      body: JSON.stringify({ message: testMessage })
    });
    setTestReply(data.reply);
  }

  async function createKey() {
    const data = await api(`/assistants/${selected.id}/api-keys`, {
      method: "POST",
      body: JSON.stringify({ name: "Default API Key" })
    });
    setApiKey(data.apiKey);
    await open(selected.id);
  }

  if (!selected) {
    return <div className="adminPage">
      <header className="pageHead"><h1>منشئ المساعدين</h1><button onClick={onClose}>رجوع</button></header>
      <div className="card">
        <h2>إنشاء مساعد جديد</h2>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="اسم المساعد"/>
        <button onClick={create}>إنشاء</button>
      </div>
      <div className="grid2">
        {items.map(item => <button className="card assistantCard" key={item.id} onClick={()=>open(item.id)}>
          <h3>{item.name}</h3><p>{item.description || "بدون وصف"}</p><small>{item.status}</small>
        </button>)}
      </div>
    </div>;
  }

  const kb = selected.knowledgeBases?.[0];

  return <div className="adminPage">
    <header className="pageHead"><h1>{selected.name}</h1><button onClick={()=>setSelected(null)}>كل المساعدين</button></header>

    <div className="grid2">
      <div className="card">
        <h2>الإعدادات</h2>
        <input value={selected.name || ""} onChange={e=>setSelected({...selected,name:e.target.value})}/>
        <textarea rows={3} value={selected.description || ""} onChange={e=>setSelected({...selected,description:e.target.value})} placeholder="الوصف"/>
        <textarea rows={9} value={selected.systemPrompt || ""} onChange={e=>setSelected({...selected,systemPrompt:e.target.value})} placeholder="تعليمات المساعد"/>
        <input type="number" step="0.1" min="0" max="2" value={selected.temperature} onChange={e=>setSelected({...selected,temperature:e.target.value})}/>
        <input type="number" value={selected.maxOutputTokens} onChange={e=>setSelected({...selected,maxOutputTokens:e.target.value})}/>
        <textarea rows={3} value={selected.fallbackMessage || ""} onChange={e=>setSelected({...selected,fallbackMessage:e.target.value})}/>
        <button onClick={save}>حفظ الإعدادات</button>
        <button className="secondary" onClick={async()=>{await api(`/assistants/${selected.id}/publish`,{method:"POST"});await open(selected.id)}}>نشر المساعد</button>
      </div>

      <div className="card">
        <h2>قاعدة المعرفة</h2>
        <input type="file" accept=".pdf,.docx,.txt,.csv,.md" onChange={e=>e.target.files?.[0]&&uploadFile(e.target.files[0]).catch(err=>alert(err.message))}/>
        {kb?.documents?.map((d:any)=><div className="row" key={d.id}><span>{d.originalName}<small> — {d.status}</small></span>
          <button onClick={async()=>{await api(`/assistants/${selected.id}/documents/${d.id}`,{method:"DELETE"});await open(selected.id)}}>حذف</button></div>)}
      </div>

      <div className="card">
        <h2>الأسئلة والأجوبة</h2>
        <input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="السؤال"/>
        <textarea value={answer} onChange={e=>setAnswer(e.target.value)} placeholder="الجواب"/>
        <button onClick={addFaq}>إضافة</button>
        {selected.faqItems?.map((f:any)=><div className="faq" key={f.id}><b>{f.question}</b><p>{f.answer}</p></div>)}
      </div>

      <div className="card">
        <h2>الاختبار المباشر</h2>
        <textarea value={testMessage} onChange={e=>setTestMessage(e.target.value)} placeholder="اكتب سؤالًا"/>
        <button onClick={test}>اختبار</button>
        {testReply && <div className="testReply">{testReply}</div>}
      </div>

      <div className="card">
        <h2>API</h2>
        <button onClick={createKey}>إنشاء API Key</button>
        {apiKey && <code>{apiKey}</code>}
        <p>Assistant ID</p><code>{selected.id}</code>
      </div>

      <div className="card">
        <h2>Widget</h2>
        <p>الكود الجاهز للإضافة للموقع:</p>
        <code>{`<script src="${location.origin}/nexora-widget.js" data-assistant="${selected.id}"></script>`}</code>
      </div>
    </div>
  </div>;
}

import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

type MarketItem = {
  id: string;
  nameAr: string;
  nameEn?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  category?: string;
  type?: string;
  ratingAverage?: number;
  downloads?: number;
  price?: number | string;
  currency?: string;
  tags?: string[];
};

const categories = ["الكل", "خدمة العملاء", "التجارة", "التسويق", "التعليم", "الإنتاجية"];

export default function Marketplace({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<MarketItem[]>([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("الكل");
  const [sort, setSort] = useState("popular");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setItems(await api(`/marketplace?q=${encodeURIComponent(q)}`));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    let list = items.filter(item => category === "الكل" || item.category === category);
    return [...list].sort((a, b) => {
      if (sort === "rating") return Number(b.ratingAverage || 0) - Number(a.ratingAverage || 0);
      if (sort === "price") return Number(a.price || 0) - Number(b.price || 0);
      return Number(b.downloads || 0) - Number(a.downloads || 0);
    });
  }, [items, category, sort]);

  async function install(id: string) {
    try {
      const data = await api(`/marketplace/${id}/install`, { method: "POST" });
      alert(data.assistant ? "تم تثبيت القالب وإنشاء مساعد جديد" : "تم التثبيت بنجاح");
    } catch (e: any) {
      alert(e.message);
    }
  }

  return <div className="marketPage">
    <header className="marketHero">
      <button className="marketBack" onClick={onClose}>← رجوع</button>
      <div>
        <span className="eyebrow">NEXORA MARKETPLACE</span>
        <h1>اكتشف مساعدين وقوالب جاهزة للعمل</h1>
        <p>ابدأ بسرعة باستخدام حلول موثوقة، ثم خصّصها بما يناسب شركتك.</p>
      </div>
      <div className="marketHeroStat"><b>{items.length}</b><span>عنصر متاح</span></div>
    </header>

    <section className="marketToolbar">
      <div className="marketSearch">
        <span>⌕</span>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && load()} placeholder="ابحث عن مساعد، قالب أو سير عمل" />
        <button onClick={load}>بحث</button>
      </div>
      <select value={sort} onChange={e => setSort(e.target.value)}>
        <option value="popular">الأكثر تثبيتًا</option>
        <option value="rating">الأعلى تقييمًا</option>
        <option value="price">السعر: الأقل أولًا</option>
      </select>
    </section>

    <div className="categoryRail">
      {categories.map(item => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}
    </div>

    {loading ? <div className="marketEmpty">جاري تحميل السوق…</div> : visible.length === 0 ? <div className="marketEmpty">لا توجد نتائج مطابقة. جرّب عبارة بحث أخرى.</div> : <div className="marketGrid">
      {visible.map(item => <article className="marketCard" key={item.id}>
        <div className="marketCardTop">
          <div className="marketIcon">✦</div>
          <div className="marketMeta"><span>{item.category || "عام"}</span><small>{item.type || "Assistant"}</small></div>
        </div>
        <h2>{item.nameAr || item.nameEn}</h2>
        <p>{item.descriptionAr || item.descriptionEn || "مساعد جاهز للتخصيص والاستخدام."}</p>
        {!!item.tags?.length && <div className="marketTags">{item.tags.slice(0, 3).map(tag => <span key={tag}>{tag}</span>)}</div>}
        <div className="marketMetrics"><span>★ {Number(item.ratingAverage || 0).toFixed(1)}</span><span>{Number(item.downloads || 0).toLocaleString()} تثبيت</span></div>
        <footer>
          <div className="marketPrice">{Number(item.price || 0) === 0 ? <><b>مجاني</b><small>ابدأ الآن</small></> : <><b>{item.price} {item.currency}</b><small>دفعة واحدة</small></>}</div>
          <button onClick={() => install(item.id)}>تثبيت</button>
        </footer>
      </article>)}
    </div>}
  </div>;
}

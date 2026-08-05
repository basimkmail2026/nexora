import React, { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function Billing({ onClose }: { onClose: () => void }) {
  const [plans, setPlans] = useState<any[]>([]);
  const [account, setAccount] = useState<any>(null);
  const [currency, setCurrency] = useState("USD");
  const [gateway, setGateway] = useState("paypal");
  const [coupon, setCoupon] = useState("");

  useEffect(() => {
    Promise.all([api("/billing/plans"), api("/billing/me")]).then(([p, a]) => {
      setPlans(p); setAccount(a);
    });
  }, []);

  async function checkout(planCode: string, interval: "MONTHLY"|"YEARLY") {
    try {
      const data = await api("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({
          planCode, interval, gatewayCode: gateway, currency,
          couponCode: coupon || undefined
        })
      });
      location.href = data.checkoutUrl;
    } catch (e: any) { alert(e.message); }
  }

  return <div className="adminPage">
    <header className="pageHead"><h1>الباقات والاشتراك</h1><button onClick={onClose}>رجوع</button></header>

    <div className="card">
      <h2>إعدادات الدفع</h2>
      <select value={currency} onChange={e=>setCurrency(e.target.value)}>
        <option>USD</option><option>ILS</option><option>JOD</option>
      </select>
      <select value={gateway} onChange={e=>setGateway(e.target.value)}>
        <option value="paypal">PayPal</option>
        <option value="binance_pay">Binance Pay</option>
        <option value="bank_palestine">Bank of Palestine</option>
        <option value="arab_bank">Arab Bank</option>
      </select>
      <input placeholder="كوبون خصم" value={coupon} onChange={e=>setCoupon(e.target.value.toUpperCase())}/>
    </div>

    <div className="pricing">
      {plans.map(plan => <div className="card priceCard" key={plan.id}>
        <h2>{plan.nameAr}</h2>
        <div className="price">${plan.priceMonthly}<small>/شهري</small></div>
        <p>{plan.messageLimit} رسالة</p>
        <p>{plan.assistantLimit} مساعد</p>
        <p>{plan.voiceMinutes} دقيقة صوت</p>
        <button onClick={()=>checkout(plan.code,"MONTHLY")}>اشتراك شهري</button>
        <button className="secondary" onClick={()=>checkout(plan.code,"YEARLY")}>اشتراك سنوي</button>
      </div>)}
    </div>

    <div className="grid2">
      <div className="card">
        <h2>الاشتراك الحالي</h2>
        <pre>{JSON.stringify(account?.subscription || null, null, 2)}</pre>
      </div>
      <div className="card">
        <h2>الفواتير</h2>
        {account?.invoices?.map((i:any)=><div className="row" key={i.id}><span>{i.number}</span><b>{i.total} {i.currency}</b></div>)}
      </div>
    </div>
  </div>;
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmtINR, fmtDate } from "@/lib/utils";

const EXP_CATS = ["PETTY", "UTILITIES", "INTERNET", "RENT", "SALARY", "REPAIR", "OTHER"];
const PAY_MODES = ["CASH", "UPI", "BANK", "CARD"];

export default function AccountsClient({ expenses, ledger, invoices, centers }: any) {
  const router = useRouter();
  const [tab, setTab] = useState<"EXP" | "LED" | "BAL">("EXP");
  const [show, setShow] = useState(false);
  const [e, setE] = useState<any>({ centerId: "", category: "PETTY", amount: 0, gst: 0, tds: 0, payee: "", paymentMode: "CASH", notes: "" });

  async function submitExp(ev: React.FormEvent) {
    ev.preventDefault();
    const r = await fetch("/api/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(e) });
    if (r.ok) { setShow(false); router.refresh(); }
  }

  // Balance summary
  const totalExpense = expenses.reduce((a: number, x: any) => a + x.amount, 0);
  const totalRevenue = invoices.filter((i: any) => i.status === "PAID").reduce((a: number, x: any) => a + x.totalAmount, 0);
  const cashInHand = expenses.filter((x: any) => x.paymentMode === "CASH").reduce((a: number, x: any) => a - x.amount, 0);
  const totalGST = invoices.reduce((a: number, x: any) => a + x.gstAmount, 0);

  return (
    <div className="space-y-4">
      <h1 className="h1">Accounts / Ledger</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card"><div className="muted text-xs">Revenue (paid)</div><div className="text-xl font-bold mt-1 text-emerald-700">{fmtINR(totalRevenue)}</div></div>
        <div className="card"><div className="muted text-xs">Total Expenses</div><div className="text-xl font-bold mt-1 text-rose-700">{fmtINR(totalExpense)}</div></div>
        <div className="card"><div className="muted text-xs">Cash in Hand</div><div className="text-xl font-bold mt-1">{fmtINR(cashInHand)}</div></div>
        <div className="card"><div className="muted text-xs">GST Collected</div><div className="text-xl font-bold mt-1 text-blue-700">{fmtINR(totalGST)}</div></div>
      </div>

      <div className="flex border-b">
        <button onClick={() => setTab("EXP")} className={`px-4 py-2 text-sm border-b-2 ${tab === "EXP" ? "border-brand-600 text-brand-700" : "border-transparent text-gray-500"}`}>Expenses / Petty Cash</button>
        <button onClick={() => setTab("LED")} className={`px-4 py-2 text-sm border-b-2 ${tab === "LED" ? "border-brand-600 text-brand-700" : "border-transparent text-gray-500"}`}>Ledger</button>
        <button onClick={() => setTab("BAL")} className={`px-4 py-2 text-sm border-b-2 ${tab === "BAL" ? "border-brand-600 text-brand-700" : "border-transparent text-gray-500"}`}>Balance Sheet</button>
      </div>

      {tab === "EXP" && (
        <>
          <button className="btn-primary" onClick={() => setShow(!show)}>+ Add Expense</button>
          {show && (
            <form onSubmit={submitExp} className="card grid sm:grid-cols-3 gap-3">
              <div><label className="label">Center</label>
                <select className="input" value={e.centerId} onChange={(ev) => setE({ ...e, centerId: ev.target.value })}>
                  <option value="">— HQ —</option>
                  {centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><label className="label">Category</label>
                <select className="input" value={e.category} onChange={(ev) => setE({ ...e, category: ev.target.value })}>{EXP_CATS.map((c) => <option key={c}>{c}</option>)}</select>
              </div>
              <div><label className="label">Mode</label>
                <select className="input" value={e.paymentMode} onChange={(ev) => setE({ ...e, paymentMode: ev.target.value })}>{PAY_MODES.map((c) => <option key={c}>{c}</option>)}</select>
              </div>
              <div><label className="label">Amount *</label><input className="input" required type="number" value={e.amount} onChange={(ev) => setE({ ...e, amount: Number(ev.target.value) })} /></div>
              <div><label className="label">GST</label><input className="input" type="number" value={e.gst} onChange={(ev) => setE({ ...e, gst: Number(ev.target.value) })} /></div>
              <div><label className="label">TDS</label><input className="input" type="number" value={e.tds} onChange={(ev) => setE({ ...e, tds: Number(ev.target.value) })} /></div>
              <div><label className="label">Payee *</label><input className="input" required value={e.payee} onChange={(ev) => setE({ ...e, payee: ev.target.value })} /></div>
              <div className="sm:col-span-2"><label className="label">Notes</label><input className="input" value={e.notes} onChange={(ev) => setE({ ...e, notes: ev.target.value })} /></div>
              <div className="sm:col-span-3 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setShow(false)}>Cancel</button><button className="btn-primary">Save</button></div>
            </form>
          )}
          <div className="card overflow-x-auto">
            <table className="table">
              <thead><tr><th>Date</th><th>Center</th><th>Category</th><th>Payee</th><th>Amount</th><th>GST</th><th>TDS</th><th>Mode</th></tr></thead>
              <tbody>
                {expenses.map((x: any) => (
                  <tr key={x.id}>
                    <td>{fmtDate(x.date)}</td>
                    <td>{x.center?.name || "HQ"}</td>
                    <td>{x.category}</td>
                    <td>{x.payee}</td>
                    <td>{fmtINR(x.amount)}</td>
                    <td>{fmtINR(x.gst)}</td>
                    <td>{fmtINR(x.tds)}</td>
                    <td>{x.paymentMode}</td>
                  </tr>
                ))}
                {expenses.length === 0 && <tr><td colSpan={8} className="text-center text-gray-400 py-8">No expenses</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "LED" && (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Date</th><th>Account</th><th>Debit</th><th>Credit</th><th>Ref</th><th>Narration</th></tr></thead>
            <tbody>
              {ledger.map((l: any) => (
                <tr key={l.id}>
                  <td>{fmtDate(l.date)}</td>
                  <td className="font-medium">{l.account}</td>
                  <td>{fmtINR(l.debit)}</td>
                  <td>{fmtINR(l.credit)}</td>
                  <td className="text-xs">{l.refType}</td>
                  <td className="text-xs">{l.narration}</td>
                </tr>
              ))}
              {ledger.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-8">No ledger entries</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "BAL" && (
        <div className="card">
          <h2 className="h2">Balance Sheet (simplified)</h2>
          <div className="grid sm:grid-cols-2 gap-4 mt-3">
            <div>
              <div className="font-semibold text-gray-700 mb-2">ASSETS</div>
              <div className="flex justify-between border-b py-1"><span>Cash in Hand</span><span>{fmtINR(cashInHand)}</span></div>
              <div className="flex justify-between border-b py-1"><span>Sundry Debtors (unpaid invoices)</span><span>{fmtINR(invoices.filter((i: any) => i.status !== "PAID").reduce((a: number, x: any) => a + x.totalAmount, 0))}</span></div>
            </div>
            <div>
              <div className="font-semibold text-gray-700 mb-2">LIABILITIES & EQUITY</div>
              <div className="flex justify-between border-b py-1"><span>GST payable</span><span>{fmtINR(totalGST)}</span></div>
              <div className="flex justify-between border-b py-1"><span>Net Surplus</span><span>{fmtINR(totalRevenue - totalExpense)}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

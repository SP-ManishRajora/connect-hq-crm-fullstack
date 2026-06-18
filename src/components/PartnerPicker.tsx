"use client";
import { useState } from "react";
import { isValidIndianPhone, isValidEmail } from "@/lib/validators";

const SOURCE_TYPES = ["Broker", "Agent", "IPC"];

type Contact = { id: string; name: string; phone?: string | null; email?: string | null };
type Partner = { id: string; type: string; organisation: string; contacts: Contact[] };

/**
 * Channel-partner picker: source type (Broker/Agent/IPC) -> organisation -> contact person.
 * Both organisations and contacts can be created inline.
 *
 * Controlled via `sourceType` / `partnerContactId`. `partners` is the full firm list
 * (with their contacts); it is kept in local state so inline-created entries appear immediately.
 */
export default function PartnerPicker({
  partners,
  sourceType,
  partnerContactId,
  onChange,
}: {
  partners: Partner[];
  sourceType: string;
  partnerContactId: string;
  onChange: (next: { sourceType: string; partnerContactId: string }) => void;
}) {
  const [list, setList] = useState<Partner[]>(partners);
  const [orgId, setOrgId] = useState<string>(() => {
    // Derive the firm from the selected contact (e.g. when editing an existing lead).
    const firm = partners.find((p) => p.contacts.some((c) => c.id === partnerContactId));
    return firm?.id || "";
  });
  const [addingOrg, setAddingOrg] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newOrg, setNewOrg] = useState("");
  const [newContact, setNewContact] = useState({ name: "", phone: "", email: "" });

  const firmsOfType = list.filter((p) => p.type === sourceType);
  const selectedFirm = list.find((p) => p.id === orgId);
  const contacts = selectedFirm?.contacts || [];

  function changeType(t: string) {
    setOrgId("");
    setAddingOrg(false);
    setAddingContact(false);
    onChange({ sourceType: t, partnerContactId: "" });
  }

  function changeOrg(id: string) {
    setOrgId(id);
    setAddingContact(false);
    onChange({ sourceType, partnerContactId: "" }); // reset contact when firm changes
  }

  async function createOrg() {
    if (!sourceType || !newOrg.trim()) return;
    setSaving(true);
    const res = await fetch("/api/partners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: sourceType, organisation: newOrg.trim() }),
    });
    setSaving(false);
    if (res.ok) {
      const firm: Partner = await res.json();
      if (!firm.contacts) firm.contacts = [];
      setList((prev) => [...prev, firm]);
      setOrgId(firm.id);
      setAddingOrg(false);
      setNewOrg("");
    } else {
      const detail = await res.json().catch(() => ({}));
      alert(`Failed (${res.status}): ${detail.error || res.statusText}`);
    }
  }

  const phoneInvalid = newContact.phone.trim() !== "" && !isValidIndianPhone(newContact.phone);
  const emailInvalid = newContact.email.trim() !== "" && !isValidEmail(newContact.email);
  const contactValid = newContact.name.trim() !== "" && !phoneInvalid && !emailInvalid;

  async function createContact() {
    if (!orgId || !contactValid) return;
    setSaving(true);
    const res = await fetch(`/api/partners/${orgId}/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newContact),
    });
    setSaving(false);
    if (res.ok) {
      const contact: Contact = await res.json();
      setList((prev) => prev.map((p) => (p.id === orgId ? { ...p, contacts: [...p.contacts, contact] } : p)));
      onChange({ sourceType, partnerContactId: contact.id });
      setAddingContact(false);
      setNewContact({ name: "", phone: "", email: "" });
    } else {
      const detail = await res.json().catch(() => ({}));
      alert(`Failed (${res.status}): ${detail.error || res.statusText}`);
    }
  }

  return (
    <div className="space-y-2">
      <label className="label">Lead came from</label>
      <select
        className="input"
        title="Source type"
        aria-label="Source type"
        value={sourceType}
        onChange={(e) => changeType(e.target.value)}
      >
        <option value="">— Direct / not via partner —</option>
        {SOURCE_TYPES.map((t) => (
          <option key={t} value={t}>{t === "IPC" ? "IPC (International Property Consultant)" : t}</option>
        ))}
      </select>

      {sourceType && (
        <>
          {/* Organisation */}
          {!addingOrg ? (
            <div className="space-y-1">
              <label className="label">{sourceType} — Organisation</label>
              <select
                className="input"
                title={`${sourceType} organisation`}
                aria-label={`${sourceType} organisation`}
                value={orgId}
                onChange={(e) => changeOrg(e.target.value)}
              >
                <option value="">— Select organisation —</option>
                {firmsOfType.map((p) => (
                  <option key={p.id} value={p.id}>{p.organisation}</option>
                ))}
              </select>
              <button type="button" className="text-xs text-brand-600 hover:underline" onClick={() => setAddingOrg(true)}>
                + Add new {sourceType} organisation
              </button>
            </div>
          ) : (
            <div className="space-y-2 rounded-lg border border-dashed p-3">
              <p className="text-xs font-medium text-gray-600">New {sourceType} organisation</p>
              <input
                className="input" placeholder="Organisation name *"
                value={newOrg}
                onChange={(e) => setNewOrg(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-primary text-xs disabled:opacity-50"
                  disabled={saving || !newOrg.trim()}
                  onClick={createOrg}
                >
                  {saving ? "Saving…" : "Add"}
                </button>
                <button type="button" className="btn-ghost text-xs" onClick={() => setAddingOrg(false)}>Cancel</button>
              </div>
            </div>
          )}

          {/* Contact person (only once a firm is chosen) */}
          {orgId && !addingContact && (
            <div className="space-y-1">
              <label className="label">Contact person</label>
              <select
                className="input"
                title="Contact person"
                aria-label="Contact person"
                value={partnerContactId}
                onChange={(e) => onChange({ sourceType, partnerContactId: e.target.value })}
              >
                <option value="">— Select contact —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.phone ? ` · ${c.phone}` : ""}
                  </option>
                ))}
              </select>
              <button type="button" className="text-xs text-brand-600 hover:underline" onClick={() => setAddingContact(true)}>
                + Add new contact person
              </button>
            </div>
          )}

          {orgId && addingContact && (
            <div className="space-y-2 rounded-lg border border-dashed p-3">
              <p className="text-xs font-medium text-gray-600">New contact at {selectedFirm?.organisation}</p>
              <input
                className="input" placeholder="Contact person *"
                value={newContact.name}
                onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
              />
              <div className="flex gap-2">
                <div className="flex-1">
                  <input
                    className={`input ${phoneInvalid ? "border-rose-400" : ""}`}
                    placeholder="Phone (10-digit mobile)"
                    inputMode="numeric"
                    value={newContact.phone}
                    onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                  />
                  {phoneInvalid && <p className="text-xs text-rose-600 mt-0.5">Enter a valid 10-digit Indian mobile (starts 6-9).</p>}
                </div>
                <div className="flex-1">
                  <input
                    className={`input ${emailInvalid ? "border-rose-400" : ""}`}
                    placeholder="Email"
                    type="email"
                    value={newContact.email}
                    onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                  />
                  {emailInvalid && <p className="text-xs text-rose-600 mt-0.5">Enter a valid email address.</p>}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-primary text-xs disabled:opacity-50"
                  disabled={saving || !contactValid}
                  onClick={createContact}
                >
                  {saving ? "Saving…" : "Add"}
                </button>
                <button type="button" className="btn-ghost text-xs" onClick={() => setAddingContact(false)}>Cancel</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

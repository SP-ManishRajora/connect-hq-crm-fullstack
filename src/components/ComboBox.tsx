"use client";
import { useEffect, useRef, useState } from "react";

// Searchable combobox: type to filter `options`; pick from the dropdown, or — when the typed
// text doesn't exactly match an existing option — choose the "Add" row to use it as a new value.
// `value` is the committed string; `onChange` fires when a value is picked or a new one added.
export default function ComboBox({
  value,
  onChange,
  options,
  placeholder = "Search or add…",
  allowAdd = true,
}: {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
  allowAdd?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  // Keep the visible text in sync when the committed value changes from outside.
  useEffect(() => { setQuery(value); }, [value]);

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(value); // revert visible text to the committed value
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [value]);

  const q = query.trim();
  const filtered = q
    ? options.filter((o) => o.toLowerCase().includes(q.toLowerCase()))
    : options;
  const exactMatch = options.some((o) => o.toLowerCase() === q.toLowerCase());
  const showAdd = allowAdd && q.length > 0 && !exactMatch;

  function commit(val: string) {
    onChange(val);
    setQuery(val);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <input
        className="input"
        value={query}
        placeholder={placeholder}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (q) commit(q); // Enter commits the typed value (existing or new)
          } else if (e.key === "Escape") {
            setOpen(false); setQuery(value);
          }
        }}
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-md border bg-white shadow-lg text-sm">
          {filtered.map((o) => (
            <button
              key={o}
              type="button"
              className={`block w-full text-left px-3 py-1.5 hover:bg-gray-100 ${o === value ? "bg-brand-50 text-brand-700" : ""}`}
              onClick={() => commit(o)}
            >
              {o}
            </button>
          ))}
          {filtered.length === 0 && !showAdd && (
            <div className="px-3 py-2 text-gray-400">No matches</div>
          )}
          {showAdd && (
            <button
              type="button"
              className="block w-full text-left px-3 py-1.5 border-t text-emerald-700 hover:bg-emerald-50"
              onClick={() => commit(q)}
            >
              + Add “{q}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}

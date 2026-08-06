import Link from "next/link";

// Shown when a LOGGED-IN staff member scans the area sticker. Clients reaching the
// same URL never see this — they get the request form directly.
//
// The whole point of the single sticker: the person on the wall side of the QR
// does not have to know which code they are looking at. They scan what is there,
// and the choice of what to do next is made here, by someone who can see the
// options, rather than in advance by whoever printed the labels.
export default function StaffChooser({
  code,
  area,
  centre,
  canInspect,
  openRequests,
}: {
  code: string;
  area: { name: string; floor: string | null; category: string };
  centre: { name: string; city: string };
  canInspect: boolean;
  openRequests: { id: string; ticketNo: string; status: string }[];
}) {
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-md space-y-4">
        <div className="rounded-xl border bg-white p-5">
          <div className="text-xs uppercase tracking-wider text-gray-500">
            {centre.name} · {centre.city}
          </div>
          <div className="mt-0.5 text-xl font-semibold">{area.name}</div>
          <div className="text-xs text-gray-500">
            {area.floor ? `${area.floor} · ` : ""}
            {area.category.replace(/_/g, " ")}
          </div>
        </div>

        <div className="px-1 text-sm text-gray-600">What would you like to do here?</div>

        <div className="space-y-3">
          {canInspect && (
            <Action
              href={`/housekeeping/inspect?code=${encodeURIComponent(code)}`}
              title="Start an inspection"
              body="Opens this area on your round. Scan again inside the app so your position and time are recorded."
              primary
            />
          )}

          {openRequests.length > 0 && (
            <div className="rounded-xl border bg-white p-4">
              <div className="font-medium">Complete a cleaning request</div>
              <div className="mt-0.5 text-xs text-gray-500">
                {openRequests.length} open here
              </div>
              <div className="mt-3 space-y-2">
                {openRequests.map((r) => (
                  <Link
                    key={r.id}
                    href={`/housekeeping/requests?focus=${r.id}&code=${encodeURIComponent(code)}`}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    <span className="font-mono text-xs">{r.ticketNo}</span>
                    <span className="text-xs text-gray-500">
                      {r.status.replace(/_/g, " ").toLowerCase()}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <Action
            href={`/qr/a/${encodeURIComponent(code)}?as=client`}
            title="Report something that needs cleaning"
            body="Raises a request for this area, exactly as a member would see it."
          />

          <Action
            href={`/qr/a/${encodeURIComponent(code)}?review=1`}
            title="Leave a review"
            body="Rate this area. Requires a one-time code sent to your mobile, the same as a member."
          />
        </div>

        <div className="px-1 pb-4 text-center text-[11px] text-gray-400">
          Area code <span className="font-mono">{code}</span>
        </div>
      </div>
    </div>
  );
}

function Action({
  href,
  title,
  body,
  primary,
}: {
  href: string;
  title: string;
  body: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-xl border p-4 hover:bg-gray-50 ${
        primary ? "border-brand-300 bg-brand-50/40" : "bg-white"
      }`}
    >
      <div className={`font-medium ${primary ? "text-brand-800" : ""}`}>{title}</div>
      <div className="mt-0.5 text-xs text-gray-500">{body}</div>
    </Link>
  );
}

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Page() {
  const centers = await prisma.center.findMany({
    include: {
      cabins: { include: { seats: true } },
      _count: { select: { clients: { where: { active: true } } } },
    },
  });

  const data = await Promise.all(
    centers.map(async (c) => {
      const seats = await prisma.seat.findMany({ where: { centerId: c.id }, orderBy: { number: "asc" } });
      const openSeats = seats.filter((s) => !s.cabinId);
      return { ...c, openSeats };
    })
  );

  return (
    <div className="space-y-4">
      <h1 className="h1">Seat Map (real-time)</h1>
      <div className="card flex gap-4 text-xs">
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-500 rounded inline-block"></span> Occupied</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-500 rounded inline-block"></span> Partial occupancy (client took cabin but seat unused)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-gray-200 rounded inline-block"></span> Empty</span>
      </div>

      {data.map((c: any) => {
        const total = c.cabins.reduce((s: number, x: any) => s + x.seats.length, 0) + c.openSeats.length;
        const occupied = c.cabins.reduce((s: number, x: any) => s + x.seats.filter((y: any) => y.occupied).length, 0) +
                          c.openSeats.filter((s: any) => s.occupied).length;
        return (
          <div key={c.id} className="card space-y-3">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h2 className="h2">{c.name} <span className="muted text-sm">— {c.city}</span></h2>
              <span className="text-sm">{occupied}/{total} occupied ({total ? Math.round((occupied / total) * 100) : 0}%)</span>
            </div>

            {c.cabins.map((cabin: any) => (
              <div key={cabin.id} className="border rounded p-3">
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-medium">{cabin.name}</span>
                  <span className="muted text-xs">{cabin.seats.filter((s: any) => s.occupied).length}/{cabin.seats.length}</span>
                </div>
                <div className="grid grid-cols-6 sm:grid-cols-12 gap-1">
                  {cabin.seats.map((s: any) => {
                    const cls = s.occupied
                      ? "bg-emerald-500 text-white"
                      : s.partialOccupancy
                      ? "bg-amber-500 text-white"
                      : "bg-gray-200 text-gray-500";
                    return (
                      <div key={s.id} title={s.number} className={`aspect-square rounded text-[9px] flex items-center justify-center ${cls}`}>{s.number}</div>
                    );
                  })}
                </div>
              </div>
            ))}

            {c.openSeats.length > 0 && (
              <div className="border rounded p-3">
                <div className="text-sm font-medium mb-2">Open / hot-desk seats</div>
                <div className="grid grid-cols-10 sm:grid-cols-15 gap-1">
                  {c.openSeats.map((s: any) => (
                    <div key={s.id} title={s.number} className={`aspect-square rounded text-[9px] flex items-center justify-center ${s.occupied ? "bg-emerald-500 text-white" : "bg-gray-200 text-gray-500"}`}>{s.number}</div>
                  ))}
                </div>
              </div>
            )}

            {c.mapImagePath && <div><img src={c.mapImagePath} alt="floor map" className="rounded border max-w-full" /></div>}
          </div>
        );
      })}
      {data.length === 0 && <div className="card">No centers yet.</div>}
    </div>
  );
}

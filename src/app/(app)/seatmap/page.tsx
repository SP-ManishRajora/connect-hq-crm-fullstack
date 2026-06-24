import { redirect } from "next/navigation";

// Seat Map has been superseded by the Occupancy module's interactive map.
// Kept as a redirect so existing bookmarks/links continue to work.
export default function SeatMapRedirect() {
  redirect("/occupancy/map");
}

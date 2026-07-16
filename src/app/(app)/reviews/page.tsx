import { prisma } from "@/lib/db";
import ReviewsClient from "./ReviewsClient";
export const dynamic = "force-dynamic";

export default async function Page() {
  const reviews = await prisma.review.findMany({
    where: { status: "Active" },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { createdBy: { select: { name: true } } },
  });
  return <ReviewsClient initial={JSON.parse(JSON.stringify(reviews))} />;
}

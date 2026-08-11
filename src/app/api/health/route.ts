import { getHealthResponse } from "@/lib/health/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  return getHealthResponse(request);
}

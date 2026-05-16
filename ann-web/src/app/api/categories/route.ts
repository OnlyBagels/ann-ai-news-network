import { NextResponse } from "next/server";
import { CATEGORIES } from "@/types";

export async function GET() {
  return NextResponse.json(CATEGORIES);
}

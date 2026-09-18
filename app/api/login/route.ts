import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { equal, issueSession } from "@/lib/crypto";
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return NextResponse.json(
      { error: "Request origin is not allowed." },
      { status: 403 },
    );
  const data = await request.json().catch(() => ({}));
  if (typeof data.code !== "string" || data.code.length > 256)
    return NextResponse.json(
      { error: "Enter your access code." },
      { status: 400 },
    );
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const bucket = createHash("sha256")
    .update(`${ip}:${Math.floor(Date.now() / 600000)}`)
    .digest("hex");
  const rows =
    await db()`INSERT INTO login_attempts(bucket,attempts,expires_at) VALUES (${bucket},1,now()+interval '10 minutes') ON CONFLICT(bucket) DO UPDATE SET attempts=login_attempts.attempts+1 RETURNING attempts`;
  if (Number(rows[0].attempts) > 10)
    return NextResponse.json(
      { error: "Too many attempts. Try again in ten minutes." },
      { status: 429 },
    );
  if (
    !process.env.OWNER_ACCESS_CODE ||
    !equal(data.code.trim(), process.env.OWNER_ACCESS_CODE)
  )
    return NextResponse.json(
      { error: "That access code is not correct." },
      { status: 401 },
    );
  const response = NextResponse.json({ ok: true });
  response.cookies.set("eve_owner", issueSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 604800,
  });
  return response;
}

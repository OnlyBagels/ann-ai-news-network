import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    // TODO: Integrate with listmonk API
    // const listmonkUrl = process.env.LISTMONK_URL;
    // const listmonkToken = process.env.LISTMONK_TOKEN;
    //
    // await fetch(`${listmonkUrl}/api/subscribers`, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': `Bearer ${listmonkToken}`,
    //   },
    //   body: JSON.stringify({
    //     email,
    //     lists: [1], // ANN Signal Briefing list ID
    //     status: 'enabled',
    //   }),
    // });

    console.log(`Newsletter signup: ${email}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Newsletter signup error:", error);
    return NextResponse.json(
      { error: "Failed to process signup" },
      { status: 500 }
    );
  }
}

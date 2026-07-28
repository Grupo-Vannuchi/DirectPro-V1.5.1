import { NextRequest, NextResponse } from "next/server";
import { getMedia, getStories } from "@/lib/ig";
import { getSelectedAccount } from "@/lib/account";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";

// Lista posts/reels (padrão) ou stories ativos (?type=stories) da conta
// selecionada no painel, para o seletor visual do formulário.
export async function GET(req: NextRequest) {
  if (!isValidSession(req.cookies.get(SESSION_COOKIE)?.value)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  try {
    const account = await getSelectedAccount();
    if (!account) {
      return NextResponse.json({ error: "Conecte o Instagram primeiro" }, { status: 400 });
    }
    const media =
      req.nextUrl.searchParams.get("type") === "stories"
        ? await getStories(account.ig_user_id, account.access_token)
        : await getMedia(account.ig_user_id, account.access_token, 40);
    return NextResponse.json({ media });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "erro" },
      { status: 500 }
    );
  }
}

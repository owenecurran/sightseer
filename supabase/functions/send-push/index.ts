import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

// Expo's push service. Tokens are ExponentPushToken[...] strings handed to us
// by the client; Expo fans them out to APNs/FCM, which is why this needs no
// Apple or Google credentials of its own.
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
// Expo's documented cap per request.
const EXPO_BATCH_SIZE = 100;

// Invoked by the notify_push trigger, not by a signed-in user, so it uses the
// service role rather than withSupabase({ auth: "user" }): there is no JWT to
// act on behalf of, and it has to read the recipient's device tokens, which
// RLS deliberately exposes to nobody but the owner.
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

type NotificationRow = {
  id: string;
  recipient_id: string;
  type: string;
  visit_id: string | null;
  board_id: string | null;
  travel_book_id: string | null;
  digest_place_ids: string[] | null;
  digest_review_count: number | null;
  actor: { name: string | null; handle: string | null } | null;
  visit: { places: { name: string } | null } | null;
};

// Mirrors the wording on the in-app notifications screen. Kept deliberately
// short: a push is a lock-screen line, not a paragraph.
function buildBody(n: NotificationRow): string {
  const who = n.actor?.name ?? n.actor?.handle ?? "Someone";
  const place = n.visit?.places?.name;
  const at = place ? ` of ${place}` : "";
  switch (n.type) {
    case "like":
      return `${who} liked your review${at}`;
    case "comment":
      return `${who} commented on your review${at}`;
    case "tagged":
      return `${who} tagged you in a review${at}`;
    case "follow":
      return `${who} started following you`;
    case "friend_visit":
      return `${who} posted a new review${at}`;
    case "board_saved":
      return `${who} saved your board`;
    case "travel_book_saved":
      return `${who} saved your travel book`;
    case "board_item_added":
      return `${who} added to a board you saved`;
    case "travel_book_item_added":
      return `${who} added to a travel book you saved`;
    case "friend_review_digest": {
      const missed = n.digest_review_count ?? 0;
      return `You missed ${missed} review${missed === 1 ? "" : "s"} from people you follow`;
    }
    case "nearby_review_digest": {
      const reviews = n.digest_review_count ?? 0;
      const places = n.digest_place_ids?.length ?? 0;
      return `${reviews} new review${reviews === 1 ? "" : "s"} at ${places} place${places === 1 ? "" : "s"} you've been`;
    }
    default:
      return "Something new happened";
  }
}

export default {
  async fetch(req: Request) {
    // The trigger passes a shared secret rather than a user JWT. Without
    // this the function would be an open relay for sending pushes to any
    // account, since it runs with the service role.
    const secret = req.headers.get("x-push-secret");
    if (!secret || secret !== Deno.env.get("PUSH_TRIGGER_SECRET")) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const { notificationId } = await req.json();
    if (typeof notificationId !== "string") {
      return Response.json({ error: "notificationId required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("notifications")
      .select(
        "id, recipient_id, type, visit_id, board_id, travel_book_id, digest_place_ids, digest_review_count, actor:users!actor_id(name, handle), visit:visits!visit_id(places!place_id(name))"
      )
      .eq("id", notificationId)
      .single();

    if (error || !data) {
      return Response.json({ error: error?.message ?? "not found" }, { status: 404 });
    }
    const notification = data as unknown as NotificationRow;

    const { data: tokens } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("user_id", notification.recipient_id);

    // No registered device is the normal case for anyone who has not opened
    // the app on a phone, or who declined the OS permission prompt.
    if (!tokens || tokens.length === 0) {
      return Response.json({ sent: 0, reason: "no tokens" });
    }

    const messages = tokens.map((t: { token: string }) => ({
      to: t.token,
      sound: "default",
      title: "Sightseer",
      body: buildBody(notification),
      // Read by the app's notification-tap handler to open the right screen.
      data: {
        notificationId: notification.id,
        type: notification.type,
        visitId: notification.visit_id,
        boardId: notification.board_id,
        travelBookId: notification.travel_book_id,
      },
    }));

    let sent = 0;
    const errors: string[] = [];
    for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
      const batch = messages.slice(i, i + EXPO_BATCH_SIZE);
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        errors.push(`expo ${response.status}`);
        continue;
      }
      sent += batch.length;

      // Expo reports per-message failures in an ok response. DeviceNotRegistered
      // means the app was uninstalled or the token rotated — the row is dead
      // and would otherwise be retried forever.
      const receipts: { status: string; details?: { error?: string } }[] = result?.data ?? [];
      const dead = receipts
        .map((receipt, index) =>
          receipt?.details?.error === "DeviceNotRegistered" ? batch[index].to : null
        )
        .filter((token): token is string => token != null);
      if (dead.length > 0) {
        await supabase.from("push_tokens").delete().in("token", dead);
      }
    }

    return Response.json({ sent, errors });
  },
};

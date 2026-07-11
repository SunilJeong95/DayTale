/**
 * services/worker/src/push.ts — Expo push notifications (WS-C, plan §2.4).
 *
 * Sends to `profiles.expo_push_token` on job completion. Push copy is kept
 * local to the worker (not `apps/mobile/src/i18n/ko.ts`) since that file is
 * owned by WS-B/mobile screens and this string only ever appears server-side
 * in a push payload, not rendered by any screen component.
 *
 * Handles `DeviceNotRegistered` (from either the initial send ticket or a
 * later receipt) by nulling the stale token via the service-role client, so
 * the app knows to request a fresh token next launch.
 */

import Expo, {
  type ExpoPushMessage,
  type ExpoPushTicket,
} from "expo-server-sdk";
import { clearAuthorPushToken } from "./jobs";

const GENERATION_COMPLETE_TITLE = "오늘의 소설이 완성됐어요";
const GENERATION_COMPLETE_BODY_PREFIX = "새 에피소드를 확인해보세요";

let expoClient: Expo | null = null;

function getExpoClient(): Expo {
  if (expoClient) return expoClient;
  expoClient = new Expo();
  return expoClient;
}

function isDeviceNotRegistered(ticket: ExpoPushTicket): boolean {
  return ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered";
}

/**
 * Send the "생성 완료" push for a `mode='generate'` job completion. No-op
 * (logs + returns) if the token is missing/malformed or not a valid Expo
 * push token — completion still succeeded, push is belt-and-suspenders
 * (Realtime is the other channel per plan §2.1 step 4).
 */
export async function sendGenerationCompletePush(params: {
  authorId: string;
  expoPushToken: string | null;
  episodeId: string;
  episodeTitle: string | null;
}): Promise<void> {
  const { authorId, expoPushToken, episodeId, episodeTitle } = params;

  if (!expoPushToken) {
    return;
  }
  if (!Expo.isExpoPushToken(expoPushToken)) {
    // eslint-disable-next-line no-console
    console.warn(
      `[worker] profiles.${authorId}.expo_push_token is not a valid Expo push token — skipping push`
    );
    return;
  }

  const message: ExpoPushMessage = {
    to: expoPushToken,
    title: GENERATION_COMPLETE_TITLE,
    body: episodeTitle
      ? `"${episodeTitle}" — ${GENERATION_COMPLETE_BODY_PREFIX}`
      : GENERATION_COMPLETE_BODY_PREFIX,
    data: { type: "generation_complete", episodeId },
    sound: "default",
  };

  await sendAndHandleStaleTokens(authorId, [message]);
}

/**
 * Send push+receipt-checked messages, nulling `profiles.expo_push_token`
 * for any recipient whose ticket/receipt comes back `DeviceNotRegistered`.
 */
async function sendAndHandleStaleTokens(
  authorId: string,
  messages: ExpoPushMessage[]
): Promise<void> {
  const client = getExpoClient();
  const chunks = client.chunkPushNotifications(messages);
  const tickets: ExpoPushTicket[] = [];

  for (const chunk of chunks) {
    try {
      const chunkTickets = await client.sendPushNotificationsAsync(chunk);
      tickets.push(...chunkTickets);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[worker] sendPushNotificationsAsync failed", err);
    }
  }

  const staleFromTickets = tickets.some(isDeviceNotRegistered);

  const receiptIds = tickets
    .filter((t): t is Extract<ExpoPushTicket, { status: "ok" }> => t.status === "ok")
    .map((t) => t.id);

  let staleFromReceipts = false;
  if (receiptIds.length > 0) {
    try {
      const receiptChunks = client.chunkPushNotificationReceiptIds(receiptIds);
      for (const chunk of receiptChunks) {
        const receipts = await client.getPushNotificationReceiptsAsync(chunk);
        for (const receipt of Object.values(receipts)) {
          if (receipt.status === "error" && receipt.details?.error === "DeviceNotRegistered") {
            staleFromReceipts = true;
          }
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[worker] getPushNotificationReceiptsAsync failed", err);
    }
  }

  if (staleFromTickets || staleFromReceipts) {
    await clearAuthorPushToken(authorId);
  }
}

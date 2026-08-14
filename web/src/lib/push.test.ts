import { describe, expect, it } from "vitest";
import { pushSubscriptionToIn, urlBase64ToUint8Array } from "./push";

describe("urlBase64ToUint8Array", () => {
  it("decodes standard base64", () => {
    expect(Array.from(urlBase64ToUint8Array("AQID"))).toEqual([1, 2, 3]);
  });

  it("decodes base64url (no padding, url-safe alphabet)", () => {
    expect(Array.from(urlBase64ToUint8Array("-_8"))).toEqual([251, 255]);
  });

  it("handles a real VAPID public key (65 bytes)", () => {
    const key =
      "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
    expect(urlBase64ToUint8Array(key).length).toBe(65);
  });
});

describe("pushSubscriptionToIn", () => {
  it("maps a PushSubscription to the API payload", () => {
    const sub = {
      endpoint: "https://push.example.com/abc",
      toJSON: () => ({
        endpoint: "https://push.example.com/abc",
        keys: { p256dh: "p256dh-bytes", auth: "auth-bytes" },
      }),
    } as unknown as PushSubscription;

    expect(pushSubscriptionToIn(sub)).toEqual({
      endpoint: "https://push.example.com/abc",
      keys: { p256dh: "p256dh-bytes", auth: "auth-bytes" },
    });
  });
});

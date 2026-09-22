import { expect, test } from "bun:test";
import { createPublisher } from "../src/index";

const element = () =>
  ({
    replaceChildren() {
      throw new Error("must not render");
    },
  }) as unknown as HTMLElement;
test("defining inventory sends nothing; each explicit load makes one metadata-minimal request", async () => {
  const requests: RequestInit[] = [];
  const client = createPublisher({
    endpoint: "https://publisher.example/v1/auctions",
    fetch: async (_input, init) => {
      requests.push(init!);
      return Response.json({
        status: "no_fill",
        bid_request_id: "a".repeat(64),
      });
    },
  });
  const placement = client.definePlacement({
    id: "sidebar",
    element: element(),
    sizes: [{ width: 300, height: 250 }],
  });
  expect(requests).toHaveLength(0);
  expect((await client.load(placement)).status).toBe("no_fill");
  expect(requests).toHaveLength(1);
  expect(JSON.parse(String(requests[0]!.body))).toEqual({
    placement: "sidebar",
    sizes: [{ width: 300, height: 250 }],
  });
  expect(requests[0]!.credentials).toBe("omit");
});
test("server and network failures reject without retries", async () => {
  for (const response of [
    () => Response.json({ error: "unavailable" }, { status: 503 }),
    () => {
      throw new TypeError("network failure");
    },
  ]) {
    let calls = 0;
    const client = createPublisher({
      endpoint: "https://publisher.example/v1/auctions",
      fetch: async () => {
        calls++;
        return response();
      },
    });
    const placement = client.definePlacement({
      id: "sidebar",
      element: element(),
      sizes: [{ width: 300, height: 250 }],
    });
    await expect(client.load(placement)).rejects.toThrow();
    expect(calls).toBe(1);
  }
});
test("untrusted creative origins and unoffered dimensions are rejected before touching the DOM", async () => {
  for (const override of [
    { creative_url: "https://attacker.example/v1/creatives/" + "b".repeat(64) },
    { width: 999 },
  ]) {
    const client = createPublisher({
      endpoint: "https://publisher.example/v1/auctions",
      fetch: async () =>
        Response.json({
          status: "filled",
          bid_request_id: "a".repeat(64),
          creative_url:
            "https://publisher.example/v1/creatives/" + "b".repeat(64),
          width: 300,
          height: 250,
          ...override,
        }),
    });
    const placement = client.definePlacement({
      id: "sidebar",
      element: element(),
      sizes: [{ width: 300, height: 250 }],
    });
    await expect(client.load(placement)).rejects.toThrow();
  }
});

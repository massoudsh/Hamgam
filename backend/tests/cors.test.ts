import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createTestDb } from "./testDb.js";

describe("CORS for a separately hosted dashboard", () => {
  const originalOrigin = process.env.CORS_ORIGIN;

  afterEach(() => {
    if (originalOrigin === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = originalOrigin;
  });

  it("allows a configured dashboard origin and answers preflight", async () => {
    process.env.CORS_ORIGIN = "http://localhost:3000";
    const app = createApp(await createTestDb());

    const preflight = await request(app)
      .options("/api/orders")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "GET");
    expect(preflight.status).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(preflight.headers["access-control-allow-methods"]).toContain("GET");

    const response = await request(app).get("/health").set("Origin", "http://localhost:3000");
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
  });

  it("does not grant CORS headers to an unlisted origin", async () => {
    process.env.CORS_ORIGIN = "http://localhost:3000";
    const app = createApp(await createTestDb());

    const response = await request(app).get("/health").set("Origin", "https://evil.example");
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import worker from "../src/index";

describe("public privacy policy", () => {
  it("renders without authentication or database bindings", async () => {
    const response = await worker.fetch(new Request("https://dev.ao3tracker.com/privacy"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const page = await response.text();
    expect(page).toContain("Privacy policy");
    expect(page).toContain("AO3 Tracker Beta");
    expect(page).toContain("IP addresses");
    expect(page).toContain("mailto:tom@qcksys.com");
    expect(page).not.toContain("<script");
  });
});

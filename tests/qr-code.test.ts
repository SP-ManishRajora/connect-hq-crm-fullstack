import { describe, it, expect } from "vitest";
import { extractCode } from "@/lib/housekeeping/qr-code";

// One sticker per area means a single printed code reaches the scanner in several
// shapes: as the URL a phone camera read, as the URL the in-app scanner decoded,
// or typed by hand from under the QR. All of them must reduce to the same code, or
// the unified sticker silently stops working for whichever path drifted.

describe("extractCode", () => {
  it("reduces the area sticker URL to the code", () => {
    expect(extractCode("https://erp.example.com/qr/a/8Kd2p_Qa91xZ")).toBe("8Kd2p_Qa91xZ");
  });

  it("reduces the legacy staff scan URL to the same code", () => {
    expect(extractCode("https://erp.example.com/housekeeping/scan/8Kd2p_Qa91xZ")).toBe(
      "8Kd2p_Qa91xZ",
    );
  });

  it("passes a bare typed code through", () => {
    expect(extractCode("8Kd2p_Qa91xZ")).toBe("8Kd2p_Qa91xZ");
  });

  it("trims whitespace from a typed or pasted code", () => {
    expect(extractCode("  8Kd2p_Qa91xZ\n")).toBe("8Kd2p_Qa91xZ");
  });

  it("ignores a query string or fragment appended to the URL", () => {
    expect(extractCode("https://erp.example.com/qr/a/8Kd2p_Qa91xZ?as=client")).toBe("8Kd2p_Qa91xZ");
    expect(extractCode("https://erp.example.com/qr/a/8Kd2p_Qa91xZ#top")).toBe("8Kd2p_Qa91xZ");
  });

  it("tolerates a trailing slash rather than yielding an empty code", () => {
    expect(extractCode("https://erp.example.com/qr/a/8Kd2p_Qa91xZ/")).toBe("8Kd2p_Qa91xZ");
  });

  it("keeps base64url codes intact, including - and _", () => {
    expect(extractCode("https://erp.example.com/qr/a/a-b_c-D_1")).toBe("a-b_c-D_1");
  });

  it("does not invent a code from a URL with no path", () => {
    // Reduces to the host-only input rather than "", so the server reports an
    // unrecognised code instead of a confusing empty-string lookup.
    expect(extractCode("https://erp.example.com")).toBe("https://erp.example.com");
  });
});

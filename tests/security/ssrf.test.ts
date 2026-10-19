import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl, isBlockedAddress, SsrfError } from "@/lib/security/ssrf";

const resolve = async (hostname: string) => {
  const table: Record<string, string[]> = {
    "example.com": ["93.184.216.34"],
    "rebind.test": ["10.1.2.3"],
    "link.local.test": ["169.254.169.254"],
    "loop.test": ["127.0.0.1"],
    "v6.test": ["fd00::1"],
  };
  return table[hostname] ?? [];
};

describe("SSRF address checks", () => {
  it("blocks private, loopback and link-local addresses", () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.8",
      "192.168.1.20",
      "172.16.0.4",
      "169.254.169.254",
      "100.64.0.1",
      "::1",
      "fe80::1",
      "fd12::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isBlockedAddress(address), address).toBe(true);
    }
    expect(isBlockedAddress("93.184.216.34")).toBe(false);
    expect(isBlockedAddress("8.8.8.8")).toBe(false);
  });

  it("rejects hostnames that resolve to a private address", async () => {
    await expect(
      assertPublicHttpUrl("http://127.0.0.1/latest/meta-data", resolve),
    ).rejects.toBeInstanceOf(SsrfError);
    await expect(
      assertPublicHttpUrl("https://rebind.test/product", resolve),
    ).rejects.toBeInstanceOf(SsrfError);
    await expect(assertPublicHttpUrl("https://link.local.test/x", resolve)).rejects.toBeInstanceOf(
      SsrfError,
    );
    await expect(assertPublicHttpUrl("https://loop.test/", resolve)).rejects.toBeInstanceOf(
      SsrfError,
    );
    await expect(assertPublicHttpUrl("https://v6.test/", resolve)).rejects.toBeInstanceOf(
      SsrfError,
    );
    await expect(assertPublicHttpUrl("http://localhost/admin", resolve)).rejects.toBeInstanceOf(
      SsrfError,
    );
    await expect(assertPublicHttpUrl("file:///etc/passwd", resolve)).rejects.toBeInstanceOf(
      SsrfError,
    );
  });

  it("allows a public hostname", async () => {
    const url = await assertPublicHttpUrl("https://example.com/item/1", resolve);
    expect(url.hostname).toBe("example.com");
  });
});

import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { decrypt, encrypt } from "../crypto";

describe("token encryption", () => {
  beforeAll(() => { process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64"); });
  it("round-trips and never stores the plain token", () => {
    const enc = encrypt("EAAG-secret-token");
    expect(enc).not.toContain("EAAG");
    expect(decrypt(enc)).toBe("EAAG-secret-token");
  });
  it("rejects tampered ciphertext", () => {
    const [iv, tag, data] = encrypt("abc").split(".");
    const flipped = Buffer.from(data, "base64"); flipped[0] ^= 1;
    expect(() => decrypt([iv, tag, flipped.toString("base64")].join("."))).toThrow();
  });
});

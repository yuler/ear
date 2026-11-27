import { createHash } from "crypto";

/** Streaming SHA-256 backed by NSH's native `crypto.createHash`. */
export class Sha256 {
  private readonly hash = createHash("sha256");

  update(data: Uint8Array): this {
    this.hash.update(data);
    return this;
  }

  digestHex(): string {
    return this.hash.digest("hex");
  }
}

export function sha256Bytes(data: Uint8Array): string {
  return new Sha256().update(data).digestHex();
}

/**
 * AES-GCM for a member's own provider key.
 * Stored form: enc:v1:<iv-base64url>.<ciphertext-base64url>
 * The key is SHA-256(AI_KEY_ENCRYPTION_SECRET). Existing plaintext rows are
 * rewritten the next time they are read, once the secret is set.
 */

const PREFIX = "enc:v1:";

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(PREFIX);
}

function requireSecret(): string {
  const secret = process.env["AI_KEY_ENCRYPTION_SECRET"]?.trim() ?? "";
  if (secret.length < 16) {
    throw new Error("AI key storage is not configured.");
  }
  return secret;
}

async function aesKey(): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(requireSecret()));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded =
    value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function encryptSecret(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await aesKey(),
    new TextEncoder().encode(plain),
  );
  return `${PREFIX}${toBase64Url(iv)}.${toBase64Url(new Uint8Array(cipher))}`;
}

export async function decryptSecret(stored: string): Promise<string> {
  if (!isEncryptedSecret(stored)) return stored;
  const rest = stored.slice(PREFIX.length);
  const [ivPart, cipherPart] = rest.split(".");
  if (!ivPart || !cipherPart) throw new Error("Stored key is damaged.");
  const iv = fromBase64Url(ivPart);
  const cipher = fromBase64Url(cipherPart);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    await aesKey(),
    cipher as BufferSource,
  );
  return new TextDecoder().decode(plain);
}

export function encryptionConfigured(): boolean {
  return (process.env["AI_KEY_ENCRYPTION_SECRET"]?.trim().length ?? 0) >= 16;
}

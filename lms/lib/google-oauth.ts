import { createHash, createPublicKey, randomBytes, verify as verifySignature } from "node:crypto";

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  appUrl: string;
  redirectUri: string;
  secureCookie: boolean;
};

export const googleOAuthCookies = {
  state: "google_oauth_state",
  verifier: "google_oauth_verifier",
  nonce: "google_oauth_nonce",
} as const;

export const googleOAuthCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/login/google",
  maxAge: 600,
};

export function getGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const appUrlValue = process.env.APP_URL?.trim();
  if (!clientId || !clientSecret || !appUrlValue) return null;

  try {
    const appUrl = new URL(appUrlValue);
    if (appUrl.protocol !== "https:" && appUrl.protocol !== "http:") return null;
    return {
      clientId,
      clientSecret,
      appUrl: appUrl.origin,
      redirectUri: new URL("/login/google/callback", appUrl).toString(),
      secureCookie: appUrl.protocol === "https:",
    };
  } catch {
    return null;
  }
}

export function createOAuthToken() {
  return randomBytes(32).toString("base64url");
}

export function createPkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeJwtPart(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

type GoogleJwk = { kid: string; kty: "RSA"; n: string; e: string; alg?: string; use?: string };

function isGoogleJwk(value: unknown): value is GoogleJwk {
  return isRecord(value)
    && typeof value.kid === "string"
    && value.kty === "RSA"
    && typeof value.n === "string"
    && typeof value.e === "string"
    && (value.alg === undefined || value.alg === "RS256")
    && (value.use === undefined || value.use === "sig");
}

export async function verifyGoogleIdToken(
  token: string,
  config: GoogleOAuthConfig,
  expectedNonce: string,
): Promise<{ email: string } | null> {
  const [encodedHeader, encodedClaims, encodedSignature, ...extra] = token.split(".");
  if (!encodedHeader || !encodedClaims || !encodedSignature || extra.length) return null;

  const header = decodeJwtPart(encodedHeader);
  const claims = decodeJwtPart(encodedClaims);
  if (!header || header.alg !== "RS256" || typeof header.kid !== "string" || !claims) return null;

  const now = Math.floor(Date.now() / 1000);
  if (
    (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com")
    || claims.aud !== config.clientId
    || typeof claims.exp !== "number"
    || !Number.isFinite(claims.exp)
    || claims.exp <= now
    || typeof claims.iat !== "number"
    || !Number.isFinite(claims.iat)
    || claims.iat > now + 60
    || claims.nonce !== expectedNonce
    || typeof claims.sub !== "string"
    || !claims.sub
    || claims.email_verified !== true
    || typeof claims.email !== "string"
    || !claims.email
  ) return null;

  let keysResponse: Response;
  try {
    keysResponse = await fetch("https://www.googleapis.com/oauth2/v3/certs", { cache: "no-store" });
  } catch (error) {
    console.error("Could not retrieve Google's signing keys.", error);
    return null;
  }
  if (!keysResponse.ok) return null;
  const keySet: unknown = await keysResponse.json();
  if (!isRecord(keySet) || !Array.isArray(keySet.keys)) return null;
  const jwk = keySet.keys.find((key) => isGoogleJwk(key) && key.kid === header.kid);
  if (!isGoogleJwk(jwk)) return null;

  try {
    const publicKey = createPublicKey({
      key: { kty: jwk.kty, n: jwk.n, e: jwk.e },
      format: "jwk",
    });
    const valid = verifySignature(
      "RSA-SHA256",
      Buffer.from(`${encodedHeader}.${encodedClaims}`),
      publicKey,
      Buffer.from(encodedSignature, "base64url"),
    );
    return valid ? { email: claims.email.toLowerCase() } : null;
  } catch {
    return null;
  }
}

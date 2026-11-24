import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  getGoogleOAuthConfig,
  googleOAuthCookieOptions,
  googleOAuthCookies,
  verifyGoogleIdToken,
} from "@/lib/google-oauth";
import { NextResponse, type NextRequest } from "next/server";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function loginRedirect(error: string, appUrl: string, secureCookie: boolean) {
  const loginUrl = new URL("/login", appUrl);
  loginUrl.searchParams.set("error", error);
  const response = NextResponse.redirect(loginUrl);
  response.headers.set("Cache-Control", "no-store");
  for (const name of Object.values(googleOAuthCookies)) {
    response.cookies.set(name, "", { ...googleOAuthCookieOptions, maxAge: 0, secure: secureCookie });
  }
  return response;
}

export async function GET(request: NextRequest) {
  const config = getGoogleOAuthConfig();
  const fallbackAppUrl = config?.appUrl ?? request.nextUrl.origin;
  const secureCookie = config?.secureCookie ?? request.nextUrl.protocol === "https:";
  if (!config) return loginRedirect("google_unavailable", fallbackAppUrl, secureCookie);

  const query = request.nextUrl.searchParams;
  if (query.has("error")) {
    return loginRedirect(
      query.get("error") === "access_denied" ? "google_cancelled" : "google_failed",
      config.appUrl,
      config.secureCookie,
    );
  }

  const code = query.get("code");
  const state = query.get("state");
  const storedState = request.cookies.get(googleOAuthCookies.state)?.value;
  const verifier = request.cookies.get(googleOAuthCookies.verifier)?.value;
  const nonce = request.cookies.get(googleOAuthCookies.nonce)?.value;
  if (!code || !state || !storedState || state !== storedState || !verifier || !nonce) {
    return loginRedirect("google_failed", config.appUrl, config.secureCookie);
  }

  let tokenResponse: Response;
  try {
    tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
      cache: "no-store",
    });
  } catch (error) {
    console.error("Google OAuth token exchange failed.", error);
    return loginRedirect("google_failed", config.appUrl, config.secureCookie);
  }
  if (!tokenResponse.ok) return loginRedirect("google_failed", config.appUrl, config.secureCookie);

  const tokenPayload: unknown = await tokenResponse.json();
  const idToken = isRecord(tokenPayload) && typeof tokenPayload.id_token === "string" ? tokenPayload.id_token : null;
  if (!idToken) return loginRedirect("google_failed", config.appUrl, config.secureCookie);

  const identity = await verifyGoogleIdToken(idToken, config, nonce);
  if (!identity) return loginRedirect("google_failed", config.appUrl, config.secureCookie);

  const user = await db.user.findFirst({
    where: { isActive: true, email: { equals: identity.email, mode: "insensitive" } },
  });
  if (!user) return loginRedirect("google_account", config.appUrl, config.secureCookie);

  const session = await getSession();
  session.userId = user.id;
  await session.save();

  const destination = user.mustChangePassword ? "/change-password" : "/dashboard";
  const response = NextResponse.redirect(new URL(destination, config.appUrl));
  response.headers.set("Cache-Control", "no-store");
  for (const name of Object.values(googleOAuthCookies)) {
    response.cookies.set(name, "", { ...googleOAuthCookieOptions, maxAge: 0, secure: config.secureCookie });
  }
  return response;
}

import { NextResponse, type NextRequest } from "next/server";
import {
  createOAuthToken,
  createPkceChallenge,
  getGoogleOAuthConfig,
  googleOAuthCookieOptions,
  googleOAuthCookies,
} from "@/lib/google-oauth";

export async function GET(request: NextRequest) {
  const config = getGoogleOAuthConfig();
  if (!config) {
    const loginUrl = new URL("/login?error=google_unavailable", request.url);
    return NextResponse.redirect(loginUrl);
  }

  const state = createOAuthToken();
  const verifier = createOAuthToken();
  const nonce = createOAuthToken();
  const authorizeUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizeUrl.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email",
    state,
    nonce,
    code_challenge: createPkceChallenge(verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();

  const response = NextResponse.redirect(authorizeUrl);
  response.headers.set("Cache-Control", "no-store");
  for (const [name, value] of [
    [googleOAuthCookies.state, state],
    [googleOAuthCookies.verifier, verifier],
    [googleOAuthCookies.nonce, nonce],
  ]) {
    response.cookies.set(name, value, { ...googleOAuthCookieOptions, secure: config.secureCookie });
  }
  return response;
}

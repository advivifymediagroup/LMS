import { LoginForm } from "./login-form";
import { getGoogleOAuthConfig } from "@/lib/google-oauth";

const googleLoginErrors: Record<string, string> = {
  google_unavailable: "Google sign-in isn't configured yet. Contact an administrator.",
  google_cancelled: "Google sign-in was cancelled.",
  google_account: "No active LMS account matches this verified Google email. Contact an administrator.",
  google_failed: "Google sign-in failed. Please try again.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { reset, error } = await searchParams;
  const googleError = typeof error === "string" ? googleLoginErrors[error] : undefined;
  return (
    <LoginForm
      notice={reset ? "Password updated. Sign in with your new password." : undefined}
      googleError={googleError}
      googleEnabled={getGoogleOAuthConfig() !== null}
    />
  );
}
export const metadata = { title: "Login" };

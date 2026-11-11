import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { reset } = await searchParams;
  return <LoginForm notice={reset ? "Password updated. Sign in with your new password." : undefined} />;
}
export const metadata = { title: "Login" };

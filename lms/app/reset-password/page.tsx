import Link from "next/link";
import { resetPasswordWithToken } from "../login/actions";
import { ResetForm } from "./reset-form";

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      {typeof token === "string" && token ? (
        <ResetForm action={resetPasswordWithToken.bind(null, token)} />
      ) : (
        <div className="card max-w-sm space-y-3">
          <p className="error">This reset link is incomplete.</p>
          <Link href="/forgot-password" className="text-sm text-blue-600">Ask for a new link</Link>
        </div>
      )}
    </main>
  );
}
export const metadata = { title: "Reset password" };

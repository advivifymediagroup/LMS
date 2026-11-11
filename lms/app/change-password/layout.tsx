import type { Metadata } from "next";

export const metadata: Metadata = { title: "Change password" };

export default function ChangePasswordLayout({
  children,
}: LayoutProps<"/change-password">) {
  return children;
}

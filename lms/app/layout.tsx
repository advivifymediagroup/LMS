import type { Metadata } from "next";
import { fontVars } from "./fonts";
import "./globals.css";


export const metadata: Metadata = {
  title: {
    default: "Advivify Portal",
    template: "%s | Advivify Portal",
  },
  description: "Advivify company portal: leave and team tasks",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fontVars} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Page not found | Leave Management",
  description: "The requested page could not be found.",
};

export default function GlobalNotFound() {
  return (
    <html lang="en" className={`${geistSans.variable} h-full`}>
      <body className="min-h-full bg-gray-50 font-sans text-gray-900">
        <header className="border-b border-gray-200 bg-white">
          <nav className="mx-auto flex max-w-6xl items-center px-4 py-3 text-sm">
            <p className="font-semibold text-gray-900">LMS</p>
          </nav>
        </header>

        <main className="mx-auto flex max-w-6xl justify-center px-4 py-16 sm:py-24">
          <section className="card w-full max-w-xl py-10 text-center sm:px-10">
            <div
              className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-blue-50 text-2xl font-semibold text-blue-600"
              aria-hidden="true"
            >
              404
            </div>
            <h1 className="text-2xl font-semibold">
              Oops! We couldn&apos;t find that page.
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-600">
              The page you&apos;re looking for may have been removed.
            </p>
            <a className="btn btn-primary mt-6" href="/dashboard">
              Back to dashboard
            </a>
          </section>
        </main>
      </body>
    </html>
  );
}

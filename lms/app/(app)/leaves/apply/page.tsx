import { redirect } from "next/navigation";

// The request form now lives on the Leave page.
export default function ApplyPage() {
  redirect("/leave#apply");
}

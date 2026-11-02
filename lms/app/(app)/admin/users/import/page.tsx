import { requireUser } from "@/lib/auth";
import { ImportForm } from "./import-form";

export default async function ImportPage() {
  await requireUser(["ADMIN"]);
  return <ImportForm />;
}

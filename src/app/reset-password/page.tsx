import { AuthLayout } from "@/components/auth-layout";
import { AuthForm } from "@/components/auth-form";
import { session } from "@/lib/data";
export default async function ResetPassword() {
  await session();
  return (
    <AuthLayout>
      <AuthForm mode="reset" />
    </AuthLayout>
  );
}

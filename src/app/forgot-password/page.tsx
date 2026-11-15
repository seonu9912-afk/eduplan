import { AuthLayout } from "@/components/auth-layout";
import { AuthForm } from "@/components/auth-form";
export default function ForgotPassword() {
  return (
    <AuthLayout>
      <AuthForm mode="forgot" />
    </AuthLayout>
  );
}

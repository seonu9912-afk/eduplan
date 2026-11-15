import { AuthLayout } from "@/components/auth-layout";
import { AuthForm } from "@/components/auth-form";
export default function Signup() {
  return (
    <AuthLayout>
      <AuthForm mode="signup" />
    </AuthLayout>
  );
}

import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./mobile.css";
import { PwaProvider } from "@/components/pwa/pwa-provider";
import { KeyboardNavigation } from "@/components/keyboard-navigation";
const pretendard = localFont({
  src: "../../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  variable: "--font-pretendard",
  display: "swap",
});
export const metadata: Metadata = {
  title: { default: "EduPlan · 에듀플랜", template: "%s | EduPlan" },
  appleWebApp: { capable: true, title: "EduPlan", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  applicationName: "EduPlan Workspace",
  description:
    "교육과정부터 수업까지, 하나의 계획으로. 대한민국 학교 교육과정 통합 설계·운영 플랫폼.",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#2563eb",
  interactiveWidget: "resizes-content",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <body>
        <a href="#main-content" className="skip-link">
          본문으로 바로가기
        </a>
        <KeyboardNavigation />
        <PwaProvider>{children}</PwaProvider>
      </body>
    </html>
  );
}

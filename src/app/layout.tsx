import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./mobile.css";
import "./theme.css";
import { ThemeRuntime } from "@/components/theme-preference";
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
  themeColor: "#ffffff",
  interactiveWidget: "resizes-content",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={pretendard.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{__html: "(function(){try{var p=localStorage.getItem(\"eduplan-theme\");if(p!==\"light\"&&p!==\"dark\")p=\"system\";var dark=p===\"dark\"||(p===\"system\"&&matchMedia(\"(prefers-color-scheme: dark)\").matches);document.documentElement.dataset.theme=dark?\"dark\":\"light\";}catch(e){document.documentElement.dataset.theme=matchMedia(\"(prefers-color-scheme: dark)\").matches?\"dark\":\"light\";}})();"}} /></head>
      <body>
        <a href="#main-content" className="skip-link">
          본문으로 바로가기
        </a>
        <ThemeRuntime />
        <KeyboardNavigation />
        <PwaProvider>{children}</PwaProvider>
      </body>
    </html>
  );
}

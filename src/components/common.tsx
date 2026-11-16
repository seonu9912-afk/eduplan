"use client";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Result } from "@/lib/models";

export function Notice({
  message,
  error = false,
}: {
  message: string;
  error?: boolean;
}) {
  return message ? (
    <div
      className={`notice ${error ? "notice-error" : "notice-success"}`}
      role={error ? "alert" : "status"}
    >
      {error ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}
      <span>{message}</span>
    </div>
  ) : null;
}
export function Field({
  label,
  children,
  hint,
  id,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  id?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`edu-dialog ${wide ? "edu-dialog-wide" : ""}`}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ?? "필요한 정보를 입력하고 저장해 주세요."}
          </DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function Confirm({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  pending = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  pending?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>취소</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {pending ? "처리 중…" : "확인"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
export function SubmitButton({
  pending,
  children = "저장하기",
}: {
  pending: boolean;
  children?: ReactNode;
}) {
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="spin" />
          저장 중…
        </>
      ) : (
        children
      )}
    </Button>
  );
}
export function PrintButton() {
  return (
    <Button
      variant="outline"
      onClick={() => window.print()}
      className="no-print"
    >
      <Printer />
      인쇄 / PDF
    </Button>
  );
}
export function Empty({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon ? <div className="empty-icon">{icon}</div> : null}
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function SaveStatus({
  state,
  children,
}: {
  state: "draft" | "dirty" | "saving" | "saved" | "error" | "conflict";
  children: ReactNode;
}) {
  return <span role="status" className="save-status" data-state={state}>{children}</span>;
}

export function useMutation() {
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const [notice, setNotice] = useState({ message: "", error: false });
  const router = useRouter();
  function execute<T>(
    task: () => Promise<Result<T>>,
    onSuccess?: (data: T) => void,
    message = "저장되었습니다.",
  ) {
    if (pending || inFlight.current) return;
    inFlight.current = true;
    setNotice({ message: "", error: false });
    startTransition(async () => {
      try {
        const result = await task();
        if (!result.ok) {
          setNotice({ message: result.error, error: true });
          return;
        }
        setNotice({ message, error: false });
        router.refresh();
        onSuccess?.(result.data);
      } catch {
        setNotice({
          message:
            "서버에 연결하지 못했습니다. 입력 내용은 유지됩니다. 다시 시도해 주세요.",
          error: true,
        });
      } finally {
        inFlight.current = false;
      }
    });
  }
  return { pending, isInFlight: () => inFlight.current, refresh: () => router.refresh(), execute, notice, setNotice };
}
export function InlineNotice({
  mutation,
}: {
  mutation: ReturnType<typeof useMutation>;
}) {
  return <Notice {...mutation.notice} />;
}

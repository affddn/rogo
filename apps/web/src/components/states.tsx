import { AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** Holds the shape of a page (header, lead tiles, main and side column) so nothing jumps when it loads. */
export function LoadingState({ label }: { label: string }) {
  return (
    <div className="grid min-h-[75dvh] content-start gap-section" role="status" aria-label={label}>
      <div className="grid gap-3">
        <Skeleton className="h-5 w-[min(100%,9rem)]" />
        <Skeleton className="h-11 w-[min(100%,28rem)]" />
        <Skeleton className="h-5 w-[min(100%,40rem)]" />
      </div>
      <div className="tiles-lead">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <div className="split-main">
        <Skeleton className="h-[40dvh]" />
        <Skeleton className="h-[28dvh]" />
      </div>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <Alert variant="destructive" className="measure">
      <AlertTriangle aria-hidden />
      <AlertTitle>Couldn't show this page</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

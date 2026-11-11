import React, { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertCircle,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import {
  ErpAttachmentKind,
  ErpAttachmentRequest,
  ResolvedErpAttachment,
} from "../lib/erpBridge";

interface AttachmentViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: ErpAttachmentRequest | null;
  resolved: ResolvedErpAttachment | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

const KIND_BADGE: Record<ErpAttachmentKind, { label: string; cls: string }> = {
  NOTICE: {
    label: "Notice Attachment",
    cls: "border-blue-200 bg-blue-50 text-blue-800",
  },
  JNF: {
    label: "Role JD File",
    cls: "border-indigo-200 bg-indigo-50 text-indigo-800",
  },
  COM: {
    label: "Company Brochure",
    cls: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  PPT: {
    label: "PPT / Deck",
    cls: "border-amber-200 bg-amber-50 text-amber-800",
  },
  CV: {
    label: "Student CV",
    cls: "border-violet-200 bg-violet-50 text-violet-800",
  },
  GUID: {
    label: "CDC Guidelines",
    cls: "border-slate-300 bg-slate-100 text-slate-700",
  },
};

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const AttachmentViewerModal: React.FC<AttachmentViewerModalProps> = ({
  open,
  onOpenChange,
  request,
  resolved,
  loading,
  error,
  onRetry,
}) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !resolved) {
      setObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(resolved.blob);
    setObjectUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [open, resolved]);

  const badge = request ? KIND_BADGE[request.kind] : KIND_BADGE.NOTICE;
  const sizeLabel = resolved ? formatFileSize(resolved.byteLength) : "";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex h-[90vh] w-[min(1060px,96vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${badge.cls}`}
                >
                  <FileText className="h-3 w-3" />
                  {badge.label}
                </span>
                {resolved && (
                  <span className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700 uppercase">
                    .{resolved.extension}
                    {sizeLabel ? ` · ${sizeLabel}` : ""}
                  </span>
                )}
              </div>
              <Dialog.Title className="mt-1 truncate text-sm font-bold text-slate-900">
                {request?.title || "Document Preview"}
              </Dialog.Title>
              <Dialog.Description
                className={
                  request?.subtitle
                    ? "truncate text-xs text-slate-500"
                    : "sr-only"
                }
              >
                {request?.subtitle || "CDC ERP attachment preview and download"}
              </Dialog.Description>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {resolved && objectUrl && (
                <>
                  <a
                    href={objectUrl}
                    download={resolved.filename}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-blue-700 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-blue-800"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </a>
                  {resolved.previewKind !== "download" && (
                    <a
                      href={objectUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                      title="Open in a separate browser tab"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">New Tab</span>
                    </a>
                  )}
                </>
              )}

              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close preview"
                  className="cursor-pointer rounded-md p-1.5 text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Body */}
          <div className="relative flex min-h-0 flex-1 items-center justify-center bg-slate-800">
            {loading && (
              <div className="flex flex-col items-center gap-2.5 rounded-xl bg-white/95 px-6 py-5 text-center shadow-lg">
                <Loader2 className="h-6 w-6 animate-spin text-blue-700" />
                <div className="text-xs font-bold text-slate-800">
                  Fetching official document from IIT KGP ERP…
                </div>
                <div className="text-[11px] text-slate-500">
                  Streamed directly inside your browser — never routed via external servers.
                </div>
              </div>
            )}

            {!loading && error && (
              <div className="mx-4 max-w-md rounded-xl border border-red-200 bg-white p-5 text-center shadow-lg">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div className="text-sm font-bold text-slate-900">
                  Could not load attachment
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">{error}</p>
                <div className="mt-4 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={onRetry}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-blue-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-blue-800"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry
                  </button>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Close
                    </button>
                  </Dialog.Close>
                </div>
              </div>
            )}

            {!loading && !error && resolved && objectUrl && resolved.previewKind === "pdf" && (
              <iframe
                title={request?.title || "PDF Attachment"}
                src={objectUrl}
                className="h-full w-full border-0 bg-slate-800"
              />
            )}

            {!loading && !error && resolved && objectUrl && resolved.previewKind === "image" && (
              <div className="flex h-full w-full items-center justify-center overflow-auto p-4">
                <img
                  src={objectUrl}
                  alt={request?.title || "Attachment"}
                  className="max-h-full max-w-full rounded bg-white object-contain shadow-lg"
                />
              </div>
            )}

            {!loading &&
              !error &&
              resolved &&
              objectUrl &&
              resolved.previewKind === "download" && (
                <div className="mx-4 max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-lg">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                    <FileSpreadsheet className="h-6 w-6" />
                  </div>
                  <div className="text-sm font-bold text-slate-900">{resolved.filename}</div>
                  <p className="mt-1 text-xs text-slate-500">
                    .{resolved.extension.toUpperCase()} document
                    {sizeLabel ? ` (${sizeLabel})` : ""} — ready to save locally.
                  </p>
                  <a
                    href={objectUrl}
                    download={resolved.filename}
                    className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-blue-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-800"
                  >
                    <Download className="h-4 w-4" />
                    Save {resolved.filename}
                  </a>
                </div>
              )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

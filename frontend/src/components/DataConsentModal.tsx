import React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ShieldCheck, X } from "lucide-react";

interface DataConsentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentConsent: boolean | null;
  onDecideConsent: (granted: boolean) => void;
}

export const DataConsentModal: React.FC<DataConsentModalProps> = ({
  open,
  onOpenChange,
  currentConsent,
  onDecideConsent,
}) => {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(520px,95vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg bg-white shadow-xl">
          <div className="flex items-start justify-between bg-[#12305a] px-4 py-2.5 text-white">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              <Dialog.Title className="text-sm font-bold">
                Permission for Server AI CV Matching & Caching
              </Dialog.Title>
            </div>
            <Dialog.Close className="text-white/80 hover:text-white cursor-pointer">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-3 p-4 text-xs leading-relaxed text-slate-700">
            <p>
              To recommend the best CV (<strong>CV1</strong>, <strong>CV2</strong>, or{" "}
              <strong>CV3</strong>) using the server LLM and cache recommendations per company, the
              app requests permission to send:
            </p>
            <ul className="list-disc space-y-1 pl-5 font-medium text-slate-800">
              <li>Your 3 CDC Resume PDFs (CV1, CV2, CV3)</li>
              <li>Placement company table rows, job roles, and Job Descriptions (JDs)</li>
              <li>Placement notices board entries</li>
            </ul>
            <div className="rounded border border-emerald-200 bg-emerald-50 p-2.5 text-[11.5px] text-emerald-950">
              <strong>Strict Privacy Guarantee:</strong> Your roll number, ERP password, security
              questions/answers, email OTP, and ERP session cookies <strong>never</strong> leave
              your browser. All ERP login and apply/cancel actions happen directly between your
              browser and <code>erp.iitkgp.ac.in</code>.
            </div>
            {currentConsent !== null && (
              <p className="text-[11px] text-slate-500">
                Current status:{" "}
                <strong>{currentConsent ? "Permission Granted" : "Permission Declined"}</strong>
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2.5">
            <button
              type="button"
              onClick={() => {
                onDecideConsent(false);
                onOpenChange(false);
              }}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              Do not send data
            </button>
            <button
              type="button"
              onClick={() => {
                onDecideConsent(true);
                onOpenChange(false);
              }}
              className="rounded bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 cursor-pointer"
            >
              Allow & Enable Smart CV Match
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

import React, { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import {
  connectGmailAccount,
  disconnectGmailAccount,
  getGmailClientId,
  loadGoogleIdentityScript,
} from "../lib/gmailOtp";
import { GmailOtpAccount, saveGmailOtpAccount } from "../lib/storage";

interface GmailOtpSettingsProps {
  account: GmailOtpAccount;
  onAccountChange: (account: GmailOtpAccount) => void;
}

export const GmailOtpSettings: React.FC<GmailOtpSettingsProps> = ({
  account,
  onAccountChange,
}) => {
  const clientId = getGmailClientId();
  const [busy, setBusy] = useState<"connect" | "disconnect" | null>(null);

  useEffect(() => {
    if (!clientId) return;
    void loadGoogleIdentityScript().catch(() => undefined);
  }, [clientId]);

  const connect = () => {
    if (!clientId) {
      onAccountChange(saveGmailOtpAccount({ enabled: true, email: "" }));
      toast.error("Add the Google OAuth client id before Gmail can be connected.");
      return;
    }
    setBusy("connect");
    const pending = connectGmailAccount();
    void pending
      .then((next) => {
        onAccountChange(next);
        toast.success(`Saved ${next.email} for OTP auto-fill.`);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Gmail connection failed.";
        toast.error(message);
        if (!account.email) {
          onAccountChange(saveGmailOtpAccount({ enabled: false, email: "" }));
        }
      })
      .finally(() => setBusy(null));
  };

  const disconnect = () => {
    setBusy("disconnect");
    void disconnectGmailAccount()
      .then((next) => {
        onAccountChange(next);
        toast.success("Gmail removed from this browser. You can also remove the app in your Google Account.");
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : "Could not disconnect Gmail.");
      })
      .finally(() => setBusy(null));
  };

  const onToggle = (checked: boolean) => {
    if (!checked) {
      onAccountChange(saveGmailOtpAccount({ ...account, enabled: false }));
      return;
    }
    if (account.email) {
      onAccountChange(saveGmailOtpAccount({ ...account, enabled: true }));
      return;
    }
    connect();
  };

  return (
    <section className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <label className="flex items-start gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={account.enabled || busy === "connect"}
          disabled={busy !== null}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span>
          Auto-fill OTP
          <span className="mt-0.5 block text-[11px] font-medium leading-relaxed text-slate-600">
            After Send OTP, this browser reads the new ERP code from the Gmail account you connect
            and keeps that account for the next login. The Google token stays in this browser
            session and is never sent to the portal server.
          </span>
        </span>
      </label>

      {!clientId && (
        <div className="mt-2.5 rounded border border-amber-200 bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-950">
          <p className="font-bold">Google Cloud client id is not in this build yet.</p>
          <ol className="mt-1 list-decimal space-y-1 pl-4">
            <li>Create a Google Cloud project and enable the Gmail API.</li>
            <li>
              OAuth consent screen: External, and leave it in Testing. Add the Gmail address that
              receives the ERP OTP as a test user. Add the <span className="font-semibold">gmail.readonly</span> scope.
            </li>
            <li>
              Create an OAuth client ID of type Web application. Authorized JavaScript origins:
              http://127.0.0.1:5173, http://localhost:5173, https://ewrpkgp.in, and
              https://www.ewrpkgp.in.
            </li>
            <li>
              Set <span className="font-semibold">VITE_GMAIL_CLIENT_ID</span> to that client id and
              rebuild. Do not put a client secret in this app.
            </li>
          </ol>
        </div>
      )}

      {clientId && (
        <div className="mt-2.5 flex flex-col gap-2">
          <p className="text-[11px] leading-relaxed text-slate-600">
            Connect the Google inbox that receives the ERP OTP. An institute Gmail account works. A
            non-Google inbox cannot be read this way. Only a recent ERP one-time code is used.
          </p>
          {account.email ? (
            <p className="text-xs font-semibold text-[#12305a]">
              Saved account: {account.email}
              {account.enabled ? "" : " (auto-fill off)"}
            </p>
          ) : (
            <p className="text-xs text-slate-500">No Gmail account saved on this device.</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={connect}
              disabled={busy !== null}
              className="inline-flex items-center gap-1 rounded bg-blue-700 px-2.5 py-1 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
            >
              <Mail className="h-3.5 w-3.5" />
              {busy === "connect" ? "Waiting for Google…" : account.email ? "Change account" : "Connect Gmail"}
            </button>
            {account.email && (
              <button
                type="button"
                onClick={disconnect}
                disabled={busy !== null}
                className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
              >
                {busy === "disconnect" ? "Removing…" : "Disconnect"}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

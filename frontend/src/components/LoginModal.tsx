import React, { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { LoginProfile, SecuritySlot, normalizeQuestion } from "../lib/erpParsers";
import { loadRememberSecretsPreference, padSlots } from "../lib/storage";

interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialProfile: LoginProfile;
  onFetchQuestions: (rollno: string) => Promise<string[]>;
  onSaveProfile: (profile: LoginProfile, rememberSecrets: boolean) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  open,
  onOpenChange,
  initialProfile,
  onFetchQuestions,
  onSaveProfile,
}) => {
  const [rollno, setRollno] = useState(initialProfile.rollno);
  const [password, setPassword] = useState(initialProfile.password);
  const [slots, setSlots] = useState<[SecuritySlot, SecuritySlot, SecuritySlot]>(() =>
    padSlots(initialProfile.slots)
  );
  const [rememberSecrets, setRememberSecrets] = useState<boolean>(() =>
    loadRememberSecretsPreference()
  );
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (open) {
      setRollno(initialProfile.rollno);
      setPassword(initialProfile.password);
      setSlots(padSlots(initialProfile.slots));
      setRememberSecrets(loadRememberSecretsPreference());
    }
  }, [open, initialProfile]);

  const handleFetch = async () => {
    const cleanRoll = rollno.trim();
    if (!cleanRoll) {
      toast.error("Enter a roll number first.");
      return;
    }
    setFetching(true);
    try {
      const questions = await onFetchQuestions(cleanRoll);
      if (questions.length < 3) {
        throw new Error("ERP did not return all 3 security questions.");
      }
      const nextSlots = questions.slice(0, 3).map((q) => {
        const cleanQ = normalizeQuestion(q);
        const existing = slots.find(
          (s) => normalizeQuestion(s.question).toLowerCase() === cleanQ.toLowerCase()
        );
        return {
          question: cleanQ,
          answer: existing ? existing.answer : "",
          use: existing ? existing.use : true,
        };
      });
      setSlots(padSlots(nextSlots));
      toast.success("Fetched all 3 security questions from ERP.");
    } catch (err: any) {
      toast.error(`Question fetch failed: ${err?.message || String(err)}`);
    } finally {
      setFetching(false);
    }
  };

  const updateSlot = (index: 0 | 1 | 2, patch: Partial<SecuritySlot>) => {
    setSlots((prev) => {
      const copy: [SecuritySlot, SecuritySlot, SecuritySlot] = [
        { ...prev[0] },
        { ...prev[1] },
        { ...prev[2] },
      ];
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanRoll = rollno.trim();
    if (!cleanRoll || !password) {
      toast.error("Roll number and password are required.");
      return;
    }
    if (slots.filter((s) => s.question.trim() !== "").length < 3) {
      toast.error("Fetch all 3 security questions first.");
      return;
    }
    if (!slots.some((s) => s.use && s.answer.trim() !== "")) {
      toast.error("At least one question must be marked Use and have an answer.");
      return;
    }
    const missing = slots.find((s) => s.use && s.question.trim() !== "" && !s.answer.trim());
    if (missing) {
      toast.error("A used question has no answer. Fill it or uncheck Use to skip it at login.");
      return;
    }
    onSaveProfile(
      {
        rollno: cleanRoll,
        password,
        slots,
      },
      rememberSecrets
    );
    onOpenChange(false);
    toast.success(
      rememberSecrets
        ? "Login saved across browser restarts on this device."
        : "Login saved for this browser session (cleared when browser closes)."
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(560px,96vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg bg-white shadow-xl">
          <div className="flex items-start justify-between bg-[#12305a] px-4 py-2.5 text-white">
            <div>
              <span className="text-[11px] text-blue-300">
                100% Local Browser Storage (Never sent to server)
              </span>
              <Dialog.Title className="text-sm font-bold">Edit ERP Login</Dialog.Title>
            </div>
            <Dialog.Close className="text-white/80 hover:text-white cursor-pointer">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4">
            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Roll Number
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={rollno}
                  onChange={(e) => setRollno(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleFetch();
                    }
                  }}
                  placeholder="e.g. 22XX10001"
                  required
                  className="flex-1 rounded border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-900"
                />
                <button
                  type="button"
                  onClick={handleFetch}
                  disabled={fetching}
                  className="inline-flex items-center gap-1 rounded border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${fetching ? "animate-spin" : ""}`} />
                  {fetching ? "Fetching…" : "Fetch questions"}
                </button>
              </div>
            </label>

            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              ERP Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="ERP password"
                required
                className="rounded border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-900"
              />
            </label>

            <p className="text-xs leading-relaxed text-slate-600">
              ERP has three security questions. Uncheck <strong>Use</strong> on a wrong one — login
              will skip it and fetch another. An empty answer is not skipped; fill it here.
            </p>

            <div className="flex flex-col gap-2">
              {([0, 1, 2] as const).map((idx) => {
                const slot = slots[idx];
                return (
                  <div
                    key={idx}
                    className="grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-1.5 rounded-md border border-slate-200 bg-slate-50 p-2.5"
                  >
                    <div
                      className={`col-span-2 text-xs font-semibold ${
                        slot.question ? "text-[#12305a]" : "italic text-slate-400"
                      }`}
                    >
                      {slot.question || `Question ${idx + 1} — click Fetch questions`}
                    </div>
                    <input
                      type="password"
                      value={slot.answer}
                      onChange={(e) => updateSlot(idx, { answer: e.target.value })}
                      placeholder="Security answer"
                      className="w-full rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-900"
                    />
                    <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={slot.use}
                        onChange={(e) => updateSlot(idx, { use: e.target.checked })}
                      />
                      Use
                    </label>
                  </div>
                );
              })}
            </div>

            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberSecrets}
                onChange={(e) => setRememberSecrets(e.target.checked)}
              />
              Remember password &amp; security answers across browser restarts on this device
            </label>

            <div className="mt-1 flex justify-end gap-2 border-t border-slate-200 pt-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Close
                </button>
              </Dialog.Close>
              <button
                type="submit"
                className="rounded bg-blue-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-blue-800 cursor-pointer"
              >
                Save login
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

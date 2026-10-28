import React, { useCallback, useEffect, useRef, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { toast } from "sonner";
import { CompanyRole, CvNumber, JnfDetails, LoginProfile, PlacementNotice } from "./lib/erpParsers";
import {
  erpClient,
  ExtensionBridgeSnapshot,
  readExtensionBridge,
} from "./lib/erpBridge";
import {
  CvDiffSummary,
  RoleMatchRecommendation,
  computeCvSetSha256,
  fetchCvSetStatus,
  requestServerCvMatches,
  syncConsentedCdcSnapshot,
} from "./lib/matcherApi";
import {
  LocalAiCacheState,
  hasUsableLoginProfile,
  loadAppliedCvMap,
  loadLocalAiCache,
  loadLoginProfile,
  loadReadNoticeIds,
  loadServerDataConsent,
  saveAppliedCvMap,
  saveLocalAiCache,
  saveLoginProfile,
  saveReadNoticeIds,
  saveServerDataConsent,
} from "./lib/storage";
import { Header } from "./components/Header";
import { ExtensionStatusBanner } from "./components/ExtensionStatusBanner";
import { OtpStrip } from "./components/OtpStrip";
import { LoginModal } from "./components/LoginModal";
import { DataConsentModal } from "./components/DataConsentModal";
import { RolesSheet } from "./components/RolesSheet";
import { NoticesSheet } from "./components/NoticesSheet";
import { JdModal } from "./components/JdModal";

export const App: React.FC = () => {
  const [profile, setProfile] = useState<LoginProfile>(() => loadLoginProfile());
  const [stage, setStage] = useState<"uninitialized" | "otp_sent" | "authenticated">(
    "uninitialized"
  );
  const [bridge, setBridge] = useState<ExtensionBridgeSnapshot>({
    status: "checking",
    version: null,
  });
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [smartBusy, setSmartBusy] = useState(false);
  const [aiWarmingUp, setAiWarmingUp] = useState(false);
  const aiSyncPromiseRef = useRef<Promise<void> | null>(null);

  const [companies, setCompanies] = useState<CompanyRole[]>([]);
  const [notices, setNotices] = useState<PlacementNotice[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [readNoticeIds, setReadNoticeIds] = useState<Set<string>>(() => loadReadNoticeIds());
  const [appliedCvMap, setAppliedCvMap] = useState<Record<string, CvNumber>>(() =>
    loadAppliedCvMap()
  );

  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [consentModalOpen, setConsentModalOpen] = useState(false);
  const [serverConsent, setServerConsent] = useState<boolean | null>(() =>
    loadServerDataConsent()
  );
  const [pendingConsentAction, setPendingConsentAction] = useState<(() => void) | null>(null);

  const [aiCache, setAiCache] = useState<LocalAiCacheState>(() => loadLocalAiCache());
  const aiCacheRef = useRef<LocalAiCacheState>(aiCache);
  useEffect(() => {
    aiCacheRef.current = aiCache;
  }, [aiCache]);

  const [jdModalOpen, setJdModalOpen] = useState(false);
  const [activeJdRole, setActiveJdRole] = useState<CompanyRole | null>(null);
  const [activeJdDetails, setActiveJdDetails] = useState<JnfDetails | null>(null);
  const [jdLoading, setJdLoading] = useState(false);
  const [jdRecLoading, setJdRecLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let inflight = false;

    const schedule = (delay: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void run();
      }, delay);
    };

    const run = async () => {
      if (cancelled || inflight) return;
      inflight = true;
      try {
        const next = await readExtensionBridge();
        if (!cancelled) {
          setBridge(next);
          schedule(next.status === "connected" ? 8000 : 2500);
        }
      } finally {
        inflight = false;
      }
    };

    void run();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      window.clearTimeout(timer);
      void run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Laptop breakpoint: show roles + notices together (same page).
  const [isLaptopUp, setIsLaptopUp] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : true
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsLaptopUp(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (stage !== "authenticated") return;
    const id = window.setInterval(() => {
      erpClient.keepalive().catch(() => undefined);
    }, 25 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [stage]);

  const updateAiCache = useCallback(
    (
      updater: (prev: LocalAiCacheState) => LocalAiCacheState
    ): LocalAiCacheState => {
      const next = updater(aiCacheRef.current);
      aiCacheRef.current = next;
      setAiCache(next);
      saveLocalAiCache(next);
      return next;
    },
    []
  );

  const mergeServerAiPayload = useCallback(
    (params: {
      cvset_hash: string;
      cv_cached?: boolean;
      session_token?: string | null;
      cv_diffs?: CvDiffSummary | null;
      recommendations?: RoleMatchRecommendation[];
    }) => {
      updateAiCache((prev) => {
        const sameHash = prev.cvset_hash === params.cvset_hash;
        const baseRecs = sameHash ? { ...prev.recommendations } : {};
        for (const rec of params.recommendations || []) {
          if (rec && rec.key) {
            baseRecs[rec.key] = rec;
          }
        }
        return {
          cvset_hash: params.cvset_hash,
          server_cv_cached: params.cv_cached ?? (sameHash ? prev.server_cv_cached : false),
          session_token:
            params.session_token || (sameHash ? prev.session_token : undefined),
          cv_diffs: params.cv_diffs || (sameHash ? prev.cv_diffs : null),
          recommendations: baseRecs,
        };
      });
    },
    [updateAiCache]
  );

  /**
   * Ensures we know the current cvset_hash and whether the server already has the 3 CV PDFs cached.
   * On every login, if sessionStorage/localStorage already has a cvset_hash + session_token, we first
   * query `/api/v1/cvset-status/{cvset_hash}` immediately to pull cached recommendations + reasons into
   * sessionStorage without re-downloading or re-uploading the 3 resume PDFs.
   */
  const prepareConsentedCvSyncPayload = useCallback(async (): Promise<{
    cvset_hash: string;
    session_token?: string;
    cv_pdfs?: { cv1: string; cv2: string; cv3: string };
  }> => {
    const cachedState = loadLocalAiCache();
    if (cachedState.cvset_hash && cachedState.session_token) {
      try {
        const fastStatus = await fetchCvSetStatus(
          cachedState.cvset_hash,
          cachedState.session_token
        );
        if (fastStatus.cv_cached && fastStatus.session_token) {
          mergeServerAiPayload({
            cvset_hash: cachedState.cvset_hash,
            cv_cached: true,
            session_token: fastStatus.session_token,
            cv_diffs: fastStatus.cv_diffs,
            recommendations: fastStatus.recommendations,
          });
          return {
            cvset_hash: cachedState.cvset_hash,
            session_token: fastStatus.session_token,
            cv_pdfs: undefined,
          };
        }
      } catch {
        /* fall through to full ERP CV fetch */
      }
    }

    const cvs = await erpClient.fetchAllThreeCvPdfsBase64();
    const cvset_hash = await computeCvSetSha256(cvs);

    const existingToken =
      aiCacheRef.current.cvset_hash === cvset_hash
        ? aiCacheRef.current.session_token
        : undefined;

    try {
      const status = await fetchCvSetStatus(cvset_hash, existingToken);
      mergeServerAiPayload({
        cvset_hash,
        cv_cached: status.cv_cached,
        session_token: status.session_token,
        cv_diffs: status.cv_diffs,
        recommendations: status.recommendations,
      });
      if (status.cv_cached && status.session_token) {
        return {
          cvset_hash,
          session_token: status.session_token,
          cv_pdfs: undefined,
        };
      }
    } catch {
      /* if status probe fails, fall back to sending cv_pdfs */
    }

    return { cvset_hash, cv_pdfs: cvs };
  }, [mergeServerAiPayload]);

  const mergeAppliedCvs = useCallback(
    (rows: CompanyRole[], cvMap: Record<string, CvNumber>): CompanyRole[] => {
      return rows.map((r) => ({
        ...r,
        applied_cv: r.applied ? r.applied_cv || cvMap[r.key] || null : null,
      }));
    },
    []
  );

  const hydrateAppliedCvNumbersInBackground = useCallback(
    async (rows: CompanyRole[], currentMap: Record<string, CvNumber>) => {
      const appliedMissing = rows.filter(
        (r) => r.applied && !r.applied_cv && !currentMap[r.key] && r.com_id && r.jnf_id
      );
      if (appliedMissing.length === 0) return;

      const updatedMap: Record<string, CvNumber> = { ...currentMap };
      let changed = false;

      for (const r of appliedMissing) {
        try {
          const details = await erpClient.fetchJnf(r.com_id, r.jnf_id, r.yop);
          if (details.applied_cv) {
            updatedMap[r.key] = details.applied_cv;
            changed = true;
          }
        } catch {
          /* ignore single failure */
        }
      }

      if (changed) {
        setAppliedCvMap(updatedMap);
        saveAppliedCvMap(updatedMap);
        setCompanies((prev) => mergeAppliedCvs(prev, updatedMap));
      }
    },
    [mergeAppliedCvs]
  );

  const syncToBackendIfConsented = useCallback(
    (
      rows: CompanyRole[],
      noticeRows: PlacementNotice[],
      consent: boolean | null
    ): Promise<void> => {
      if (!consent) return Promise.resolve();
      if (aiSyncPromiseRef.current) {
        return aiSyncPromiseRef.current;
      }

      const run = (async () => {
        setAiWarmingUp(true);
        try {
          // 1. Hydrate any existing sessionStorage/localStorage cache first
          const stored = loadLocalAiCache();
          if (stored.cvset_hash) {
            mergeServerAiPayload({
              cvset_hash: stored.cvset_hash,
              cv_cached: stored.server_cv_cached,
              session_token: stored.session_token,
              cv_diffs: stored.cv_diffs,
              recommendations: Object.values(stored.recommendations),
            });
          }

          // 2. Fetch server cache status (pulls cached recommendations + why reasons into sessionStorage)
          const { cvset_hash, session_token, cv_pdfs } =
            await prepareConsentedCvSyncPayload();

          // 3. Non-lazily check which open roles are still missing from frontend sessionStorage cache
          const currentRecs = aiCacheRef.current.recommendations;
          const openUncached = rows.filter((r) => r.is_open && !currentRecs[r.key]);
          const jds: Record<string, string> = {};

          if (openUncached.length > 0) {
            await Promise.all(
              openUncached.map(async (r) => {
                try {
                  const jnf = await erpClient.fetchJnf(r.com_id, r.jnf_id, r.yop);
                  jds[r.key] = jnf.jd_text || jnf.raw_text || "";
                } catch {
                  /* ignore single JD fetch error */
                }
              })
            );
          }

          const needPrecompute =
            openUncached.length > 0 || !aiCacheRef.current.cv_diffs;

          const syncRes = await syncConsentedCdcSnapshot({
            cvset_hash,
            session_token,
            cv_pdfs,
            roles: rows,
            jds,
            notices: noticeRows,
            precompute_matches: needPrecompute,
          });

          mergeServerAiPayload({
            cvset_hash,
            cv_cached: syncRes.cv_cached,
            session_token: syncRes.session_token,
            cv_diffs: syncRes.cv_diffs,
            recommendations: syncRes.recommendations,
          });
        } catch {
          /* non-blocking eager snapshot & AI cache warmup */
        } finally {
          setAiWarmingUp(false);
          aiSyncPromiseRef.current = null;
        }
      })();

      aiSyncPromiseRef.current = run;
      return run;
    },
    [mergeServerAiPayload, prepareConsentedCvSyncPayload]
  );

  const handleSendOtp = async () => {
    if (bridge.status !== "connected") {
      toast.error("Install or update the ERP bridge extension, then reload this page.");
      return;
    }
    if (!hasUsableLoginProfile(profile)) {
      setLoginModalOpen(true);
      return;
    }
    setSendingOtp(true);
    try {
      const res = await erpClient.sendOtp(profile);
      setStage("otp_sent");
      toast.success(res.message || `OTP requested for ${res.rollno}. Check your email.`);
    } catch (err: any) {
      const msg = err?.message || String(err);
      toast.error(`Send OTP failed: ${msg}`);
      if (msg.toLowerCase().includes("edit login")) {
        setLoginModalOpen(true);
      }
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async (otp: string) => {
    if (bridge.status !== "connected") {
      toast.error("Install or update the ERP bridge extension, then reload this page.");
      return;
    }
    setVerifyingOtp(true);
    try {
      const res = await erpClient.verifyOtpAndOpenCdc(profile, otp);
      const merged = mergeAppliedCvs(res.companies, appliedCvMap);
      setStage("authenticated");
      setCompanies(merged);
      setNotices(res.notices);
      toast.success(`Logged into CDC as ${res.rollno}. Loaded ${merged.length} roles.`);
      hydrateAppliedCvNumbersInBackground(merged, appliedCvMap);
      syncToBackendIfConsented(merged, res.notices, serverConsent);
    } catch (err: any) {
      toast.error(`OTP verification failed: ${err?.message || String(err)}`);
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const [freshCompanies, freshNotices] = await Promise.all([
        erpClient.fetchCompanies(),
        erpClient.fetchNotices(50, true),
      ]);
      const merged = mergeAppliedCvs(freshCompanies, appliedCvMap);
      setCompanies(merged);
      setNotices(freshNotices);
      toast.success("Synced live placement data from ERP.");
      hydrateAppliedCvNumbersInBackground(merged, appliedCvMap);
      syncToBackendIfConsented(merged, freshNotices, serverConsent);
    } catch (err: any) {
      toast.error(`Refresh failed: ${err?.message || String(err)}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLogout = async () => {
    await erpClient.logout();
    setStage("uninitialized");
    setCompanies([]);
    setNotices([]);
    setSelectedKeys(new Set());
    toast.success("Logged out of ERP.");
  };

  const handleApplyRole = (
    role: CompanyRole,
    cv: CvNumber,
    prevCvOnSwitch: CvNumber | null = null
  ) => {
    // Optimistic UI update
    const nextMap = { ...appliedCvMap, [role.key]: cv };
    setAppliedCvMap(nextMap);
    saveAppliedCvMap(nextMap);
    setSelectedKeys((prev) => {
      const copy = new Set(prev);
      copy.delete(role.key);
      return copy;
    });
    setCompanies((prev) =>
      prev.map((r) =>
        r.key === role.key
          ? {
              ...r,
              applied: true,
              status: "Y",
              applied_cv: cv,
              switched_from: prevCvOnSwitch ?? r.switched_from ?? null,
            }
          : r
      )
    );
    toast.message(`Submitting CV${cv} for ${role.company}…`);

    erpClient
      .applyRole(role.com_id, role.jnf_id, cv, role.yop)
      .then((res) => {
        if (!res.verified) {
          throw new Error("ERP did not confirm the application");
        }
        toast.success(`Applied to ${role.company} (${role.role}) with CV${res.applied_cv || cv}.`);
      })
      .catch((err) => {
        toast.error(`Apply failed on ${role.company}: ${err?.message || String(err)}`);
        handleRefresh();
      });
  };

  const handleSwitchCv = (
    role: CompanyRole,
    newCv: CvNumber,
    prevCv: CvNumber | null
  ) => {
    setCompanies((prev) =>
      prev.map((r) =>
        r.key === role.key
          ? {
              ...r,
              applied: true,
              applied_cv: newCv,
              switched_from: prevCv,
            }
          : r
      )
    );
    toast.message(
      prevCv
        ? `Switching ${role.company} to CV${newCv}…`
        : `Reverting ${role.company} to CV${newCv}…`
    );

    (async () => {
      try {
        await erpClient.cancelRole(role.com_id, role.jnf_id, role.yop);
        const res = await erpClient.applyRole(role.com_id, role.jnf_id, newCv, role.yop);
        if (!res.verified) {
          throw new Error("ERP did not confirm re-application");
        }
        const nextMap = { ...appliedCvMap, [role.key]: newCv };
        setAppliedCvMap(nextMap);
        saveAppliedCvMap(nextMap);
        toast.success(
          prevCv
            ? `Switched ${role.company} to CV${newCv}. Click Undo to revert.`
            : `Reverted ${role.company} back to CV${newCv}.`
        );
      } catch (err: any) {
        toast.error(`Switch failed on ${role.company}: ${err?.message || String(err)}`);
        handleRefresh();
      }
    })();
  };

  const handleCancelRole = (role: CompanyRole) => {
    setCompanies((prev) =>
      prev.map((r) =>
        r.key === role.key
          ? { ...r, applied: false, status: "", applied_cv: null, switched_from: null }
          : r
      )
    );
    toast.message(`Cancelling ${role.company}…`);

    erpClient
      .cancelRole(role.com_id, role.jnf_id, role.yop)
      .then((res) => {
        if (!res.cancelled) {
          throw new Error("ERP still marks this role as applied");
        }
        const nextMap = { ...appliedCvMap };
        delete nextMap[role.key];
        setAppliedCvMap(nextMap);
        saveAppliedCvMap(nextMap);
        toast.success(`Cancelled application for ${role.company}.`);
      })
      .catch((err) => {
        toast.error(`Cancel failed on ${role.company}: ${err?.message || String(err)}`);
        handleRefresh();
      });
  };

  const executeSmartApply = async () => {
    const selectedRoles = companies.filter((r) => selectedKeys.has(r.key) && r.is_open && !r.applied);
    if (selectedRoles.length === 0) {
      toast.error("Select at least one open role first.");
      return;
    }

    setSmartBusy(true);
    try {
      // Wait for any in-flight login AI cache build so we reuse sessionStorage recommendations
      // and never fire a duplicate concurrent Gemini request
      if (aiSyncPromiseRef.current) {
        await aiSyncPromiseRef.current;
      }

      const currentRecs = {
        ...loadLocalAiCache().recommendations,
        ...aiCacheRef.current.recommendations,
      };
      const uncachedRoles = selectedRoles.filter((r) => !currentRecs[r.key]);

      if (uncachedRoles.length > 0) {
        toast.message("Matching uncached roles via server AI…");
        const { cvset_hash, session_token, cv_pdfs } = await prepareConsentedCvSyncPayload();

        // Re-check after prepareConsentedCvSyncPayload hydrated server-cached recommendations
        for (const [k, rec] of Object.entries(aiCacheRef.current.recommendations)) {
          currentRecs[k] = rec;
        }
        const stillUncached = selectedRoles.filter((r) => !currentRecs[r.key]);

        if (stillUncached.length > 0) {
          const roleInputs = await Promise.all(
            stillUncached.map(async (r) => {
              let jd_text = "";
              try {
                const jnf = await erpClient.fetchJnf(r.com_id, r.jnf_id, r.yop);
                jd_text = jnf.jd_text || jnf.raw_text || "";
              } catch {
                /* use empty jd if ERP JNF fails */
              }
              return {
                com_id: r.com_id,
                jnf_id: r.jnf_id,
                yop: r.yop,
                company: r.company,
                role: r.role,
                ctc: r.ctc,
                deadline: r.deadline,
                jd_text,
              };
            })
          );

          const matchRes = await requestServerCvMatches({
            cvset_hash,
            session_token,
            cv_pdfs,
            roles: roleInputs,
          });

          mergeServerAiPayload({
            cvset_hash,
            cv_cached: true,
            session_token: matchRes.session_token,
            cv_diffs: matchRes.cv_diffs,
            recommendations: matchRes.recommendations,
          });
          for (const rec of matchRes.recommendations) {
            currentRecs[rec.key] = rec;
          }
        }
      }

      for (const role of selectedRoles) {
        const rec = currentRecs[role.key];
        if (rec && (rec.cv === 1 || rec.cv === 2 || rec.cv === 3)) {
          handleApplyRole(role, rec.cv);
        }
      }
    } catch (err: any) {
      toast.error(`Smart AI match failed: ${err?.message || String(err)}`);
    } finally {
      setSmartBusy(false);
    }
  };

  const handleSmartApplySelected = () => {
    if (serverConsent !== true) {
      setPendingConsentAction(() => executeSmartApply);
      setConsentModalOpen(true);
      return;
    }
    executeSmartApply();
  };

  const handleOpenJd = async (role: CompanyRole) => {
    setActiveJdRole(role);
    setActiveJdDetails(null);
    setJdModalOpen(true);
    setJdLoading(true);
    let loadedDetails: JnfDetails | null = null;
    try {
      const details = await erpClient.fetchJnf(role.com_id, role.jnf_id, role.yop);
      loadedDetails = details;
      setActiveJdDetails(details);
    } catch (err: any) {
      toast.error(`Failed to load JD: ${err?.message || String(err)}`);
    } finally {
      setJdLoading(false);
    }

    // If AI Sync is enabled and this role does not have a cached recommendation yet, wait for login warmup or fetch once
    if (serverConsent === true && !aiCacheRef.current.recommendations[role.key]) {
      setJdRecLoading(true);
      try {
        if (aiSyncPromiseRef.current) {
          await aiSyncPromiseRef.current;
        }
        if (!aiCacheRef.current.recommendations[role.key]) {
          const { cvset_hash, session_token, cv_pdfs } = await prepareConsentedCvSyncPayload();
          if (!aiCacheRef.current.recommendations[role.key]) {
            const matchRes = await requestServerCvMatches({
              cvset_hash,
              session_token,
              cv_pdfs,
              roles: [
                {
                  com_id: role.com_id,
                  jnf_id: role.jnf_id,
                  yop: role.yop,
                  company: role.company,
                  role: role.role,
                  ctc: role.ctc,
                  deadline: role.deadline,
                  jd_text: loadedDetails?.jd_text || loadedDetails?.raw_text || "",
                },
              ],
            });
            mergeServerAiPayload({
              cvset_hash,
              cv_cached: true,
              session_token: matchRes.session_token,
              cv_diffs: matchRes.cv_diffs,
              recommendations: matchRes.recommendations,
            });
          }
        }
      } catch {
        /* non-fatal in JD modal */
      } finally {
        setJdRecLoading(false);
      }
    }
  };

  const unreadCount = notices.filter((n) => !readNoticeIds.has(String(n.id))).length;
  const openCount = companies.filter((r) => !r.applied && r.is_open).length;

  const rolesSheetProps = {
    companies,
    selectedKeys,
    smartBusy,
    aiWarmingUp,
    cvDiffs: serverConsent ? aiCache.cv_diffs : null,
    recommendations: serverConsent ? aiCache.recommendations : {},
    onToggleKey: (key: string, checked: boolean) => {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        if (checked) next.add(key);
        else next.delete(key);
        return next;
      });
    },
    onToggleAllOpen: (keys: string[], checked: boolean) => {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        for (const k of keys) {
          if (checked) next.add(k);
          else next.delete(k);
        }
        return next;
      });
    },
    onApplyRole: (r: CompanyRole, cv: CvNumber) => handleApplyRole(r, cv),
    onSwitchCv: handleSwitchCv,
    onCancelRole: handleCancelRole,
    onSmartApplySelected: handleSmartApplySelected,
    onOpenJd: handleOpenJd,
  };

  const noticesSheetProps = {
    notices,
    readIds: readNoticeIds,
    onMarkRead: (id: string) => {
      setReadNoticeIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        saveReadNoticeIds(next);
        return next;
      });
    },
    onMarkAllRead: () => {
      const next = new Set(readNoticeIds);
      notices.forEach((n) => next.add(String(n.id)));
      setReadNoticeIds(next);
      saveReadNoticeIds(next);
    },
    onOpenAttachment: (noticeId: string, year: string) => {
      erpClient.openNoticeAttachment(noticeId, year).catch((err) => {
        toast.error(`Attachment open failed: ${err?.message || String(err)}`);
      });
    },
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <Header
        rollno={stage === "authenticated" ? erpClient.getSessionState().rollno || profile.rollno : profile.rollno}
        stage={stage}
        bridge={bridge}
        hasSavedLogin={hasUsableLoginProfile(profile)}
        serverConsent={serverConsent}
        isRefreshing={isRefreshing}
        cvDiffs={serverConsent ? aiCache.cv_diffs : null}
        onOpenCv={(cv) => {
          erpClient.openCvPreview(cv).catch((err) => {
            toast.error(`Could not open CV${cv}: ${err?.message || String(err)}`);
          });
        }}
        onRefresh={handleRefresh}
        onEditLogin={() => setLoginModalOpen(true)}
        onOpenConsent={() => setConsentModalOpen(true)}
        onLogout={handleLogout}
      />

      <ExtensionStatusBanner bridge={bridge} />

      <OtpStrip
        authenticated={stage === "authenticated"}
        stage={stage}
        hasSavedLogin={hasUsableLoginProfile(profile)}
        rollno={profile.rollno}
        sendingOtp={sendingOtp}
        verifyingOtp={verifyingOtp}
        bridgeReady={bridge.status === "connected"}
        onSetupLogin={() => setLoginModalOpen(true)}
        onSendOtp={handleSendOtp}
        onVerifyOtp={handleVerifyOtp}
      />

      <main className="w-full py-2.5">
        {isLaptopUp ? (
          <div className="grid grid-cols-2 items-start gap-3">
            <div className="min-w-0">
              <RolesSheet {...rolesSheetProps} />
            </div>
            <div className="min-w-0">
              <NoticesSheet {...noticesSheetProps} />
            </div>
          </div>
        ) : (
          <Tabs.Root defaultValue="roles">
            <Tabs.List className="mb-2 flex items-center gap-1 border-b-2 border-slate-200">
              <Tabs.Trigger
                value="roles"
                className="inline-flex cursor-pointer items-center gap-1.5 border-b-2 border-transparent px-3.5 py-1.5 text-xs font-bold text-slate-500 data-[state=active]:border-blue-700 data-[state=active]:bg-white data-[state=active]:text-blue-700"
              >
                Roles
                <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                  {openCount}
                </span>
              </Tabs.Trigger>

              <Tabs.Trigger
                value="notices"
                className="inline-flex cursor-pointer items-center gap-1.5 border-b-2 border-transparent px-3.5 py-1.5 text-xs font-bold text-slate-500 data-[state=active]:border-blue-700 data-[state=active]:bg-white data-[state=active]:text-blue-700"
              >
                Notices
                {unreadCount > 0 && (
                  <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content value="roles">
              <RolesSheet {...rolesSheetProps} />
            </Tabs.Content>

            <Tabs.Content value="notices">
              <NoticesSheet {...noticesSheetProps} />
            </Tabs.Content>
          </Tabs.Root>
        )}
      </main>

      <LoginModal
        open={loginModalOpen}
        onOpenChange={setLoginModalOpen}
        initialProfile={profile}
        bridgeReady={bridge.status === "connected"}
        onFetchQuestions={async (roll) => {
          if (bridge.status !== "connected") {
            throw new Error("Install or update the ERP bridge extension, then reload this page.");
          }
          return erpClient.fetchAllSecurityQuestions(roll);
        }}
        onSaveProfile={(nextProfile, rememberSecrets) => {
          const saved = saveLoginProfile(nextProfile, rememberSecrets);
          setProfile(saved);
        }}
      />

      <DataConsentModal
        open={consentModalOpen}
        onOpenChange={setConsentModalOpen}
        currentConsent={serverConsent}
        onDecideConsent={(granted) => {
          setServerConsent(granted);
          saveServerDataConsent(granted);
          if (granted) {
            toast.success("AI CV Match permission granted.");
            if (pendingConsentAction) {
              const fn = pendingConsentAction;
              setPendingConsentAction(null);
              fn();
            } else if (stage === "authenticated") {
              syncToBackendIfConsented(companies, notices, true);
            }
          } else {
            setPendingConsentAction(null);
            toast.message("Server data sharing disabled. You can still apply manually with CV1/CV2/CV3.");
          }
        }}
      />

      <JdModal
        open={jdModalOpen}
        onOpenChange={setJdModalOpen}
        role={activeJdRole}
        details={activeJdDetails}
        loading={jdLoading}
        recommendation={
          serverConsent && activeJdRole
            ? aiCache.recommendations[activeJdRole.key] || null
            : null
        }
        recommendationLoading={jdRecLoading}
        cvDiffs={serverConsent ? aiCache.cv_diffs : null}
        onApplyRole={(r, cv) => handleApplyRole(r, cv)}
      />
    </div>
  );
};

import React from "react";
import {
  ERP_EXTENSION_STORE_URL,
  ExtensionBridgeSnapshot,
  MIN_BRIDGE_VERSION,
} from "../lib/erpBridge";

interface ExtensionStatusBannerProps {
  bridge: ExtensionBridgeSnapshot;
}

export const ExtensionStatusBanner: React.FC<ExtensionStatusBannerProps> = ({ bridge }) => {
  if (bridge.status === "checking" || bridge.status === "connected") {
    return null;
  }

  const needsUpdate = bridge.status === "outdated";
  const installedLabel = bridge.version ? `version ${bridge.version}` : "an older version";

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-3 py-2 text-amber-950">
      <div className="min-w-0 text-xs leading-relaxed">
        <p className="font-bold">
          {needsUpdate ? "Update the ERP bridge extension" : "Install the ERP bridge extension"}
        </p>
        <p className="mt-0.5 text-amber-900">
          {needsUpdate
            ? `This browser has ${installedLabel}. Version ${MIN_BRIDGE_VERSION} or newer can fetch security questions. Update it, allow it on this site, then reload.`
            : "This site fetches security questions through the Chrome extension. Install it, allow it on this site, then reload."}
        </p>
      </div>
      <a
        href={ERP_EXTENSION_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center rounded bg-[#0b1f3a] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#12305a]"
      >
        {needsUpdate ? "Update extension" : "Install extension"}
      </a>
    </section>
  );
};

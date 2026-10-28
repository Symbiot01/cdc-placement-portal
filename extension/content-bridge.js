(() => {
  const SOURCE_PAGE = "ERP_CDC_PAGE";
  const SOURCE_EXT = "ERP_CDC_EXT";
  const BRIDGE_VERSION = chrome.runtime.getManifest().version;

  window.document.documentElement.setAttribute("data-erp-cdc-bridge", BRIDGE_VERSION);

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== SOURCE_PAGE || !data.id) return;

    chrome.runtime.sendMessage(
      {
        target: "ERP_CDC_BG",
        action: data.action,
        payload: data.payload,
      },
      (response) => {
        const runtimeError = chrome.runtime.lastError;
        const reported =
          response && typeof response.version === "string" && /^\d+\.\d+\.\d+$/.test(response.version)
            ? response.version
            : BRIDGE_VERSION;
        window.postMessage(
          {
            source: SOURCE_EXT,
            id: data.id,
            ok: !runtimeError && Boolean(response && response.ok),
            version: reported,
            result: response ? response.result : undefined,
            error: runtimeError
              ? runtimeError.message
              : response && response.error
              ? response.error
              : undefined,
          },
          window.location.origin
        );
      }
    );
  });
})();

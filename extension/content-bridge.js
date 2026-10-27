(() => {
  const SOURCE_PAGE = "ERP_CDC_PAGE";
  const SOURCE_EXT = "ERP_CDC_EXT";

  window.document.documentElement.setAttribute("data-erp-cdc-bridge", "1.0.0");

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
        window.postMessage(
          {
            source: SOURCE_EXT,
            id: data.id,
            ok: !runtimeError && Boolean(response && response.ok),
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

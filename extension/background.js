const ERP_ORIGIN = "https://erp.iitkgp.ac.in";

const LOCAL_SENDER_HOSTS = new Set(["localhost", "127.0.0.1"]);
const PUBLIC_HTTPS_HOSTS = new Set(["ewrpkgp.in", "www.ewrpkgp.in"]);

function assertAllowedSender(sender) {
  const rawUrl = sender && (sender.url || (sender.tab && sender.tab.url));
  if (!rawUrl) {
    throw new Error("Blocked bridge message from unknown sender context");
  }
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Blocked bridge message with invalid sender URL");
  }
  const host = parsed.hostname;
  const proto = parsed.protocol;
  const isLocal = (proto === "http:" || proto === "https:") && LOCAL_SENDER_HOSTS.has(host);
  const isPublicHttps = proto === "https:" && PUBLIC_HTTPS_HOSTS.has(host);
  if (!isLocal && !isPublicHttps) {
    throw new Error(`Blocked bridge message from untrusted origin: ${parsed.origin}`);
  }
}

function assertErpUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl, ERP_ORIGIN);
  } catch {
    throw new Error("Invalid ERP URL");
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "erp.iitkgp.ac.in") {
    throw new Error("Blocked outbound request outside https://erp.iitkgp.ac.in");
  }
  return parsed.toString();
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function clearErpCookies() {
  // Collect via URL scopes (host-only + path cookies) and domain filter.
  const probeUrls = [
    `${ERP_ORIGIN}/`,
    `${ERP_ORIGIN}/IIT_ERP3/`,
    `${ERP_ORIGIN}/SSOAdministration/`,
    `${ERP_ORIGIN}/TrainingPlacementSSO/`,
  ];
  const seen = new Set();
  const cookies = [];

  const pushUnique = (list) => {
    for (const c of list) {
      const key = [
        c.name,
        c.domain,
        c.path,
        c.storeId || "",
        c.partitionKey ? JSON.stringify(c.partitionKey) : "",
      ].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      cookies.push(c);
    }
  };

  for (const url of probeUrls) {
    pushUnique(await chrome.cookies.getAll({ url }));
  }
  pushUnique(await chrome.cookies.getAll({ domain: "erp.iitkgp.ac.in" }));
  pushUnique(await chrome.cookies.getAll({ domain: ".iitkgp.ac.in" }));

  await Promise.all(
    cookies.map((c) => {
      const path = c.path && c.path.startsWith("/") ? c.path : `/${c.path || ""}`;
      const urlPath = path.endsWith("/") ? path : `${path}/`;
      const details = {
        url: `${ERP_ORIGIN}${urlPath}`,
        name: c.name,
      };
      if (c.storeId) details.storeId = c.storeId;
      if (c.partitionKey) details.partitionKey = c.partitionKey;
      return chrome.cookies.remove(details).catch(() => null);
    })
  );
}

async function performErpFetch(payload) {
  const targetUrl = assertErpUrl(payload.url);
  const rawMethod = (payload.method || (payload.form ? "POST" : "GET")).toUpperCase();
  if (rawMethod !== "GET" && rawMethod !== "POST") {
    throw new Error(`Disallowed HTTP method: ${rawMethod}`);
  }
  const headers = new Headers();

  if (payload.ajax) {
    headers.set("X-Requested-With", "XMLHttpRequest");
  }

  let body;
  if (payload.form && typeof payload.form === "object") {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(payload.form)) {
      params.set(k, v == null ? "" : String(v));
    }
    body = params.toString();
    headers.set("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
  }

  const resp = await fetch(targetUrl, {
    method: rawMethod,
    headers,
    body: rawMethod === "GET" ? undefined : body,
    credentials: "include",
    redirect: "follow",
  });

  const finalUrl = resp.url || targetUrl;
  assertErpUrl(finalUrl);
  const contentType = resp.headers.get("content-type") || "application/octet-stream";

  if (payload.responseType === "base64") {
    const buf = await resp.arrayBuffer();
    return {
      ok: resp.ok,
      status: resp.status,
      finalUrl,
      contentType,
      base64: arrayBufferToBase64(buf),
    };
  }

  const text = await resp.text();
  return {
    ok: resp.ok,
    status: resp.status,
    finalUrl,
    contentType,
    text,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== "ERP_CDC_BG") {
    return false;
  }

  (async () => {
    try {
      assertAllowedSender(sender);

      if (message.action === "PING") {
        sendResponse({ ok: true, version: "1.0.3" });
        return;
      }
      if (message.action === "CLEAR_COOKIES") {
        await clearErpCookies();
        sendResponse({ ok: true });
        return;
      }
      if (message.action === "FETCH") {
        const result = await performErpFetch(message.payload || {});
        sendResponse({ ok: true, result });
        return;
      }
      sendResponse({ ok: false, error: `Unknown action: ${message.action}` });
    } catch (err) {
      sendResponse({
        ok: false,
        error: err && err.message ? err.message : String(err),
      });
    }
  })();

  return true;
});

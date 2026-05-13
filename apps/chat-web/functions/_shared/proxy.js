const normalizeOrigin = (value) => {
  const candidate = typeof value === "string" ? value.trim() : "";
  return candidate ? candidate.replace(/\/+$/g, "") : "";
};

const normalizeProjectId = (value) => {
  const candidate = typeof value === "string" ? value.trim() : "";
  return candidate || "";
};

const ALLOWED_REQUEST_HEADERS = new Set([
  "accept",
  "cache-control",
  "content-type",
  "last-event-id",
]);

export const getProxyOrigin = (env) => {
  const origin = normalizeOrigin(env.WEBCHAT_PROXY_ORIGIN);
  if (!origin) {
    throw new Error("WEBCHAT_PROXY_ORIGIN is not configured");
  }

  return origin;
};

export const buildProxyUrl = (request, env, pathname) => {
  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(pathname, `${getProxyOrigin(env)}/`);
  targetUrl.search = incomingUrl.search;
  const fixedProjectId = normalizeProjectId(env.WEBCHAT_FIXED_PROJECT_ID);
  if (fixedProjectId) {
    targetUrl.searchParams.set("projectId", fixedProjectId);
  }
  return targetUrl;
};

const filterForwardHeaders = (headers) => {
  const filteredHeaders = new Headers();

  headers.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();
    if (ALLOWED_REQUEST_HEADERS.has(normalizedKey)) {
      filteredHeaders.set(normalizedKey, value);
    }
  });

  return filteredHeaders;
};

const sanitizeJsonBody = (body, env) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return body;
  }

  const nextBody = { ...body };
  const fixedProjectId = normalizeProjectId(env.WEBCHAT_FIXED_PROJECT_ID);
  if (fixedProjectId) {
    nextBody.projectId = fixedProjectId;
  }

  return nextBody;
};

export const forwardRequest = async (request, targetUrl, env) => {
  const method = request.method.toUpperCase();
  const headers = filterForwardHeaders(request.headers);
  const init = {
    method,
    headers,
  };

  if (method !== "GET" && method !== "HEAD") {
    const contentType = (headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
      const jsonBody = await request.clone().json().catch(() => null);
      init.body = JSON.stringify(sanitizeJsonBody(jsonBody, env));
      headers.set("content-type", "application/json");
    } else {
      init.body = await request.arrayBuffer();
    }
  }

  return fetch(new Request(targetUrl.toString(), init));
};

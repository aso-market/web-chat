const DEFAULT_WEBCHAT_PROXY_ORIGIN =
  "https://tg-business-rag-worker.artsyom-avanesov.workers.dev";

const normalizeOrigin = (value) => {
  const candidate = typeof value === "string" ? value.trim() : "";
  return candidate ? candidate.replace(/\/+$/g, "") : "";
};

export const getProxyOrigin = (env) => {
  return (
    normalizeOrigin(env.WEBCHAT_PROXY_ORIGIN) ||
    DEFAULT_WEBCHAT_PROXY_ORIGIN
  );
};

export const buildProxyUrl = (request, env, pathname) => {
  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(pathname, `${getProxyOrigin(env)}/`);
  targetUrl.search = incomingUrl.search;
  return targetUrl;
};

export const forwardRequest = (request, targetUrl) => {
  const proxiedRequest = new Request(targetUrl.toString(), request);
  const headers = new Headers(proxiedRequest.headers);

  headers.delete("host");
  headers.delete("origin");

  return fetch(
    new Request(proxiedRequest, {
      headers,
    }),
  );
};

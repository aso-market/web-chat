import { buildProxyUrl, forwardRequest } from "../../_shared/proxy";

const normalizePathParam = (value) => {
  if (Array.isArray(value)) {
    return value.join("/");
  }

  return value || "";
};

export async function onRequest(context) {
  const proxyPath = normalizePathParam(context.params.path);
  const targetUrl = buildProxyUrl(
    context.request,
    context.env,
    `/api/webchat/${proxyPath}`,
  );

  return forwardRequest(context.request, targetUrl);
}

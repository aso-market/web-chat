import { buildProxyUrl, forwardRequest } from "../../_shared/proxy";

const normalizePathParam = (value) => {
  if (Array.isArray(value)) {
    return value.join("/");
  }

  return value || "";
};

export async function onRequest(context) {
  try {
    const proxyPath = normalizePathParam(context.params.path);
    const targetUrl = buildProxyUrl(
      context.request,
      context.env,
      `/api/webchat/${proxyPath}`,
    );

    return forwardRequest(context.request, targetUrl, context.env);
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error:
          error instanceof Error ? error.message : "webchat_proxy_failed",
      }),
      {
        status: 500,
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
      },
    );
  }
}

import {
  createTemporaryReferenceSet,
  decodeReply,
  loadServerAction,
  renderToReadableStream
} from "@vitejs/plugin-rsc/rsc";

import AppDocument from "../app/AppDocument";

function getHtmlRequestUrl(request: Request) {
  const url = new URL(request.url);

  if (url.pathname.endsWith(".rsc")) {
    url.pathname = url.pathname.slice(0, -4) || "/";
  }

  return url.toString();
}

export default async function handler(request: Request) {
  const requestUrl = new URL(request.url);
  const isAction = request.method === "POST";
  const isRscRequest =
    requestUrl.pathname.endsWith(".rsc") ||
    request.headers.get("accept")?.includes("text/x-component") ||
    isAction;
  let returnValue: unknown;
  let temporaryReferences: unknown;

  if (isAction) {
    const actionId = request.headers.get("x-rsc-action");

    if (actionId) {
      const requestBody = request.headers.get("content-type")?.startsWith("multipart/form-data")
        ? await request.formData()
        : await request.text();

      temporaryReferences = createTemporaryReferenceSet();
      const args = await decodeReply(requestBody, { temporaryReferences });

      returnValue = await (await loadServerAction(actionId)).apply(null, args as unknown[]);
    }
  }

  const rscStream = renderToReadableStream(
    {
      returnValue,
      root: <AppDocument requestUrl={getHtmlRequestUrl(request)} />
    },
    { temporaryReferences }
  );

  if (isRscRequest) {
    return new Response(rscStream, {
      headers: {
        "content-type": "text/x-component;charset=utf-8",
        vary: "accept"
      }
    });
  }

  const ssrEntry = await import.meta.viteRsc.import<typeof import("./entry.ssr.tsx")>(
    "./entry.ssr.tsx",
    { environment: "ssr" }
  );
  const htmlStream = await ssrEntry.handleSsr(rscStream);

  return new Response(htmlStream, {
    headers: {
      "content-type": "text/html;charset=utf-8",
      vary: "accept"
    }
  });
}

if (import.meta.hot) {
  import.meta.hot.accept();
}

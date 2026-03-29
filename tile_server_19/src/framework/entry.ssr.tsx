import { createFromReadableStream } from "@vitejs/plugin-rsc/ssr";
import React from "react";
import { renderToReadableStream } from "react-dom/server.edge";

interface SsrPayload {
  root: React.ReactNode;
}

export async function handleSsr(rscStream: ReadableStream<Uint8Array>) {
  const payload = createFromReadableStream(rscStream) as Promise<SsrPayload>;

  function SsrRoot() {
    return React.use(payload).root;
  }

  const bootstrapScriptContent = await import.meta.viteRsc.loadBootstrapScriptContent("index");

  return renderToReadableStream(<SsrRoot />, {
    bootstrapScriptContent
  });
}

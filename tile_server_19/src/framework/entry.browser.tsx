import {
  createFromFetch,
  createTemporaryReferenceSet,
  encodeReply,
  setServerCallback
} from "@vitejs/plugin-rsc/browser";
import "ace-builds/src-noconflict/ace";
import "ace-builds/esm-resolver";
import React from "react";
import { hydrateRoot } from "react-dom/client";

interface BrowserPayload {
  returnValue?: unknown;
  root: React.ReactNode;
}

function getRscUrl() {
  const url = new URL(window.location.href);

  url.pathname = `${url.pathname}.rsc`;
  return url.toString();
}

async function main() {
  const initialPayload = (await createFromFetch(fetch(getRscUrl()))) as BrowserPayload;
  let updatePayload: ((payload: BrowserPayload) => void) | null = null;

  setServerCallback(async (actionId, args) => {
    const temporaryReferences = createTemporaryReferenceSet();
    const payload = (await createFromFetch(
      fetch(window.location.href, {
        body: await encodeReply(args, { temporaryReferences }),
        headers: {
          "x-rsc-action": actionId
        },
        method: "POST"
      }),
      { temporaryReferences }
    )) as BrowserPayload;

    updatePayload?.(payload);
    return payload.returnValue;
  });

  function BrowserRoot() {
    const [payload, setPayload] = React.useState(initialPayload);

    React.useEffect(() => {
      updatePayload = (nextPayload) => {
        React.startTransition(() => {
          setPayload(nextPayload);
        });
      };

      return () => {
        updatePayload = null;
      };
    }, []);

    React.useEffect(() => {
      if (!import.meta.hot) {
        return;
      }

      const refresh = async () => {
        const nextPayload = (await createFromFetch(
          fetch(window.location.href)
        )) as BrowserPayload;

        updatePayload?.(nextPayload);
      };

      const onUpdate = () => {
        void refresh();
      };

      import.meta.hot.on("rsc:update", onUpdate);

      return () => {
        import.meta.hot?.off("rsc:update", onUpdate);
      };
    }, []);

    return payload.root;
  }

  hydrateRoot(
    document,
    <React.StrictMode>
      <BrowserRoot />
    </React.StrictMode>
  );
}

void main();

import React from "react";
import ReactDOM from "react-dom/client";
import { loadAuthToken } from "@/lib/auth-token-cache";
import { apiBaseUrlItem } from "@/lib/storage";
import App from "~popup/App.tsx";
import { initAuthClient } from "~popup/lib/auth-client";
import "~popup/style.css";

// Better Auth's bearer plugin needs a sync token accessor; seed the cache
// before mounting so the first useSession() call has a token to send.
const baseUrl = await apiBaseUrlItem.getValue();
initAuthClient(baseUrl);
await loadAuthToken();

// biome-ignore lint/style/noNonNullAssertion: Required for React
const root = document.getElementById("root")!;

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

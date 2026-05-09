import React from "react";
import ReactDOM from "react-dom/client";
import App from "~popup/App.tsx";
import "~popup/style.css";

// biome-ignore lint/style/noNonNullAssertion: Required for React
const root = document.getElementById("root")!;

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

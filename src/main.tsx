import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Spotify only accepts 127.0.0.1 (not "localhost") redirect URIs, and the
// login must start on the same origin it returns to.
if (window.location.hostname === "localhost") {
  window.location.replace(window.location.href.replace("//localhost", "//127.0.0.1"));
} else {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

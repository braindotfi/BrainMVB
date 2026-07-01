import { Buffer } from "buffer";
if (typeof globalThis.Buffer === "undefined") {
  (globalThis as any).Buffer = Buffer;
}

import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Dev guard: fail loudly if any mock rule reference no longer resolves.
if (import.meta.env.DEV) {
  import("./lib/ruleConsistencyCheck").then((m) => m.checkRuleReferences());
}

createRoot(document.getElementById("root")!).render(<App />);

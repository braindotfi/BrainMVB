import { Buffer } from "buffer";
if (typeof globalThis.Buffer === "undefined") {
  (globalThis as any).Buffer = Buffer;
}

import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Dev guards: assert mock data is internally consistent (never throws).
if (import.meta.env.DEV) {
  import("./lib/ruleConsistencyCheck").then((m) => {
    m.checkRuleReferences();
    m.checkSemanticAuditRecords();
  });
}

createRoot(document.getElementById("root")!).render(<App />);

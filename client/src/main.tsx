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
    // Resolution guards — every referenced id points at a real store entity.
    m.checkRuleReferences();
    m.checkVendorReferences();
    m.checkDocumentReferences();
    m.checkProposalReferences();
    // Coherence guards — resolved refs must also tell the truth.
    m.checkSemanticAuditRecords();
    m.checkReferenceCoherence();
    m.checkAnchorUiCoherence();
    m.checkAgentDomainCoherence();
  });
}

createRoot(document.getElementById("root")!).render(<App />);

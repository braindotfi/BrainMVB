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
    // ponytail: checkRuleReferences is neutralized (not called) — rulesStore no
    // longer seeds demo rules (mock-removal Phase D), so every rule-id ref in mock
    // audit/vendor data would now permanently false-positive as unresolved.
    // checkVendorReferences' rule-edge assertion is neutralized inline for the
    // same reason (see ruleConsistencyCheck.ts). Restore or delete this whole
    // file in Phase F when the mock data it validates is removed.
    m.checkVendorReferences();
    m.checkDocumentReferences();
    m.checkProposalReferences();
    // Coherence guards — resolved refs must also tell the truth.
    m.checkSemanticAuditRecords();
    m.checkReferenceCoherence();
    m.checkAnchorUiCoherence();
    m.checkAgentDomainCoherence();
    m.checkActorPayeeSegregation();
    m.checkMemberActorCoherence();
  });
}

createRoot(document.getElementById("root")!).render(<App />);

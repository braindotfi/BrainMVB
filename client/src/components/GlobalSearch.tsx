/**
 * Global search bar.
 *
 * One input over three things the operator already has somewhere on screen:
 * decisions, vendors, accounts. Every result is projected from a feed the app has
 * already read — no index, no service, no new endpoint — and every destination is
 * a route that already existed before this component did.
 *
 * Matching and ranking live in `lib/globalSearch.ts` so they are testable without
 * a DOM. What stays here is the part that must be seen to be judged: which of the
 * three sources answered, and how the bar admits it when one of them did not.
 *
 * On the dropdown NOT being cmdk: the mapping for this item said to reuse
 * `ui/command.tsx`, and that turned out to be the wrong call on contact. cmdk
 * drives its keyboard navigation from its own `CommandInput`, whose shadcn wrapper
 * hardcodes `border-b`, horizontal padding and a magnifier icon that fight this
 * design system — and this is an inline dropdown, not a command palette. Bending
 * it into shape needs a stack of `[&_[cmdk-input-wrapper]]:` overrides that are
 * harder to read than the forty lines of listbox below. The ARIA contract
 * (combobox + listbox + aria-activedescendant) is implemented directly instead.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useCurrency } from "@/lib/useCurrency";
import { useBrainProposals, agentKeyForProposalType } from "@/lib/brainProposals";
import { useBrainVendors } from "@/lib/brainVendors";
import { useFeed } from "@/lib/feed";
import { openVendorDetail } from "@/lib/openVendorDetail";
import { buildProposalHeaderCopy } from "@/lib/proposalCards";
import { AGENT_DISPLAY_NAME } from "@/components/AgentProposalModal";
import { ACCOUNT_KIND_LABEL, type BrainAccountsResponse } from "@/lib/brainAccounts";
import {
  accountResult,
  decisionResult,
  vendorResult,
  rankResults,
  KIND_LABEL,
  type SearchResult,
} from "@/lib/globalSearch";

const INPUT =
  "w-full min-w-0 bg-[#06070a] border border-solid border-[#1d2132] rounded-[10px] px-[12px] py-[9px] [font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[18px] text-[#a8b9f4] outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] placeholder:text-[#414965]";

export function GlobalSearch() {
  const [, navigate] = useLocation();
  const { formatText } = useCurrency();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  /* All three are reads the app already makes elsewhere, so this bar adds cache
     hits rather than requests. Each exposes its own failure separately — a bar
     that cannot say WHICH source is missing can only apologise vaguely. */
  const decisionsQ = useBrainProposals();
  const vendorsQ = useBrainVendors();
  const accountsFeed = useFeed(
    ["/api/brain/ledger/accounts"],
    (d: BrainAccountsResponse) => d.accounts,
  );

  const candidates = useMemo(() => {
    const out: SearchResult[] = [];
    for (const p of decisionsQ.proposals) {
      /* Same headline helper the Decisions rows use, so a record is called the
         same thing in the search list and on the card it opens. */
      const agentName = p.agent?.display_name || AGENT_DISPLAY_NAME[agentKeyForProposalType(p.type)];
      const copy = buildProposalHeaderCopy(p, agentName, formatText);
      out.push(
        decisionResult({ id: p.id, title: copy.title, detail: copy.text, extra: `${agentName} ${p.type}` }),
      );
    }
    for (const v of vendorsQ.vendors) {
      out.push(vendorResult({ id: v.id, name: v.name, category: v.category }));
    }
    if (accountsFeed.status === "ready") {
      for (const a of accountsFeed.rows) {
        out.push(
          accountResult({
            id: a.id,
            name: a.name,
            institution: a.institution,
            kindLabel: ACCOUNT_KIND_LABEL[a.account_type] ?? a.account_type,
          }),
        );
      }
    }
    return out;
  }, [decisionsQ.proposals, vendorsQ.vendors, accountsFeed.status, accountsFeed.rows, formatText]);

  const results = useMemo(() => rankResults(candidates, query), [candidates, query]);

  /* Which sources could not be asked. Naming them is the whole point: "no matches"
     while the vendor feed is down is not a statement about your vendors. */
  const down: string[] = [];
  if (decisionsQ.isError) down.push("decisions");
  if (vendorsQ.isError) down.push("vendors");
  if (accountsFeed.unavailable) down.push("accounts");
  const allDown = down.length === 3;
  const downLabel =
    down.length === 0
      ? ""
      : down.length === 1
        ? down[0]
        : `${down.slice(0, -1).join(", ")} and ${down[down.length - 1]}`;

  const searched = (["decisions", "vendors", "accounts"] as const).filter((s) => !down.includes(s));
  const searchedLabel =
    searched.length === 0
      ? ""
      : searched.length === 1
        ? searched[0]
        : `${searched.slice(0, -1).join(", ")} and ${searched[searched.length - 1]}`;

  const hasQuery = query.trim() !== "";
  const showPanel = open && hasQuery;

  useEffect(() => setActive(0), [query]);

  /* Close on outside click. */
  useEffect(() => {
    if (!showPanel) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showPanel]);

  const go = (r: SearchResult) => {
    setOpen(false);
    setQuery("");
    /* Vendors go through the canonical opener rather than a hand-built URL, so
       this surface obeys the same resolve-by-id contract as every other vendor
       reference in the app. */
    if (r.kind === "vendor") {
      if (openVendorDetail(r.id, navigate)) return;
    }
    navigate(r.href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!showPanel || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[active];
      if (r) go(r);
    }
  };

  return (
    <div className="relative w-full shrink-0 mb-[12px]" ref={wrapRef} data-testid="global-search">
      <input
        type="text"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls="global-search-results"
        aria-activedescendant={showPanel && results[active] ? `gs-${results[active].key}` : undefined}
        aria-autocomplete="list"
        aria-label="Search decisions, vendors and accounts"
        className={INPUT}
        placeholder="Search decisions, vendors, accounts…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        data-testid="input-global-search"
      />

      {showPanel && (
        <div
          id="global-search-results"
          role="listbox"
          /* Anchored to the input, not the viewport: the centre column of the
             three-panel shell is narrow, and a viewport-width dropdown would
             overhang the assistant panel. */
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 overflow-hidden rounded-[10px] border border-solid border-[#1d2132] bg-[#11141b] shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
        >
          {allDown ? (
            <p
              className="px-[14px] py-[10px] [font-family:'Gilroy',sans-serif] font-medium text-[13px] text-[#ff9400]"
              data-testid="text-search-unavailable"
            >
              Search is unavailable — decisions, vendors and accounts could not be
              loaded. This is not a result of "nothing found".
            </p>
          ) : (
            <>
              {results.length === 0 && (
                <p
                  className="px-[14px] py-[10px] [font-family:'Gilroy',sans-serif] font-medium text-[13px] text-[#6c779d]"
                  data-testid="text-search-no-matches"
                >
                  No matches in {searchedLabel}.
                </p>
              )}

              {results.map((r, i) => (
                <div
                  key={r.key}
                  id={`gs-${r.key}`}
                  role="option"
                  aria-selected={i === active}
                  tabIndex={-1}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(r)}
                  className="flex cursor-pointer items-center justify-between gap-[10px] border-b border-solid border-[#1d2132] px-[14px] py-[10px] last:border-b-0"
                  style={{ background: i === active ? "#151926" : "transparent" }}
                  data-testid={`search-result-${r.kind}`}
                >
                  <span className="flex min-w-px flex-1 flex-col">
                    <span className="truncate [font-family:'Gilroy',sans-serif] font-semibold text-[13px] text-[#a8b9f4]">
                      {r.label}
                    </span>
                    {r.detail && (
                      <span className="truncate [font-family:'Gilroy',sans-serif] font-medium text-[12px] text-[#6c779d]">
                        {r.detail}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 rounded-[6px] bg-[#222737] px-[6px] py-[2px] [font-family:'Gilroy',sans-serif] font-semibold text-[11px] text-[#6c779d]">
                    {KIND_LABEL[r.kind]}
                  </span>
                </div>
              ))}

              {/* A partial answer that looks whole is the failure mode here: the
                  list renders, so nothing on screen suggests a source is absent. */}
              {down.length > 0 && (
                <p
                  className="border-t border-solid border-[#1d2132] px-[14px] py-[8px] [font-family:'Gilroy',sans-serif] font-medium text-[12px] text-[#ff9400]"
                  data-testid="text-search-partial"
                >
                  {downLabel} could not be searched, so matches there are missing.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

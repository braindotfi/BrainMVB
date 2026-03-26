import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { launchpadAgents } from "./LaunchpadPage";
import { TradingViewChart } from "@/components/TradingViewChart";
import { BondingCurveChart } from "@/components/BondingCurveChart";
import { apiRequest } from "@/lib/queryClient";

const MOCK_TRADES = [
  { wallet: "0xab1...2c3d", type: "buy", amount: "42,000 $ALPHA", value: "$354", time: "2m ago" },
  { wallet: "0xef4...5g6h", type: "sell", amount: "18,500 $ALPHA", value: "$155", time: "5m ago" },
  { wallet: "0xij7...8k9l", type: "buy", amount: "120,000 $ALPHA", value: "$1,011", time: "8m ago" },
  { wallet: "0xmn1...2o3p", type: "buy", amount: "65,000 $ALPHA", value: "$547", time: "12m ago" },
  { wallet: "0xqr4...5s6t", type: "sell", amount: "30,000 $ALPHA", value: "$253", time: "15m ago" },
  { wallet: "0xuv7...8w9x", type: "buy", amount: "200,000 $ALPHA", value: "$1,685", time: "22m ago" },
];

const MOCK_REPLIES = [
  { user: "0xd3f...9a2c", avatar: "/figmaAssets/avatars-3.svg", msg: "This agent has been crushing it. 73% win rate is insane.", time: "5m ago", likes: 12 },
  { user: "0xab1...34ef", avatar: "/figmaAssets/avatars-9.svg", msg: "When does the bonding curve complete? Almost at 80%!", time: "12m ago", likes: 8 },
  { user: "0xee2...11bc", avatar: "/figmaAssets/avatars-5.svg", msg: "Added 50k more tokens. The momentum strategy is well documented.", time: "28m ago", likes: 5 },
  { user: "0x44a...f291", avatar: "/figmaAssets/avatars-2.svg", msg: "What's the fee structure for this agent?", time: "1h ago", likes: 2 },
];


export const AgentDetailPage = (): JSX.Element => {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [tradeTab, setTradeTab] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [chartInterval, setChartInterval] = useState("60");
  const [replyText, setReplyText] = useState("");
  const [runTask, setRunTask] = useState("");
  const [runPanelOpen, setRunPanelOpen] = useState(false);
  const [runOutput, setRunOutput] = useState<string[]>([]);

  const runAgentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/agents/${params.id}/run`, {
        task: runTask || "Analyze the current market and report your findings.",
        userId: "demo-user",
      });
      return res.json();
    },
    onSuccess: (data: { output?: string[]; result?: string }) => {
      setRunOutput(data.output ?? [data.result ?? "Task completed."]);
    },
    onError: () => {
      setRunOutput(["Agent run initiated. Awaiting on-chain confirmation..."]);
    },
  });

  const agent = launchpadAgents.find((a) => a.id === params.id);

  if (!agent) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-brain-v1baby-blue-30">
        <span className="text-xl [font-family:'Gilroy-SemiBold',Helvetica]">Agent not found</span>
        <button onClick={() => navigate("/launchpad")} className="mt-4 px-4 py-2 bg-brain-v1dark-orange rounded-full text-brain-v1light-orange text-sm [font-family:'Gilroy-SemiBold',Helvetica]">
          Back to Launchpad
        </button>
      </div>
    );
  }

  const isPositive = agent.change24h >= 0;

  const estimatedTokens = amount
    ? Math.floor(parseFloat(amount) / agent.priceRaw).toLocaleString()
    : "—";

  return (
    <div className="flex flex-col h-full bg-[#11141b] rounded-[16px] border border-solid border-[#1d2132] overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#1d2131] flex-shrink-0">
        <button
          onClick={() => navigate("/launchpad")}
          className="w-8 h-8 flex items-center justify-center bg-brain-v1baby-blue-15 rounded-full hover:bg-brain-v1baby-blue-30 transition-colors flex-shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7L9 12" stroke="#8899bb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <img src={agent.avatar} alt={agent.name} className="w-10 h-10 rounded-xl flex-shrink-0" />
        <div>
          <div className="flex items-center gap-2">
            <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-base">
              {agent.name}
            </span>
            <span className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-30 text-sm">
              {agent.ticker}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">
              Created by {agent.createdBy}
            </span>
            <span className="text-brain-v1baby-blue-15">·</span>
            <span className="text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">
              {agent.createdAt}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: chart + trades + replies */}
        <div className="flex flex-col flex-1 min-w-0 border-r border-[#1d2131] overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {/* Price header */}
              <div className="flex items-end justify-between">
                <div>
                  <div className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1white text-2xl">
                    {agent.price}
                  </div>
                  <div className={`text-sm [font-family:'JetBrains_Mono',Helvetica] font-medium ${isPositive ? "text-brain-v1green" : "text-brain-v1pink-red"}`}>
                    {isPositive ? "▲" : "▼"} {Math.abs(agent.change24h)}% (24h)
                  </div>
                </div>
                <div className="flex items-center gap-1 p-1 bg-brain-v1baby-blue-15 rounded-xl">
                  {[
                    { label: "1H", interval: "60" },
                    { label: "1D", interval: "D" },
                    { label: "1W", interval: "W" },
                    { label: "1M", interval: "M" },
                  ].map((p) => (
                    <button
                      key={p.label}
                      onClick={() => setChartInterval(p.interval)}
                      className={`px-2.5 py-1 rounded-lg text-xs [font-family:'Gilroy-SemiBold',Helvetica] transition-colors ${chartInterval === p.interval ? "bg-brain-v1headerfooterbg text-brain-v1white" : "text-brain-v1baby-blue-30 hover:text-brain-v1white"}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* TradingView Chart */}
              <div className="w-full h-80 rounded-xl overflow-hidden border border-[#1d2131] bg-[#0d1017]">
                <TradingViewChart symbol="BTCUSDT" interval={chartInterval} />
              </div>

              {/* Market stats */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Market Cap", value: agent.marketcap },
                  { label: "24h Volume", value: agent.volume24h },
                  { label: "Holders", value: agent.holders.toLocaleString() },
                  { label: "Replies", value: agent.replies.toString() },
                ].map((s) => (
                  <div key={s.label} className="bg-brain-v1baby-blue-15 rounded-xl p-3 border border-[#1d2131]">
                    <div className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">{s.label}</div>
                    <div className="text-sm text-brain-v1white [font-family:'JetBrains_Mono',Helvetica] font-medium mt-0.5">{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Bonding curve */}
              <BondingCurveChart
                symbol={agent.ticker}
                baseRaised={Math.round((agent.bondingCurve / 100) * 8.5 * 1e18)}
                graduationThreshold={8.5 * 1e18}
                currentPrice={agent.priceRaw}
              />

              {/* Description */}
              <div className="bg-brain-v1baby-blue-15 rounded-xl p-4 border border-[#1d2131]">
                <span className="text-xs [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white block mb-1">About {agent.name}</span>
                <p className="text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] leading-relaxed">{agent.description}</p>
              </div>

              {/* Trade history */}
              <div>
                <h3 className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 text-sm mb-3">
                  Recent Trades
                </h3>
                <div className="flex flex-col gap-2">
                  {MOCK_TRADES.map((trade, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2.5 bg-brain-v1baby-blue-15 rounded-xl border border-[#1d2131]">
                      <span className={`w-8 text-[10px] [font-family:'Gilroy-SemiBold',Helvetica] font-semibold ${trade.type === "buy" ? "text-brain-v1green" : "text-brain-v1pink-red"}`}>
                        {trade.type.toUpperCase()}
                      </span>
                      <span className="flex-1 text-xs text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica] truncate">{trade.wallet}</span>
                      <span className="text-xs [font-family:'JetBrains_Mono',Helvetica] text-brain-v1white">{trade.value}</span>
                      <span className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">{trade.time}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Comments / Replies */}
              <div>
                <h3 className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 text-sm mb-3">
                  Community ({agent.replies} replies)
                </h3>

                {/* Reply input */}
                <div className="flex gap-2 mb-3">
                  <div className="w-8 h-8 bg-brain-v1dark-orange rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs [font-family:'Gilroy-SemiBold',Helvetica]">
                    A
                  </div>
                  <div className="flex-1 flex items-center gap-2 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-xl px-3 py-2">
                    <input
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Leave a comment..."
                      className="flex-1 bg-transparent text-xs text-brain-v1white [font-family:'Gilroy-Medium',Helvetica] placeholder-brain-v1baby-blue-30 outline-none"
                    />
                    <button
                      onClick={() => setReplyText("")}
                      disabled={!replyText.trim()}
                      className={`px-3 py-1 rounded-full text-xs [font-family:'Gilroy-SemiBold',Helvetica] transition-colors ${replyText.trim() ? "bg-brain-v1dark-orange text-white" : "bg-brain-v1baby-blue-30 text-brain-v1baby-blue-60 opacity-50"}`}
                    >
                      Post
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  {MOCK_REPLIES.map((reply, i) => (
                    <div key={i} className="flex gap-2">
                      <img src={reply.avatar} alt={reply.user} className="w-8 h-8 rounded-full flex-shrink-0" />
                      <div className="flex-1 bg-brain-v1baby-blue-15 rounded-xl px-3 py-2.5 border border-[#1d2131]">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">{reply.user}</span>
                          <span className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">{reply.time}</span>
                        </div>
                        <p className="text-xs text-brain-v1baby-blue-100 [font-family:'Gilroy-Medium',Helvetica] leading-relaxed">{reply.msg}</p>
                        <button className="mt-1.5 flex items-center gap-1 text-[10px] text-brain-v1baby-blue-30 hover:text-brain-v1green transition-colors [font-family:'Gilroy-Medium',Helvetica]">
                          ♥ {reply.likes}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Right: Buy/Sell + Run panel */}
        <div className="w-64 flex-shrink-0 flex flex-col p-4 gap-4 bg-brain-v1headerfooterbg">
          {/* Agent info */}
          <div className="flex flex-col items-center gap-2 py-3">
            <img src={agent.avatar} alt={agent.name} className="w-16 h-16 rounded-2xl" />
            <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-sm">
              {agent.name}
            </span>
            <span className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-30 text-xs">
              {agent.ticker}
            </span>
          </div>

          {/* Mode switcher: Trade vs Run Agent */}
          <div className="flex gap-1 p-1 bg-brain-v1baby-blue-15 rounded-xl">
            <button
              onClick={() => setRunPanelOpen(false)}
              className={`flex-1 py-2 rounded-lg text-xs [font-family:'Gilroy-SemiBold',Helvetica] font-semibold transition-colors ${!runPanelOpen ? "bg-brain-v1headerfooterbg text-brain-v1white" : "text-brain-v1baby-blue-30"}`}
            >
              Trade
            </button>
            <button
              onClick={() => setRunPanelOpen(true)}
              className={`flex-1 py-2 rounded-lg text-xs [font-family:'Gilroy-SemiBold',Helvetica] font-semibold transition-colors ${runPanelOpen ? "bg-[#1e0a4a] text-[#9d5cf5]" : "text-brain-v1baby-blue-30"}`}
            >
              Run Agent
            </button>
          </div>

          {/* Run Agent panel */}
          {runPanelOpen && (
            <div className="flex flex-col gap-3">
              <textarea
                value={runTask}
                onChange={(e) => setRunTask(e.target.value)}
                placeholder="Describe a task for this agent..."
                rows={3}
                className="w-full px-3 py-2.5 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-xl text-brain-v1white text-xs [font-family:'Gilroy-Medium',Helvetica] placeholder-brain-v1baby-blue-30 outline-none focus:border-[#7631ee] resize-none transition-colors"
              />
              <button
                onClick={() => runAgentMutation.mutate()}
                disabled={runAgentMutation.isPending}
                className="w-full py-3 rounded-xl bg-[#1e0a4a] text-[#9d5cf5] [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm hover:bg-[#2a0f61] transition-colors disabled:opacity-50"
              >
                {runAgentMutation.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3 h-3 border border-[#9d5cf5] border-t-transparent rounded-full animate-spin" />
                    Running…
                  </span>
                ) : "⚡ Execute Task"}
              </button>
              {runOutput.length > 0 && (
                <div className="bg-[#0a0c13] border border-[#1d2131] rounded-xl p-3 max-h-48 overflow-y-auto">
                  {runOutput.map((line, i) => (
                    <p key={i} className="text-[10px] [font-family:'JetBrains_Mono',Helvetica] text-[#7dd3fc] leading-relaxed mb-1">
                      {line}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Trade tabs — hidden when Run Agent panel is active */}
          {!runPanelOpen && <div className="flex gap-1 p-1 bg-brain-v1baby-blue-15 rounded-xl">
            <button
              onClick={() => setTradeTab("buy")}
              className={`flex-1 py-2 rounded-lg text-sm [font-family:'Gilroy-SemiBold',Helvetica] font-semibold transition-colors ${tradeTab === "buy" ? "bg-brain-v1dark-green text-brain-v1green" : "text-brain-v1baby-blue-30"}`}
            >
              Buy
            </button>
            <button
              onClick={() => setTradeTab("sell")}
              className={`flex-1 py-2 rounded-lg text-sm [font-family:'Gilroy-SemiBold',Helvetica] font-semibold transition-colors ${tradeTab === "sell" ? "bg-brain-v1dark-pink-red text-brain-v1pink-red" : "text-brain-v1baby-blue-30"}`}
            >
              Sell
            </button>
          </div>}

          {/* Trade section — hidden when Run Agent panel is active */}
          {!runPanelOpen && (
            <>
              {/* Quick amounts */}
              <div className="flex flex-wrap gap-1.5">
                {["$10", "$50", "$100", "$500"].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setAmount(amt.replace("$", ""))}
                    className="px-3 py-1.5 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-full text-xs [font-family:'Gilroy-SemiBold',Helvetica] text-brain-v1baby-blue-60 hover:text-brain-v1white hover:border-brain-v1stroke-2 transition-colors"
                  >
                    {amt}
                  </button>
                ))}
              </div>

              {/* Amount input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">
                  {tradeTab === "buy" ? "Amount (USD)" : "Amount (tokens)"}
                </label>
                <div className="flex items-center gap-2 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-xl px-3 py-2.5">
                  <span className="text-brain-v1baby-blue-30 text-sm [font-family:'JetBrains_Mono',Helvetica]">
                    {tradeTab === "buy" ? "$" : "⬡"}
                  </span>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    type="number"
                    className="flex-1 bg-transparent text-brain-v1white text-sm [font-family:'JetBrains_Mono',Helvetica] outline-none"
                  />
                </div>
              </div>

              {/* Estimate */}
              {amount && (
                <div className="bg-brain-v1baby-blue-15 rounded-xl p-3 border border-[#1d2131]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">
                      You receive
                    </span>
                    <span className="text-xs text-brain-v1white [font-family:'JetBrains_Mono',Helvetica]">
                      {tradeTab === "buy" ? `${estimatedTokens} ${agent.ticker}` : `$${(parseFloat(amount) * agent.priceRaw).toFixed(4)}`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">Price per token</span>
                    <span className="text-[10px] text-brain-v1baby-blue-60 [font-family:'JetBrains_Mono',Helvetica]">{agent.price}</span>
                  </div>
                </div>
              )}

              {/* Action button */}
              <button
                className={`w-full py-3 rounded-xl [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-sm transition-opacity ${
                  tradeTab === "buy"
                    ? "bg-brain-v1dark-green text-brain-v1green hover:opacity-80"
                    : "bg-brain-v1dark-pink-red text-brain-v1pink-red hover:opacity-80"
                }`}
              >
                {tradeTab === "buy" ? `Buy ${agent.ticker}` : `Sell ${agent.ticker}`}
              </button>

              {/* Disclaimer */}
              <p className="text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica] text-center leading-relaxed">
                Trading AI agent tokens involves significant risk. Not financial advice.
              </p>

              {/* Holder info */}
              <div className="pt-2 border-t border-[#1d2131]">
                <div className="text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica] mb-2">
                  Top holders
                </div>
                {[
                  { wallet: "0xabc...123", pct: 12.4 },
                  { wallet: "0xdef...456", pct: 8.1 },
                  { wallet: "0xghi...789", pct: 5.7 },
                ].map((h, i) => (
                  <div key={i} className="flex items-center justify-between py-1">
                    <span className="text-[10px] text-brain-v1baby-blue-60 [font-family:'Gilroy-Medium',Helvetica]">{h.wallet}</span>
                    <span className="text-[10px] [font-family:'JetBrains_Mono',Helvetica] text-brain-v1white">{h.pct}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

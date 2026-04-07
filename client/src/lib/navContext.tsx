import { createContext, useContext } from "react";

export interface AgentPrefillData {
  type:           string;
  name:           string;
  description:    string;
  avatar:         string;
  capital:        string;
  capitalAsset:   string;
  riskLevel:      string;
  maxDrawdown:    string;
  stopLoss:       string;
  executionMode:  string;
  allowedAssets:  string[];
  maxAlloc:       string;
  maxPosition:    string;
  maxTrades:      string;
  maxLTV?:             string;
  liquidationThreshold?: string;
  targetAPY?:     string;
  minAPY?:        string;
  rebalanceFreq?: string;
  yieldProtocols?: string[];
  maxSinglePayment?:        string;
  monthlyBudgetCap?:        string;
  autoApprovalThreshold?:   string;
}

interface NavContextType {
  navCollapsed: boolean;
  toggleNav: () => void;
  openCreateAgentAtStep: (step: number, prefill?: AgentPrefillData, agentId?: string) => void;
}

export const NavContext = createContext<NavContextType>({
  navCollapsed: false,
  toggleNav: () => {},
  openCreateAgentAtStep: () => {},
});

export const useNav = () => useContext(NavContext);

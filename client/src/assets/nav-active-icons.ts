import securityVector from "@assets/figma_icons/nav/security_vector.svg";
import securityStroke from "@assets/figma_icons/nav/security_stroke.svg";
import notificationsUnion from "@assets/figma_icons/nav/notifications_union.svg";
import paymentsSubtract from "@assets/figma_icons/nav/payments_subtract.svg";
import paymentsArrow from "@assets/figma_icons/nav/payments_arrow.svg";
import agentsVector from "@assets/figma_icons/nav/agents_vector.svg";
import agentsUnion from "@assets/figma_icons/nav/agents_union.svg";
import legalVector from "@assets/figma_icons/nav/legal_vector.svg";
import legalPencil from "@assets/figma_icons/nav/legal_pencil.svg";
import accountUnionRight from "@assets/figma_icons/nav/account_union_right.svg";
import accountUnionLeft from "@assets/figma_icons/nav/account_union_left.svg";

export const NAV_ACTIVE = {
  security_vector: securityVector,
  security_stroke: securityStroke,
  notifications_union: notificationsUnion,
  payments_subtract: paymentsSubtract,
  payments_arrow: paymentsArrow,
  agents_vector: agentsVector,
  agents_union: agentsUnion,
  legal_vector: legalVector,
  legal_pencil: legalPencil,
  account_union_right: accountUnionRight,
  account_union_left: accountUnionLeft,
} as const;

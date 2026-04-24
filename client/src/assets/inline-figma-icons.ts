// Local copies of all inline Figma SVGs that used to be linked from
// www.figma.com/api/mcp/asset/<uuid>. Those URLs are short-lived and
// expire, breaking pages in production. All assets are now bundled
// from attached_assets/figma_icons/inline/ via the @assets alias so
// the build is fully self-contained.

import rulesDivider          from "@assets/figma_icons/inline/rules_divider.svg";

import walletBadgeBg         from "@assets/figma_icons/inline/wallet_badge_bg.svg";
import walletBadgeIcon       from "@assets/figma_icons/inline/wallet_badge_icon.svg";
import txInactiveVec1        from "@assets/figma_icons/inline/tx_inactive_vec1.svg";
import txInactiveVec2        from "@assets/figma_icons/inline/tx_inactive_vec2.svg";
import txActiveUnion         from "@assets/figma_icons/inline/tx_active_union.svg";
import checkEllipse          from "@assets/figma_icons/inline/check_ellipse.svg";
import checkMark             from "@assets/figma_icons/inline/check_mark.svg";
import miscA                 from "@assets/figma_icons/inline/misc_a.svg";
import bankPopupClosedA      from "@assets/figma_icons/inline/bank_popup_closed_a.svg";
import bankPopupClosedB      from "@assets/figma_icons/inline/bank_popup_closed_b.svg";
import txAccountBg           from "@assets/figma_icons/inline/tx_account_bg.svg";
import txAccountGlyphA       from "@assets/figma_icons/inline/tx_account_glyph_a.svg";
import txAccountGlyphB       from "@assets/figma_icons/inline/tx_account_glyph_b.svg";
import txAccountGlyphC       from "@assets/figma_icons/inline/tx_account_glyph_c.svg";
import miscB                 from "@assets/figma_icons/inline/misc_b.svg";

import invoiceBg             from "@assets/figma_icons/inline/invoice_bg.svg";
import invoiceIcon           from "@assets/figma_icons/inline/invoice_icon.svg";

import homeDot               from "@assets/figma_icons/inline/home_dot.svg";
import homeDivider           from "@assets/figma_icons/inline/home_divider.svg";
import homeCheckEllipse      from "@assets/figma_icons/inline/home_check_ellipse.svg";
import homeCheckVector       from "@assets/figma_icons/inline/home_check_vector.svg";
import homeInfoEllipse       from "@assets/figma_icons/inline/home_info_ellipse.svg";
import homeInfoVec1          from "@assets/figma_icons/inline/home_info_vec1.svg";
import homeInfoVec2          from "@assets/figma_icons/inline/home_info_vec2.svg";

export const INLINE_FIGMA = {
  rulesDivider,
  walletBadgeBg,
  walletBadgeIcon,
  txInactiveVec1,
  txInactiveVec2,
  txActiveUnion,
  checkEllipse,
  checkMark,
  miscA,
  // The "popup-open" state variants for the bank icon expired upstream.
  // We reuse the closed-state assets for both states; visually the popup
  // still works correctly — only the bg/glyph color tweak is dropped.
  bankPopupClosedA,
  bankPopupOpenA: bankPopupClosedA,
  bankPopupClosedB,
  bankPopupOpenB: bankPopupClosedB,
  txAccountBg,
  txAccountGlyphA,
  txAccountGlyphB,
  txAccountGlyphC,
  miscB,
  invoiceBg,
  invoiceIcon,
  homeDot,
  homeDivider,
  homeCheckEllipse,
  homeCheckVector,
  homeInfoEllipse,
  homeInfoVec1,
  homeInfoVec2,
} as const;

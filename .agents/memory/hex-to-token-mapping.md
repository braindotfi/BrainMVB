---
    name: Mapping raw hex to design tokens
    description: Why nearest-token-by-ΔE is unsafe on its own — paired values and contrast floors — and what to check before proposing a collapse.
    ---

    Nearest-token distance (CIE L*a*b* ΔE) is the right way to *find* candidate collapses and a
    bad way to *decide* them. Two failure modes, both hit in practice:

    **Paired values collapse onto the same token.** A `bg-[#a] hover:bg-[#b]` pair can have both
    halves nearest to the same token. Taking each independently destroys the hover delta — and
    if that token is also the element's `border` colour, it erases the outline too. Resolve a
    base and its hover *together*, and check what else on the element already uses the candidate.

    **A text colour's contrast is part of its identity.** Accent and fill tokens are routinely too
    dark to serve as body text on the same surface. Before collapsing anything used as `text-*`,
    compute WCAG contrast against the surface it actually sits on, before and after. A collapse
    that crosses 4.5:1 downward is a regression, not a dedup — that role needs its own token.

    **Why:** a token-adoption pass that mapped purely by nearest ΔE would have flattened an auth
    button's background into its own border and pushed error text from 5.97:1 to 3.37:1, both
    silently and both looking like tidy-ups in the diff.

    **How to apply:** rank by ΔE to shortlist, then read the full class string for each candidate
    (not just the value), group base/hover/border that appear on the same element, and
    contrast-check every `text-*`. Report ΔE and both contrast ratios so a reviewer can see the cost.

    Values deliberately outside the palette — third-party brand colours, or a sub-palette modelling
    something physical like printed paper — should be *named* in their own namespace rather than
    whitelisted, so a "no raw hex" rule can stay fail-on-any with zero exceptions.
    
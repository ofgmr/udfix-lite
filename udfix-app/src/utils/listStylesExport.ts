/**
 * Returns the CSS string for list styles to be embedded in export HTML.
 * This mirrors the rules in src/styles/lists.css but as a plain string
 * so it can be injected into print windows and PDF exports.
 */
export function getListStylesCSS(): string {
    return `
/* ── Ordered List Base Reset ── */
ol {
    --start: 0;
    --list-marker-width: 2.125em;
    list-style-type: none;
    padding-left: 0;
    margin: 0.25em 0;
}
ol li {
    position: relative;
    display: block;
    text-indent: 0;
    margin-left: 2.75em;
    padding-left: 0;
    list-style: none;
}
ol li::before {
    position: absolute;
    right: 100%;
    width: var(--list-marker-width);
    min-width: var(--list-marker-width);
    margin-right: 0.45em;
    text-align: right;
    font-family: var(--marker-font-family, inherit);
    font-weight: var(--marker-weight, 500);
    font-style: var(--marker-style, normal);
    text-decoration: var(--marker-text-decoration, none);
    color: inherit;
    line-height: 1.35;
    top: 0.12em;
    white-space: nowrap;
}
ol li > p,
ol li > div,
ol li > h1,
ol li > h2,
ol li > h3,
ol li > h4,
ol li > h5,
ol li > h6 {
    display: block;
    min-width: 0;
    margin: 0;
    text-indent: 0;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
}
ol li > ol {
    width: 100%;
    margin-top: 0.1em;
}

/* ── 1. DEFAULT STYLE (5 Levels) ── */
ol[data-list-type="default"] { counter-reset: d1 var(--start); }
ol[data-list-type="default"]>li { counter-increment: d1; }
ol[data-list-type="default"]>li::before { content: counter(d1, decimal) "."; }

ol[data-list-type="default"] ol { counter-reset: d2 var(--start); }
ol[data-list-type="default"] ol>li { counter-increment: d2; }
ol[data-list-type="default"] ol>li::before { content: counter(d2, lower-alpha) "."; }

ol[data-list-type="default"] ol ol { counter-reset: d3 var(--start); }
ol[data-list-type="default"] ol ol>li { counter-increment: d3; }
ol[data-list-type="default"] ol ol>li::before { content: counter(d3, lower-roman) "."; }

ol[data-list-type="default"] ol ol ol { counter-reset: d4 var(--start); }
ol[data-list-type="default"] ol ol ol>li { counter-increment: d4; }
ol[data-list-type="default"] ol ol ol>li::before { content: "(" counter(d4, decimal) ")"; }

ol[data-list-type="default"] ol ol ol ol { counter-reset: d5 var(--start); }
ol[data-list-type="default"] ol ol ol ol>li { counter-increment: d5; }
ol[data-list-type="default"] ol ol ol ol>li::before { content: "(" counter(d5, lower-alpha) ")"; }

/* ── 2. ROMAN STYLE (5 Levels) ── */
ol[data-list-type="roman"] { counter-reset: r1 var(--start); }
ol[data-list-type="roman"]>li { counter-increment: r1; }
ol[data-list-type="roman"]>li::before { content: counter(r1, upper-roman) "."; font-weight: var(--marker-weight, 700); }

ol[data-list-type="roman"] ol { counter-reset: r2 var(--start); }
ol[data-list-type="roman"] ol>li { counter-increment: r2; }
ol[data-list-type="roman"] ol>li::before { content: counter(r2, upper-alpha) "."; font-weight: var(--marker-weight, 700); }

ol[data-list-type="roman"] ol ol { counter-reset: r3 var(--start); }
ol[data-list-type="roman"] ol ol>li { counter-increment: r3; }
ol[data-list-type="roman"] ol ol>li::before { content: counter(r3, decimal) "."; }

ol[data-list-type="roman"] ol ol ol { counter-reset: r4 var(--start); }
ol[data-list-type="roman"] ol ol ol>li { counter-increment: r4; }
ol[data-list-type="roman"] ol ol ol>li::before { content: counter(r4, lower-alpha) "."; }

ol[data-list-type="roman"] ol ol ol ol { counter-reset: r5 var(--start); }
ol[data-list-type="roman"] ol ol ol ol>li { counter-increment: r5; }
ol[data-list-type="roman"] ol ol ol ol>li::before { content: counter(r5, lower-roman) "."; }

/* ── 3. PAREN STYLE (5 Levels) ── */
ol[data-list-type="paren"] { counter-reset: p1 var(--start); }
ol[data-list-type="paren"]>li { counter-increment: p1; }
ol[data-list-type="paren"]>li::before { content: counter(p1, decimal) ")"; }

ol[data-list-type="paren"] ol { counter-reset: p2 var(--start); }
ol[data-list-type="paren"] ol>li { counter-increment: p2; }
ol[data-list-type="paren"] ol>li::before { content: counter(p2, lower-alpha) ")"; }

ol[data-list-type="paren"] ol ol { counter-reset: p3 var(--start); }
ol[data-list-type="paren"] ol ol>li { counter-increment: p3; }
ol[data-list-type="paren"] ol ol>li::before { content: counter(p3, lower-roman) ")"; }

ol[data-list-type="paren"] ol ol ol { counter-reset: p4 var(--start); }
ol[data-list-type="paren"] ol ol ol>li { counter-increment: p4; }
ol[data-list-type="paren"] ol ol ol>li::before { content: "[" counter(p4, decimal) "]"; }

ol[data-list-type="paren"] ol ol ol ol { counter-reset: p5 var(--start); }
ol[data-list-type="paren"] ol ol ol ol>li { counter-increment: p5; }
ol[data-list-type="paren"] ol ol ol ol>li::before { content: "[" counter(p5, lower-alpha) "]"; }

/* ── 4. NEW OUTLINE STYLE: A. → 1. → a. → i. → aa. ── */
ol[data-list-type="outline"] { counter-reset: out1 var(--start); }
ol[data-list-type="outline"]>li { counter-increment: out1; }
ol[data-list-type="outline"]>li::before { content: counter(out1, upper-alpha) "."; }

ol[data-list-type="outline"] ol { counter-reset: out2 var(--start); }
ol[data-list-type="outline"] ol>li { counter-increment: out2; }
ol[data-list-type="outline"] ol>li::before { content: counter(out2, decimal) "."; }

ol[data-list-type="outline"] ol ol { counter-reset: out3 var(--start); }
ol[data-list-type="outline"] ol ol>li { counter-increment: out3; }
ol[data-list-type="outline"] ol ol>li::before { content: counter(out3, lower-alpha) "."; }

ol[data-list-type="outline"] ol ol ol { counter-reset: out4 var(--start); }
ol[data-list-type="outline"] ol ol ol>li { counter-increment: out4; }
ol[data-list-type="outline"] ol ol ol>li::before { content: counter(out4, lower-roman) "."; }

ol[data-list-type="outline"] ol ol ol ol { counter-reset: out5 var(--start); }
ol[data-list-type="outline"] ol ol ol ol>li { counter-increment: out5; }
ol[data-list-type="outline"] ol ol ol ol>li::before { content: counter(out5, lower-alpha) counter(out5, lower-alpha) "."; }

/* ── 5. LEGAL STYLE: 1. → 1.1. → 1.1.1. (hierarchical) ── */
ol[data-list-type="legal"] { counter-reset: legal-l1 var(--start); }
ol[data-list-type="legal"]>li { counter-increment: legal-l1; --list-marker-width: 2.2em; }
ol[data-list-type="legal"]>li::before { content: counter(legal-l1) "."; }

ol[data-list-type="legal"] ol { counter-reset: legal-l2 var(--start); }
ol[data-list-type="legal"] ol>li { counter-increment: legal-l2; --list-marker-width: 2.8em; }
ol[data-list-type="legal"] ol>li::before { content: counter(legal-l1) "." counter(legal-l2) "."; }

ol[data-list-type="legal"] ol ol { counter-reset: legal-l3 var(--start); }
ol[data-list-type="legal"] ol ol>li { counter-increment: legal-l3; --list-marker-width: 3.6em; }
ol[data-list-type="legal"] ol ol>li::before { content: counter(legal-l1) "." counter(legal-l2) "." counter(legal-l3) "."; }

ol[data-list-type="legal"] ol ol ol { counter-reset: legal-l4 var(--start); }
ol[data-list-type="legal"] ol ol ol>li { counter-increment: legal-l4; --list-marker-width: 4.4em; }
ol[data-list-type="legal"] ol ol ol>li::before { content: counter(legal-l1) "." counter(legal-l2) "." counter(legal-l3) "." counter(legal-l4) "."; }

ol[data-list-type="legal"] ol ol ol ol { counter-reset: legal-l5 var(--start); }
ol[data-list-type="legal"] ol ol ol ol>li { counter-increment: legal-l5; --list-marker-width: 5.2em; }
ol[data-list-type="legal"] ol ol ol ol>li::before { content: counter(legal-l1) "." counter(legal-l2) "." counter(legal-l3) "." counter(legal-l4) "." counter(legal-l5) "."; }
`;
}

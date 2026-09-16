/**
 * xml2js uses sax-js (not libxml). External entities are not expanded.
 * Keep xmlns off so document type / namespace tricks stay inert (audit F-19).
 */
export const XML2JS_SAFE_OPTIONS = {
    xmlns: false,
} as const;

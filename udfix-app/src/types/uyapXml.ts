/** Parsed xml2js shapes for legacy UYAP UDF templates (converter.ts). */
export type XmlAttrs = Record<string, string | undefined>;

export interface XmlTextSpan {
    $: XmlAttrs & { startOffset: string; length: string };
}

export interface XmlField {
    $: XmlAttrs & {
        fieldName?: string;
        fieldGroupName?: string;
        fieldType?: string;
        startOffset: string;
        length: string;
    };
}

export interface XmlOffsetNode {
    $: XmlAttrs & { startOffset: string; length: string };
}

export interface XmlImage {
    $: XmlAttrs & { imageData: string };
}

export interface XmlParagraph {
    $?: XmlAttrs & { GroupName?: string; RepeatingLabel?: string };
    content?: XmlTextSpan[];
    field?: XmlField[];
    tab?: XmlOffsetNode[];
    space?: XmlOffsetNode[];
    image?: XmlImage[];
}

export interface XmlCell {
    $?: XmlAttrs;
    paragraph?: XmlParagraph[];
    table?: XmlTable[];
}

export interface XmlRow {
    cell?: XmlCell[];
}

export interface XmlTable {
    $?: XmlAttrs;
    row?: XmlRow[];
}

export interface XmlElements {
    paragraph?: XmlParagraph[];
    table?: XmlTable[];
}

export interface XmlTemplate {
    content: [string];
    elements: [XmlElements];
    data?: [Record<string, unknown>];
}

export interface XmlParseResult {
    template: XmlTemplate;
}

export interface AttributeSearchRow {
    tag_key: string;
    tag_value: string;
    sort_order: number;
}

export function parseAttributesSearchBlob(
    attributesSearch: string | null | undefined,
): AttributeSearchRow[] {
    if (!attributesSearch) return [];
    return attributesSearch
        .split(' | ')
        .map((chunk, idx) => {
            const colon = chunk.indexOf(': ');
            if (colon <= 0) return null;
            const tag_key = chunk.slice(0, colon).trim();
            const tag_value = chunk.slice(colon + 2).trim();
            if (!tag_key || !tag_value) return null;
            return { tag_key, tag_value, sort_order: idx };
        })
        .filter((row): row is AttributeSearchRow => row !== null);
}

export function attributeValueFromSearchBlob(
    attributesSearch: string | null | undefined,
    tagKey: string,
): string {
    if (!attributesSearch) return '';
    for (const chunk of attributesSearch.split(' | ')) {
        const prefix = `${tagKey}: `;
        if (chunk.startsWith(prefix)) return chunk.slice(prefix.length).trim();
    }
    return '';
}

export const ICRA_LAWYER_ATTRIBUTE_KEYS = [
    { key: 'uyap_takipte_kesinlesen_miktar', label: 'Çıkış miktarı' },
    { key: 'uyap_yapilmis_tahsilat', label: 'Yapılmış tahsilat' },
    { key: 'uyap_yatan_para', label: 'Yatan para' },
    { key: 'uyap_bakiye_borc_miktari', label: 'Bakiye borç' },
    { key: 'uyap_vekalet_ucreti', label: 'Vekalet ücreti' },
] as const;

export const HIDDEN_MATTER_ATTRIBUTE_KEYS = new Set(['uyap_evrak_sayfa']);

export function isHiddenMatterAttribute(tagKey: string): boolean {
    return HIDDEN_MATTER_ATTRIBUTE_KEYS.has(tagKey);
}

export function visibleMatterAttributeRows<T extends { tag_key: string }>(rows: T[]): T[] {
    return rows.filter((row) => !isHiddenMatterAttribute(row.tag_key));
}

export function getIcraLawyerSummary(
    attributesSearch: string | null | undefined,
): Array<{ label: string; value: string }> {
    return ICRA_LAWYER_ATTRIBUTE_KEYS.map(({ key, label }) => ({
        label,
        value: attributeValueFromSearchBlob(attributesSearch, key),
    })).filter((row) => row.value.length > 0);
}

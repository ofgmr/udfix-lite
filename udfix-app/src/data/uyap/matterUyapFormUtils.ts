import type { Matter, MatterCategory, UyapDosyaTurLabel, UyapProcessRoleLabel, UyapYargiBirimiTablo } from '../../services/dataService';
import { UYAP_DOSYA_TURLERI } from './uyapDosyaTurleri';
import { UYAP_YARGI_BIRIMI_BY_TABLO } from './yargiBirimleri';
import { mergeMatterMetadataUyap, parseMatterUyapMetadata } from './matterUyapMetadata';
import { isMatterUyapClassificationVisible } from './matterUyapVisibility';

export interface MatterUyapFormValues {
    uyapDosyaTur: UyapDosyaTurLabel | '';
    yargiBirimTablo: UyapYargiBirimiTablo | '';
    davaKonuId: string;
    icraTakipTuru: string;
    icraTakipYolu: string;
    icraTakipMahiyet: string;
    icraTakipSekli: string;
}

export const EMPTY_MATTER_UYAP_FORM: MatterUyapFormValues = {
    uyapDosyaTur: '',
    yargiBirimTablo: '',
    davaKonuId: '__none__',
    icraTakipTuru: '__none__',
    icraTakipYolu: '__none__',
    icraTakipMahiyet: '__none__',
    icraTakipSekli: '__none__',
};

export function matterUyapFormFromMetadata(metadata?: string | null): MatterUyapFormValues {
    const uyap = parseMatterUyapMetadata(metadata);
    const rawDosyaTur = String(uyap.dosyaTur ?? '');
    const normalizedDosyaTur =
        rawDosyaTur === 'İdare Dava Dosyası' ? 'İdari Dava Dosyası' : uyap.dosyaTur;
    return {
        uyapDosyaTur: normalizedDosyaTur ?? '',
        yargiBirimTablo: uyap.yargiBirimTablo ?? '',
        davaKonuId:
            uyap.davaKonuRef ??
            (uyap.davaKonuId != null ? `KONU:${String(uyap.davaKonuId)}` : '__none__'),
        icraTakipTuru: uyap.icra?.takipTuru != null ? String(uyap.icra.takipTuru) : '__none__',
        icraTakipYolu: uyap.icra?.takipYolu != null ? String(uyap.icra.takipYolu) : '__none__',
        icraTakipMahiyet:
            uyap.icra?.takipMahiyeti != null ? String(uyap.icra.takipMahiyeti) : '__none__',
        icraTakipSekli: uyap.icra?.takipSekli != null ? String(uyap.icra.takipSekli) : '__none__',
    };
}

function parseNumericKonuId(ref: string): number | undefined {
    const idariVergiAltKonu = ref.match(/^KONU_ALT:(\d+):\d+$/);
    if (idariVergiAltKonu) {
        const parentId = Number(idariVergiAltKonu[1]);
        return Number.isFinite(parentId) ? parentId : undefined;
    }
    const m = ref.match(/(\d+)$/);
    if (!m) return undefined;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : undefined;
}

export function applyMatterUyapMetadataOnSave(
    existingMetadata: string | null | undefined,
    matterType: Matter['matter_type'],
    matterCategory: MatterCategory | string | null | undefined,
    form: MatterUyapFormValues,
    partyProcessRoles?: Record<string, UyapProcessRoleLabel>,
    selectedDavaKonuLabel?: string
): string | null {
    if (!isMatterUyapClassificationVisible(matterType, matterCategory)) {
        return existingMetadata ?? null;
    }

    const icraActive =
        matterType === 'ENFORCEMENT' ||
        form.uyapDosyaTur === 'İcra Dosyası' ||
        form.icraTakipTuru !== '__none__' ||
        form.icraTakipYolu !== '__none__' ||
        form.icraTakipMahiyet !== '__none__' ||
        form.icraTakipSekli !== '__none__';

    return mergeMatterMetadataUyap(existingMetadata, {
        dosyaTur: form.uyapDosyaTur || undefined,
        dosyaTurKod: form.uyapDosyaTur
            ? UYAP_DOSYA_TURLERI.find((d) => d.label === form.uyapDosyaTur)?.dosyaTurKod
            : undefined,
        yargiBirimTablo: form.yargiBirimTablo || undefined,
        yargiAlani: form.yargiBirimTablo
            ? UYAP_YARGI_BIRIMI_BY_TABLO[form.yargiBirimTablo]?.yargiAlani
            : undefined,
        davaKonuRef: form.davaKonuId !== '__none__' ? form.davaKonuId : undefined,
        davaKonuId: form.davaKonuId !== '__none__' ? parseNumericKonuId(form.davaKonuId) : undefined,
        davaKonuLabel: form.davaKonuId !== '__none__' ? selectedDavaKonuLabel || undefined : undefined,
        icra: icraActive
            ? {
                  takipTuru: form.icraTakipTuru !== '__none__' ? Number(form.icraTakipTuru) : undefined,
                  takipYolu: form.icraTakipYolu !== '__none__' ? Number(form.icraTakipYolu) : undefined,
                  takipMahiyeti:
                      form.icraTakipMahiyet !== '__none__' ? Number(form.icraTakipMahiyet) : undefined,
                  takipSekli: form.icraTakipSekli !== '__none__' ? Number(form.icraTakipSekli) : undefined,
              }
            : undefined,
        partyProcessRoles:
            partyProcessRoles && Object.keys(partyProcessRoles).length > 0
                ? partyProcessRoles
                : undefined,
    });
}

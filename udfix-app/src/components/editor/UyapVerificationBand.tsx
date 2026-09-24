import React from 'react';
import {
    buildUyapVerificationNoticeText,
    type UyapVerificationMeta,
} from '../../utils/uyapVerification';
import { uyapVerificationQrDataUrl } from '../../utils/uyapVerificationBlock';
import {
    EDITOR_PAGE_MARGIN_LEFT_PX,
    EDITOR_PAGE_MARGIN_RIGHT_PX,
    EDITOR_PAGE_WIDTH_PX,
} from '../../utils/editorLayout';

interface UyapVerificationBandProps {
    meta: UyapVerificationMeta;
    className?: string;
}

/** UDF editöründe TipTap dışında gösterilen UYAP doğrulama metni + QR (gövdeye karışmaz). */
export const UyapVerificationBand: React.FC<UyapVerificationBandProps> = ({ meta, className = '' }) => {
    const [qrSrc, setQrSrc] = React.useState<string | null>(null);
    const [qrError, setQrError] = React.useState(false);

    React.useEffect(() => {
        let cancelled = false;
        setQrError(false);
        setQrSrc(null);
        void uyapVerificationQrDataUrl(meta)
            .then((url) => {
                if (!cancelled) setQrSrc(url);
            })
            .catch(() => {
                if (!cancelled) setQrError(true);
            });
        return () => {
            cancelled = true;
        };
    }, [meta.accessToken, meta.uyapdogrulamakodu]);

    const notice = buildUyapVerificationNoticeText(meta);

    return (
        <section
            className={`uyap-verification-band shrink-0 border-t border-border/60 bg-[#fafafa] dark:bg-zinc-950 ${className}`}
            data-uyap-verification="true"
            aria-label="UYAP belge doğrulama"
        >
            <div
                className="mx-auto w-full py-5 box-border"
                style={{
                    width: `var(--rm-page-width, ${EDITOR_PAGE_WIDTH_PX}px)`,
                    maxWidth: `${EDITOR_PAGE_WIDTH_PX}px`,
                    paddingLeft: `var(--rm-margin-left, ${EDITOR_PAGE_MARGIN_LEFT_PX}px)`,
                    paddingRight: `var(--rm-margin-right, ${EDITOR_PAGE_MARGIN_RIGHT_PX}px)`,
                }}
            >
                <table className="w-full border-collapse" role="presentation">
                    <tbody>
                        <tr>
                            <td className="align-middle pr-4 text-[9pt] leading-snug text-justify text-black dark:text-zinc-100 font-[Times_New_Roman,Times,serif]">
                                {notice}
                            </td>
                            <td className="w-[132px] align-middle text-center">
                                {qrSrc ? (
                                    <img
                                        src={qrSrc}
                                        alt="UYAP belge doğrulama QR kodu"
                                        width={120}
                                        height={120}
                                        className="inline-block h-[120px] w-[120px]"
                                    />
                                ) : qrError ? (
                                    <span className="text-[10px] text-muted-foreground">QR yüklenemedi</span>
                                ) : (
                                    <span className="text-[10px] text-muted-foreground">QR…</span>
                                )}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>
    );
};

export default UyapVerificationBand;

import React from 'react';
import { ESignatureBadgeIcon } from '../icons/ESignatureBadgeIcon';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../ui/hover-card';
import { getUdfSignatureBadgeDetailViewModel } from '../../utils/udfSignatureBadge';
import type { UdfSignatureMetadata } from '../../utils/udfSignatureState';

/** Premium seal — sized to fill the square trigger button. */
const EDITOR_BADGE_ICON_SIZE = 61;

type UdfEditorSignatureBadgeProps = {
    metadata: UdfSignatureMetadata | null;
};

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="flex flex-col gap-0.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-xs text-foreground leading-snug break-words">{value}</span>
    </div>
);

export const UdfEditorSignatureBadge: React.FC<UdfEditorSignatureBadgeProps> = ({ metadata }) => {
    const detail = getUdfSignatureBadgeDetailViewModel(metadata);
    if (!detail.visible) return null;

    const multipleSigners = detail.signers.length > 1;

    return (
        <HoverCard openDelay={80} closeDelay={120}>
            <HoverCardTrigger asChild>
                <button
                    type="button"
                    className="absolute left-2 top-2 z-[120] flex h-20 w-20 items-center justify-center rounded-lg border border-amber-300/40 bg-amber-950/20 p-0.5 shadow-md backdrop-blur-md transition-colors hover:bg-amber-300/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50"
                    aria-label="E-imza bilgisi"
                >
                    <ESignatureBadgeIcon size={EDITOR_BADGE_ICON_SIZE} aria-hidden />
                </button>
            </HoverCardTrigger>
            <HoverCardContent
                side="right"
                align="start"
                sideOffset={8}
                variant="glass"
                className={`z-[var(--z-editor-floating)] p-3 space-y-2.5 ${multipleSigners ? 'w-72 max-w-[min(18rem,90vw)]' : 'w-56'}`}
            >
                <div className="flex items-center gap-2 text-amber-200">
                    <ESignatureBadgeIcon size={18} aria-hidden />
                    <span className="text-xs font-semibold">
                        {multipleSigners ? `E-imzalı belge (${detail.signers.length} imza)` : 'E-imzalı belge'}
                    </span>
                </div>

                {multipleSigners ? (
                    <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Sertifika sahipleri
                        </span>
                        <ul className="space-y-2 text-xs text-foreground leading-snug">
                            {detail.signers.map((signer, index) => (
                                <li key={`${signer.signerName}-${index}`} className="break-words">
                                    <span className="font-medium">{signer.signerName}</span>
                                    {signer.certificateValidUntilLabel ? (
                                        <div className="text-[10px] text-muted-foreground mt-0.5">
                                            Geçerlilik: {signer.certificateValidUntilLabel}
                                        </div>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : (
                    <DetailRow label="Sertifika sahibi" value={detail.signers[0]?.signerName ?? 'Bilinmiyor'} />
                )}

                {detail.signedAtLabel ? <DetailRow label="İmza tarihi" value={detail.signedAtLabel} /> : null}

                {!multipleSigners && detail.certificateValidUntilLabel ? (
                    <DetailRow label="Sertifika geçerliliği" value={detail.certificateValidUntilLabel} />
                ) : null}
            </HoverCardContent>
        </HoverCard>
    );
};

export default UdfEditorSignatureBadge;

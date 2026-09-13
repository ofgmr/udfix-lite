import React, { useEffect, useState } from 'react';
import { type Party, DataService } from '../../services/dataService';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { useLayoutStore } from '../../stores/useLayoutStore';
import { CopyContentButton } from '../../components/ui/CopyContentButton';
import { formatPartyCopyText } from '../../utils/entityCopyText';
import { copyTextWithToast } from '../../utils/copyText';
import { useClientReportUiStore } from '../../stores/useClientReportUiStore';

interface ClientWidgetProps {
    party: Party;
    isActive?: boolean;
    onClick?: () => void;
    onDelete?: (e: React.MouseEvent) => void;
    onEditSuccess?: () => void;
}

const ClientWidget: React.FC<ClientWidgetProps> = React.memo(({
    party,
    isActive,
    onClick,
    onDelete,
    onEditSuccess: _onEditSuccess,
}) => {
    const openPartyFormFloating = useLayoutStore((s) => s.openPartyFormFloating);
    const isKurum = party.party_kind === 'KURUM' || party.type === 'CORPORATE';

    const [relatedCounts, setRelatedCounts] = useState<{ matter_count: number; note_count: number } | null>(
        null
    );
    const openClientReport = useClientReportUiStore((s) => s.openReport);

    useEffect(() => {
        if (!party.id) {
            setRelatedCounts(null);
            return;
        }

        let cancelled = false;
        void DataService.getPartyRelatedCounts(party.id)
            .then((counts) => {
                if (!cancelled) setRelatedCounts(counts);
            })
            .catch(() => {
                if (!cancelled) setRelatedCounts({ matter_count: 0, note_count: 0 });
            });

        return () => {
            cancelled = true;
        };
    }, [party.id]);

    const hasContact = Boolean(party.phone || party.email);
    const showContactExpanded = Boolean(isActive && hasContact);

    return (
        <div
            onClick={onClick}
            className={cn(
                "p-3 rounded-xl border border-white/5 transition-all cursor-pointer group mb-2 hover:shadow-lg relative overflow-hidden select-text",
                isActive
                    ? "bg-primary/20 border-primary/30 shadow-md shadow-primary/10"
                    : "bg-white/5 hover:bg-white/10"
            )}
        >
            {isActive && (
                <div className="absolute -right-4 -top-4 w-20 h-20 bg-primary/20 blur-2xl rounded-full pointer-events-none" />
            )}

            <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className={cn(
                        "p-2.5 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105",
                        isKurum
                            ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                            : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    )}>
                        <MaterialIcon icon={isKurum ? "business" : "person"} size={20} />
                    </div>

                    <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-sm text-foreground/90 group-hover:text-foreground truncate transition-colors">
                            {party.full_name}
                        </span>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-tight flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className={cn(
                                "w-1.5 h-1.5 rounded-full shrink-0",
                                party.is_client ? 'bg-green-500' : 'bg-gray-500'
                            )} />
                            <span>{party.id_number || 'TCKN / VKN Yok'}</span>
                            {relatedCounts && (
                                <>
                                    <span className="opacity-40">·</span>
                                    <span className="normal-case tracking-normal">
                                        {relatedCounts.matter_count} dosya · {relatedCounts.note_count} not
                                    </span>
                                </>
                            )}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                    <CopyContentButton
                        text={formatPartyCopyText(party)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                    <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-all hover:bg-white/10 rounded-lg"
                            title="Taraf işlemleri"
                            aria-label="Taraf işlemleri"
                        >
                            <MaterialIcon icon="more_horiz" size={18} />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="glass border-white/10 w-52">
                        <DropdownMenuItem
                            onSelect={(e) => {
                                e.preventDefault();
                                openPartyFormFloating(party);
                            }}
                            className="gap-2 text-xs"
                        >
                            <MaterialIcon icon="edit" size={14} /> Düzenle
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onSelect={(e) => {
                                e.preventDefault();
                                if (party.id) openClientReport(party.id, party.full_name);
                            }}
                            className="gap-2 text-xs"
                        >
                            <MaterialIcon icon="download" size={14} /> Müvekkil raporu (CSV)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onSelect={(e) => {
                                e.preventDefault();
                                void copyTextWithToast(formatPartyCopyText(party));
                            }}
                            className="gap-2 text-xs"
                        >
                            <MaterialIcon icon="content_copy" size={14} /> İçerik kopyala
                        </DropdownMenuItem>
                        {onDelete && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={onDelete}
                                    className="gap-2 text-destructive text-xs focus:bg-destructive/10 focus:text-destructive"
                                >
                                    <MaterialIcon icon="delete" size={14} /> Sil
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
                </div>
            </div>

            {showContactExpanded && (
                <div className="mt-3 pt-3 border-t border-white/5 relative z-10">
                    <div className="flex flex-col gap-1.5 text-[11px] text-muted-foreground">
                        {party.phone && (
                            <div className="flex items-center gap-2 hover:text-foreground/80 transition-colors">
                                <MaterialIcon icon="call" size={12} className="text-primary/70" />
                                <span className="tracking-wide">{party.phone}</span>
                            </div>
                        )}
                        {party.email && (
                            <div className="flex items-center gap-2 hover:text-foreground/80 transition-colors">
                                <MaterialIcon icon="mail" size={12} className="text-primary/70" />
                                <span className="truncate">{party.email}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
});

export default ClientWidget;

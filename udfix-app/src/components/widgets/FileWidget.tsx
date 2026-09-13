import React from 'react';
import { type Matter } from '../../services/dataService';
import MaterialIcon from '../../components/ui/MaterialIcon';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';
import { getIcraLawyerSummary } from '../../utils/matterAttributeSearch';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { useLayoutStore } from '../../stores/useLayoutStore';
import { CopyContentButton } from '../../components/ui/CopyContentButton';
import { formatMatterCopyText } from '../../utils/entityCopyText';
import { copyTextWithToast } from '../../utils/copyText';

interface FileWidgetProps {
    matter: Matter;
    isActive?: boolean;
    onClick?: () => void;
    onDelete?: (e: React.MouseEvent) => void;
    onEditSuccess?: () => void;
}

const getMatterIcon = (type: string) => {
    switch (type) {
        case 'LAW_CASE': return 'gavel';
        case 'ENFORCEMENT': return 'account_balance_wallet';
        case 'ADVISORY': return 'description';
        case 'MEDIATION': return 'diversity_3';
        case 'PROSECUTION': return 'policy';
        case 'ARBITRATION': return 'balance';
        default: return 'folder';
    }
};

const getMatterColorClass = (type: string) => {
    switch (type) {
        case 'LAW_CASE': return "bg-red-500/10 text-red-400 border-red-500/20";
        case 'ENFORCEMENT': return "bg-orange-500/10 text-orange-400 border-orange-500/20";
        case 'ADVISORY': return "bg-blue-500/10 text-blue-400 border-blue-500/20";
        case 'MEDIATION': return "bg-purple-500/10 text-purple-400 border-purple-500/20";
        case 'PROSECUTION': return "bg-amber-500/10 text-amber-400 border-amber-500/20";
        case 'ARBITRATION': return "bg-teal-500/10 text-teal-400 border-teal-500/20";
        default: return "bg-gray-500/10 text-gray-400 border-gray-500/20";
    }
};

const FileWidget: React.FC<FileWidgetProps> = React.memo(({
    matter,
    isActive,
    onClick,
    onDelete,
    onEditSuccess: _onEditSuccess,
}) => {
    const openMatterFormFloating = useLayoutStore((s) => s.openMatterFormFloating);
    const icraSummary =
        matter.matter_type === 'ENFORCEMENT'
            ? getIcraLawyerSummary(matter.attributes_search)
            : [];
    return (
        <div
            onClick={onClick}
            className={cn(
                "p-3 rounded-xl border border-white/5 transition-all cursor-pointer group mb-2 hover:shadow-lg relative overflow-hidden flex flex-col gap-2 select-text",
                isActive
                    ? "bg-primary/20 border-primary/30 shadow-md shadow-primary/10"
                    : "bg-white/5 hover:bg-white/10"
            )}
        >
            {/* Background Gradient Decoration */}
            {isActive && (
                <div className="absolute -right-8 -top-8 w-24 h-24 bg-primary/15 blur-3xl rounded-full pointer-events-none" />
            )}

            <div className="flex items-start justify-between relative z-10">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={cn(
                        "p-2.5 rounded-xl flex items-center justify-center shrink-0 border transition-transform group-hover:scale-105",
                        getMatterColorClass(matter.matter_type)
                    )}>
                        <MaterialIcon icon={getMatterIcon(matter.matter_type)} size={18} />
                    </div>

                    <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-semibold text-sm text-foreground/90 group-hover:text-foreground truncate line-clamp-2 leading-tight">
                            {matter.title}
                        </span>

                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-tight font-medium bg-white/5 px-1.5 py-0.5 rounded-md border border-white/5">
                                {matter.internal_id || 'NO: --'}
                            </span>
                            {matter.status !== 'OPEN' && (
                                <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-white/5 border-white/10 uppercase font-bold tracking-wider">
                                    {matter.status === 'CLOSED'
                                        ? 'Kapalı'
                                        : matter.status === 'ARCHIVED'
                                          ? 'Arşiv'
                                          : 'İstinaf/Temyiz'}
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 -mt-1 -mr-1">
                    <CopyContentButton
                        text={formatMatterCopyText(matter)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                    <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-all hover:bg-white/10 rounded-lg shrink-0"
                            title="Dosya işlemleri"
                            aria-label="Dosya işlemleri"
                        >
                            <MaterialIcon icon="more_horiz" size={18} />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="glass border-white/10 w-32">
                        <DropdownMenuItem
                            onSelect={(e) => {
                                e.preventDefault();
                                openMatterFormFloating(matter);
                            }}
                            className="gap-2 text-xs"
                        >
                            <MaterialIcon icon="edit" size={14} /> Düzenle
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onSelect={(e) => {
                                e.preventDefault();
                                void copyTextWithToast(formatMatterCopyText(matter));
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

            {/* Details Section */}
            {(matter.court_name || matter.file_number || matter.parties_list) && (
                <div className="flex flex-col gap-1.5 text-[11px] text-muted-foreground border-t border-white/5 pt-2.5 mt-1 relative z-10">
                    {(matter.court_name || matter.file_number) && (
                        <div className="flex items-center gap-3">
                            {matter.court_name && (
                                <div className="flex items-center gap-1.5 truncate flex-1" title={matter.court_name}>
                                    <MaterialIcon icon="account_balance" size={12} className="shrink-0 opacity-70" />
                                    <span className="truncate font-medium">{matter.court_name}</span>
                                </div>
                            )}
                            {matter.file_number && (
                                <div className="flex items-center gap-1.5 shrink-0 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                                    <MaterialIcon icon="tag" size={10} className="shrink-0 opacity-70" />
                                    <span className="font-mono text-[10px]">{matter.file_number}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {matter.parties_list && (
                        <div className="text-[10px] text-primary/80 font-medium truncate flex items-center gap-1.5 pt-0.5">
                            <MaterialIcon icon="groups" size={12} className="opacity-70" />
                            <span className="truncate">{matter.parties_list}</span>
                        </div>
                    )}

                    {icraSummary.length > 0 && (
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1">
                            {icraSummary.map((row) => (
                                <div key={row.label} className="flex items-center justify-between gap-2 min-w-0">
                                    <span className="truncate opacity-80">{row.label}</span>
                                    <span className="font-mono text-[10px] text-foreground/90 shrink-0">
                                        {row.value} ₺
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});

export default FileWidget;

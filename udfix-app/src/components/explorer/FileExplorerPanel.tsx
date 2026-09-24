import React from 'react';
import { Tree, type NodeRendererProps, type TreeApi } from 'react-arborist';
import MaterialIcon from '../ui/MaterialIcon';
import { FileSystemService, type FsEntry } from '../../services/fileSystemService';
import { useShallow } from 'zustand/react/shallow';
import { useLayoutStore } from '../../stores/useLayoutStore';
import { DataService } from '../../services/dataService';
import { NOMAI_FS_ENTRY_MIME } from '../../utils/processDockviewFileDrop';
import { ESignatureBadgeIcon } from '../icons/ESignatureBadgeIcon';
import {
    formatUdfSignatureSignerNames,
    getUdfSignatureSignerNames,
    readUdfSignatureMetadata,
    type UdfSignatureMetadata,
} from '../../utils/udfSignatureState';
import { toast } from 'sonner';
import { WORKSPACE_ROOT_CHANGED_EVENT } from '../../hooks/useApplicationMenuBridge';
import {
    ContextMenu,
    ContextMenuTrigger,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
} from '../ui/context-menu';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '../ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

type ExplorerNode = {
    id: string;
    name: string;
    path: string;
    isDirectory: boolean;
    mtimeMs: number;
    udfSignature?: UdfSignatureMetadata | null;
    children?: ExplorerNode[];
    childrenLoaded?: boolean;
};

const STORAGE_KEY = 'nomai-workspace-root';
const PANEL_WIDTH_KEY = 'nomai-file-explorer-width';
const DEFAULT_PANEL_WIDTH = 360;
const MIN_PANEL_WIDTH = 220;
const MAX_PANEL_WIDTH = 720;
/** Below this width (px), hide the date column to save space. */
const DATE_COLUMN_MIN_WIDTH = 340;
/** Toolbar: filter becomes icon + popover below this inner width. */
const COMPACT_TOOLBAR_WIDTH = 300;
const DELAYED_RENAME_MS = 650;

/** Hidden by default (macOS / Windows junk). */
const HIDDEN_ENTRY_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

const shouldShowFsEntry = (e: FsEntry) => {
    if (HIDDEN_ENTRY_NAMES.has(e.name)) return false;
    if (e.name.startsWith('._')) return false;
    return true;
};

const filterVisibleEntries = (entries: FsEntry[]) => entries.filter(shouldShowFsEntry);

const joinFsPath = (dir: string, fileName: string) => {
    const d = dir.replace(/[/\\]+$/, '');
    const sep = d.includes('\\') ? '\\' : '/';
    return `${d}${sep}${fileName}`;
};

const formatModified = (mtimeMs: number) => {
    if (!mtimeMs) return '—';
    return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(mtimeMs));
};

const getExt = (name: string) => {
    const idx = name.lastIndexOf('.');
    return idx < 0 ? '' : name.slice(idx + 1).toLowerCase();
};

const getUdfDocumentId = (filePath: string) => `udf:${encodeURIComponent(filePath)}`;

const readKnownUdfSignature = (entry: Pick<FsEntry, 'name' | 'path' | 'isDirectory'>): UdfSignatureMetadata | null => {
    if (entry.isDirectory || getExt(entry.name) !== 'udf') return null;
    return readUdfSignatureMetadata(getUdfDocumentId(entry.path));
};

const getBaseName = (targetPath: string) => {
    const n = targetPath.replace(/\\/g, '/');
    const idx = n.lastIndexOf('/');
    return idx < 0 ? n : n.slice(idx + 1);
};

const getParentDir = (targetPath: string) => {
    const n = targetPath.replace(/\\/g, '/');
    const idx = n.lastIndexOf('/');
    return idx <= 0 ? n : n.slice(0, idx);
};

const sortEntries = (entries: FsEntry[], mode: 'name' | 'modified') =>
    [...entries].sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        if (mode === 'modified') return b.mtimeMs - a.mtimeMs;
        return a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' });
    });

const toNodes = (entries: FsEntry[], mode: 'name' | 'modified'): ExplorerNode[] =>
    sortEntries(filterVisibleEntries(entries), mode).map((e) => ({
        id: e.path,
        name: e.name,
        path: e.path,
        isDirectory: e.isDirectory,
        mtimeMs: e.mtimeMs,
        udfSignature: readKnownUdfSignature(e),
        children: e.isDirectory ? [] : undefined,
        childrenLoaded: e.isDirectory ? false : undefined,
    }));

const replaceChildren = (nodes: ExplorerNode[], path: string, children: ExplorerNode[]): ExplorerNode[] =>
    nodes.map((n) => {
        if (n.path === path) return { ...n, children, childrenLoaded: true };
        if (!n.children?.length) return n;
        return { ...n, children: replaceChildren(n.children, path, children) };
    });

const collectLoadedDirectoryPaths = (nodes: ExplorerNode[], acc: string[] = []): string[] => {
    for (const n of nodes) {
        if (!n.isDirectory || !n.childrenLoaded) continue;
        acc.push(n.path);
        if (n.children?.length) collectLoadedDirectoryPaths(n.children, acc);
    }
    return acc;
};

const findByPath = (nodes: ExplorerNode[], path: string): ExplorerNode | null => {
    for (const n of nodes) {
        if (n.path === path) return n;
        if (n.children && n.children.length > 0) {
            const child = findByPath(n.children, path);
            if (child) return child;
        }
    }
    return null;
};

const fuzzy = (needle: string, haystack: string) => {
    const n = needle.trim().toLowerCase();
    if (!n) return true;
    const h = haystack.toLowerCase();
    let j = 0;
    for (let i = 0; i < h.length && j < n.length; i++) {
        if (h[i] === n[j]) j++;
    }
    return j === n.length;
};

const NEW_FOLDER_BASE = 'Yeni Klasor';

const pickUniqueFolderName = (existingNames: Set<string>): string => {
    if (!existingNames.has(NEW_FOLDER_BASE)) return NEW_FOLDER_BASE;
    let i = 2;
    while (existingNames.has(`${NEW_FOLDER_BASE} ${i}`)) i += 1;
    return `${NEW_FOLDER_BASE} ${i}`;
};

const filterTree = (nodes: ExplorerNode[], q: string, signedOnly: boolean): ExplorerNode[] => {
    if (!q.trim() && !signedOnly) return nodes;
    const out: ExplorerNode[] = [];
    for (const n of nodes) {
        const kids = n.children ? filterTree(n.children, q, signedOnly) : n.children;
        const matchesQuery = fuzzy(q, n.name);
        const matchesSignature = !signedOnly || n.isDirectory || (!n.isDirectory && n.udfSignature?.signed === true);
        const hasMatchingChild = Array.isArray(kids) && kids.length > 0;
        if ((matchesQuery && matchesSignature) || hasMatchingChild) {
            out.push({ ...n, children: Array.isArray(kids) ? kids : n.children });
        }
    }
    return out;
};

const countLoadedUdfStats = (nodes: ExplorerNode[]): { total: number; signed: number } => {
    let total = 0;
    let signed = 0;
    for (const node of nodes) {
        if (!node.isDirectory && getExt(node.name) === 'udf') {
            total += 1;
            if (node.udfSignature?.signed) signed += 1;
        }
        if (Array.isArray(node.children)) {
            const childStats = countLoadedUdfStats(node.children);
            total += childStats.total;
            signed += childStats.signed;
        }
    }
    return { total, signed };
};

const updateNodeSignature = (
    nodes: ExplorerNode[],
    filePath: string,
    signature: UdfSignatureMetadata | null,
): ExplorerNode[] =>
    nodes.map((node) => {
        if (node.path === filePath) return { ...node, udfSignature: signature };
        if (!node.children || node.children.length === 0) return node;
        return { ...node, children: updateNodeSignature(node.children, filePath, signature) };
    });

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'ico', 'tiff', 'tif']);

const FileRowIcon: React.FC<{
    name: string;
    path: string;
    isDirectory: boolean;
    isOpen: boolean;
}> = ({ name, isDirectory, isOpen }) => {
    const ext = getExt(name);

    if (isDirectory) {
        return <MaterialIcon icon={isOpen ? 'folder_open' : 'folder'} size={16} className="text-primary shrink-0" />;
    }

    if (ext === 'pdf') {
        return <MaterialIcon icon="picture_as_pdf" size={16} className="text-red-500 shrink-0" />;
    }
    if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) {
        return <MaterialIcon icon="table_chart" size={16} className="text-emerald-500 shrink-0" />;
    }
    if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) {
        return <MaterialIcon icon="description" size={16} className="text-sky-500 shrink-0" />;
    }
    if (['ppt', 'pptx', 'odp'].includes(ext)) {
        return <MaterialIcon icon="slideshow" size={16} className="text-orange-400 shrink-0" />;
    }
    if (ext === 'udf') {
        return <MaterialIcon icon="edit_document" size={16} className="text-violet-400 shrink-0" />;
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
        return <MaterialIcon icon="folder_zip" size={16} className="text-amber-200/90 shrink-0" />;
    }
    if (IMAGE_EXTENSIONS.has(ext)) {
        return <MaterialIcon icon="image" size={16} className="text-sky-400 shrink-0" />;
    }
    return <MaterialIcon icon="draft" size={16} className="text-muted-foreground shrink-0" />;
};

const FS_EXPLORER_TOOLTIP_CONTENT =
    'glass-tooltip border-white/10 px-2 py-1.5 text-[11px] text-foreground shadow-md max-w-[min(92vw,380px)] z-[var(--z-floating)] bg-[var(--glass-bg)]';

const FsExplorerTooltip: React.FC<{
    content: React.ReactNode;
    side?: 'top' | 'right' | 'bottom' | 'left';
    align?: 'start' | 'center' | 'end';
    children: React.ReactElement;
}> = ({ content, side = 'top', align = 'center', children }) => (
    <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} align={align} variant="default" className={FS_EXPLORER_TOOLTIP_CONTENT}>
            {content}
        </TooltipContent>
    </Tooltip>
);

export const FileExplorerPanel: React.FC = () => {
    const { openInNewViewerTab, openUdfEditorTab } = useLayoutStore(
        useShallow((s) => ({
            openInNewViewerTab: s.openInNewViewerTab,
            openUdfEditorTab: s.openUdfEditorTab,
        })),
    );
    const [workspaceRoot, setWorkspaceRoot] = React.useState<string | null>(() => localStorage.getItem(STORAGE_KEY) || null);
    const [treeData, setTreeData] = React.useState<ExplorerNode[]>([]);
    const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [containerHeight, setContainerHeight] = React.useState(520);
    const [filterQuery, setFilterQuery] = React.useState('');
    const [sortMode, setSortMode] = React.useState<'name' | 'modified'>('name');
    const [starred, setStarred] = React.useState<Set<string>>(new Set());
    const [renamePath, setRenamePath] = React.useState<string | null>(null);
    const [renameValue, setRenameValue] = React.useState('');
    const [panelWidth, setPanelWidth] = React.useState(() => {
        const raw = localStorage.getItem(PANEL_WIDTH_KEY);
        const n = raw ? Number.parseInt(raw, 10) : NaN;
        if (Number.isFinite(n)) return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, n));
        return DEFAULT_PANEL_WIDTH;
    });
    const [measuredWidth, setMeasuredWidth] = React.useState(DEFAULT_PANEL_WIDTH);
    const [dndRootElement, setDndRootElement] = React.useState<HTMLElement | null>(null);
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const panelOuterRef = React.useRef<HTMLDivElement | null>(null);
    const pendingRenameRef = React.useRef<{ path: string; timer: number } | null>(null);
    const renameInputRef = React.useRef<HTMLInputElement | null>(null);
    const watchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const treeApiRef = React.useRef<TreeApi<ExplorerNode> | undefined>(undefined);
    const treeDataRef = React.useRef<ExplorerNode[]>([]);
    const showDateColumn = measuredWidth >= DATE_COLUMN_MIN_WIDTH;
    const compactToolbar = measuredWidth < COMPACT_TOOLBAR_WIDTH;

    type InputDialogState =
        | { kind: 'tagAdd'; filePath: string }
        | { kind: 'tagRemove'; filePath: string; initialTag: string };

    const [inputDialog, setInputDialog] = React.useState<InputDialogState | null>(null);
    const [inputDialogValue, setInputDialogValue] = React.useState('');
    const [deleteConfirmPath, setDeleteConfirmPath] = React.useState<string | null>(null);
    const [filterPopoverOpen, setFilterPopoverOpen] = React.useState(false);
    const [signedOnly, setSignedOnly] = React.useState(false);

    const clearPendingRename = React.useCallback(() => {
        if (pendingRenameRef.current) {
            window.clearTimeout(pendingRenameRef.current.timer);
            pendingRenameRef.current = null;
        }
    }, []);

    const startRename = React.useCallback((node: ExplorerNode) => {
        clearPendingRename();
        setRenamePath(node.path);
        setRenameValue(node.name);
    }, [clearPendingRename]);

    const scheduleDelayedRename = React.useCallback((node: ExplorerNode) => {
        clearPendingRename();
        const timer = window.setTimeout(() => {
            pendingRenameRef.current = null;
            setRenamePath(node.path);
            setRenameValue(node.name);
        }, DELAYED_RENAME_MS);
        pendingRenameRef.current = { path: node.path, timer };
    }, [clearPendingRename]);

    React.useEffect(() => clearPendingRename, [clearPendingRename]);

    const setContainerNode = React.useCallback((node: HTMLDivElement | null) => {
        containerRef.current = node;
        setDndRootElement((prev) => (prev === node ? prev : node));
    }, []);

    const refreshMeta = React.useCallback(async () => {
        const pins = await DataService.getStarredFiles(100);
        setStarred(new Set(pins.map((p) => p.path)));
    }, []);

    const loadDirChildren = React.useCallback(async (dirPath: string) => {
        const entries = await FileSystemService.listDirectory(dirPath);
        const children = toNodes(entries, sortMode);
        setTreeData((prev) => replaceChildren(prev, dirPath, children));
    }, [sortMode]);

    const bootstrap = React.useCallback(async (root: string, opts?: { silent?: boolean }) => {
        if (!opts?.silent) setLoading(true);
        const rootNode: ExplorerNode = {
            id: root,
            name: getBaseName(root),
            path: root,
            isDirectory: true,
            mtimeMs: Date.now(),
            children: [],
            childrenLoaded: false,
        };
        if (!opts?.silent) setTreeData([rootNode]);
        try {
            const entries = await FileSystemService.listDirectory(root);
            setTreeData([{ ...rootNode, children: toNodes(entries, sortMode), childrenLoaded: true }]);
        } finally {
            if (!opts?.silent) setLoading(false);
        }
    }, [sortMode]);

    const refreshAll = React.useCallback(async () => {
        if (!workspaceRoot) return;
        const loadedDirs = collectLoadedDirectoryPaths(treeDataRef.current);
        await bootstrap(workspaceRoot, { silent: true });
        for (const dir of loadedDirs) {
            if (dir === workspaceRoot) continue;
            await loadDirChildren(dir);
        }
        await refreshMeta();
    }, [bootstrap, loadDirChildren, refreshMeta, workspaceRoot]);

    React.useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        let raf = 0;
        const observer = new ResizeObserver((entries) => {
            const h = Math.floor(entries[0]?.contentRect.height ?? 0);
            if (h <= 0) return;
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                raf = 0;
                setContainerHeight((prev) => (Math.abs(prev - h) < 2 ? prev : h));
            });
        });
        observer.observe(el);
        return () => {
            if (raf) cancelAnimationFrame(raf);
            observer.disconnect();
        };
    }, []);

    React.useEffect(() => {
        const el = panelOuterRef.current;
        if (!el) return;
        let raf = 0;
        const observer = new ResizeObserver((entries) => {
            const w = Math.floor(entries[0]?.contentRect.width ?? 0);
            if (w <= 0) return;
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                raf = 0;
                setMeasuredWidth((prev) => (Math.abs(prev - w) < 2 ? prev : w));
            });
        });
        observer.observe(el);
        return () => {
            if (raf) cancelAnimationFrame(raf);
            observer.disconnect();
        };
    }, []);

    const onResizeHandleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startWidth = panelWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        const onMove = (move: MouseEvent) => {
            const delta = move.clientX - startX;
            setPanelWidth(Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, startWidth + delta)));
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            setPanelWidth((w) => {
                localStorage.setItem(PANEL_WIDTH_KEY, String(w));
                return w;
            });
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    React.useEffect(() => {
        if (!workspaceRoot) return;
        void bootstrap(workspaceRoot);
    }, [workspaceRoot, bootstrap]);

    React.useEffect(() => {
        void refreshMeta();
    }, [refreshMeta]);

    React.useEffect(() => {
        const onSignatureMetaChanged = (event: Event) => {
            const documentId = (event as CustomEvent<{ documentId?: unknown }>).detail?.documentId;
            if (typeof documentId !== 'string' || !documentId.startsWith('udf:')) return;
            try {
                const filePath = decodeURIComponent(documentId.slice(4));
                setTreeData((prev) => updateNodeSignature(prev, filePath, readUdfSignatureMetadata(documentId)));
            } catch {
                // Ignore malformed document ids from external events.
            }
        };
        window.addEventListener('udfix:signature-meta-updated', onSignatureMetaChanged as EventListener);
        return () => {
            window.removeEventListener('udfix:signature-meta-updated', onSignatureMetaChanged as EventListener);
        };
    }, []);

    React.useEffect(() => {
        if (!renamePath) {
            renameInputRef.current = null;
            return;
        }
        const t = window.requestAnimationFrame(() => {
            const el = renameInputRef.current;
            if (el) {
                el.focus();
                el.select();
            }
        });
        return () => cancelAnimationFrame(t);
    }, [renamePath]);

    React.useEffect(() => {
        if (!workspaceRoot || !window.electron?.on || !window.electron?.off) return;
        void FileSystemService.startWatch(workspaceRoot);
        const onFsChange = (...args: unknown[]) => {
            const payload = args[0] as { rootPath: string };
            if (payload.rootPath !== workspaceRoot) return;
            if (watchTimerRef.current) clearTimeout(watchTimerRef.current);
            watchTimerRef.current = setTimeout(() => void refreshAll(), 700);
        };
        window.electron.on('fs-watch-event', onFsChange);
        return () => {
            if (watchTimerRef.current) clearTimeout(watchTimerRef.current);
            window.electron?.off?.('fs-watch-event', onFsChange);
            void FileSystemService.stopWatch(workspaceRoot);
        };
    }, [workspaceRoot, refreshAll]);

    const openFile = React.useCallback(async (node: ExplorerNode, preferEditor = false) => {
        if (node.isDirectory) return;
        if (getExt(node.name) === 'udf' && preferEditor) {
            openUdfEditorTab({ path: node.path, name: node.name });
        } else {
            openInNewViewerTab({ url: node.path, name: node.name });
        }
        await DataService.touchRecentFile(node.path);
        await refreshMeta();
    }, [openInNewViewerTab, openUdfEditorTab, refreshMeta]);

    const renameCommit = React.useCallback(async () => {
        if (!renamePath) return;
        const node = findByPath(treeData, renamePath);
        if (!node) return;
        const next = renameValue.trim();
        if (!next || next === node.name) {
            setRenamePath(null);
            return;
        }
        const parent = getParentDir(node.path);
        await FileSystemService.renamePath(node.path, joinFsPath(parent, next));
        if (node.isDirectory) {
            await refreshAll();
        } else {
            await loadDirChildren(parent);
        }
        setRenamePath(null);
    }, [renamePath, renameValue, treeData, loadDirChildren, refreshAll]);

    const pickWorkspace = async () => {
        const picked = await FileSystemService.selectWorkspaceDirectory();
        if (!picked) return;
        localStorage.setItem(STORAGE_KEY, picked);
        setWorkspaceRoot(picked);
    };

    React.useEffect(() => {
        const onWorkspaceRootChanged = (event: Event) => {
            const root = (event as CustomEvent<{ root?: string }>).detail?.root;
            if (typeof root !== 'string' || !root) return;
            localStorage.setItem(STORAGE_KEY, root);
            setWorkspaceRoot(root);
        };
        window.addEventListener(WORKSPACE_ROOT_CHANGED_EVENT, onWorkspaceRootChanged);
        return () => window.removeEventListener(WORKSPACE_ROOT_CHANGED_EVENT, onWorkspaceRootChanged);
    }, []);

    const resolveTargetDir = React.useCallback(
        (explicit?: string | null) => {
            if (!workspaceRoot) return null;
            if (explicit) return explicit;
            if (!selectedPath) return workspaceRoot;
            const sel = findByPath(treeData, selectedPath);
            if (!sel) return workspaceRoot;
            return sel.isDirectory ? sel.path : getParentDir(sel.path);
        },
        [workspaceRoot, selectedPath, treeData],
    );

    const createFolderInline = React.useCallback(
        async (targetBase?: string | null) => {
            if (!workspaceRoot) {
                toast.error('Önce bir çalışma klasörü seçin.');
                return;
            }
            const base = resolveTargetDir(targetBase ?? undefined);
            if (!base) return;
            try {
                const entries = await FileSystemService.listDirectory(base);
                const names = new Set(entries.map((e) => e.name));
                const name = pickUniqueFolderName(names);
                const fullPath = joinFsPath(base, name);
                await FileSystemService.createDirectory(fullPath);
                await loadDirChildren(base);
                treeApiRef.current?.open(base);
                setRenamePath(fullPath);
                setRenameValue(name);
            } catch (err) {
                console.error(err);
                toast.error(err instanceof Error ? err.message : 'Klasör oluşturulamadı');
            }
        },
        [workspaceRoot, resolveTargetDir, loadDirChildren],
    );

    const submitInputDialog = React.useCallback(async () => {
        if (!inputDialog) return;
        const raw = inputDialogValue.trim();
        if (inputDialog.kind === 'tagAdd') {
            if (!raw) {
                toast.error('Etiket adı girin.');
                return;
            }
            try {
                await DataService.addFileTag(inputDialog.filePath, raw);
                toast.success('Etiket eklendi');
                setInputDialog(null);
            } catch (err) {
                console.error(err);
                toast.error(err instanceof Error ? err.message : 'Etiket eklenemedi');
            }
            return;
        }
        if (inputDialog.kind === 'tagRemove') {
            if (!raw) return;
            try {
                await DataService.removeFileTag(inputDialog.filePath, raw);
                toast.success('Etiket kaldırıldı');
                setInputDialog(null);
            } catch (err) {
                console.error(err);
                toast.error(err instanceof Error ? err.message : 'Etiket kaldırılamadı');
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- dialog commit does not need loadDirChildren
    }, [inputDialog, inputDialogValue, loadDirChildren]);

    const deleteSelected = () => {
        if (!selectedPath) return;
        const n = findByPath(treeData, selectedPath);
        if (!n) return;
        setDeleteConfirmPath(n.path);
    };

    const showInFolder = React.useCallback(async (targetPath: string) => {
        try {
            await FileSystemService.showItemInFolder(targetPath);
        } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'Klasörde gösterilemedi');
        }
    }, []);

    const confirmDelete = async () => {
        if (!deleteConfirmPath) return;
        const n = findByPath(treeData, deleteConfirmPath);
        if (!n) {
            setDeleteConfirmPath(null);
            return;
        }
        try {
            await FileSystemService.deletePath(n.path);
            await refreshAll();
            setSelectedPath(null);
        } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'Silinemedi');
        } finally {
            setDeleteConfirmPath(null);
        }
    };

    const toggleStar = async (path: string) => {
        await DataService.setFileStarred(path, !starred.has(path));
        await refreshMeta();
    };

    const udfStats = React.useMemo(() => countLoadedUdfStats(treeData), [treeData]);
    const filtered = React.useMemo(() => filterTree(treeData, filterQuery, signedOnly), [treeData, filterQuery, signedOnly]);
    treeDataRef.current = treeData;

    const Row = React.useCallback(
        ({ node, style, dragHandle }: NodeRendererProps<ExplorerNode>) => {
            const isDir = node.data.isDirectory;
            const isUdfFile = !isDir && getExt(node.data.name) === 'udf';
            const isSignedUdf = isUdfFile && node.data.udfSignature?.signed === true;
            const signerNames = getUdfSignatureSignerNames(node.data.udfSignature);
            const signerLabel =
                signerNames.length > 0 ? formatUdfSignatureSignerNames(signerNames) : null;
            const isPinned = !isDir && starred.has(node.data.path);
            const parentForCreate = isDir ? node.data.path : getParentDir(node.data.path);

            const row = (
                <div
                    style={style}
                    ref={dragHandle}
                    draggable={!isDir}
                    onDragStart={(e) => {
                        clearPendingRename();
                        if (isDir) return;
                        e.dataTransfer.effectAllowed = 'copyMove';
                        e.dataTransfer.setData(NOMAI_FS_ENTRY_MIME, JSON.stringify({ path: node.data.path, name: node.data.name }));
                        e.dataTransfer.setData('text/plain', node.data.path);
                    }}
                    onContextMenu={clearPendingRename}
                    onClick={async (e) => {
                        const wasSelected = selectedPath === node.data.path || node.isSelected;
                        const plainClick = !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey;

                        node.select();
                        if (renamePath === node.data.path) return;

                        if (!plainClick) {
                            clearPendingRename();
                        }

                        if (isUdfFile && e.shiftKey) {
                            await openFile(node.data, true);
                            return;
                        }

                        // Klasörler tek tıkla açılır/kapanır; içerik arka planda yüklenir.
                        if (isDir && plainClick && e.detail < 2) {
                            clearPendingRename();
                            node.toggle();
                            return;
                        }

                        // Yavaş ikinci tıklama yalnızca dosyalarda yeniden adlandırır.
                        if (plainClick && wasSelected && !isDir) {
                            scheduleDelayedRename(node.data);
                            return;
                        }

                        clearPendingRename();
                    }}
                    onDoubleClick={async (e) => {
                        clearPendingRename();
                        if (renamePath === node.data.path) return;
                        e.preventDefault();

                        if (isDir) return;

                        await openFile(node.data, e.shiftKey);
                    }}
                    className={`flex items-center gap-1 px-2 text-xs rounded-sm mx-1 cursor-pointer ${
                        node.isSelected ? 'bg-primary/20 text-foreground' : 'text-muted-foreground hover:bg-white/5'
                    }`}
                >
                    <FileRowIcon name={node.data.name} path={node.data.path} isDirectory={isDir} isOpen={node.isOpen} />
                    {!isDir ? (
                        <FsExplorerTooltip content={isPinned ? 'Yıldızı kaldır' : 'Yıldızla'} side="top">
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    clearPendingRename();
                                    void toggleStar(node.data.path);
                                }}
                                className="shrink-0 w-[22px] h-[22px] flex items-center justify-center rounded opacity-80 hover:opacity-100"
                            >
                                <MaterialIcon icon={isPinned ? 'star' : 'star_outline'} size={14} className={isPinned ? 'text-amber-300' : 'text-muted-foreground'} />
                            </button>
                        </FsExplorerTooltip>
                    ) : (
                        <span className="shrink-0 w-[22px]" aria-hidden />
                    )}
                    {renamePath === node.data.path ? (
                        <input
                            ref={(el) => {
                                renameInputRef.current = el;
                            }}
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => void renameCommit()}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') void renameCommit();
                                if (e.key === 'Escape') setRenamePath(null);
                            }}
                            className="truncate flex-1 min-w-0 bg-transparent border-b border-primary/40 outline-none"
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <FsExplorerTooltip
                            side="top"
                            align="start"
                            content={
                                <div className="space-y-1 text-left">
                                    <div className="font-medium break-all leading-snug">{node.data.name}</div>
                                    {isSignedUdf && (
                                        <div className="space-y-0.5 leading-snug">
                                            <div className="text-amber-200 font-medium">E-imzalı UDF</div>
                                            <div className="text-muted-foreground">
                                                {signerNames.length > 1 ? 'İmzalayanlar' : 'İmzalayan'}:{' '}
                                                {signerNames.length > 1 ? (
                                                    <ul className="mt-0.5 list-disc pl-4 text-foreground space-y-0.5">
                                                        {signerNames.map((name) => (
                                                            <li key={name} className="break-words">
                                                                {name}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : (
                                                    <span className="text-foreground break-words">
                                                        {signerLabel ?? 'Bilinmiyor'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    {isUdfFile && (
                                        <div className="text-muted-foreground leading-snug">
                                            Shift+tıklama ile editörde açılır.
                                        </div>
                                    )}
                                </div>
                            }
                        >
                            <span className="truncate flex-1 min-w-0 text-left">{node.data.name}</span>
                        </FsExplorerTooltip>
                    )}
                    {isSignedUdf && (
                        <FsExplorerTooltip
                            side="top"
                            content={
                                signerLabel
                                    ? `E-imzalı: ${signerLabel}`
                                    : 'E-imzalı UDF'
                            }
                        >
                            <span
                                className="shrink-0 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-amber-300/10 text-amber-300"
                                aria-label="E-imzalı UDF"
                            >
                                <ESignatureBadgeIcon size={13} aria-hidden />
                            </span>
                        </FsExplorerTooltip>
                    )}
                    {showDateColumn && (
                        <FsExplorerTooltip
                            side="left"
                            align="end"
                            content={<span className="tabular-nums">{formatModified(node.data.mtimeMs)}</span>}
                        >
                            <span className="w-[76px] shrink-0 text-[10px] text-muted-foreground tabular-nums text-right block truncate cursor-default">
                                {formatModified(node.data.mtimeMs)}
                            </span>
                        </FsExplorerTooltip>
                    )}
                </div>
            );

            return (
                <ContextMenu>
                    <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
                    <ContextMenuContent
                        className="min-w-[12rem] border-white/15 p-1 text-popover-foreground"
                        glass={{ blur: 10,outline: 'rgba(255,255,255,0.12)' }}
                        style={{ backgroundImage: 'none' }}
                    >
                        {!isDir && (
                            <>
                                <ContextMenuItem className="gap-2 cursor-pointer" onSelect={() => void openFile(node.data, false)}>
                                    <MaterialIcon icon="open_in_new" size={16} className="opacity-80" />
                                    Aç
                                </ContextMenuItem>
                                {getExt(node.data.name) === 'udf' && (
                                    <ContextMenuItem className="gap-2 cursor-pointer" onSelect={() => void openFile(node.data, true)}>
                                        <MaterialIcon icon="edit_document" size={16} className="opacity-80" />
                                        UDF olarak editörde aç
                                    </ContextMenuItem>
                                )}
                            </>
                        )}
                        <ContextMenuItem className="gap-2 cursor-pointer" onSelect={() => void showInFolder(node.data.path)}>
                            <MaterialIcon icon="folder_open" size={16} className="opacity-80" />
                            Klasörde göster
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem className="gap-2 cursor-pointer" onSelect={() => void createFolderInline(parentForCreate)}>
                            <MaterialIcon icon="create_new_folder" size={16} className="opacity-80" />
                            Yeni klasör
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                            className="gap-2 cursor-pointer"
                            onSelect={() => {
                                startRename(node.data);
                            }}
                        >
                            <MaterialIcon icon="drive_file_rename_outline" size={16} className="opacity-80" />
                            Yeniden adlandır
                        </ContextMenuItem>
                        {!isDir && (
                            <ContextMenuItem className="gap-2 cursor-pointer" onSelect={() => void toggleStar(node.data.path)}>
                                <MaterialIcon icon={isPinned ? 'star' : 'star_border'} size={16} className="opacity-80" />
                                {isPinned ? 'Yıldızı kaldır' : 'Yıldızla'}
                            </ContextMenuItem>
                        )}
                        {!isDir && (
                            <ContextMenuItem
                                className="gap-2 cursor-pointer"
                                onSelect={() => {
                                    setInputDialogValue('');
                                    setInputDialog({ kind: 'tagAdd', filePath: node.data.path });
                                }}
                            >
                                <MaterialIcon icon="sell" size={16} className="opacity-80" />
                                Etiket ekle
                            </ContextMenuItem>
                        )}
                        {!isDir && (
                            <ContextMenuItem
                                className="gap-2 cursor-pointer"
                                onSelect={async () => {
                                    const tags = await DataService.getFileTags(node.data.path);
                                    if (!tags.length) {
                                        toast.error('Kaldırılacak etiket yok');
                                        return;
                                    }
                                    const t = tags[0].tag;
                                    setInputDialogValue(t);
                                    setInputDialog({ kind: 'tagRemove', filePath: node.data.path, initialTag: t });
                                }}
                            >
                                <MaterialIcon icon="label_off" size={16} className="opacity-80" />
                                Etiket kaldır
                            </ContextMenuItem>
                        )}
                        <ContextMenuSeparator />
                        <ContextMenuItem
                            className="gap-2 cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
                            onSelect={() => {
                                setDeleteConfirmPath(node.data.path);
                            }}
                        >
                            <MaterialIcon icon="delete" size={16} />
                            Çöp Kutusuna Gönder
                        </ContextMenuItem>
                    </ContextMenuContent>
                </ContextMenu>
            );
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps -- tree row renderer stable without toggleStar in deps
        [clearPendingRename, openFile, renamePath, renameValue, renameCommit, scheduleDelayedRename, selectedPath, starred, refreshAll, createFolderInline, showDateColumn, startRename, showInFolder],
    );

    return (
        <TooltipProvider delayDuration={250}>
        <div className="flex h-full min-h-0 shrink-0 [contain:layout]" style={{ width: panelWidth }}>
            <div
                ref={panelOuterRef}
                className="flex flex-col h-full min-h-0 min-w-0 flex-1 glass-dock rounded-2xl border border-white/10 overflow-hidden"
            >
            <div className="h-11 px-2 border-b border-white/10 flex items-center gap-1.5 min-w-0 shrink-0">
                <FsExplorerTooltip content="Çalışma klasörü seçin" side="bottom">
                    <button type="button" onClick={() => void pickWorkspace()} className="h-7 shrink-0 px-2 text-[11px] rounded-md bg-white/10 hover:bg-white/15">
                        Klasör Aç
                    </button>
                </FsExplorerTooltip>
                <FsExplorerTooltip content="Yeni klasör" side="bottom">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            void createFolderInline();
                        }}
                        className="h-7 w-7 shrink-0 rounded-md hover:bg-white/10 flex items-center justify-center"
                    >
                        <MaterialIcon icon="create_new_folder" size={16} />
                    </button>
                </FsExplorerTooltip>
                <FsExplorerTooltip content="Seçili öğeyi çöp kutusuna gönder" side="bottom">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            void deleteSelected();
                        }}
                        className="h-7 w-7 shrink-0 rounded-md hover:bg-white/10 flex items-center justify-center"
                    >
                        <MaterialIcon icon="delete" size={16} />
                    </button>
                </FsExplorerTooltip>
                <FsExplorerTooltip
                    content={
                        signedOnly
                            ? 'İmzalı UDF filtresini kapat'
                            : `Bilinen imzalı UDF: ${udfStats.signed}/${udfStats.total}. Güvenli modda klasör tararken UDF paketleri okunmaz.`
                    }
                    side="bottom"
                >
                    <button
                        type="button"
                        aria-pressed={signedOnly}
                        onClick={(e) => {
                            e.stopPropagation();
                            setSignedOnly((v) => !v);
                        }}
                        className={`h-7 shrink-0 px-2 rounded-md text-[10px] whitespace-nowrap inline-flex items-center gap-1 border ${
                            signedOnly
                                ? 'bg-amber-300/15 border-amber-300/30 text-amber-200'
                                : 'bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10'
                        }`}
                    >
                        <ESignatureBadgeIcon size={14} aria-hidden />
                        <span>{compactToolbar ? udfStats.signed : `Bilinen ${udfStats.signed}`}</span>
                    </button>
                </FsExplorerTooltip>
                {compactToolbar ? (
                    <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <PopoverTrigger asChild>
                                    <button
                                        type="button"
                                        className="h-7 w-7 shrink-0 rounded-md hover:bg-white/10 flex items-center justify-center ml-auto"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <MaterialIcon icon="search" size={18} />
                                    </button>
                                </PopoverTrigger>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" variant="default" className={FS_EXPLORER_TOOLTIP_CONTENT}>
                                Dosya ve klasörleri filtrele
                            </TooltipContent>
                        </Tooltip>
                        <PopoverContent align="end" className="w-64 p-2 glass border-white/10" variant="glass">
                            <Input
                                variant="glass"
                                value={filterQuery}
                                onChange={(e) => setFilterQuery(e.target.value)}
                                placeholder="Filtrele…"
                                className="h-8 text-xs"
                                autoFocus
                            />
                        </PopoverContent>
                    </Popover>
                ) : (
                    <FsExplorerTooltip content="Dosya ve klasörleri filtrele" side="bottom">
                        <input
                            value={filterQuery}
                            onChange={(e) => setFilterQuery(e.target.value)}
                            placeholder="Filtrele…"
                            className="flex-1 min-w-[72px] max-w-[160px] h-7 rounded-md bg-white/5 border border-white/10 px-2 text-[11px] outline-none focus:border-primary/40 ml-auto"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </FsExplorerTooltip>
                )}
                <FsExplorerTooltip
                    content={sortMode === 'modified' ? 'Ada göre sırala (A-Z)' : 'Değişim tarihine göre sırala'}
                    side="bottom"
                >
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setSortMode((s) => (s === 'name' ? 'modified' : 'name'));
                        }}
                        className="h-7 shrink-0 px-1.5 rounded-md hover:bg-white/10 text-[10px] whitespace-nowrap"
                    >
                        {sortMode === 'modified' ? 'Tarih' : 'A-Z'}
                    </button>
                </FsExplorerTooltip>
            </div>
            <div className="flex-1 min-h-0 flex flex-col min-w-0 overflow-hidden" ref={setContainerNode}>
                {!workspaceRoot ? (
                    <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground px-4 text-center min-h-0">
                        Bir çalışma klasörü seçin.
                    </div>
                ) : loading || !dndRootElement ? (
                    <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground min-h-0">Yükleniyor...</div>
                ) : (
                    <Tree<ExplorerNode>
                        ref={treeApiRef}
                        key={workspaceRoot}
                        data={filtered}
                        width={Math.max(1, measuredWidth)}
                        height={Math.max(120, containerHeight)}
                        dndRootElement={dndRootElement}
                        rowHeight={28}
                        indent={20}
                        paddingTop={6}
                        paddingBottom={6}
                        openByDefault={false}
                        initialOpenState={{ [workspaceRoot]: true }}
                        childrenAccessor={(d) => (d.isDirectory ? (d.children ?? []) : null)}
                        disableDrop={(args: { parentNode?: { data?: { isDirectory?: boolean } } }) => !args.parentNode?.data?.isDirectory}
                        onMove={async (args: { parentId?: string | null; dragIds: string[] }) => {
                            const parentId = String(args.parentId ?? workspaceRoot ?? '');
                            if (!parentId) return;
                            const parentNode = findByPath(treeData, parentId);
                            const parentPath = parentNode?.path ?? workspaceRoot ?? '';
                            if (!parentPath) return;
                            for (const dragId of args.dragIds as string[]) {
                                const src = findByPath(treeData, dragId);
                                if (!src) continue;
                                const target = joinFsPath(parentPath, getBaseName(src.path));
                                if (target === src.path) continue;
                                await FileSystemService.renamePath(src.path, target);
                            }
                            await refreshAll();
                        }}
                        onSelect={(nodes) => {
                            const nextPath = nodes[0]?.data.path ?? null;
                            if (pendingRenameRef.current && pendingRenameRef.current.path !== nextPath) {
                                clearPendingRename();
                            }
                            setSelectedPath(nextPath);
                        }}
                        onToggle={(id) => {
                            clearPendingRename();
                            const n = findByPath(treeDataRef.current, String(id));
                            if (n?.isDirectory && !n.childrenLoaded) void loadDirChildren(n.path);
                        }}
                    >
                        {Row}
                    </Tree>
                )}
            </div>
            </div>
            <FsExplorerTooltip content="Genişliği sürükleyerek ayarlayın" side="left">
                <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Dosya gezgini genişliğini ayarla"
                    onMouseDown={onResizeHandleMouseDown}
                    className="w-1.5 shrink-0 cursor-col-resize hover:bg-white/15 active:bg-white/25 rounded-full my-3 self-stretch border border-transparent box-border"
                />
            </FsExplorerTooltip>

            <Dialog open={inputDialog !== null} onOpenChange={(o) => !o && setInputDialog(null)}>
                <DialogContent className="glass-panel border-white/10 sm:max-w-md" variant="glass">
                    <DialogHeader>
                        <DialogTitle>
                            {inputDialog?.kind === 'tagAdd' && 'Etiket ekle'}
                            {inputDialog?.kind === 'tagRemove' && 'Etiket kaldır'}
                        </DialogTitle>
                    </DialogHeader>
                    <Input
                        variant="glass"
                        value={inputDialogValue}
                        onChange={(e) => setInputDialogValue(e.target.value)}
                        placeholder="Etiket"
                        className="h-9 text-sm"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                void submitInputDialog();
                            }
                        }}
                        autoFocus
                    />
                    <DialogFooter className="gap-2 sm:gap-2">
                        <Button type="button" variant="outline" onClick={() => setInputDialog(null)}>
                            İptal
                        </Button>
                        <Button type="button" onClick={() => void submitInputDialog()}>
                            Tamam
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={deleteConfirmPath !== null} onOpenChange={(o) => !o && setDeleteConfirmPath(null)}>
                <AlertDialogContent variant="glass" className="glass-panel border-white/10">
                    <AlertDialogHeader>
                        <AlertDialogTitle> {deleteConfirmPath ? findByPath(treeData, deleteConfirmPath)?.name ?? deleteConfirmPath : ''} silinsin mi? </AlertDialogTitle>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>İptal</AlertDialogCancel>
                        <Button variant="destructive" onClick={() => void confirmDelete()}>
                            Onayla
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
        </TooltipProvider>
    );
};


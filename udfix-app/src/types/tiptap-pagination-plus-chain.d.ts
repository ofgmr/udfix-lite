import '@tiptap/core';

/**
 * PaginationPlus registers these on the TipTap command chain (flat merge).
 * Package `Commands` augmentation nests under `PaginationPlus`, which does not match runtime.
 */
declare module '@tiptap/core' {
    interface ChainedCommands {
        updateHeaderContent: (left: string, right: string, pageNumber?: number) => ChainedCommands;
        updateFooterContent: (left: string, right: string, pageNumber?: number) => ChainedCommands;
    }
}

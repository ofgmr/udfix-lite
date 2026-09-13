import { create } from 'zustand';

type ClientReportUiState = {
    open: boolean;
    partyId: string | null;
    partyName: string;
    openReport: (partyId: string, partyName?: string) => void;
    setOpen: (open: boolean) => void;
};

export const useClientReportUiStore = create<ClientReportUiState>((set) => ({
    open: false,
    partyId: null,
    partyName: '',
    openReport: (partyId, partyName) =>
        set({
            open: true,
            partyId,
            partyName: String(partyName || '').trim(),
        }),
    setOpen: (open) =>
        set(
            open
                ? { open: true }
                : { open: false, partyId: null, partyName: '' },
        ),
}));

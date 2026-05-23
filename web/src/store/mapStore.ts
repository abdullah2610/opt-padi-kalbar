import { create } from 'zustand';
import type { IndexName } from '@/lib/types';

interface MapState {
  selectedKabupatenId: string | null;
  activeIndex: IndexName;
  compositeDate: string | null;
  bottomSheetOpen: boolean;
  setSelectedKabupaten: (id: string | null) => void;
  setActiveIndex: (index: IndexName) => void;
  setCompositeDate: (date: string | null) => void;
  setBottomSheetOpen: (open: boolean) => void;
}

export const useMapStore = create<MapState>((set) => ({
  selectedKabupatenId: null,
  activeIndex: 'ndvi',
  compositeDate: null,
  bottomSheetOpen: false,
  setSelectedKabupaten: (id) => set({ selectedKabupatenId: id, bottomSheetOpen: id !== null }),
  setActiveIndex: (index) => set({ activeIndex: index }),
  setCompositeDate: (date) => set({ compositeDate: date }),
  setBottomSheetOpen: (open) => set({ bottomSheetOpen: open })
}));

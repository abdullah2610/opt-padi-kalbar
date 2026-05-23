import MapView from '@/components/MapView';
import LayerSwitcher from '@/components/LayerSwitcher';
import DateSlider from '@/components/DateSlider';
import KabupatenSheet from '@/components/KabupatenSheet';

export default function MapPage() {
  return (
    <div className="relative h-full w-full">
      <MapView />
      <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-xs safe-top">
        <DateSlider />
      </div>
      <div className="pointer-events-none absolute right-3 top-3 z-10 safe-top md:right-16">
        <LayerSwitcher />
      </div>
      <KabupatenSheet />
    </div>
  );
}

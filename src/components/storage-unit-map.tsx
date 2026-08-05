"use client";

export type StorageMapUnit = {
  id: string;
  storeganise_user_id: string;
  unit_number: string;
  sourceUnitNumber: string;
  map_zone: string | null;
  free: boolean;
  synthetic: boolean;
  occupied?: boolean;
  occupantName?: string;
};

export const storageCodes = [
  ...Array.from({ length: 19 }, (_, index) => `B${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 18 }, (_, index) => `A${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 20 }, (_, index) => `D${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 20 }, (_, index) => `E${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 36 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 5 }, (_, index) => `F${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 5 }, (_, index) => `G${String(index + 1).padStart(2, "0")}`),
];

export function StorageUnitMap({ units, ownedUnitIds, selectedIds, onSelect, description = "Selecciona una o varias bodegas para incluirlas en el documento." }: {
  units: StorageMapUnit[];
  ownedUnitIds: Set<string>;
  selectedIds: string[];
  onSelect: (unit: StorageMapUnit, owned: boolean) => void;
  description?: string;
}) {
  const byCode = new Map(units.map((unit) => [unit.unit_number, unit]));
  const button = (code: string) => {
    const unit = byCode.get(code);
    if (!unit) return null;
    const owned = ownedUnitIds.has(unit.id);
    const selected = selectedIds.includes(unit.id);
    return (
      <button key={code} type="button" title={`Bodega ${code} · ${unit.occupied ? `Ocupada por ${unit.occupantName}` : owned ? "Asignada al cliente" : "Libre"}`} onClick={() => onSelect(unit, owned)}
        className={`flex min-h-0 min-w-0 items-center justify-center overflow-hidden border border-black/15 text-[clamp(5px,1.35vw,8px)] font-semibold transition hover:brightness-95 ${selected ? "z-10 bg-[#004B13] text-white ring-2 ring-emerald-300" : unit.occupied ? "bg-[#8f8f8f] text-slate-950" : "bg-[#59c35b] text-slate-950"}`}>
        <span className="-rotate-90 whitespace-nowrap leading-none">{code}</span>
      </button>
    );
  };
  const vertical = (codes: string[]) => codes.map(button);
  const bTop = Array.from({ length: 8 }, (_, index) => `B${String(index + 1).padStart(2, "0")}`);
  const bBottom = Array.from({ length: 11 }, (_, index) => `B${String(index + 9).padStart(2, "0")}`);
  const aTop = Array.from({ length: 8 }, (_, index) => `A${String(index + 1).padStart(2, "0")}`);
  const aBottom = ["A18", "A17", "A16", "A15", "A14", "A13", "A12", "A11", "A10", "A09"];
  const cLeft = Array.from({ length: 18 }, (_, index) => `C${String(36 - index).padStart(2, "0")}`);
  const cRight = Array.from({ length: 18 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`);

  return (
    <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-3"><h3 className="font-black text-slate-950">Mapa de bodegas</h3><p className="text-xs text-slate-500">{description}</p></div>
      <div className="relative mx-auto w-full max-w-[650px] overflow-hidden border border-slate-200 bg-white" style={{ aspectRatio: "706 / 395" }}>
        <div className="absolute left-1/2 top-1/2" style={{ width: "55.95%", height: "178.73%", transform: "translate(-50%, -50%) rotate(90deg)" }}><div className="relative h-full w-full">
          <div className="absolute grid grid-rows-[32fr_20fr] gap-[10px]" style={{ left: "1%", top: "0.8%", width: "41.5%", height: "8.9%" }}><div className="grid grid-cols-8">{bTop.map(button)}</div><div className="mr-[12%] grid" style={{ gridTemplateColumns: "repeat(7,1fr) repeat(3,1.55fr) 1fr" }}>{bBottom.map(button)}</div></div>
          <div className="absolute grid grid-rows-[32fr_20fr] gap-[10px]" style={{ left: "55.2%", top: "0.8%", width: "41.8%", height: "8.9%" }}><div className="grid grid-cols-8">{aTop.map(button)}</div><div className="ml-[12%] grid" style={{ gridTemplateColumns: "repeat(6,1fr) repeat(4,1.55fr)" }}>{aBottom.map(button)}</div></div>
          <div className="absolute grid grid-rows-9" style={{ left: "1%", top: "11.7%", width: "13%", height: "25.9%" }}>{vertical(Array.from({ length: 9 }, (_, index) => `D${String(index + 1).padStart(2, "0")}`))}</div>
          <div className="absolute grid grid-rows-11" style={{ left: "1%", top: "43.8%", width: "13%", height: "31.7%" }}>{vertical(Array.from({ length: 11 }, (_, index) => `D${String(index + 10).padStart(2, "0")}`))}</div>
          <div className="absolute grid grid-rows-9" style={{ left: "84.3%", top: "11.7%", width: "13.2%", height: "25.9%" }}>{vertical(Array.from({ length: 9 }, (_, index) => `E${String(index + 1).padStart(2, "0")}`))}</div>
          <div className="absolute grid grid-rows-11" style={{ left: "84.3%", top: "43.8%", width: "13.2%", height: "31.7%" }}>{vertical(Array.from({ length: 11 }, (_, index) => `E${String(index + 10).padStart(2, "0")}`))}</div>
          <div className="absolute grid grid-cols-2" style={{ left: "37.2%", top: "17.7%", width: "26.1%", height: "52.1%" }}><div className="grid grid-rows-[repeat(18,minmax(0,1fr))]">{vertical(cLeft)}</div><div className="grid grid-rows-[repeat(18,minmax(0,1fr))]">{vertical(cRight)}</div></div>
          <div className="absolute grid grid-rows-5" style={{ left: "1%", top: "77.5%", width: "25.8%", height: "22%" }}>{vertical(Array.from({ length: 5 }, (_, index) => `F${String(index + 1).padStart(2, "0")}`))}</div>
          <div className="absolute grid grid-rows-5" style={{ left: "71.6%", top: "77.5%", width: "26.1%", height: "22%" }}>{vertical(Array.from({ length: 5 }, (_, index) => `G${String(index + 1).padStart(2, "0")}`))}</div>
        </div></div>
      </div>
    </div>
  );
}

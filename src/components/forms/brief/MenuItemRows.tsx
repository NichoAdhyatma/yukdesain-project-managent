import { menuPriceLabel } from "./menu-items";

type MenuRow = { id?: string; name: string; price?: string | number; caption?: string };

/**
 * Daftar menu tanpa foto sebagai baris (nama kiri, harga kanan). Menu dari WhatsApp umumnya tanpa foto per item; kartu
 * grid di panel sempit membuat nama patah per huruf.
 */
export function MenuItemRows({ items }: { items: MenuRow[] }) {
  return (
    <ul className="divide-y rounded-lg border">
      {items.map((item, idx) => {
        const price = menuPriceLabel(item.price);
        return (
          <li key={item.id || idx} className="flex items-start justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm break-words">{item.name || "-"}</p>
              {item.caption && <p className="mt-0.5 text-xs text-muted-foreground break-words">{item.caption}</p>}
            </div>
            {price && <p className="shrink-0 text-sm text-muted-foreground tabular-nums">{price}</p>}
          </li>
        );
      })}
    </ul>
  );
}

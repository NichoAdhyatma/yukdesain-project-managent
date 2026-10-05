import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 text-center px-4">
      <div className="flex flex-col items-center gap-3">
        <FileQuestion className="h-16 w-16 text-muted-foreground" />
        <h1 className="text-4xl font-bold text-foreground">404</h1>
        <h2 className="text-xl font-semibold text-foreground">Halaman Tidak Ditemukan</h2>
        <p className="text-muted-foreground max-w-sm">
          Halaman yang kamu cari tidak tersedia atau telah dipindahkan.
        </p>
      </div>
      <Link href="/dashboard">
        <Button>
          Kembali ke Dashboard
        </Button>
      </Link>
    </div>
  );
}

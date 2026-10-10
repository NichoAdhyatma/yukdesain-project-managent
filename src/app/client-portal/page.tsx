"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Loader2, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function ClientPortalPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/portal/lookup?code=${encodeURIComponent(code.trim())}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Kode tidak ditemukan. Pastikan kode yang dimasukkan benar.");
        setLoading(false);
        return;
      }

      // Redirect to tracking page with token
      window.location.href = `/client/${data.token}`;
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-8">
        {/* Brand */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-foreground">YukDesain Studio</h1>
          <p className="text-sm text-muted-foreground">Client Portal</p>
        </div>

        {/* Lookup Card */}
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-lg">Lacak Pesanan</CardTitle>
            <CardDescription>
              Masukkan kode project yang telah diberikan oleh designer
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleLookup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Kode Project</Label>
                <Input
                  id="code"
                  placeholder="Contoh: PRJ-20261010-001"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="text-center font-mono text-base tracking-wider"
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive text-center bg-destructive/10 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={loading || !code.trim()}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Mencari...
                  </>
                ) : (
                  <>
                    Lacak Pesanan
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Info */}
        <div className="text-center space-y-2">
          <p className="text-xs text-muted-foreground">
            Kode project diberikan oleh designer setelah brief diterima.
          </p>
          <p className="text-xs text-muted-foreground">
            Contoh: <code className="font-mono bg-muted px-1.5 py-0.5 rounded">PRJ-20261010-001</code>
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { login } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await login(email, password);

      if (result.success) {
        window.location.href = redirectTo;
      } else {
        setError(result.error);
      }
    } catch {
      setError("Terjadi kesalahan");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 w-12 h-12 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-primary-foreground font-bold text-lg">YD</span>
        </div>
        <CardTitle className="text-2xl">Masuk</CardTitle>
        <CardDescription>
          YukDesain Studio Portal
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Memuat..." : "Masuk"}
          </Button>
        </form>

        <div className="mt-6 p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground space-y-3">
          <div>
            <p className="font-medium mb-1">Demo Login Owner:</p>
            <p>Email: owner@yukdesain.com</p>
            <p>Password: admin123</p>
          </div>
          <div>
            <p className="font-medium mb-1">Demo Login Designer:</p>
            <p>Email: rina@yukdesain.com (full-time)</p>
            <p>Email: budi@yukdesain.com (freelancer)</p>
            <p>Password: admin123</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Suspense fallback={
        <Card className="w-full max-w-md flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </Card>
      }>
        <LoginForm />
      </Suspense>
    </div>
  );
}

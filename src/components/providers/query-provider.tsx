"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, createContext, useContext, type ReactNode } from "react";

interface LoadingContextValue {
  isGlobalFetching: boolean;
  setGlobalFetching: (v: boolean) => void;
}

const LoadingContext = createContext<LoadingContextValue>({
  isGlobalFetching: false,
  setGlobalFetching: () => {},
});

export function useGlobalFetching() {
  return useContext(LoadingContext);
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );
  const [isGlobalFetching, setGlobalFetching] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <LoadingContext.Provider value={{ isGlobalFetching, setGlobalFetching }}>
        {children}
      </LoadingContext.Provider>
    </QueryClientProvider>
  );
}

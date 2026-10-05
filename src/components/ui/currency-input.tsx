"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface CurrencyInputProps {
  value?: number;
  onChange: (value: number) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  required?: boolean;
}

function formatRupiahDisplay(value: number | string): string {
  if (!value && value !== 0) return "";
  const num = typeof value === "string" ? parseInt(value.replace(/\D/g, ""), 10) || 0 : value;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export function CurrencyInput({
  value,
  onChange,
  placeholder = "0",
  className,
  disabled,
  id,
}: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync display when value prop changes (e.g., form reset)
  useEffect(() => {
    if (!isFocused) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayValue(value ? formatRupiahDisplay(value) : "");
    }
  }, [value, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, "");
    const num = parseInt(raw, 10) || 0;
    setDisplayValue(raw ? formatRupiahDisplay(num) : "");
    onChange(num);
  };

  const handleFocus = () => {
    setIsFocused(true);
    // Show raw number on focus for easy editing
    setDisplayValue(value ? String(value) : "");
    // Move cursor to end
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.setSelectionRange(inputRef.current.value.length, inputRef.current.value.length);
      }
    }, 0);
  };

  const handleBlur = () => {
    setIsFocused(false);
    setDisplayValue(value ? formatRupiahDisplay(value) : "");
  };

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive md:text-sm dark:bg-input/30 dark:disabled:bg-input/80",
        className
      )}
    />
  );
}

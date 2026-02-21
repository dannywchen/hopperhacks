"use client";

import { CornerRightUp } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAutoResizeTextarea } from "@/components/hooks/use-auto-resize-textarea";

interface AIInputWithLoadingProps {
  id?: string;
  placeholder?: string;
  minHeight?: number;
  maxHeight?: number;
  loadingDuration?: number;
  thinkingDuration?: number;
  onSubmit?: (value: string) => void | Promise<void>;
  className?: string;
  autoAnimate?: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
  submitting?: boolean;
  disabled?: boolean;
  hintText?: string | null;
  submittedText?: string;
  showStatusText?: boolean;
  inlineAction?: ReactNode;
}

export function AIInputWithLoading({
  id = "ai-input-with-loading",
  placeholder = "Ask me anything!",
  minHeight = 56,
  maxHeight = 200,
  loadingDuration = 3000,
  thinkingDuration = 1000,
  onSubmit,
  className,
  autoAnimate = false,
  value,
  onValueChange,
  submitting,
  disabled = false,
  hintText = null,
  submittedText = "Thinking...",
  showStatusText = true,
  inlineAction,
}: AIInputWithLoadingProps) {
  const [internalValue, setInternalValue] = useState("");
  const [internalSubmitted, setInternalSubmitted] = useState(autoAnimate);
  const [isAnimating, setIsAnimating] = useState(autoAnimate);
  const isValueControlled = typeof value === "string";
  const inputValue = isValueControlled ? value : internalValue;
  const isSubmitted = submitting ?? internalSubmitted;
  const isDisabled = disabled || isSubmitted;

  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight,
    maxHeight,
  });

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | undefined;

    const runAnimation = () => {
      if (!isAnimating) return;
      setInternalSubmitted(true);
      timeoutId = setTimeout(() => {
        setInternalSubmitted(false);
        timeoutId = setTimeout(runAnimation, thinkingDuration);
      }, loadingDuration);
    };

    if (isAnimating && typeof submitting === "undefined") {
      runAnimation();
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isAnimating, loadingDuration, thinkingDuration, submitting]);

  useEffect(() => {
    adjustHeight();
  }, [adjustHeight, inputValue]);

  const canSubmit = useMemo(
    () => Boolean(inputValue.trim()) && !isDisabled,
    [inputValue, isDisabled],
  );

  const updateValue = (nextValue: string) => {
    if (!isValueControlled) {
      setInternalValue(nextValue);
    }
    onValueChange?.(nextValue);
  };

  const handleSubmit = async () => {
    if (!inputValue.trim() || isDisabled) return;
    if (typeof submitting === "undefined") {
      setInternalSubmitted(true);
      setIsAnimating(false);
    }

    await onSubmit?.(inputValue);
    updateValue("");
    adjustHeight(true);

    if (typeof submitting === "undefined") {
      setTimeout(() => {
        setInternalSubmitted(false);
      }, loadingDuration);
    }
  };

  return (
    <div className={cn("w-full py-2", className)}>
      <div className="relative flex w-full flex-col items-start gap-2">
        <div className="relative w-full">
          <Textarea
            id={id}
            placeholder={placeholder}
            className={cn(
              "w-full rounded-2xl border-0 bg-zinc-800/70 px-4 py-3 pb-12",
              inlineAction ? "pr-28" : "pr-16",
              "text-zinc-100 placeholder:text-zinc-500",
              "resize-none leading-[1.35]",
              "focus-visible:ring-0 focus-visible:ring-offset-0",
            )}
            style={{ minHeight: `${minHeight}px` }}
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => {
              updateValue(e.target.value);
              adjustHeight();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            disabled={isDisabled}
          />
          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            {inlineAction ? (
              <div className="inline-flex h-9 w-9 items-center justify-center">
                {inlineAction}
              </div>
            ) : null}
            <button
              onClick={() => void handleSubmit()}
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-full transition",
                canSubmit
                  ? "bg-zinc-100 text-zinc-900 hover:bg-white"
                  : "bg-zinc-700/60 text-zinc-500",
              )}
              type="button"
              disabled={!canSubmit}
            >
              {isSubmitted ? (
                <div
                  className="h-4 w-4 animate-spin rounded-[4px] bg-zinc-900/90 transition duration-700"
                  style={{ animationDuration: "1.8s" }}
                />
              ) : (
                <CornerRightUp
                  className={cn(
                    "h-5 w-5 transition-opacity",
                    inputValue.trim() ? "opacity-100" : "opacity-40",
                  )}
                />
              )}
            </button>
          </div>
        </div>
        {showStatusText && (isSubmitted || hintText) ? (
          <p className="h-4 pl-1 text-xs text-zinc-500">
            {isSubmitted ? submittedText : hintText}
          </p>
        ) : null}
      </div>
    </div>
  );
}

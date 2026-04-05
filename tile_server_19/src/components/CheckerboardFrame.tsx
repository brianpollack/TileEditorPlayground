"use client";

import { checkerboardSurfaceClass, cx } from "./uiStyles";

interface CheckerboardFrameProps {
  children?: React.ReactNode;
  className?: string;
  size?: "sm" | "md";
}

export function CheckerboardFrame({
  children,
  className,
  size = "sm"
}: CheckerboardFrameProps) {
  return <div className={cx(checkerboardSurfaceClass(size), className)}>{children}</div>;
}

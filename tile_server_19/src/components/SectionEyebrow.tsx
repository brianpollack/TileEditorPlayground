"use client";

import { cx, sectionEyebrowClass } from "./uiStyles";

interface SectionEyebrowProps {
  children: React.ReactNode;
  className?: string;
}

export function SectionEyebrow({ children, className }: SectionEyebrowProps) {
  return <div className={cx(sectionEyebrowClass, className)}>{children}</div>;
}

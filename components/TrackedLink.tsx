"use client";

import { track } from "@vercel/analytics";
import Link from "next/link";
import type { ComponentProps } from "react";

type TrackedLinkProps = ComponentProps<typeof Link> & {
  eventName: "facebook_click" | "instagram_click" | "whatsapp_channel_click";
};

export function TrackedLink({ eventName, onClick, ...props }: TrackedLinkProps) {
  return (
    <Link
      {...props}
      onClick={(event) => {
        onClick?.(event);
        track(eventName);
      }}
    />
  );
}

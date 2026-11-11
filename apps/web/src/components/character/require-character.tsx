import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { QuickSetup } from "@/components/character/quick-setup";
import { useProfile } from "@/lib/game/profile-context";

/** Pages built around one character show the setup form until there is one. */
export function RequireCharacter({
  title,
  why,
  children,
}: {
  title: string;
  /** one line on what the page does once a character exists */
  why: string;
  children: ReactNode;
}) {
  const { profile } = useProfile();
  if (profile) return children;
  return (
    <>
      <PageHeader title={title}>{why}</PageHeader>
      <QuickSetup />
    </>
  );
}

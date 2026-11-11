import { useState } from "react";
import { Link, useLocation } from "react-router";
import { Info, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { readShared } from "@/lib/game/characters";
import { specName } from "@rogo/game/classes";
import { useProfile } from "@/lib/game/profile-context";
import { short } from "@/lib/format";

/** Above every page but the character page: whose numbers these are, and how to make them yours. */
export function CharacterBanner() {
  const { profile } = useProfile();
  const { pathname } = useLocation();
  if (pathname === "/character") return null;
  // only pages whose numbers come from your stats carry the notice
  const personal = ["/planner", "/progression", "/stages", "/modes", "/skills"].some((p) =>
    pathname.startsWith(p),
  );
  if (!personal) return null;
  if (!profile)
    return (
      <div className="game-panel flex flex-wrap items-center gap-x-block gap-y-3">
        <span className="grid min-w-0 flex-[1_1_20rem] gap-1">
          <span className="font-heading text-base font-semibold">No character yet</span>
          <span className="text-sm text-muted-foreground">
            Stage estimates below are for a typical build. Add your class, level and power to see
            your own progress, damage and upgrade plan.
          </span>
        </span>
        <Button asChild>
          <Link to="/character">
            <UserPlus aria-hidden /> Set up your character
          </Link>
        </Button>
      </div>
    );
  if (profile.statsSource === "estimated")
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-sm">
        <Info className="size-4 shrink-0 text-gold" aria-hidden />
        <span className="min-w-0 flex-[1_1_16rem]">
          {profile.name}'s stats are estimated from power. Enter them from Attribute Details for
          exact damage numbers.
        </span>
        <Button asChild size="sm" variant="outline">
          <Link to="/character">Enter stats</Link>
        </Button>
      </div>
    );
  return null;
}

/** Opening a share link asks before adding the character it carries. */
export function SharedCharacterDialog() {
  const { add } = useProfile();
  const [shared, setShared] = useState(() => readShared(window.location.hash));
  const close = () => {
    setShared(null);
    history.replaceState(null, "", window.location.pathname + window.location.search);
  };
  return (
    <AlertDialog open={!!shared} onOpenChange={(open) => !open && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Add {shared?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This link carries a character: {shared && specName(shared.spec)}, level {shared?.level},{" "}
            {shared && short(shared.power)} power. Adding it saves a copy in this browser; nothing
            is sent anywhere.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Not now</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (shared) {
                const c = add(shared);
                toast.success(`${c.name} added`);
              }
              close();
            }}
          >
            Add character
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

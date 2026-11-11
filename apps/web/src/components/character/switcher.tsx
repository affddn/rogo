import { useRef } from "react";
import { useNavigate } from "react-router";
import { ChevronsUpDown, FileUp, Settings2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { SpecIcon } from "@/components/game-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { readCharacterFile } from "@/lib/game/character-files";
import { useProfile } from "@/lib/game/profile-context";
import { specInfo } from "@rogo/game/classes";
import { short } from "@/lib/format";

/** Sidebar footer: the active character, and a menu to switch, add or import. */
export function CharacterSwitcher() {
  const { profile, characters, select, add } = useProfile();
  const navigate = useNavigate();
  const file = useRef<HTMLInputElement>(null);

  if (!profile)
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            tooltip="Set up your character"
            onClick={() => navigate("/character")}
            className="border border-dashed border-gold/50"
          >
            <UserPlus className="size-5! shrink-0 text-gold" aria-hidden />
            <span className="grid min-w-0 leading-tight">
              <span className="truncate font-medium">Set up your character</span>
              <span className="truncate text-xs text-sidebar-foreground/70">
                Class, level, power
              </span>
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent"
              tooltip={profile.name}
            >
              <SpecIcon spec={profile.spec} className="size-8 shrink-0" />
              <span className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate font-medium">{profile.name}</span>
                <span className="tabular truncate text-xs text-sidebar-foreground/70">
                  Lv {profile.level} · {short(profile.power)} power
                </span>
              </span>
              <ChevronsUpDown className="ml-auto size-4 opacity-60" aria-hidden />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-64">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Characters
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup value={profile.id} onValueChange={select}>
              {characters.map((c) => (
                <DropdownMenuRadioItem key={c.id} value={c.id}>
                  <span className="grid min-w-0 leading-tight">
                    <span className="truncate">{c.name}</span>
                    <span className="tabular text-xs text-muted-foreground">
                      {specInfo(c.spec)?.name} · Lv {c.level} · {short(c.power)}
                    </span>
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate("/character?new=1")}>
              <UserPlus aria-hidden /> New character
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => file.current?.click()}>
              <FileUp aria-hidden /> Import from file…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate("/character")}>
              <Settings2 aria-hidden /> Edit character
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              const list = await readCharacterFile(f);
              if (!list.length) throw new Error("no characters");
              list.forEach(add);
              toast.success(
                list.length === 1
                  ? `${list[0].name} imported`
                  : `${list.length} characters imported`,
              );
            } catch {
              toast.error("That file isn't a character saved by this guide", {
                description: "Use a .json file from Character → Save to file.",
              });
            }
          }}
        />
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

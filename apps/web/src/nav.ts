import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Bot,
  Castle,
  Crown,
  GalleryVerticalEnd,
  Shield,
  Flame,
  Swords,
  Compass,
  Database,
  Terminal,
  Gem,
  Package,
  Sparkles,
  UserRound,
} from "lucide-react";

export interface NavEntry {
  to: string;
  label: string;
  icon: LucideIcon;
  /** one line for the overview's index of pages */
  blurb: string;
  end?: boolean;
}

export const NAV: { group: string; items: NavEntry[] }[] = [
  {
    group: "Your character",
    items: [
      { to: "/", label: "Overview", icon: Compass, end: true, blurb: "Where you stand." },
      {
        to: "/character",
        label: "Character",
        icon: UserRound,
        blurb: "Your stats in, power and per-hit damage out. Keep several characters.",
      },
      {
        to: "/cards",
        label: "Card album",
        icon: GalleryVerticalEnd,
        blurb: "Tick the cards you own and their stars; see your album bonus.",
      },
      {
        to: "/daily",
        label: "Daily optimizer",
        icon: Sparkles,
        blurb: "Check live rewards, sweeps and mode challenges.",
      },
      {
        to: "/automation",
        label: "Automation",
        icon: Bot,
        blurb: "A long-running job that pushes the campaign and shows what it does in a console.",
      },
      {
        to: "/planner",
        label: "Planner",
        icon: Sparkles,
        blurb: "Which upgrade, stat point or card moves you through your next stage fastest.",
      },
    ],
  },
  {
    group: "Progression",
    items: [
      {
        to: "/progression",
        label: "Stage progression",
        icon: Castle,
        blurb: "Power to clear every campaign stage, the walls, and each stage's enemies.",
      },
      {
        to: "/modes",
        label: "Game modes",
        icon: Crown,
        blurb:
          "MVP, Endless Tower, realms, dungeons and the world boss, matched to campaign stages.",
      },
    ],
  },
  {
    group: "Gear and growth",
    items: [
      {
        to: "/equipment",
        label: "Equipment",
        icon: Shield,
        blurb:
          "Item stats by grade and level, refine odds and expected cost, enhance, enchant odds.",
      },
      {
        to: "/systems",
        label: "Weapons, pets and more",
        icon: Swords,
        blurb: "Weapons by star, Collection Gear sets, pets, awakening, guild skills and costumes.",
      },
      {
        to: "/skills",
        label: "Skills and jobs",
        icon: Flame,
        blurb:
          "Skill trees with + and − per level, the best next skill point, job changes and levels.",
      },
    ],
  },
  {
    group: "Reference",
    items: [
      {
        to: "/operations",
        label: "Game actions",
        icon: Terminal,
        blurb: "Inspect gateway requests and run individual operations on a connected character.",
      },
      {
        to: "/items",
        label: "Items and drops",
        icon: Package,
        blurb: "Every item, card and pet, and where each one drops, sells or comes from.",
      },
      {
        to: "/summons",
        label: "Summons and shops",
        icon: Gem,
        blurb: "Summon rates, pity and level-ups, and every shop's goods and limits.",
      },
      {
        to: "/formulas",
        label: "Formulas",
        icon: BookOpen,
        blurb: "Damage, power, attribute and clear rules, with their source in the game code.",
      },
      {
        to: "/data",
        label: "Game data",
        icon: Database,
        blurb: "Searchable monsters, cards and attributes.",
      },
    ],
  },
];

export const ALL_NAV = NAV.flatMap((g) => g.items);

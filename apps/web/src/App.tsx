import {
  BrowserRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useMatch,
  useResolvedPath,
} from "react-router";
import { Moon, Sun } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import { SharedCharacterDialog } from "@/components/character/banners";
import { CharacterSwitcher } from "@/components/character/switcher";
import { ProfileProvider } from "@/lib/game/profile-context";
import { useGameData } from "@/lib/game/data";
import { GameDataProvider } from "@/lib/game/game-data-context";
import { useTheme } from "@/hooks/use-theme";
import { LoadingState, ErrorState } from "@/components/states";
import { lazy, Suspense } from "react";
import { ALL_NAV, NAV, type NavEntry } from "@/nav";

// one chunk per page: charts and tables load with the page that uses them
const OverviewPage = lazy(() => import("@/pages/overview"));
const ProgressionPage = lazy(() => import("@/pages/progression"));
const StagePage = lazy(() => import("@/pages/stage"));
const FormulasPage = lazy(() => import("@/pages/formulas"));
const CharacterPage = lazy(() => import("@/pages/character"));
const PlannerPage = lazy(() => import("@/pages/planner"));
const CardsPage = lazy(() => import("@/pages/cards"));
const EquipmentPage = lazy(() => import("@/pages/equipment"));
const SystemsPage = lazy(() => import("@/pages/systems"));
const SkillsPage = lazy(() => import("@/pages/skills"));
const ModesPage = lazy(() => import("@/pages/modes"));
const ItemsPage = lazy(() => import("@/pages/items"));
const SummonsPage = lazy(() => import("@/pages/summons"));
const DailyPage = lazy(() => import("@/pages/daily"));
const OperationsPage = lazy(() => import("@/pages/operations"));
const DataPage = lazy(() => import("@/pages/data"));

function NavItem({ to, label, icon: Icon, end }: NavEntry) {
  const resolved = useResolvedPath(to);
  const active = useMatch({ path: resolved.pathname, end: end ?? false }) !== null;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={label}>
        <NavLink to={to} end={end}>
          <Icon aria-hidden />
          <span>{label}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="pt-[max(0.5rem,env(safe-area-inset-top))] pl-[max(0.5rem,env(safe-area-inset-left))]">
        <div className="flex items-center gap-3 px-1 py-2">
          <img
            src="/game/ui/icon_combat_power.png"
            alt=""
            width={56}
            height={52}
            className="size-9 shrink-0 object-contain drop-shadow"
          />
          <div className="grid leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-heading text-base font-semibold text-gold">Ragnarok GO</span>
            <span className="text-xs tracking-[0.12em] text-sidebar-foreground/70 uppercase">
              Adventurer's guide
            </span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {NAV.map((g) => (
          <SidebarGroup key={g.group}>
            <SidebarGroupLabel className="font-heading tracking-[0.12em] text-gold/80 uppercase">
              {g.group}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((item) => (
                  <NavItem key={item.to} {...item} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))]">
        <CharacterSwitcher />
      </SidebarFooter>
    </Sidebar>
  );
}

const TITLES: Record<string, string> = Object.fromEntries(ALL_NAV.map((n) => [n.to, n.label]));

function TopBar({ theme, toggle }: { theme: "light" | "dark"; toggle: () => void }) {
  const { pathname } = useLocation();
  const title = TITLES[pathname] ?? (pathname.startsWith("/stages/") ? "Stage" : "");
  return (
    <header className="sticky top-0 z-10 flex min-h-[calc(var(--topbar-h)+env(safe-area-inset-top))] shrink-0 items-center gap-3 border-b border-gold/35 bg-background/85 pt-[env(safe-area-inset-top)] pr-[max(var(--page-x),env(safe-area-inset-right))] pl-[max(calc(var(--page-x)/2),env(safe-area-inset-left))] backdrop-blur">
      <SidebarTrigger className="size-(--touch)" />
      <Separator orientation="vertical" className="h-5 bg-gold/40" />
      <span className="min-w-0 truncate font-heading text-base font-semibold">{title}</span>
      <Button
        variant="ghost"
        size="icon"
        className="ml-auto"
        onClick={toggle}
        aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      >
        {theme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
      </Button>
    </header>
  );
}

function Routed() {
  const data = useGameData();
  if (data.status === "loading") return <LoadingState label="Loading game data…" />;
  if (data.status === "error") return <ErrorState message={data.error} />;
  return (
    <GameDataProvider data={data.data}>
      <Suspense fallback={<LoadingState label="Loading page…" />}>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/progression" element={<ProgressionPage />} />
          <Route path="/stages/:id" element={<StagePage />} />
          <Route path="/character" element={<CharacterPage />} />
          <Route path="/calculator" element={<Navigate to="/character" replace />} />
          <Route path="/planner" element={<PlannerPage />} />
          <Route path="/cards" element={<CardsPage />} />
          <Route path="/equipment" element={<EquipmentPage />} />
          <Route path="/systems" element={<SystemsPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/modes" element={<ModesPage />} />
          <Route path="/items" element={<ItemsPage />} />
          <Route path="/summons" element={<SummonsPage />} />
          <Route path="/formulas" element={<FormulasPage />} />
          <Route path="/daily" element={<DailyPage />} />
          <Route path="/operations" element={<OperationsPage />} />
          <Route path="/data" element={<DataPage />} />
          <Route
            path="*"
            element={
              <ErrorState message="There's no page here. Pick a section from the sidebar." />
            }
          />
        </Routes>
      </Suspense>
    </GameDataProvider>
  );
}

export default function App() {
  const { theme, toggle } = useTheme();
  return (
    <BrowserRouter>
      <TooltipProvider delayDuration={300}>
        <ProfileProvider>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="min-w-0">
              <TopBar theme={theme} toggle={toggle} />
              <main className="mx-auto grid w-full max-w-(--content-max) min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-section pt-section pr-[max(var(--page-x),env(safe-area-inset-right))] pb-[max(var(--section-y),env(safe-area-inset-bottom))] pl-[max(var(--page-x),env(safe-area-inset-left))]">
                <Routed />
              </main>
            </SidebarInset>
          </SidebarProvider>
          <SharedCharacterDialog />
          <Toaster theme={theme} position="bottom-right" />
        </ProfileProvider>
      </TooltipProvider>
    </BrowserRouter>
  );
}

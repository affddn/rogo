import { useDeferredValue, useMemo, useState } from "react";
import { Link } from "react-router";
import { Check, Minus, Plus, Search } from "lucide-react";
import { PageHeader, SectionTitle, Stat } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useGame } from "@/lib/game/game-data-context";
import { useProfile } from "@/lib/game/profile-context";
import { attrLine, sumAttrs } from "@rogo/game/attr-format";
import type { Card } from "@rogo/game/cards";
import { useAssetIndex, useSystems } from "@/lib/game/extra-data";
import { full } from "@/lib/format";
import { cn } from "@/lib/utils";

const base = import.meta.env.BASE_URL;
export const CARD_QUALITY = ["", "Normal", "Excellent", "Rare", "Epic", "Legendary"];
const SLOTS = [1, 2, 3, 4, 5, 6];

type Show = "all" | "owned" | "missing";

export default function CardsPage() {
  const { data } = useGame();
  const { profile, setProfile } = useProfile();
  const systems = useSystems();
  const owned = profile?.cards ?? {};
  const [slot, setSlot] = useState("all");
  const [quality, setQuality] = useState("all");
  const [show, setShow] = useState<Show>("all");
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim().toLowerCase());

  const setStar = (id: number, star: number | null) => {
    if (!profile) return;
    const cards = { ...profile.cards };
    if (star === null) delete cards[id];
    else cards[id] = star;
    setProfile({ ...profile, cards });
  };

  const shown = useMemo(
    () =>
      data.cards.filter(
        (c) =>
          (slot === "all" || c.slot === Number(slot)) &&
          (quality === "all" || c.quality === Number(quality)) &&
          (show === "all" || (show === "owned") === c.id in owned) &&
          (!q || c.name.toLowerCase().includes(q)),
      ),
    [data.cards, slot, quality, show, q, owned],
  );

  const ownedList = data.cards.filter((c) => c.id in owned);
  const totalStars = ownedList.reduce((a, c) => a + owned[c.id], 0);
  const albumBonus = useMemo(() => {
    const sum: Record<string, number> = {};
    for (const c of ownedList) sumAttrs(sum, c.stars[owned[c.id] - 1]?.inv ?? {});
    return sum;
  }, [ownedList, owned]);
  const milestones = systems?.cards.collectionBonus ?? [];
  const nextMilestone = milestones.find((m) => m.totalStar > totalStars);

  return (
    <>
      <PageHeader eyebrow="Your character" title="Card album">
        Tick the cards you own and set their stars. Every owned card adds its album bonus whether or
        not it's inserted, and the planner ranks only cards you have.
      </PageHeader>

      {profile ? (
        <div className="tiles-lead">
          <Stat
            lead
            label="Cards owned"
            value={`${ownedList.length} / ${data.cards.length}`}
            hint={`${totalStars} stars in total`}
          />
          <Stat
            label="Next album reward"
            value={
              !systems ? "…" : nextMilestone ? `${nextMilestone.totalStar} stars` : "All claimed"
            }
            hint={nextMilestone?.reward.map((r) => `${r.name} ×${full(r.num)}`).join(", ")}
          />
          <Stat
            label="Album bonus lines"
            value={Object.keys(albumBonus).length}
            hint="Listed below the cards"
          />
        </div>
      ) : (
        <div className="game-panel flex flex-wrap items-center gap-x-block gap-y-3">
          <span className="min-w-0 flex-[1_1_20rem] text-sm text-muted-foreground">
            Browse every card here. To tick the ones you own, set up your character first; the album
            is saved with it.
          </span>
          <Button asChild>
            <Link to="/character">Set up your character</Link>
          </Button>
        </div>
      )}

      <section className="grid gap-block">
        <div className="flex flex-wrap items-end gap-x-block gap-y-4">
          <div className="grid gap-1.5">
            <Label>Slot</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              value={slot}
              onValueChange={(v) => v && setSlot(v)}
            >
              <ToggleGroupItem value="all" className="min-h-(--touch) px-3">
                All
              </ToggleGroupItem>
              {SLOTS.map((s) => (
                <ToggleGroupItem
                  key={s}
                  value={String(s)}
                  aria-label={systems?.cards.slotCategories[s] ?? `Slot ${s}`}
                  className="min-h-(--touch) px-2"
                >
                  <img
                    src={`${base}game/cardslot/icon_cardslot_category_${s}.png`}
                    alt=""
                    width={24}
                    height={24}
                    className="size-6"
                  />
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="grid gap-1.5">
            <Label>Quality</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              value={quality}
              onValueChange={(v) => v && setQuality(v)}
            >
              <ToggleGroupItem value="all" className="min-h-(--touch) px-3">
                All
              </ToggleGroupItem>
              {[2, 3, 4, 5].map((n) => (
                <ToggleGroupItem key={n} value={String(n)} className="min-h-(--touch) px-3">
                  {CARD_QUALITY[n]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          {profile && (
            <div className="grid gap-1.5">
              <Label>Show</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={show}
                onValueChange={(v) => v && setShow(v as Show)}
              >
                <ToggleGroupItem value="all" className="min-h-(--touch) px-3">
                  All
                </ToggleGroupItem>
                <ToggleGroupItem value="owned" className="min-h-(--touch) px-3">
                  Owned
                </ToggleGroupItem>
                <ToggleGroupItem value="missing" className="min-h-(--touch) px-3">
                  Missing
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}
          <div className="grid min-w-0 flex-[1_1_14rem] gap-1.5">
            <Label htmlFor="card-search">Search</Label>
            <div className="flex items-center gap-2 rounded-lg border border-input bg-parchment/50 pl-3">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <Input
                id="card-search"
                type="search"
                value={query}
                placeholder="Card name"
                onChange={(e) => setQuery(e.target.value)}
                className="border-0 bg-transparent shadow-none focus-visible:ring-0"
              />
            </div>
          </div>
        </div>

        {profile && shown.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>
              {shown.length} card{shown.length === 1 ? "" : "s"} shown
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const cards = { ...profile.cards };
                for (const c of shown) cards[c.id] ??= 1;
                setProfile({ ...profile, cards });
              }}
            >
              Mark shown as owned
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const cards = { ...profile.cards };
                for (const c of shown) delete cards[c.id];
                setProfile({ ...profile, cards });
              }}
            >
              Clear shown
            </Button>
          </div>
        )}

        {shown.length ? (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-block">
            {shown.map((c) => (
              <CardTile
                key={c.id}
                card={c}
                star={owned[c.id] ?? null}
                editable={!!profile}
                onStar={(s) => setStar(c.id, s)}
              />
            ))}
          </ul>
        ) : (
          <p className="game-panel text-sm text-muted-foreground">
            No card matches these filters. Clear the search or pick another slot.
          </p>
        )}
      </section>

      {profile && ownedList.length > 0 && (
        <section className="split-aside items-start">
          <div className="grid content-start gap-3">
            <SectionTitle>Album bonus</SectionTitle>
            <p className="text-sm text-muted-foreground">
              The owned bonus of every card you ticked, at its star level. It counts whether or not
              the card is inserted.
            </p>
          </div>
          <ul className="game-panel grid grid-cols-[repeat(auto-fill,minmax(min(100%,13rem),1fr))] gap-x-block gap-y-2 text-sm">
            {Object.entries(albumBonus).map(([k, v]) => (
              <li key={k} className="tabular">
                {attrLine(data.attrs, k, v)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function CardTile({
  card,
  star,
  editable,
  onStar,
}: {
  card: Card;
  star: number | null;
  editable: boolean;
  onStar: (star: number | null) => void;
}) {
  const { data } = useGame();
  const index = useAssetIndex();
  const hasArt = !!index?.card?.some((x) => String(x) === String(card.id));
  const at = card.stars[(star ?? 1) - 1] ?? card.stars[0];
  const owned = star !== null;
  return (
    <li
      className={cn(
        "game-panel grid content-start gap-3 transition-[filter]",
        !owned && editable && "saturate-[0.55]",
      )}
    >
      <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-3">
        <span
          className="grid size-14 place-items-center bg-[length:100%_100%]"
          style={{ backgroundImage: `url(${base}game/frame/bottom_item_${card.quality}.png)` }}
        >
          {hasArt ? (
            <img
              src={`${base}game/card/${card.id}.webp`}
              alt=""
              width={40}
              height={57}
              className="h-[3.4rem] w-auto rounded-sm object-contain"
            />
          ) : (
            <img
              src={`${base}game/cardslot/icon_cardslot_category_${card.slot}.png`}
              alt=""
              width={28}
              height={28}
              className="size-7 drop-shadow"
            />
          )}
        </span>
        <span className="grid min-w-0 gap-0.5">
          <span className="truncate font-heading font-semibold">{card.name}</span>
          <span className="text-xs text-muted-foreground">
            {CARD_QUALITY[card.quality]} · {card.slotName}
            {card.mvp ? " · MVP" : ""}
          </span>
        </span>
      </div>

      <Button asChild variant="outline" size="sm" className="justify-self-start">
        <Link to={`/operations?command=4661&card=${card.id}`}>Apply in game</Link>
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          disabled={!editable}
          aria-pressed={owned}
          aria-label={`${card.name}: owned`}
          onClick={() => onStar(owned ? null : 1)}
          className={cn(
            "inline-flex min-h-(--touch) items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
            owned
              ? "border-gold bg-gold/20 text-foreground"
              : "border-input bg-parchment/40 text-muted-foreground hover:border-gold/60",
          )}
        >
          <span
            className={cn(
              "grid size-5 place-items-center rounded border",
              owned ? "border-gold bg-gold text-leather" : "border-input",
            )}
          >
            {owned && <Check className="size-3.5" aria-hidden />}
          </span>
          Owned
        </button>
        <div className="flex items-center gap-1" aria-label={`Star level of ${card.name}`}>
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={!owned || (star ?? 1) <= 1}
            onClick={() => onStar(Math.max(1, (star ?? 1) - 1))}
            aria-label={`One star less for ${card.name}`}
          >
            <Minus aria-hidden />
          </Button>
          <span className="flex" role="img" aria-label={`${star ?? 0} of ${card.maxStar} stars`}>
            {Array.from({ length: card.maxStar }, (_, i) => (
              <img
                key={i}
                src={`${base}game/ui/${owned && i < (star ?? 0) ? "icon_star3_on" : "icon_star3_off"}.png`}
                alt=""
                width={18}
                height={18}
                className="size-[1.125rem]"
              />
            ))}
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={!owned || (star ?? 1) >= card.maxStar}
            onClick={() => onStar(Math.min(card.maxStar, (star ?? 1) + 1))}
            aria-label={`One star more for ${card.name}`}
          >
            <Plus aria-hidden />
          </Button>
        </div>
      </div>

      <dl className="grid gap-2 text-sm">
        <div className="grid gap-0.5">
          <dt className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Inserted · ★{at.star}
          </dt>
          <dd className="tabular">
            {Object.entries(at.equip)
              .filter(([k]) => !k.startsWith("81000"))
              .map(([k, v]) => attrLine(data.attrs, k, v))
              .join(" · ") || "—"}
          </dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Owned bonus
          </dt>
          <dd className="tabular">
            {Object.entries(at.inv)
              .map(([k, v]) => attrLine(data.attrs, k, v))
              .join(" · ") || "—"}
          </dd>
        </div>
        {at.brand && (
          <div className="grid gap-0.5">
            <dt className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Effect
            </dt>
            <dd className="text-muted-foreground">{at.brand.text}</dd>
          </div>
        )}
      </dl>
    </li>
  );
}

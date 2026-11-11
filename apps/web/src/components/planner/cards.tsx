import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Sparkle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useGame } from "@/lib/game/game-data-context";
import { useCharacter } from "@/lib/game/profile-context";
import { useAssetIndex } from "@/lib/game/extra-data";
import { attrLine } from "@rogo/game/attr-format";
import { rankCards } from "@rogo/game/cards";
import { pct } from "@/lib/format";
import type { Stage } from "@rogo/game/types";

const base = import.meta.env.BASE_URL;
const SLOTS = [1, 2, 3, 4, 5, 6];
// card_filter_quality_N in the English text table
const QUALITY = ["", "Normal", "Excellent", "Rare", "Epic", "Legendary"];

export function CardsPanel({ stage }: { stage: Stage }) {
  const { data } = useGame();
  const profile = useCharacter();
  const index = useAssetIndex();
  const hasArt = (id: number) => !!index?.card?.some((x) => String(x) === String(id));
  const ownedCount = Object.keys(profile.cards).length;
  // with an album ticked, rank what the player has at the stars they have; otherwise every card
  const [which, setWhich] = useState<"owned" | "all">(ownedCount ? "owned" : "all");
  const [star, setStar] = useState("1");
  const [slot, setSlot] = useState("1");
  const slotName = data.cards.find((c) => c.slot === Number(slot))?.slotName ?? "";

  const ranked = useMemo(
    () =>
      rankCards(
        data.attrTransfer,
        data.battleRate,
        profile,
        stage,
        data.cards.filter(
          (c) => c.slot === Number(slot) && (which === "all" || c.id in profile.cards),
        ),
        (c) => (which === "owned" ? (profile.cards[c.id] ?? 1) : Math.min(c.maxStar, Number(star))),
      ),
    [data, profile, stage, slot, star, which],
  );

  return (
    <Card>
      <CardHeader className="grid gap-4">
        <div className="grid gap-1.5">
          <CardTitle>Best card per slot for {stage.id}</CardTitle>
          <CardDescription className="max-w-[65ch]">
            Each card's inserted bonus, run through the damage formula on this stage. Owned bonuses
            (the PATK, MATK and HP % every activated card gives) count no matter which slot a card
            sits in, so they don't change the pick. Proc effects are listed but not counted.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-end gap-x-block gap-y-4">
          <div className="grid gap-1.5">
            <Label>Cards</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              value={which}
              onValueChange={(v) => v && setWhich(v as "owned" | "all")}
              aria-label="Which cards to rank"
            >
              <ToggleGroupItem value="owned" className="min-h-(--touch) px-3">
                Mine ({ownedCount})
              </ToggleGroupItem>
              <ToggleGroupItem value="all" className="min-h-(--touch) px-3">
                Every card
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="grid gap-1.5">
            <Label>Slot</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              value={slot}
              onValueChange={(v) => v && setSlot(v)}
              aria-label="Card slot"
            >
              {SLOTS.map((s) => {
                const name = data.cards.find((c) => c.slot === s)?.slotName ?? String(s);
                return (
                  <ToggleGroupItem
                    key={s}
                    value={String(s)}
                    aria-label={name}
                    title={name}
                    className="min-h-(--touch) px-2.5"
                  >
                    <img
                      src={`${base}game/cardslot/icon_cardslot_category_${s}.png`}
                      alt=""
                      className="size-5"
                    />
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
          </div>
          {which === "all" && (
            <div className="grid gap-1.5">
              <Label>Card stars</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={star}
                onValueChange={(v) => v && setStar(v)}
                aria-label="Card stars"
              >
                {[1, 2, 3, 4, 5].map((s) => (
                  <ToggleGroupItem
                    key={s}
                    value={String(s)}
                    className="tabular min-h-(--touch) w-10"
                  >
                    {s}★
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          )}
          <span className="pb-2 text-sm text-muted-foreground">
            {slotName} cards: {ranked.length}
            {which === "owned" && (
              <>
                {" · "}
                <Link to="/cards" className="underline underline-offset-2">
                  edit your album
                </Link>
              </>
            )}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {ranked.length === 0 && (
          <p className="py-6 text-sm text-muted-foreground">
            {which === "owned"
              ? "You haven't ticked any card for this slot. Tick the ones you own in the card album, or rank every card."
              : "No cards for this slot."}
          </p>
        )}
        <Table className={ranked.length ? undefined : "hidden"}>
          <TableHeader>
            <TableRow>
              <TableHead>Card</TableHead>
              <TableHead>Inserted bonus</TableHead>
              <TableHead className="text-right">More damage</TableHead>
              <TableHead className="text-right">More power</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranked.map(({ card, star: st, damageGain, powerGain }, i) => (
              <TableRow key={card.id}>
                <TableCell className="align-top">
                  <div className="flex items-start gap-2.5">
                    <img
                      src={
                        hasArt(card.id)
                          ? `${base}game/card/${card.id}.webp`
                          : `${base}game/frame/bottom_item_${Math.min(10, card.quality)}.png`
                      }
                      alt=""
                      width={32}
                      height={46}
                      className="mt-0.5 h-11 w-auto rounded-sm object-contain"
                    />
                    <div className="grid gap-1">
                      <span className="font-medium">
                        {i === 0 && damageGain > 0 && (
                          <Sparkle
                            className="mr-1 inline size-3.5 text-gold"
                            aria-label="Best pick"
                          />
                        )}
                        {card.name}
                      </span>
                      <span className="flex flex-wrap gap-1">
                        <Badge variant="outline">
                          {QUALITY[card.quality] ?? `Q${card.quality}`}
                        </Badge>
                        {card.mvp ? <Badge variant="secondary">MVP</Badge> : null}
                        <Badge variant="outline" className="tabular">
                          {st.star}★
                        </Badge>
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="max-w-[26rem] align-top text-sm whitespace-normal">
                  {Object.entries(st.equip)
                    .filter(([k]) => !k.startsWith("81000"))
                    .map(([k, v]) => attrLine(data.attrs, k, v))
                    .join(", ") || <span className="text-muted-foreground">No inserted stats</span>}
                  {st.brand && (
                    <p className="mt-1 text-xs text-muted-foreground">Proc: {st.brand.text}</p>
                  )}
                </TableCell>
                <TableCell
                  className={`tabular text-right align-top ${damageGain > 0.0005 ? "" : "text-muted-foreground"}`}
                >
                  {pct(damageGain, 2)}
                </TableCell>
                <TableCell className="tabular text-right align-top text-muted-foreground">
                  {pct(powerGain, 2)}
                  <Link
                    className="block text-sm underline"
                    to={`/operations?command=4661&card=${card.id}`}
                  >
                    Apply card
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

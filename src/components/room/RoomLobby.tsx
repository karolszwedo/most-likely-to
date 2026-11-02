import { useState } from "react";
import { Play } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SLICE_DOTS } from "@/components/room/chart-colors";
import {
  COHOST_HINT_LOBBY,
  COHOST_ROW,
  CohostBadge,
  CohostButton,
  type RoleSwitchPreview,
} from "@/components/room/CohostButton";
import {
  COLOR_HINT,
  ColorDotButton,
  ColorPalette,
  type ColorPickerPreview,
  useColorPicker,
} from "@/components/room/PlayerColorPicker";
import PlayerLink, { type LinkPreview } from "@/components/room/PlayerLink";
import QuestionList, { type QuestionListActions, type QuestionListPreview } from "@/components/room/QuestionList";
import { mayRemove, RemovePlayerButton, type RemovalPreview } from "@/components/room/RemovePlayerButton";
import type { ActionOutcome } from "@/components/room/room-actions";
import { playerColors } from "@/lib/rooms/chart";
import { MIN_PLAYERS, type RoomView } from "@/lib/rooms/shared";
import { cn } from "@/lib/utils";

// /dev/room-states only: the starting state of this lobby; the real page never sets it.
export interface LobbyPreview {
  copied?: boolean;
  starting?: boolean;
  startError?: string | null;
  // The host's "Przejrzyj pytania" section (S-06).
  questionList?: QuestionListPreview;
  // The host's co-host switch of one guest's row, on its way or refused (S-07).
  roleSwitch?: RoleSwitchPreview;
  // The player's own colour's palette (S-18).
  colorPicker?: ColorPickerPreview;
  // A leader's "Usuń" by a guest's nick (S-09).
  removal?: RemovalPreview;
  // The players' link: copied, or just replaced by a removal (S-09).
  link?: LinkPreview;
}

interface Props {
  view: RoomView;
  // Unique ids when /dev/room-states renders several screens on one page; "" on the real page.
  idPrefix: string;
  titleAs: "h1" | "h2";
  refreshFailed: boolean;
  // A leader's "Zacznij grę": the screen sends it and looks again (src/components/room/RoomScreen.tsx).
  onStart: () => Promise<ActionOutcome>;
  // The host's moves on the game's question list ("Przejrzyj pytania" and the list's buttons), sent the same way.
  questionActions: QuestionListActions;
  // The host gives a guest the co-host role or takes it back (CohostButton), sent the same way.
  onCohost: (nick: string, cohost: boolean) => Promise<ActionOutcome>;
  // The player picks their own colour (useColorPicker), sent the same way.
  onColor: (color: number) => Promise<ActionOutcome>;
  // A leader removes a guest (RemovePlayerButton), sent the same way.
  onRemove: (nick: string) => Promise<ActionOutcome>;
  // How many refreshed states the screen has had (useRoomState), for CohostButton and RemovePlayerButton.
  refreshes: number;
  preview?: LobbyPreview;
}

// The lobby: a leader's (the host's or a co-host's, S-07) players' link (S-09) and "Zacznij grę", the host's game's
// question list ("Przejrzyj pytania"), the list of players for everyone, with the host's co-host switch by each
// guest's nick and a leader's "Usuń" (S-09). RoomScreen keeps the state live, the link included (view.linkUrl): a link
// replaced by a removal shows with the next fetch.
export default function RoomLobby({
  view,
  idPrefix,
  titleAs: Title,
  refreshFailed,
  onStart,
  questionActions,
  onCohost,
  onColor,
  onRemove,
  refreshes,
  preview,
}: Props) {
  // After "Zacznij grę" was accepted the button stays busy until the game's state arrives and this view goes away.
  const [starting, setStarting] = useState(preview?.starting ?? false);
  const [startError, setStartError] = useState<string | null>(preview?.startError ?? null);
  // The host unfolded "Przejrzyj pytania"; the list shows once the view has it.
  const [questionsOpen, setQuestionsOpen] = useState(preview?.questionList?.open ?? false);
  const isHost = view.role === "host";
  const { linkUrl } = view;
  // The host, or a guest with the co-host role (S-07): "Zacznij grę".
  const leads = view.leader;
  const canStart = view.players.length >= MIN_PLAYERS;
  const colors = playerColors(view.players);
  const startHintId = `${idPrefix}start-hint`;
  const questionsShown = isHost && questionsOpen && view.questions !== null;
  // The host's co-host switches and their hint, once a guest is in the room.
  const hasGuests = view.players.some((player) => !player.host);
  const cohostHintId = `${idPrefix}cohost-hint`;
  const picker = useColorPicker({
    meNick: view.me,
    players: view.players,
    idPrefix,
    onColor,
    refreshes,
    preview: preview?.colorPicker,
  });

  async function start() {
    setStarting(true);
    setStartError(null);
    const outcome = await onStart();
    if (!outcome.ok) {
      setStarting(false);
      setStartError(outcome.message);
    }
  }

  // Under the title: the host shares the link; a co-host may start; everyone else waits for a leader.
  let subtitle = "Czekamy, aż prowadzący zacznie.";
  if (isHost) subtitle = "Wklej link na Discordzie. Kto go otworzy, wpisze nick i dołączy.";
  else if (leads) subtitle = "Jesteś współhostem: możesz zacząć grę.";

  return (
    <div className="flex flex-col gap-8 lg:grid lg:grid-cols-3 lg:items-start lg:gap-x-12">
      {/* From lg two columns: the game (title first in the DOM, where the focus goes after a leader's move) and the
          players. The game's group stays in view while a long list of players scrolls the page, so the host keeps the
          link and "Zacznij grę" on screen; a sticky grid item moves only within its row, so only the shorter column
          can stick. With the game's question list unfolded the group is taller than a window, so it scrolls with the
          page instead, or the list's end would stay out of reach. Below lg the group is display: contents, so its
          blocks stand in one column as on a phone. */}
      <div
        className={cn("contents lg:col-span-2 lg:flex lg:flex-col lg:gap-8", !questionsShown && "lg:sticky lg:top-6")}
      >
        <div className="flex flex-col gap-2">
          <Title className="text-2xl font-semibold break-words">
            {isHost ? "Twój pokój" : `Jesteś w grze jako ${view.me}`}
          </Title>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>

        {leads &&
          (linkUrl ? (
            <PlayerLink
              linkUrl={linkUrl}
              idPrefix={idPrefix}
              preview={preview ? { ...preview.link, copied: preview.copied ?? preview.link?.copied } : undefined}
            />
          ) : (
            <p role="alert" className="text-destructive text-sm">
              Nie udało się pobrać linku. Odśwież stronę.
            </p>
          ))}

        {leads && (
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              className="w-full"
              disabled={!canStart || starting}
              aria-describedby={startHintId}
              onClick={() => void start()}
            >
              {starting ? (
                <>
                  <Spinner aria-hidden="true" />
                  Zaczynamy…
                </>
              ) : (
                <>
                  <Play />
                  Zacznij grę
                </>
              )}
            </Button>
            <p id={startHintId} className="text-muted-foreground text-sm">
              {canStart
                ? "Po starcie nowi gracze wejdą tylko wtedy, gdy ich wpuścisz."
                : `Grę zaczniesz, gdy będzie was co najmniej ${MIN_PLAYERS}.`}
            </p>
            <ServerError message={startError} />
          </div>
        )}

        {isHost && (
          <QuestionList
            questions={view.questions}
            idPrefix={idPrefix}
            open={questionsOpen}
            onOpenChange={setQuestionsOpen}
            actions={questionActions}
            preview={preview?.questionList}
          />
        )}
      </div>

      {/* From lg the column next to the game. */}
      <section aria-labelledby={`${idPrefix}players-heading`} className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id={`${idPrefix}players-heading`} className="text-sm font-medium">
            Gracze ({view.players.length})
          </h2>
          <p aria-live="polite" className="text-muted-foreground text-xs">
            {refreshFailed ? "Nie udało się odświeżyć listy" : ""}
          </p>
        </div>
        <ul className="divide-y rounded-md border">
          {view.players.map((player) => {
            const color = colors.get(player.nick);
            // The host's switch on every guest's row, never on the host's own.
            const switchShown = isHost && !player.host;
            const isMe = player.nick === view.me;
            return (
              <li
                key={player.nick}
                className={cn(
                  "flex items-center gap-x-3 px-3",
                  leads ? COHOST_ROW : "justify-between py-2.5",
                  // The own row holds the palette of colours under the nick (S-18).
                  isMe && "flex-wrap",
                )}
              >
                <span className={cn("flex min-w-0 items-center gap-x-2", leads && "mr-auto")}>
                  {/* The player's stored colour (playerColors), as on the reveal's pie; the own dot is the button that
                      changes it. Outside the nick's span, so a long nick wraps next to its dot. */}
                  {isMe ? (
                    <ColorDotButton picker={picker} />
                  ) : (
                    <span
                      aria-hidden="true"
                      data-color={color}
                      className={cn("size-2.5 shrink-0 rounded-full", color !== undefined && SLICE_DOTS[color])}
                    />
                  )}
                  <span className="min-w-0 break-words">{player.nick}</span>
                </span>
                <span className={cn("flex shrink-0 gap-1.5", leads && "ml-auto")}>
                  {player.host && <Badge variant="secondary">host</Badge>}
                  {/* In the host's view the switch stands in the badge's place; pressed, it looks the same. */}
                  {player.cohost && !switchShown && <CohostBadge />}
                  {!isHost && player.nick === view.me && <Badge variant="outline">ty</Badge>}
                </span>
                {switchShown && (
                  <CohostButton
                    player={player}
                    hintId={cohostHintId}
                    onCohost={onCohost}
                    refreshes={refreshes}
                    preview={preview?.roleSwitch}
                  />
                )}
                {mayRemove(view, player) && (
                  <RemovePlayerButton
                    player={player}
                    onRemove={onRemove}
                    refreshes={refreshes}
                    preview={preview?.removal}
                  />
                )}
                {isMe && <ColorPalette picker={picker} />}
              </li>
            );
          })}
        </ul>
        <p className="text-muted-foreground text-sm">{COLOR_HINT}</p>
        {isHost && hasGuests && (
          <p id={cohostHintId} className="text-muted-foreground text-sm">
            {COHOST_HINT_LOBBY}
          </p>
        )}
      </section>
    </div>
  );
}

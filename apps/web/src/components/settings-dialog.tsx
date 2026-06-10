"use client";

import { useEffect, useMemo, useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import {
  GearIcon,
  MagnifyingGlassIcon,
  SignOutIcon,
  SlidersHorizontalIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import type { LearnerPreferences, VoiceMode } from "@basics/contracts";

type UserResource = NonNullable<ReturnType<typeof useUser>["user"]>;

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Kbd } from "@/components/ui/kbd";
import { Switch } from "@/components/ui/switch";
import { formatKeyCode, isRecordableKey } from "@/lib/keybind";
import { cn } from "@/lib/utils";
import {
  updateLearnerDisplayName,
  updateLearnerPreferences,
} from "@/lib/profile-actions";

export type SettingsTab = "general" | "profile" | "account";

const SECTIONS: { id: SettingsTab; label: string; icon: typeof GearIcon }[] = [
  { id: "general", label: "General", icon: SlidersHorizontalIcon },
  { id: "profile", label: "Profile", icon: UserCircleIcon },
  { id: "account", label: "Account", icon: GearIcon },
];

const THEME_ITEMS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const VOICE_MODE_ITEMS: { value: VoiceMode; label: string }[] = [
  { value: "realtime", label: "Real-time" },
  { value: "push_to_talk", label: "Hold to talk" },
];

export function SettingsDialog({
  open,
  onOpenChange,
  initialTab = "general",
  preferences,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: SettingsTab;
  preferences: LearnerPreferences;
}) {
  const { user } = useUser();

  if (!user) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Remount on open so local form state resets to the latest values. */}
      {open ? (
        <SettingsDialogBody
          user={user}
          initialTab={initialTab}
          initialPreferences={preferences}
        />
      ) : null}
    </Dialog>
  );
}

/**
 * A single setting row: label + description on the left, control on the
 * right. `keywords` feed the sidebar search.
 */
type SettingRow = {
  id: string;
  section: SettingsTab;
  group: string;
  label: string;
  description: string;
  keywords: string;
  control: React.ReactNode;
};

function SettingsDialogBody({
  user,
  initialTab,
  initialPreferences,
}: {
  user: UserResource;
  initialTab: SettingsTab;
  initialPreferences: LearnerPreferences;
}) {
  const { signOut } = useClerk();
  const { theme, setTheme } = useTheme();
  const [section, setSection] = useState<SettingsTab>(initialTab);
  const [query, setQuery] = useState("");
  const [prefs, setPrefs] = useState<LearnerPreferences>(initialPreferences);

  // Optimistic preference updates: flip the UI immediately, roll back if the
  // server rejects the change.
  function savePreferences(update: Partial<LearnerPreferences>) {
    const previous = prefs;
    setPrefs((current) => ({ ...current, ...update }));
    updateLearnerPreferences(update).catch(() => {
      setPrefs(previous);
      toast.error("Couldn't save your settings. Try again.");
    });
  }

  const rows = useMemo<SettingRow[]>(
    () => [
      {
        id: "theme",
        section: "general",
        group: "Appearance",
        label: "Theme",
        description: "Match your system or pick light/dark.",
        keywords: "theme appearance dark light mode color",
        control: (
          <Select
            items={THEME_ITEMS}
            value={theme ?? "system"}
            onValueChange={(value) => {
              if (typeof value === "string") setTheme(value);
            }}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} align="end">
              {THEME_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ),
      },
      {
        id: "voice-mode",
        section: "general",
        group: "Live sessions",
        label: "Conversation style",
        description:
          "Real-time lets the tutor respond when you pause. Hold to talk waits until you hold your talk key, then responds when you release — handy in noisy places.",
        keywords:
          "voice mode push to talk hold space realtime microphone turn noisy",
        control: (
          <Select
            items={VOICE_MODE_ITEMS}
            value={prefs.voiceMode}
            onValueChange={(value) => {
              if (value === "realtime" || value === "push_to_talk") {
                savePreferences({ voiceMode: value });
              }
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} align="end">
              {VOICE_MODE_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ),
      },
      {
        id: "ptt-keybind",
        section: "general",
        group: "Live sessions",
        label: "Push-to-talk key",
        description:
          "The key you hold to speak in hold-to-talk sessions. Click and press any key to change it.",
        keywords:
          "push to talk keybind key bind shortcut hotkey space hold record",
        control: (
          <KeybindInput
            value={prefs.pttKeybind}
            onChange={(code) => savePreferences({ pttKeybind: code })}
          />
        ),
      },
      {
        id: "captions",
        section: "general",
        group: "Live sessions",
        label: "Live captions",
        description: "Show what the tutor is saying as on-screen captions.",
        keywords: "captions subtitles transcript accessibility",
        control: (
          <Switch
            checked={prefs.showCaptions}
            onCheckedChange={(checked) =>
              savePreferences({ showCaptions: checked })
            }
            aria-label="Toggle live captions"
          />
        ),
      },
      {
        id: "display-name",
        section: "profile",
        group: "Profile",
        label: "Display name",
        description: "Shown to your tutor and used across Basics.",
        keywords: "display name profile rename",
        control: <DisplayNameForm user={user} />,
      },
      {
        id: "email",
        section: "account",
        group: "Account",
        label: "Email",
        description: "Your sign-in email. Contact support to change it.",
        keywords: "email address sign in login",
        control: (
          <Input
            value={user.primaryEmailAddress?.emailAddress ?? ""}
            readOnly
            disabled
            className="w-56"
          />
        ),
      },
      {
        id: "sign-out",
        section: "account",
        group: "Account",
        label: "Sign out",
        description: "Sign out of Basics on this device.",
        keywords: "sign out log out logout leave",
        control: (
          <Button
            variant="outline"
            onClick={() => void signOut({ redirectUrl: "/sign-in" })}
          >
            <SignOutIcon />
            Sign out
          </Button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, prefs, user],
  );

  const searching = query.trim().length > 0;
  const visibleRows = searching
    ? rows.filter((row) =>
        `${row.label} ${row.description} ${row.keywords} ${row.group}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      )
    : rows.filter((row) => row.section === section);

  const groups = [...new Set(visibleRows.map((row) => row.group))];
  const activeSection = SECTIONS.find((entry) => entry.id === section);

  return (
    <DialogContent className="flex h-[min(620px,85svh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
      <div className="flex min-h-0 flex-1">
        {/* Section rail */}
        <aside className="flex w-48 shrink-0 flex-col gap-3 border-r bg-muted/40 p-3 max-sm:w-14">
          <div className="relative max-sm:hidden">
            <MagnifyingGlassIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search settings"
              className="h-8 bg-background pl-8 text-sm"
            />
          </div>
          <nav className="flex flex-col gap-0.5">
            {SECTIONS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  setSection(entry.id);
                  setQuery("");
                }}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors max-sm:justify-center max-sm:px-0",
                  !searching && section === entry.id
                    ? "bg-background font-medium shadow-xs ring-1 ring-foreground/5"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                )}
              >
                <entry.icon className="size-4 shrink-0" />
                <span className="max-sm:hidden">{entry.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Active section */}
        <main className="flex min-h-0 flex-1 flex-col">
          <div className="px-6 pt-5 pb-3">
            <DialogTitle>
              {searching ? "Search results" : (activeSection?.label ?? "Settings")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Manage your Basics settings.
            </DialogDescription>
          </div>
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 pb-6">
            {visibleRows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No settings match &ldquo;{query.trim()}&rdquo;.
              </p>
            ) : (
              groups.map((group) => (
                <section key={group}>
                  <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                    {group}
                  </h3>
                  <div className="divide-y rounded-xl border bg-card">
                    {visibleRows
                      .filter((row) => row.group === group)
                      .map((row) => (
                        <div
                          key={row.id}
                          className="flex items-center justify-between gap-6 px-4 py-3.5"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{row.label}</p>
                            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                              {row.description}
                            </p>
                          </div>
                          <div className="shrink-0">{row.control}</div>
                        </div>
                      ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </main>
      </div>
    </DialogContent>
  );
}

/**
 * Records a key by capturing the next physical keypress: click arms the
 * recorder, the next keydown becomes the bind (stored as
 * `KeyboardEvent.code`, so it's keyboard-layout independent). Escape
 * cancels recording — it stays reserved for cancelling a held turn.
 */
function KeybindInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      // Swallow the press entirely so it can't also close the dialog,
      // scroll the page, or submit a form.
      event.preventDefault();
      event.stopPropagation();

      if (isRecordableKey(event.code)) {
        onChange(event.code);
      }
      setRecording(false);
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [recording, onChange]);

  return (
    <Button
      variant="outline"
      className={cn("w-36", recording && "ring-2 ring-ring")}
      onClick={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      aria-label={
        recording
          ? "Recording: press a key"
          : `Push-to-talk key: ${formatKeyCode(value)}. Click to change.`
      }
    >
      {recording ? (
        <span className="text-muted-foreground">Press a key...</span>
      ) : (
        <Kbd>{formatKeyCode(value)}</Kbd>
      )}
    </Button>
  );
}

function DisplayNameForm({ user }: { user: UserResource }) {
  const [name, setName] = useState(user.fullName ?? "");
  const [saving, setSaving] = useState(false);

  const dirty = name.trim() !== (user.fullName ?? "") && name.trim().length > 0;

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }

    setSaving(true);
    try {
      const [firstName, ...rest] = trimmed.split(/\s+/);
      await user.update({ firstName, lastName: rest.join(" ") });
      await updateLearnerDisplayName(trimmed);
      toast.success("Profile updated.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update profile.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Your name"
        maxLength={120}
        className="w-44"
      />
      {dirty ? (
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      ) : null}
    </div>
  );
}

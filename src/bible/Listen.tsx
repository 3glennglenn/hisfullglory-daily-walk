// "Listen": the device reads the chapter aloud with its own voice, verse by verse, so the reader can follow
// along. The WEB is in the public domain, so reading it aloud needs no licence. Nothing leaves the device;
// where the browser has no speech, there is no control at all.
//
// UI-SPEC A3: the control that starts it is the reader toolbar's Listen button (or the entry in More at
// narrower widths); while it plays, a mini player bar floats above the tab bar with Pause or Resume, the verse
// being read and Stop, and that verse keeps --highlight-gold in the text. useListen owns the speech state; the
// toolbar, the More sheet and the bar are views of it.
import { useEffect, useRef, useState } from "react";
import { Pause, Play, Square } from "lucide-react";
import type { Chapter } from "./provider";
import { speechParts } from "./speech";

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

function englishVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang === "en-US" && v.localService) ?? voices.find((v) => v.lang.startsWith("en"));
}

export type ListenState = "idle" | "playing" | "paused";

export function useListen(reference: string, chapter: Chapter | undefined, onVerse: (verse?: number) => void) {
  const [state, setState] = useState<ListenState>("idle");
  const run = useRef(0);
  // Stop when the chapter changes or the reader leaves it.
  useEffect(() => {
    setState("idle");
    return () => {
      run.current++;
      if (canSpeak()) window.speechSynthesis.cancel();
      onVerse(undefined);
    };
  }, [reference]);
  function start() {
    if (!canSpeak() || !chapter) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const id = ++run.current;
    const parts = speechParts(reference, chapter);
    const voice = englishVoice();
    parts.forEach((part, i) => {
      const utterance = new SpeechSynthesisUtterance(part.text);
      utterance.lang = "en-US";
      if (voice) utterance.voice = voice;
      utterance.onstart = () => {
        if (run.current !== id) return;
        onVerse(part.verse);
        if (part.verse) document.getElementById(`verse-${part.verse}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      };
      if (i === parts.length - 1)
        utterance.onend = () => {
          if (run.current !== id) return;
          setState("idle");
          onVerse(undefined);
        };
      synth.speak(utterance);
    });
    setState("playing");
  }
  function pause() {
    window.speechSynthesis.pause();
    setState("paused");
  }
  function resume() {
    window.speechSynthesis.resume();
    setState("playing");
  }
  function stop() {
    run.current++;
    window.speechSynthesis.cancel();
    setState("idle");
    onVerse(undefined);
  }
  return { supported: canSpeak(), state, start, pause, resume, stop };
}

export type Listening = ReturnType<typeof useListen>;

/**
 * The mini player: Pause or Resume, the verse being read, and Stop. Absent while nothing plays. Pause takes focus
 * when the bar appears, because the Listen button that started it has just gone.
 */
export function ListenBar({
  reference,
  listening,
  verse,
  onStopped,
}: {
  reference: string;
  listening: Listening;
  verse?: number;
  /** Called after Stop, so the screen can put focus back on the control that started it. */
  onStopped: () => void;
}) {
  if (listening.state === "idle") return null;
  const playing = listening.state === "playing";
  return (
    <div className="mini-player" role="group" aria-label={`Listening to ${reference}`}>
      <button
        type="button"
        className="mini-button"
        autoFocus
        onClick={playing ? listening.pause : listening.resume}
      >
        {playing ? <Pause size={20} aria-hidden="true" focusable="false" /> : <Play size={20} aria-hidden="true" focusable="false" />}
        <span>{playing ? "Pause" : "Resume"}</span>
      </button>
      <span className="mini-verse">{verse ? `Verse ${verse}` : reference}</span>
      <button
        type="button"
        className="mini-button"
        onClick={() => {
          listening.stop();
          onStopped();
        }}
      >
        <Square size={18} aria-hidden="true" focusable="false" />
        <span>Stop</span>
      </button>
      <span className="sr-only">Read aloud by your device’s own voice.</span>
    </div>
  );
}

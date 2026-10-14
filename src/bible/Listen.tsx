// "Listen": the device reads the chapter aloud with its own voice, verse by verse, so the
// reader can follow along. The WEB is in the public domain, so reading it aloud needs no
// licence. Nothing leaves the device; where the browser has no speech, the button is absent.
import { useEffect, useRef, useState } from "react";
import type { Chapter } from "./provider";
import { speechParts } from "./speech";

const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

function englishVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang === "en-US" && v.localService) ?? voices.find((v) => v.lang.startsWith("en"));
}

export function Listen({ reference, chapter, onVerse }: { reference: string; chapter: Chapter; onVerse: (verse?: number) => void }) {
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
  const run = useRef(0);
  // Stop when the chapter changes or the reader leaves it.
  useEffect(() => {
    return () => {
      run.current++;
      if (canSpeak()) window.speechSynthesis.cancel();
      onVerse(undefined);
    };
  }, [reference]);
  if (!canSpeak()) return null;
  function start() {
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
  function stop() {
    run.current++;
    window.speechSynthesis.cancel();
    setState("idle");
    onVerse(undefined);
  }
  return (
    <div className="listen" role="group" aria-label="Listen to this chapter">
      {state === "idle" && <button className="secondary" onClick={start}>Listen</button>}
      {state === "playing" && (
        <button className="secondary" onClick={() => { window.speechSynthesis.pause(); setState("paused"); }}>Pause</button>
      )}
      {state === "paused" && (
        <button className="secondary" onClick={() => { window.speechSynthesis.resume(); setState("playing"); }}>Resume</button>
      )}
      {state !== "idle" && <button className="text-button" onClick={stop}>Stop</button>}
      <small>Read aloud by your device’s own voice.</small>
    </div>
  );
}

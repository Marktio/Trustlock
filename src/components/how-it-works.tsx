"use client";

import { useEffect, useRef, useState } from "react";
import { HOW_STEPS, HOW_VIDEO, RAIL_LABELS } from "./how-steps";

const sc = (n: number) => `${n.toLocaleString("en-GB")} SC`;

/** One "How it works" button. It opens a popup with a Text tab (opens first) and a Video tab (never autoplays). */
export function HowItWorks({ className = "btn" }: { className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [tab, setTab] = useState<"text" | "video">("text");
  const [step, setStep] = useState(0);
  const s = HOW_STEPS[step];

  useEffect(() => {
    if (tab !== "video") video.current?.pause();
  }, [tab]);

  const open = () => {
    setTab("text");
    setStep(0);
    dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();

  return (
    <>
      <button type="button" className={className} onClick={open} aria-haspopup="dialog">
        How it works
      </button>
      <dialog
        ref={dialog}
        className="how-dialog"
        aria-labelledby="how-h"
        onClose={() => video.current?.pause()}
        onClick={(e) => {
          if (e.target === dialog.current) close();
        }}
      >
        <button type="button" className="how-x" onClick={close} aria-label="Close">
          ✕
        </button>
        <h2 id="how-h">How it works</h2>
        <div className="how-tabs" role="tablist" aria-label="Choose how to learn">
          <button type="button" role="tab" id="how-t-text" aria-selected={tab === "text"} aria-controls="how-p-text" onClick={() => setTab("text")}>
            Text
          </button>
          <button type="button" role="tab" id="how-t-video" aria-selected={tab === "video"} aria-controls="how-p-video" onClick={() => setTab("video")}>
            Video (45s)
          </button>
        </div>

        <div id="how-p-text" role="tabpanel" aria-labelledby="how-t-text" hidden={tab !== "text"} className="how-grid">
          <div className="how-steps">
            {HOW_STEPS.map((x, i) => (
              <button type="button" key={x.title} className="how-step" aria-current={i === step} onClick={() => setStep(i)}>
                <b>
                  <span className="how-num">{i + 1}</span>
                  {x.title}
                </b>
                {i === step && <p>{x.text}</p>}
              </button>
            ))}
            <div className="btn-row">
              <button type="button" className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>
                Back
              </button>
              {step < HOW_STEPS.length - 1 ? (
                <button type="button" className="btn btn-primary" onClick={() => setStep(step + 1)}>
                  Next
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={() => { close(); }}>
                  Got it
                </button>
              )}
            </div>
          </div>
          <div className="how-stage" aria-live="polite">
            <div className="how-rail" aria-hidden="true">
              {RAIL_LABELS.map((r, i) => (
                <span key={r} className={i <= s.rail ? "on" : ""}>
                  {r}
                </span>
              ))}
            </div>
            <div className="how-wallets">
              {([["Amina (client)", s.amina], ["Brian (freelancer)", s.brian]] as const).map(([name, w]) => (
                <div key={name} className="how-w">
                  <h4>{name}</h4>
                  <div><span>Available</span><b>{sc(w.available)}</b></div>
                  <div className="held"><span>Held</span><b>{sc(w.held)}</b></div>
                </div>
              ))}
            </div>
            <span className={`how-chip ${s.tone}`}>{s.note}</span>
            <p className="small" style={{ color: "var(--navy-300)", margin: 0 }}>Amounts in this walk-through are practice credits (SC). Inside the app they are shown in your own currency, for example KSh.</p>
          </div>
        </div>

        <div id="how-p-video" role="tabpanel" aria-labelledby="how-t-video" hidden={tab !== "video"}>
          <video ref={video} controls preload="none" playsInline poster={HOW_VIDEO.poster} className="how-video">
            <source src={HOW_VIDEO.src} type="video/mp4" />
            <track kind="captions" src={HOW_VIDEO.captions} srcLang="en" label="English" default />
          </video>
          <p className="small muted">Practice credits only. No real money moves anywhere in TrustLock. Inside the app they are shown in your own currency, for example KSh.</p>
        </div>
      </dialog>
    </>
  );
}

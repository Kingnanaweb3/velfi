"""
Velfi demo voiceover: generates narration with Kyutai Pocket TTS, times each line
to the video, and muxes it into velfi-demo-voiced.mp4.

Setup (once):
    pip install pocket-tts scipy numpy
    brew install ffmpeg

Run (from the folder that has velfi-demo.mp4):
    python3 add_voiceover.py
    python3 add_voiceover.py --voice marius
    python3 add_voiceover.py --voice ./my_voice.wav          # clone your own voice
    python3 add_voiceover.py --music ./lofi.mp3              # optional background music
"""
import argparse, os, subprocess, tempfile
import numpy as np
import scipy.io.wavfile as wavfile
from pocket_tts import TTSModel

# (start_sec, must_end_by_sec, text) -- timed to the 75s video.
# Spellings are phonetic on purpose ("Swee", "dot vel") so the TTS says them right.
LINES = [
    (2.9,  5.0,  "What if your money just listened?"),
    (5.4,  10.5, "Today, moving money on-chain means copying long addresses, guarding twelve secret words, and approving five pop-ups for one payment."),
    (10.7, 12.9, "There's a simpler way."),
    (13.4, 18.8, "Meet Velfi. The AI money agent on Swee. One text becomes an on-chain transaction."),
    (19.6, 26.8, "Sign in with Google. No seed phrase. Your wallet is ready in seconds."),
    (27.3, 32.9, "Then claim your dot vel name, so anyone can pay you without a long address."),
    (33.4, 39.3, "Now, just say what you want. Split eighteen hundred dollars of rent, forty, thirty, thirty."),
    (39.5, 46.6, "Velfi shows you exactly what will happen. You confirm once, and it's done, with a receipt stored on Walrus."),
    (47.3, 56.7, "Stream a salary. Auto-save. Escrow a deal. Schedule rent. Set it once, and it keeps running."),
    (57.3, 65.8, "You own your money, and your memory. Only your keys move funds, and the agent never breaks your limits."),
    (66.6, 74.6, "Claim your dot vel name before someone else does. Join the waitlist at velfi dot x y z."),
]
VIDEO_LEN = 75.0
MAX_SPEEDUP = 1.25   # beyond this, shorten the line instead of speeding it up


def trim_silence(a, sr, thresh=0.01, pad=0.05):
    idx = np.where(np.abs(a) > thresh)[0]
    if len(idx) == 0:
        return a
    p = int(pad * sr)
    return a[max(0, idx[0] - p): idx[-1] + p]


def speed_up(a, sr, factor):
    with tempfile.TemporaryDirectory() as d:
        i, o = os.path.join(d, "in.wav"), os.path.join(d, "out.wav")
        wavfile.write(i, sr, a)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", i,
                        "-filter:a", f"atempo={factor:.4f}", o], check=True)
        _, out = wavfile.read(o)
    return out.astype(np.float32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", default="velfi-demo.mp4")
    ap.add_argument("--out", default="velfi-demo-voiced.mp4")
    ap.add_argument("--voice", default="alba",
                    help="preset (alba, marius, javert, jean, fantine, cosette, eponine, azelma) or a .wav to clone")
    ap.add_argument("--music", default=None, help="optional background music file")
    ap.add_argument("--music-volume", type=float, default=0.12)
    args = ap.parse_args()

    print("Loading Pocket TTS (first run downloads the model)...")
    model = TTSModel.load_model()
    voice = model.get_state_for_audio_prompt(args.voice)
    sr = model.sample_rate

    track = np.zeros(int((VIDEO_LEN + 1) * sr), dtype=np.float32)
    for start, end, text in LINES:
        audio = model.generate_audio(voice, text).numpy().astype(np.float32).flatten()
        audio = trim_silence(audio, sr)
        dur, slot = len(audio) / sr, end - start
        if dur > slot:
            factor = dur / slot
            if factor > MAX_SPEEDUP:
                print(f"  ! {start:>5.1f}s line is {dur:.1f}s for a {slot:.1f}s slot; consider shortening: {text!r}")
                factor = MAX_SPEEDUP
            audio = speed_up(audio, sr, factor)
            dur = len(audio) / sr
        s = int(start * sr)
        e = min(len(track), s + len(audio))
        track[s:e] += audio[: e - s]
        print(f"  {start:>5.1f}s  {dur:4.1f}s  {text}")

    peak = np.max(np.abs(track)) or 1.0
    track = (track / peak * 0.9).astype(np.float32)
    wavfile.write("voiceover.wav", sr, track)
    print("Wrote voiceover.wav")

    if args.music:
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", args.video, "-i", "voiceover.wav",
               "-stream_loop", "-1", "-i", args.music, "-filter_complex",
               f"[2:a]volume={args.music_volume},afade=t=out:st={VIDEO_LEN - 2}:d=2[m];"
               f"[1:a][m]amix=inputs=2:duration=first:normalize=0[a]",
               "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
               "-t", str(VIDEO_LEN), "-movflags", "+faststart", args.out]
    else:
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", args.video, "-i", "voiceover.wav",
               "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
               "-t", str(VIDEO_LEN), "-movflags", "+faststart", args.out]
    subprocess.run(cmd, check=True)
    print(f"Done: {args.out}")


if __name__ == "__main__":
    main()

// Vision for the agent: keep the caller's latest camera frame, and answer
// questions about it with Gemini Flash. The Gemini Live plugin for Node does not
// forward video to the model, so the agent calls look() instead.
import { GoogleGenAI } from '@google/genai';
import { RoomEvent, TrackKind, VideoBufferType, VideoStream } from '@livekit/rtc-node';
import sharp from 'sharp';

const VISION_MODEL = process.env.GEMINI_VISION_MODEL || 'gemini-3.5-flash';
const MAX_SIDE = 768;

/**
 * Watches the caller's video track and keeps the most recent frame.
 * @param {import('@livekit/rtc-node').Room} room
 * @param {string} callerIdentity
 */
export function watchCallerVideo(room, callerIdentity) {
  let latest = null;
  let latestAt = 0;
  let stopped = false;
  const readers = [];

  async function read(track) {
    const stream = new VideoStream(track);
    const reader = stream.getReader();
    readers.push(reader);
    try {
      while (!stopped) {
        const { value, done } = await reader.read();
        if (done) break;
        latest = value.frame;
        latestAt = Date.now();
      }
    } catch { /* track ended */ }
  }

  const onSubscribed = (track, _pub, participant) => {
    if (track.kind === TrackKind.KIND_VIDEO && participant.identity === callerIdentity) read(track);
  };
  room.on(RoomEvent.TrackSubscribed, onSubscribed);
  // Tracks that were subscribed before we started listening.
  const caller = room.remoteParticipants.get(callerIdentity);
  for (const pub of caller?.trackPublications.values() ?? []) {
    if (pub.track && pub.kind === TrackKind.KIND_VIDEO) read(pub.track);
  }

  return {
    /** The latest frame as JPEG bytes, or null when no video has arrived. */
    async snapshot() {
      if (!latest) return null;
      const rgba = latest.convert(VideoBufferType.RGBA);
      const jpeg = await sharp(Buffer.from(rgba.data), { raw: { width: rgba.width, height: rgba.height, channels: 4 } })
        .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside' })
        .jpeg({ quality: 80 })
        .toBuffer();
      return { jpeg, ageMs: Date.now() - latestAt };
    },
    stop() {
      stopped = true;
      room.off(RoomEvent.TrackSubscribed, onSubscribed);
      for (const r of readers) r.cancel().catch(() => {});
    },
  };
}

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

/** Asks Gemini Flash a question about one JPEG frame. */
export async function describeFrame(jpeg, question) {
  const res = await ai.models.generateContent({
    model: VISION_MODEL,
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: jpeg.toString('base64') } },
        { text: `This is a live frame from the caller's camera (smart glasses or phone). ${question}\nAnswer in one or two short spoken sentences. If there is a hazard, mention it first; otherwise do not talk about hazards.` },
      ],
    }],
  });
  return res.text?.trim() || 'I could not make out the image.';
}

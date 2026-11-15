import { fileURLToPath } from 'node:url';
import { AutoSubscribe, defineAgent, llm, voice } from '@livekit/agents';
import { z } from 'zod';
import { describeFrame, watchCallerVideo } from './vision.mjs';
import * as google from '@livekit/agents-plugin-google';
import { LocalVideoTrack, TrackSource, VideoBufferType, VideoFrame, VideoSource } from '@livekit/rtc-node';
import { drawFace, FPS, HEIGHT, WIDTH } from './face.mjs';
import { runAgent } from './chert-rooms.mjs';
import { greetOnBridgeReady } from './greet.mjs';
import { connectGlasses } from './glasses.mjs';
import { endCall, logAlert, logMessage, startCall } from './dashboard.mjs';

// Change these instructions to build your own agent. Keep replies conversational.
const instructions = `You are Odyssey, a friendly AI guide on a FaceTime video call, built for smart glasses
that help a person get around safely. The caller sees a simple animated face while you talk.
Listen carefully, answer calmly, and keep each reply to one or two short sentences.
If the caller sounds lost or in danger, stay with them and tell them help can be contacted.
Be clear that you are an AI.
You cannot see the camera directly. Whenever the caller asks what you see, what is around them,
to read something, or anything visual, first say a few words like "Let me take a look", then call
the look tool with their question and answer from its result. Never stay silent while you look.
Give directions out loud and clearly, for example "turn left", "slightly right" or "about three steps ahead".
The caller wears glasses with one vibration motor, and a long buzz always means "careful, something is ahead".
Call the buzz tool with stop first, then explain, when you see an immediate hazard. Call buzz with found
when what they asked for is straight ahead (that is three quick taps). Never buzz for left or right.
The glasses also have a distance sensor that buzzes on its own when something gets close in front of them.`;
const OBSTACLE_WARNING_GAP_MS = 8000; // speak an obstacle warning at most this often
const OBSTACLE_CLEAR_MS = 3000; // no reading for this long = the path was clear, so the next one is new
const LOOK_TIMEOUT_MS = 8000; // a camera answer slower than this is dropped so the call never goes silent
// Said once, as soon as FaceTime is ready. Keep it short: it is the first thing the caller hears.
const greeting = 'Greet the caller in one short sentence: say you are Odyssey, their AI guide, and ask how you can help.';

const agent = defineAgent({
  entry: async ctx => {
    await ctx.connect(undefined, AutoSubscribe.SUBSCRIBE_ALL);
    // Chert prepares a room before a caller exists. Join promptly so Chert can
    // find us, but wait before opening a paid model session or sending video.
    const caller = await ctx.waitForParticipant();

    // Video: one camera track, published by this agent. The Mac shows video only
    // from the participant that speaks, so the picture and the voice stay together.
    const source = new VideoSource(WIDTH, HEIGHT);
    const track = LocalVideoTrack.createVideoTrack('agent-video', source);
    let tick = 0, speaking = false;
    const frame = () => source.captureFrame(new VideoFrame(drawFace(tick++, speaking), WIDTH, HEIGHT, VideoBufferType.RGBA));
    frame();
    await ctx.room.localParticipant.publishTrack(track, { source: TrackSource.SOURCE_CAMERA });
    const timer = setInterval(frame, 1000 / FPS);

    // The caller's camera: keep the latest frame for the look tool.
    const vision = watchCallerVideo(ctx.room, caller.identity);
    const look = llm.tool({
      name: 'look',
      description: "Look through the caller's camera and answer a question about what is in view. Use for anything visual.",
      parameters: z.object({ question: z.string().describe('What the caller wants to know about the view, e.g. "What do you see?"') }),
      execute: async ({ question }) => {
        const shot = await vision.snapshot();
        if (!shot) return 'No camera video has arrived yet. Ask the caller to turn on their camera.';
        const started = Date.now();
        try {
          // Never leave the caller in silence: give up after LOOK_TIMEOUT_MS.
          const answer = await Promise.race([
            describeFrame(shot.jpeg, question),
            new Promise(resolve => setTimeout(() => resolve(null), LOOK_TIMEOUT_MS)),
          ]);
          console.log(`[look] ${answer ? 'answered' : 'timed out'} in ${Date.now() - started} ms`);
          return answer ?? 'The camera view is taking too long to analyze. Tell the caller you could not see clearly and ask them to try again.';
        } catch (err) {
          console.error('look failed', err);
          return 'The camera view could not be analyzed just now.';
        }
      },
    });

    // The caregiver dashboard: one Supabase row per call, transcript and buzzes as they happen.
    // Not awaited, so a slow network never delays the call; rows before it exists are skipped.
    let callId = null;
    const callReady = startCall().then(id => { callId = id; });

    // The glasses: buzz commands out over USB serial, obstacle readings back.
    let session = null;
    let greeted = false; // no spoken warnings before FaceTime is ready
    let lastWarning = 0;
    let lastObstacle = 0;
    const glasses = connectGlasses({
      onObstacle: cm => {
        // The UNO repeats O:<cm> every second while something stays close. Speak only
        // when a new obstacle appears (nothing seen for a few seconds before it), so the
        // AI does not keep saying "stop" about the same desk or wall; the glasses keep
        // spinning on their own the whole time.
        const now = Date.now();
        const newObstacle = now - lastObstacle > OBSTACLE_CLEAR_MS;
        lastObstacle = now;
        if (newObstacle) logAlert(callId, 'obstacle', cm);
        if (!greeted || !newObstacle || now - lastWarning < OBSTACLE_WARNING_GAP_MS) return;
        lastWarning = now;
        try {
          session.generateReply({ instructions: `The glasses' distance sensor sees something ${cm} centimeters straight ahead. Warn the caller to stop in five words or fewer.` });
        } catch (err) {
          console.error('[glasses] obstacle warning failed', err);
        }
      },
    });
    const buzz = llm.tool({
      name: 'buzz',
      description: "Buzz the caller's glasses (one motor). stop: a long buzz, halt immediately for a hazard. found: three quick taps, what they asked for is straight ahead. Directions such as left or right are spoken, never buzzed.",
      parameters: z.object({ direction: z.enum(['found', 'stop']) }),
      execute: async ({ direction }) => {
        const sent = glasses.buzz(direction);
        logAlert(callId, direction === 'stop' ? 'obstacle' : direction);
        console.log(`[glasses] buzz ${direction}${sent ? '' : ' (glasses not connected)'}`);
        return sent ? `Buzzed ${direction}.` : 'The glasses are not connected right now, so say the direction out loud.';
      },
    });

    session = new voice.AgentSession({
      llm: new google.realtime.RealtimeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-native-audio-preview-12-2025', voice: 'Puck' }),
    });
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, event => { speaking = event.newState === 'speaking'; });
    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, ({ item }) => {
      if (item?.type !== 'message') return;
      if (item.role === 'user' || item.role === 'assistant') logMessage(callId, item.role === 'user' ? 'user' : 'agent', item.textContent);
    });
    ctx.addShutdownCallback(async () => {
      const ending = callReady.then(() => endCall(callId)); // ended_at + summary for the dashboard
      clearInterval(timer);
      vision.stop();
      await glasses.close();
      await session.close();
      await track.close();
      await source.close();
      await ending;
    });
    await session.start({
      room: ctx.room,
      agent: new voice.Agent({ instructions, tools: [look, buzz] }),
      record: false,
      inputOptions: {
        participantIdentity: caller.identity,
        audioEnabled: true,
        videoEnabled: false,
        textEnabled: false,
        closeOnDisconnect: true,
        deleteRoomOnClose: false,
      },
      outputOptions: { audioEnabled: true, transcriptionEnabled: false },
    });
    // Greet once when chert dev reports that FaceTime is ready (bridge_ready in the
    // room metadata): the Mac ends the call if it hears nothing within 10 seconds
    // of that. Participant arrival alone is not readiness, so there is no greeting
    // on it. Without the signal there is no greeting, and the caller speaks first.
    const stopGreeting = greetOnBridgeReady(ctx.room, () => {
      greeted = true;
      return session.generateReply({ instructions: greeting });
    });
    ctx.addShutdownCallback(async () => stopGreeting());
  },
});

export default agent;

// Your own LiveKit project when .env.local has its three LIVEKIT_ values; otherwise Chert rooms through chert dev.
runAgent(agent, { file: fileURLToPath(import.meta.url), agentName: process.env.AGENT_NAME || 'video-agent' });

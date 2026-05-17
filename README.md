# Test12

A voice-first micro-posting app. Tap the mic, say your name and your message,
confirm, and it gets posted. When you open the page, every existing original
post is read aloud so you can catch up with your eyes off the screen — and
you can reply to any post entirely by voice, without ever touching a number
or the keyboard.

**Live demo:** <https://test12.net> — try it without installing anything.

Test12 ships with **two ways to talk**:

- **Public Voice Posts** at [`/`](https://test12.net/) — a shared, threaded
  feed everyone on the server sees, with auto-read catch-up and voice
  replies.
- **Private Voice Channels** at [`/private`](https://test12.net/private) —
  disposable 1-on-1 chat rooms reachable only by their share-link URL.

Both are powered by [xAI Grok](https://docs.x.ai) for speech-to-text,
text-to-speech, and natural-language parsing of spoken posts and reply
targets.

## Features

- One-button voice flow: record → confirm → publish
- xAI Grok STT for input, Grok TTS for output
- Grok `grok-3-mini` extracts `{ name, message }` from natural sentences such
  as *"hi my name is Jonathan and the post is have a great day"*
- **Voice replies** — after the auto-read, the app asks "Do you want to reply
  to one of these posts?". Say *"yes"*, then describe the post in your own
  words (*"Alice's hello post"*, *"reply to Bob about hi"*) and Grok matches
  it to the right post for you. No numbers to remember.
- **Threaded posts** up to 3 levels deep (original → reply → reply-to-reply).
  The Reply button is hidden once a thread reaches the deepest level.
- **Private 1-on-1 channels** with shareable URLs — create a room, send the
  link to one other person, and chat by voice or text in real time over
  WebSockets (with a polling fallback).
- **Auto-read narrates only original posts** so the catch-up stays short;
  replies are still visible in the feed and remain reachable for voice
  replies.
- **Resilient voice flow** — if the mic catches silence or STT fails, the
  app keeps you in the same conversational step instead of dropping you back
  to "record a new post". `[reply-flow]` console logs make the state machine
  easy to debug.
- Posts persisted in MySQL (with `parent_id` / `level` for threads) and
  rendered live in the Voice Posts panel
- Typed-text fallback (the textarea + Post button) for keyboard users

## Prerequisites

- Node.js 18+
- MySQL 8+ reachable from where you run the server (the database itself must
  exist; the `voice_post` table is created automatically on boot)
- An xAI API key with access to `grok-stt`, `grok-tts`, and `grok-3-mini`

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the example env file and fill in your credentials:

   ```bash
   cp .env.example .env
   ```

   Then edit `.env`:

   - `XAI_API_KEY` — your xAI API key
   - `MYSQL_URL` — connection URL to your MySQL database
     (e.g. `mysql://root:password@127.0.0.1:3306/test12`)

   The database referenced in the URL must already exist. The server will
   create the `voice_post` table on first boot.

3. Start the server:

   ```bash
   npm start
   ```

   The app is now at <http://localhost:3000>.

   If MySQL is unreachable on boot, the server still runs and the rest of the
   app works — only the Voice Posts panel will show "Posts unavailable".

## How to use

### Example (60-second walkthrough)

You can try this on the live deployment at <https://test12.net> or against
your own server at <http://localhost:3000> after running `npm start`.

1. Open <https://test12.net> in a browser and tap once anywhere so the
   browser unlocks audio playback.
2. Tap the mic and say *"my name is Maria and the post is have a beautiful
   day"*. Tap the mic again to stop.
3. Test12 reads back what it understood — say *"confirm"* to publish (or
   *"cancel"* to discard).
4. Your post appears at the top of the **Voice Posts** panel and Test12
   says *"Posted. Thanks Maria."*
5. Want a 1-on-1 conversation instead? Click **Private Channels** (or visit
   <https://test12.net/private>), create a room, copy the link, and send it
   to a friend. See [Private channels](#private-channels-1-on-1-voice-rooms-at-private)
   below.

That's the whole loop. Everything else is variations on it.

### Public channel (the Voice Posts feed at `/`)

The home page is one big **public** feed — anyone with access to the server
sees the same posts. It's where you go for broadcast-style messages and
threaded discussions.

**Posting:**

1. **Open the page.** You'll see "Tap anywhere to play all posts". Tap once
   anywhere — Test12 reads every original post aloud as
   *"Post N, from &lt;name&gt;: &lt;message&gt;"*.
2. **Stop the auto-read** at any time by tapping the mic.
3. **Record a new post.** Tap the mic and say your name and your message in
   one sentence, e.g. *"my name is Maria and the post is have a beautiful
   day"*. Tap the mic again to stop.
4. **Confirm.** Test12 reads back what it understood and asks you to say
   `confirm`. Tap the mic, say `confirm` (or `cancel` to discard), and tap
   again to stop.
5. **Done.** The new post appears in the Voice Posts panel immediately and
   Test12 says *"Posted. Thanks &lt;name&gt;."*

**Replying by voice:**

After the auto-read finishes, Test12 asks
*"Do you want to reply to one of these posts?"*.

1. Tap the mic and say *"yes"* (or *"no"* / *"cancel"* to skip).
2. Test12 asks for the post by name. Tap the mic and say something like
   *"Alice's hello post"* or *"reply to Bob about hi"* — Grok matches your
   description against the eligible posts and confirms the target.
3. Tap the mic and say your name and your reply
   (*"my name is Carol and that's a great greeting"*).
4. Confirm with *"confirm"* (or *"cancel"*) and the reply is saved with the
   correct `parent_id`.

Threads are capped at 3 levels — once a post is at the deepest level the
Reply button is hidden and voice attempts at it are politely refused.

You can also type a message directly in the textarea and click **Post** — same
result, no voice required. Use the per-post **Reply** button to compose a
reply by keyboard.

### Private channels (1-on-1 voice rooms at `/private`)

Private channels are short-lived rooms identified by a random 12-character
ID. They're not listed anywhere — the only way in is the share URL, so
whoever holds the link can join.

**Create a channel:**

1. Visit <https://test12.net/private> (or <http://localhost:3000/private> on
   a self-hosted server, or click **Private Channels** from the home page).
2. Enter your display name and an optional channel name (e.g.
   *"Project Planning"*).
3. Click **Create Private Channel**. You'll get a URL like
   `https://test12.net/private/ab12cd34ef56` — use the copy button to put it
   on your clipboard.
4. Send that URL to the one person you want to chat with. Anyone with the
   link can join; nobody else can find the channel.

**Join a channel:**

1. Open the URL you were sent.
2. Type your name in the join overlay and click **Join Channel**.
3. The header shows the channel name, a live `n/2` participant counter, and
   a **Share** button to re-copy the link.

**Talk inside the channel:**

- **Type** a message in the compose bar and press Enter (or click the send
  button).
- **Speak** by tapping (or holding) the mic button — your voice is
  transcribed via Grok STT and sent as a message. The other side's
  messages can be read aloud automatically.
- Messages are pushed in real time through API Gateway WebSockets when
  `WS_URL` is configured, with a polling fallback so the room still works
  without WebSockets.
- Closing the tab leaves the channel; reopening the URL re-joins it. The
  message history is preserved in MySQL for as long as the channel row
  exists.

## Project structure

```
.
├── app.js                 Express server + xAI proxy + channels API
├── server.js              Local entrypoint (node server.js → npm start)
├── db.js                  MySQL pool + voice_post & channel CRUD
├── ws-handler.js          API Gateway WebSocket connect/disconnect handler
├── ws-broadcast.js        Broadcast helper (DynamoDB + API Gateway Mgmt API)
├── public/
│   ├── index.html         Public Voice Posts UI
│   ├── index.css          Theme for the public feed
│   ├── app.js             Mic flow, TTS auto-read, posts rendering
│   ├── private.html       Private-channels landing page (create a room)
│   ├── channel.html       Private 1-on-1 chat room UI
│   ├── channel.css        Theme for private channels
│   └── channel.js         Channel client: WebSocket, polling, voice input
└── .env.example           Template — copy to .env and fill in
```

## API endpoints

### Public feed (Voice Posts)

| Method | Path                        | Purpose                                                                    |
| ------ | --------------------------- | -------------------------------------------------------------------------- |
| POST   | `/api/stt`                  | Proxy to xAI Grok STT                                                      |
| POST   | `/api/tts`                  | Proxy to xAI Grok TTS (returns MP3 stream)                                 |
| POST   | `/api/parse-post`           | `{ text }` → `{ name, message }` via grok-3-mini                           |
| POST   | `/api/match-reply-target`   | `{ text, candidates }` → `{ id, confidence, reason }` via grok-3-mini      |
| POST   | `/api/voice-posts`          | Insert a new post `{ text, author, parent_id? }` (replies use `parent_id`) |
| GET    | `/api/voice-posts`          | List recent posts as a tree (newest first)                                 |

### Private channels

| Method | Path                              | Purpose                                                                       |
| ------ | --------------------------------- | ----------------------------------------------------------------------------- |
| POST   | `/api/channels`                   | Create a new channel `{ name?, author }` → `{ channel, url: "/private/:id" }` |
| GET    | `/api/channels/:id`               | Channel info + recent messages + live user count + WebSocket URL              |
| POST   | `/api/channels/:id/messages`      | Send a message `{ text, author }` — also broadcast over WebSocket             |
| GET    | `/api/channels/:id/messages`      | List messages (supports `?after_id=` for polling)                             |
| GET    | `/private`                        | Landing page to create a channel                                              |
| GET    | `/private/:id`                    | The 1-on-1 chat room page                                                     |

## Notes

- The browser blocks any audio playback until the user has interacted with
  the page. Test12 tries to autoplay on load and falls back to a "Tap
  anywhere to play" prompt if blocked.
- Posts are stored in MySQL as `voice_post (id, text, author, date,
  parent_id, level)`. The table is created automatically the first time the
  server starts. `level = 1` for original posts, `2` for replies, `3` for
  replies to replies; `4` and beyond are rejected by the server.
- The display name typed in "Posting as" is persisted in `localStorage` and
  used as the fallback author when the spoken sentence doesn't include a
  name.
- The voice reply matcher falls back to a local substring match (author
  name first, then any word longer than 3 characters from the post text) if
  the Grok call fails, so replies still work offline-ish.
- If STT returns an empty transcript or fails mid-flow, the app restores
  the previous `AWAITING_*` state instead of resetting to idle, so you can
  simply tap the mic and try again without losing your place in a reply or
  confirmation step.
- Private channels are stored in MySQL alongside their messages. The
  channel ID is a random 12-character slug — there is no listing endpoint,
  so anyone without the URL cannot discover an existing room.
- Real-time delivery in private channels uses an AWS API Gateway WebSocket
  + DynamoDB connection table. Set `WS_URL` to the WebSocket endpoint when
  deploying to production; if it is unset locally the client falls back to
  HTTP polling (`GET /api/channels/:id/messages?after_id=…`) and the room
  still works, just with a small delivery delay.

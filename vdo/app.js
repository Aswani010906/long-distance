const els = {
  roomCode: document.getElementById("roomCode"),
  startBtn: document.getElementById("startBtn"),
  createBtn: document.getElementById("createBtn"),
  joinBtn: document.getElementById("joinBtn"),
  hangupBtn: document.getElementById("hangupBtn"),
  status: document.getElementById("status"),
  localVideo: document.getElementById("localVideo"),
  remoteVideo: document.getElementById("remoteVideo"),
  movieUrl: document.getElementById("movieUrl"),
  loadMovieBtn: document.getElementById("loadMovieBtn"),
  moviePlayBtn: document.getElementById("moviePlayBtn"),
  moviePauseBtn: document.getElementById("moviePauseBtn"),
  movieBackBtn: document.getElementById("movieBackBtn"),
  movieForwardBtn: document.getElementById("movieForwardBtn"),
  movieSyncBtn: document.getElementById("movieSyncBtn"),
  movieStatus: document.getElementById("movieStatus"),
  moviePlayer: document.getElementById("moviePlayer"),
  youtubePlayerWrap: document.getElementById("youtubePlayerWrap"),
};

const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const BUILD = "broadcast-v2026-02-13b";

const state = {
  tabId: `tab_${Math.random().toString(36).slice(2, 10)}`,
  role: null,
  roomId: null,
  pc: null,
  channel: null,
  localStream: null,
  remoteStream: null,
  joined: false,
  pendingCandidates: [],
  suppressMovieBroadcast: false,
  movieMode: null,
  currentMediaUrl: "",
  ytPlayer: null,
  ytApiReady: false,
};

init();

function init() {
  els.startBtn.addEventListener("click", startCamera);
  els.createBtn.addEventListener("click", createRoom);
  els.joinBtn.addEventListener("click", joinRoom);
  els.hangupBtn.addEventListener("click", hangUp);

  els.loadMovieBtn.addEventListener("click", loadMovie);
  els.moviePlayBtn.addEventListener("click", () => controlMovie("play"));
  els.moviePauseBtn.addEventListener("click", () => controlMovie("pause"));
  els.movieBackBtn.addEventListener("click", () => controlMovie("seek", -10));
  els.movieForwardBtn.addEventListener("click", () => controlMovie("seek", 10));
  els.movieSyncBtn.addEventListener("click", () => {
    if (!state.joined) {
      setMovieStatus("Join/create room first to sync movie.");
      return;
    }
    sendSignal({ type: "movie-sync-state", payload: getMovieSnapshot() });
    setMovieStatus("Movie sync snapshot sent.");
  });

  setupMovieEventBroadcast();

  setButtons({
    start: true,
    create: false,
    join: false,
    hangup: false,
  });

  // Warn users when the page is opened via file:// — BroadcastChannel and
  // cross-tab communication can be unreliable with file origins in some browsers.
  if (location.protocol === "file:") {
    setStatus(
      `Ready (${BUILD}). NOTE: Serving via file:// may block cross-tab signalling. Use a local http server (python -m http.server) and open http://localhost to allow video calls.`
    );
  } else {
    setStatus(`Ready (${BUILD}). Open this page in two tabs and use the same room code.`);
  }
}

async function startCamera() {
  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    state.remoteStream = new MediaStream();

    els.localVideo.srcObject = state.localStream;
    els.remoteVideo.srcObject = state.remoteStream;

    setButtons({
      start: false,
      create: true,
      join: true,
      hangup: false,
    });
    setStatus("Camera started. Create room in one tab, join in the other.");
  } catch (error) {
    setStatus(`Camera/mic failed: ${describeError(error)}. Allow permission in browser.`);
  }
}

async function createRoom() {
  const roomId = sanitizeRoomCode(els.roomCode.value);
  if (!roomId) {
    setStatus("Enter a room code first.");
    return;
  }
  if (!state.localStream) {
    setStatus("Start camera first.");
    return;
  }

  await prepareSession("caller", roomId);

  try {
    const offer = await state.pc.createOffer();
    await state.pc.setLocalDescription(offer);

    sendSignal({
      type: "offer",
      sdp: serializeDescription(offer),
    });

    setButtons({ start: false, create: false, join: false, hangup: true });
    setStatus(`Room ${roomId} created. In other tab, enter same code and click Join Room.`);
  } catch (error) {
    setStatus(`Create room failed: ${describeError(error)}`);
  }
}

async function joinRoom() {
  const roomId = sanitizeRoomCode(els.roomCode.value);
  if (!roomId) {
    setStatus("Enter a room code first.");
    return;
  }
  if (!state.localStream) {
    setStatus("Start camera first.");
    return;
  }

  await prepareSession("callee", roomId);
  setButtons({ start: false, create: false, join: false, hangup: true });

  sendSignal({ type: "join-request" });
  setStatus(`Joining room ${roomId}. Waiting for offer...`);
}

async function prepareSession(role, roomId) {
  await cleanupSession(false);

  state.role = role;
  state.roomId = roomId;
  state.joined = true;

  state.remoteStream = new MediaStream();
  els.remoteVideo.srcObject = state.remoteStream;

  state.pc = new RTCPeerConnection(rtcConfig);

  state.localStream.getTracks().forEach((track) => {
    state.pc.addTrack(track, state.localStream);
  });

  state.pc.addEventListener("icecandidate", (event) => {
    if (!event.candidate) return;
    sendSignal({ type: "ice", candidate: serializeCandidate(event.candidate) });
  });

  state.pc.addEventListener("track", (event) => {
    // event.streams may be empty in some implementations; handle both
    // event.streams and event.track cases for maximum compatibility.
    try {
      if (event.streams && event.streams.length && event.streams[0]) {
        event.streams[0].getTracks().forEach((track) => state.remoteStream.addTrack(track));
      } else if (event.track) {
        state.remoteStream.addTrack(event.track);
      }
    } catch (e) {
      console.debug("track handler error:", e);
    }
  });

  state.pc.addEventListener("connectionstatechange", () => {
    const c = state.pc?.connectionState;
    if (c === "connected") setStatus("Call connected.");
    if (c === "connecting") setStatus("Connecting...");
    if (c === "disconnected" || c === "failed") {
      setStatus("Call disconnected. Recreate and rejoin room.");
    }
  });

  openChannel(roomId);
}

function openChannel(roomId) {
  if (state.channel) {
    state.channel.close();
  }

  state.channel = new BroadcastChannel(`video-room-${roomId}`);
  state.channel.onmessage = async (event) => {
    const msg = event.data;
    // debug incoming message
    console.debug("[signal] recv:", msg);
    if (!msg || msg.from === state.tabId) return;

    if (msg.type === "join-request" && state.role === "caller") {
      if (state.pc?.localDescription) {
        sendSignal({ type: "offer", sdp: serializeDescription(state.pc.localDescription) });
      }
      sendSignal({ type: "movie-sync-state", payload: getMovieSnapshot() });
      return;
    }

    if (msg.type === "offer" && state.role === "callee") {
      await onOffer(msg.sdp);
      return;
    }

    if (msg.type === "answer" && state.role === "caller") {
      await onAnswer(msg.sdp);
      return;
    }

    if (msg.type === "ice") {
      await onIce(msg.candidate);
      return;
    }

    if (msg.type === "movie-load") {
      if (msg.mode === "youtube" || isYouTubeUrl(msg.url)) {
        await applyYouTubeLoad(msg.url, false);
      } else {
        await applyMovieLoad(msg.url, false);
      }
      return;
    }

    if (msg.type === "movie-control") {
      await applyRemoteMovieControl(msg.mode, msg.action, msg.value);
      return;
    }

    if (msg.type === "movie-sync-state") {
      await applyRemoteMovieSync(msg.payload);
      return;
    }

    if (msg.type === "hangup") {
      setStatus("Partner ended call.");
      await cleanupSession(true);
    }
  };
}

async function onOffer(offer) {
  try {
    if (!state.pc.remoteDescription || !state.pc.remoteDescription.type) {
      await state.pc.setRemoteDescription(new RTCSessionDescription(offer));
      // flush any queued remote ICE candidates that arrived early
      while (state.pendingCandidates.length) {
        const c = state.pendingCandidates.shift();
        try {
          await state.pc.addIceCandidate(new RTCIceCandidate(c));
        } catch (e) {
          // ignore individual candidate errors
        }
      }
    }

    const answer = await state.pc.createAnswer();
    await state.pc.setLocalDescription(answer);
    sendSignal({ type: "answer", sdp: serializeDescription(answer) });
    setStatus("Offer received. Sending answer...");
  } catch (error) {
    setStatus(`Offer handling failed: ${describeError(error)}`);
  }
}

async function onAnswer(answer) {
  try {
    if (!state.pc.remoteDescription || !state.pc.remoteDescription.type) {
      await state.pc.setRemoteDescription(new RTCSessionDescription(answer));
      // flush any queued remote ICE candidates that arrived early
      while (state.pendingCandidates.length) {
        const c = state.pendingCandidates.shift();
        try {
          await state.pc.addIceCandidate(new RTCIceCandidate(c));
        } catch (e) {
          // ignore individual candidate errors
        }
      }
      setStatus("Answer received. Finalizing connection...");
    }
  } catch (error) {
    setStatus(`Answer handling failed: ${describeError(error)}`);
  }
}

async function onIce(candidateData) {
  try {
    if (!state.pc || !candidateData) return;
    // If remote description is not set yet, queue the candidate for later
    if (!state.pc.remoteDescription || !state.pc.remoteDescription.type) {
      state.pendingCandidates.push(candidateData);
      return;
    }
    await state.pc.addIceCandidate(new RTCIceCandidate(candidateData));
  } catch {
    // ignore occasional duplicate candidate errors
  }
}

function sendSignal(payload) {
  if (!state.channel) return;
  // allow sending certain control signals even if joined flag toggles
  try {
    const msg = {
      ...payload,
      from: state.tabId,
      roomId: state.roomId,
      ts: Date.now(),
    };
    console.debug("[signal] send:", msg);
    state.channel.postMessage(msg);
  } catch (error) {
    setStatus(`Signal send failed: ${describeError(error)}`);
  }
}

async function hangUp() {
  sendSignal({ type: "hangup" });
  await cleanupSession(true);
  setStatus("Call ended.");
}

async function cleanupSession(resetButtons) {
  state.joined = false;

  if (state.pc) {
    state.pc.ontrack = null;
    state.pc.onicecandidate = null;
    state.pc.close();
    state.pc = null;
  }

  if (state.channel) {
    state.channel.close();
    state.channel = null;
  }

  if (state.remoteStream) {
    state.remoteStream.getTracks().forEach((track) => track.stop());
    state.remoteStream = null;
  }

  // clear any queued candidates
  state.pendingCandidates = [];

  els.remoteVideo.srcObject = null;

  if (resetButtons) {
    setButtons({
      start: !state.localStream,
      create: Boolean(state.localStream),
      join: Boolean(state.localStream),
      hangup: false,
    });
  }
}

function setupMovieEventBroadcast() {
  els.moviePlayer.addEventListener("play", () => {
    if (state.suppressMovieBroadcast || !state.joined || state.movieMode !== "html5") return;
    sendSignal({ type: "movie-control", mode: "html5", action: "play", value: els.moviePlayer.currentTime });
  });

  els.moviePlayer.addEventListener("pause", () => {
    if (state.suppressMovieBroadcast || !state.joined || state.movieMode !== "html5") return;
    sendSignal({ type: "movie-control", mode: "html5", action: "pause", value: els.moviePlayer.currentTime });
  });

  els.moviePlayer.addEventListener("seeked", () => {
    if (state.suppressMovieBroadcast || !state.joined || state.movieMode !== "html5") return;
    sendSignal({ type: "movie-control", mode: "html5", action: "seek", value: els.moviePlayer.currentTime });
  });
}

async function loadMovie() {
  const url = els.movieUrl.value.trim();
  if (!url) {
    setMovieStatus("Paste a movie URL first.");
    return;
  }

  if (isYouTubeUrl(url)) {
    await applyYouTubeLoad(url, true);
  } else {
    await applyMovieLoad(url, true);
  }

  if (state.joined) {
    sendSignal({ type: "movie-load", url: state.currentMediaUrl || url, mode: state.movieMode });
    sendSignal({ type: "movie-sync-state", payload: getMovieSnapshot() });
  }
}

async function applyMovieLoad(url, localAction) {
  try {
    state.suppressMovieBroadcast = true;
    state.movieMode = "html5";
    state.currentMediaUrl = url;

    els.youtubePlayerWrap.style.display = "none";
    els.moviePlayer.style.display = "block";

    if (els.moviePlayer.src !== url) {
      els.moviePlayer.src = url;
    }
    els.moviePlayer.load();
    els.movieUrl.value = url;
    setMovieStatus(localAction ? "Movie loaded and shared." : "Partner loaded a movie.");
  } catch (error) {
    setMovieStatus(`Could not load movie URL: ${describeError(error)}`);
  } finally {
    state.suppressMovieBroadcast = false;
  }
}

async function applyYouTubeLoad(url, localAction) {
  const videoId = extractYouTubeId(url);
  if (!videoId) {
    setMovieStatus("Invalid YouTube URL.");
    return;
  }

  try {
    state.suppressMovieBroadcast = true;
    state.movieMode = "youtube";
    state.currentMediaUrl = normalizeYouTubeUrl(videoId);

    els.moviePlayer.pause();
    els.moviePlayer.style.display = "none";
    els.youtubePlayerWrap.style.display = "block";
    els.movieUrl.value = state.currentMediaUrl;

    await ensureYouTubeApi();
    await createOrLoadYouTubePlayer(videoId);

    setMovieStatus(localAction ? "YouTube video loaded and shared." : "Partner loaded a YouTube video.");
  } catch (error) {
    setMovieStatus(`Could not load YouTube video: ${describeError(error)}`);
  } finally {
    state.suppressMovieBroadcast = false;
  }
}

async function controlMovie(action, value = 0) {
  if (!state.movieMode) {
    setMovieStatus("Load a movie URL first.");
    return;
  }

  try {
    if (state.movieMode === "youtube") {
      if (!state.ytPlayer) {
        setMovieStatus("YouTube player not ready yet.");
        return;
      }

      if (action === "play") {
        state.ytPlayer.playVideo();
      } else if (action === "pause") {
        state.ytPlayer.pauseVideo();
      } else if (action === "seek") {
        const next = Math.max(0, Number(state.ytPlayer.getCurrentTime() || 0) + Number(value || 0));
        state.ytPlayer.seekTo(next, true);
      }

      if (state.joined) {
        sendSignal({
          type: "movie-control",
          mode: "youtube",
          action,
          value: Number(state.ytPlayer.getCurrentTime() || 0),
        });
      }
      return;
    }

    if (action === "play") {
      await els.moviePlayer.play();
    } else if (action === "pause") {
      els.moviePlayer.pause();
    } else if (action === "seek") {
      els.moviePlayer.currentTime = Math.max(0, els.moviePlayer.currentTime + Number(value || 0));
    }
  } catch (error) {
    setMovieStatus(`Movie control failed: ${describeError(error)}`);
  }
}

async function applyRemoteMovieControl(mode, action, value) {
  if (!state.movieMode) return;

  try {
    state.suppressMovieBroadcast = true;

    if ((mode || state.movieMode) === "youtube") {
      if (!state.ytPlayer) return;

      if (action === "seek") {
        state.ytPlayer.seekTo(Number(value || 0), true);
      } else if (action === "play") {
        if (typeof value === "number") state.ytPlayer.seekTo(value, true);
        state.ytPlayer.playVideo();
      } else if (action === "pause") {
        if (typeof value === "number") state.ytPlayer.seekTo(value, true);
        state.ytPlayer.pauseVideo();
      }
    } else {
      if (action === "seek") {
        els.moviePlayer.currentTime = Number(value || 0);
      } else if (action === "play") {
        if (typeof value === "number") els.moviePlayer.currentTime = value;
        await els.moviePlayer.play();
      } else if (action === "pause") {
        if (typeof value === "number") els.moviePlayer.currentTime = value;
        els.moviePlayer.pause();
      }
    }

    setMovieStatus("Movie synced from partner.");
  } catch (error) {
    setMovieStatus(`Remote movie control failed: ${describeError(error)}`);
  } finally {
    state.suppressMovieBroadcast = false;
  }
}

async function applyRemoteMovieSync(payload) {
  if (!payload || !payload.url) return;

  try {
    state.suppressMovieBroadcast = true;

    if (payload.mode === "youtube" || isYouTubeUrl(payload.url)) {
      await applyYouTubeLoad(payload.url, false);
      if (state.ytPlayer && typeof payload.time === "number") {
        state.ytPlayer.seekTo(payload.time, true);
      }
      if (payload.paused === false) {
        state.ytPlayer.playVideo();
      } else {
        state.ytPlayer.pauseVideo();
      }
    } else {
      if (els.moviePlayer.src !== payload.url || state.movieMode !== "html5") {
        await applyMovieLoad(payload.url, false);
      }
      if (typeof payload.time === "number" && Number.isFinite(payload.time)) {
        els.moviePlayer.currentTime = payload.time;
      }
      if (payload.paused === false) {
        await els.moviePlayer.play();
      } else {
        els.moviePlayer.pause();
      }
    }

    els.movieUrl.value = payload.url;
    setMovieStatus("Movie state synced with partner.");
  } catch (error) {
    setMovieStatus(`Movie sync failed: ${describeError(error)}`);
  } finally {
    state.suppressMovieBroadcast = false;
  }
}

function sanitizeRoomCode(input) {
  return input.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24);
}

function setStatus(message) {
  els.status.textContent = message;
}

function setMovieStatus(message) {
  els.movieStatus.textContent = message;
}

function setButtons({ start, create, join, hangup }) {
  els.startBtn.disabled = !start;
  els.createBtn.disabled = !create;
  els.joinBtn.disabled = !join;
  els.hangupBtn.disabled = !hangup;
}

function describeError(error) {
  return error?.message || "Unknown error";
}

function serializeDescription(desc) {
  if (!desc) return null;
  return {
    type: desc.type,
    sdp: desc.sdp,
  };
}

function serializeCandidate(candidate) {
  if (!candidate) return null;
  return typeof candidate.toJSON === "function"
    ? candidate.toJSON()
    : {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
        usernameFragment: candidate.usernameFragment,
      };
}

function getMovieSnapshot() {
  if (state.movieMode === "youtube" && state.ytPlayer) {
    const playerState = state.ytPlayer.getPlayerState();
    return {
      mode: "youtube",
      url: state.currentMediaUrl,
      time: Number(state.ytPlayer.getCurrentTime() || 0),
      paused: playerState !== 1,
    };
  }
  return {
    mode: "html5",
    url: els.moviePlayer.currentSrc || els.moviePlayer.src || state.currentMediaUrl || "",
    time: Number.isFinite(els.moviePlayer.currentTime) ? els.moviePlayer.currentTime : 0,
    paused: els.moviePlayer.paused,
  };
}

function isYouTubeUrl(url) {
  return /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)/i.test(url);
}

function extractYouTubeId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.replace("/", "").trim();
    }
    if (parsed.searchParams.get("v")) {
      return parsed.searchParams.get("v");
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    const embedIndex = parts.indexOf("embed");
    if (embedIndex >= 0 && parts[embedIndex + 1]) {
      return parts[embedIndex + 1];
    }
  } catch {
    return "";
  }
  return "";
}

function normalizeYouTubeUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

async function ensureYouTubeApi() {
  if (window.YT && window.YT.Player) {
    state.ytApiReady = true;
    return;
  }
  if (state.ytApiReady) return;

  await new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      state.ytApiReady = true;
      if (typeof previous === "function") previous();
      resolve();
    };

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.appendChild(script);
  });
}

async function createOrLoadYouTubePlayer(videoId) {
  if (state.ytPlayer) {
    state.ytPlayer.loadVideoById(videoId);
    return;
  }

  await new Promise((resolve) => {
    state.ytPlayer = new window.YT.Player("youtubePlayer", {
      videoId,
      playerVars: {
        playsinline: 1,
        rel: 0,
      },
      events: {
        onReady: () => resolve(),
        onStateChange: (event) => {
          if (state.suppressMovieBroadcast || !state.joined) return;
          const ytState = event.data;
          if (ytState === window.YT.PlayerState.PLAYING) {
            sendSignal({
              type: "movie-control",
              mode: "youtube",
              action: "play",
              value: Number(state.ytPlayer.getCurrentTime() || 0),
            });
          } else if (ytState === window.YT.PlayerState.PAUSED) {
            sendSignal({
              type: "movie-control",
              mode: "youtube",
              action: "pause",
              value: Number(state.ytPlayer.getCurrentTime() || 0),
            });
          }
        },
      },
    });
  });
}
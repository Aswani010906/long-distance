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
  movieSyncBtn: document.getElementById("movieSyncBtn"),
  movieBackBtn: document.getElementById("movieBackBtn"),
  movieForwardBtn: document.getElementById("movieForwardBtn"),
  moviePlayer: document.getElementById("moviePlayer"),
  movieStatus: document.getElementById("movieStatus"),
  youtubePlayerWrap: document.getElementById("youtubePlayerWrap"),
};

const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

const state = {
  tabId: `tab_${Math.random().toString(36).slice(2, 10)}`,
  pc: null,
  channel: null,
  dataChannel: null,
  localStream: null,
  isRemoteChange: false,
  youtubeApiReady: false,
  youtubePlayer: null,
  youtubeReady: false,
  pendingYouTubeSeek: null,
  movieMode: "none",
};

// --- 1. CAMERA & CONNECTION (STAYED THE SAME) ---

els.startBtn.onclick = async () => {
  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    els.localVideo.srcObject = state.localStream;
    updateStatus("Camera Active. Enter code and Create or Join.");
  } catch (e) {
    updateStatus("Camera Error: Please allow permissions.");
  }
};

els.createBtn.onclick = () => initSession(true);
els.joinBtn.onclick = () => initSession(false);

els.hangupBtn.onclick = () => {
  sendSignal({ type: "hangup" });
  handleHangup();
};

async function initSession(isCaller) {
  const roomId = els.roomCode.value.trim();
  if (!roomId || !state.localStream) return alert("Start camera and enter room code!");

  state.pc = new RTCPeerConnection(rtcConfig);
  state.channel = new BroadcastChannel(`room_${roomId}`);

  state.localStream.getTracks().forEach(t => state.pc.addTrack(t, state.localStream));

  state.pc.ontrack = e => {
    if (e.streams[0]) els.remoteVideo.srcObject = e.streams[0];
  };

  state.pc.onicecandidate = e => {
    if (e.candidate) sendSignal({ type: "ice", candidate: e.candidate });
  };

  if (isCaller) {
    state.dataChannel = state.pc.createDataChannel("movieSync");
    setupDataChannel(state.dataChannel);
    const offer = await state.pc.createOffer();
    await state.pc.setLocalDescription(offer);
    sendSignal({ type: "offer", sdp: offer });
    updateStatus("Room Created. Waiting for partner...");
  } else {
    state.pc.ondatachannel = e => setupDataChannel(e.channel);
    sendSignal({ type: "request-offer" });
    updateStatus("Joining...");
  }

  state.channel.onmessage = async ({ data }) => {
    if (data.from === state.tabId) return;
    if (data.type === "hangup") return handleHangup();

    if (data.type === "request-offer" && isCaller) {
      const offer = await state.pc.createOffer();
      await state.pc.setLocalDescription(offer);
      sendSignal({ type: "offer", sdp: offer });
    } else if (data.type === "offer" && !isCaller) {
      await state.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await state.pc.createAnswer();
      await state.pc.setLocalDescription(answer);
      sendSignal({ type: "answer", sdp: answer });
    } else if (data.type === "answer") {
      await state.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    } else if (data.type === "ice") {
      state.pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {});
    }
  };
}

// --- 2. THE MOVIE PLAYER (CORRECTED) ---

els.loadMovieBtn.onclick = () => {
  const url = els.movieUrl.value.trim();
  if (!url) return;

  applyMovieSource(url);
  // Send the URL to partner
  broadcastData({ type: "load", url: url });
};

function applyMovieSource(url) {
  if (isYouTubeUrl(url)) {
    showYouTubePlayer();
    loadYouTubeVideo(url);
    updateMovieStatus("YouTube video loaded.");
    return;
  }

  showNativeMoviePlayer();
  els.moviePlayer.pause();
  els.moviePlayer.src = url;
  els.moviePlayer.load();
  els.moviePlayer.play().then(() => {
    updateMovieStatus("Video loaded and playing.");
  }).catch(() => {
    updateMovieStatus("Video loaded. Click Play.");
  });
}

els.moviePlayBtn.onclick = () => handleVideoAction("play");
els.moviePauseBtn.onclick = () => handleVideoAction("pause");
els.movieBackBtn.onclick = () => handleVideoAction("seek", -10);
els.movieForwardBtn.onclick = () => handleVideoAction("seek", 10);
els.movieSyncBtn.onclick = () => handleSyncNow();

function handleSyncNow() {
  if (state.movieMode === "none") {
    updateMovieStatus("Load a movie first.");
    return;
  }

  const payload = {
    type: "sync",
    time: getPlaybackTime(),
    paused: isPlaybackPaused(),
  };
  const sent = broadcastData(payload);
  updateMovieStatus(sent ? "Synced partner to your current time." : "Partner not connected yet.");
}

function handleVideoAction(action, val = 0) {
  if (state.isRemoteChange) return;

  if (action === "seek") {
    const seekOk = seekBy(Number(val || 0));
    if (!seekOk) return;
  } else if (state.movieMode === "youtube") {
    if (!state.youtubePlayer) {
      updateMovieStatus("YouTube player is still loading.");
      return;
    }
    if (action === "play") state.youtubePlayer.playVideo();
    if (action === "pause") state.youtubePlayer.pauseVideo();
  } else {
    if (action === "play") els.moviePlayer.play().catch(() => {});
    if (action === "pause") els.moviePlayer.pause();
  }

  broadcastData({
    type: "control",
    action: action,
    time: getPlaybackTime()
  });
}

function setupDataChannel(channel) {
  state.dataChannel = channel;
  channel.onopen = () => updateStatus("Connected! Ready to watch together.");
  channel.onmessage = e => {
    const msg = JSON.parse(e.data);
    state.isRemoteChange = true; // Block loop

    if (msg.type === "load") {
      applyMovieSource(msg.url);
    } else if (msg.type === "control") {
      setPlaybackTime(msg.time);
      if (msg.action === "play") {
        if (state.movieMode === "youtube" && state.youtubePlayer) {
          state.youtubePlayer.playVideo();
        } else {
          els.moviePlayer.play().catch(() => {});
        }
      } else if (msg.action === "pause") {
        if (state.movieMode === "youtube" && state.youtubePlayer) {
          state.youtubePlayer.pauseVideo();
        } else {
          els.moviePlayer.pause();
        }
      }
    } else if (msg.type === "sync") {
      setPlaybackTime(msg.time);
      if (msg.paused === true) {
        if (state.movieMode === "youtube" && state.youtubePlayer) {
          state.youtubePlayer.pauseVideo();
        } else {
          els.moviePlayer.pause();
        }
      } else if (msg.paused === false) {
        if (state.movieMode === "youtube" && state.youtubePlayer) {
          state.youtubePlayer.playVideo();
        } else {
          els.moviePlayer.play().catch(() => {});
        }
      }
    }
    setTimeout(() => { state.isRemoteChange = false; }, 500);
  };
}

// --- 3. HELPERS ---

function handleHangup() {
  if (state.pc) state.pc.close();
  els.remoteVideo.srcObject = null;
  updateStatus("Call ended.");
}

function sendSignal(data) { 
  if (state.channel) state.channel.postMessage({ ...data, from: state.tabId }); 
}

function broadcastData(data) {
  if (state.dataChannel?.readyState === "open") {
    state.dataChannel.send(JSON.stringify(data));
    return true;
  }
  return false;
}

function updateStatus(txt) {
  els.status.textContent = txt;
}

function updateMovieStatus(txt) {
  if (els.movieStatus) els.movieStatus.textContent = txt;
}

function getPlaybackTime() {
  if (state.movieMode === "youtube" && state.youtubePlayer) {
    return Number(state.youtubePlayer.getCurrentTime?.() || 0);
  }
  return Number(els.moviePlayer.currentTime || 0);
}

function setPlaybackTime(time) {
  const t = Number(time || 0);
  if (!Number.isFinite(t)) return;
  if (state.movieMode === "youtube" && state.youtubePlayer) {
    if (!state.youtubeReady) {
      state.pendingYouTubeSeek = Math.max(0, t);
      updateMovieStatus("YouTube player is preparing...");
      return;
    }
    state.youtubePlayer.seekTo(Math.max(0, t), true);
    return;
  }
  const video = els.moviePlayer;
  const duration = Number(video.duration);
  if (Number.isFinite(duration) && duration > 0) {
    video.currentTime = Math.max(0, Math.min(duration, t));
  } else {
    video.currentTime = Math.max(0, t);
  }
}

function isPlaybackPaused() {
  if (state.movieMode === "youtube" && state.youtubePlayer) {
    const playerState = Number(state.youtubePlayer.getPlayerState?.());
    return playerState !== 1;
  }
  return Boolean(els.moviePlayer.paused);
}

function isYouTubeUrl(url) {
  return /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/i.test(url);
}

function extractYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.split("/")[1] || "";
    if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || "";
    return u.searchParams.get("v") || "";
  } catch {
    return "";
  }
}

function showNativeMoviePlayer() {
  state.movieMode = "native";
  state.pendingYouTubeSeek = null;
  els.moviePlayer.style.display = "block";
  if (els.youtubePlayerWrap) els.youtubePlayerWrap.style.display = "none";
}

function showYouTubePlayer() {
  state.movieMode = "youtube";
  state.youtubeReady = false;
  els.moviePlayer.pause();
  els.moviePlayer.removeAttribute("src");
  els.moviePlayer.load();
  els.moviePlayer.style.display = "none";
  if (els.youtubePlayerWrap) els.youtubePlayerWrap.style.display = "block";
}

function ensureYouTubeApi() {
  if (window.YT && window.YT.Player) {
    state.youtubeApiReady = true;
    return Promise.resolve();
  }
  if (window.__ytApiPromise) return window.__ytApiPromise;

  window.__ytApiPromise = new Promise(resolve => {
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
    window.onYouTubeIframeAPIReady = () => {
      state.youtubeApiReady = true;
      resolve();
    };
  });
  return window.__ytApiPromise;
}

function loadYouTubeVideo(url) {
  const videoId = extractYouTubeId(url);
  if (!videoId) {
    updateMovieStatus("Invalid YouTube link.");
    return;
  }

  ensureYouTubeApi().then(() => {
    if (state.youtubePlayer) {
      state.youtubeReady = true;
      state.youtubePlayer.loadVideoById(videoId);
      if (state.pendingYouTubeSeek !== null) {
        state.youtubePlayer.seekTo(state.pendingYouTubeSeek, true);
        state.pendingYouTubeSeek = null;
      }
      return;
    }

    state.youtubePlayer = new YT.Player("youtubePlayer", {
      videoId,
      playerVars: {
        playsinline: 1,
        rel: 0,
      },
      events: {
        onReady: () => {
          state.youtubeReady = true;
          if (state.pendingYouTubeSeek !== null) {
            state.youtubePlayer.seekTo(state.pendingYouTubeSeek, true);
            state.pendingYouTubeSeek = null;
          }
        },
      },
    });
  }).catch(() => {
    updateMovieStatus("Failed to load YouTube player.");
  });
}

function seekBy(deltaSeconds) {
  const delta = Number(deltaSeconds);
  if (!Number.isFinite(delta) || delta === 0) return false;

  if (state.movieMode === "youtube") {
    if (!state.youtubePlayer) {
      updateMovieStatus("YouTube player is still loading.");
      return false;
    }
    if (!state.youtubeReady) {
      const current = Number(state.pendingYouTubeSeek ?? (state.youtubePlayer.getCurrentTime?.() || 0));
      const target = Math.max(0, current + delta);
      state.pendingYouTubeSeek = target;
      updateMovieStatus("Preparing YouTube seek...");
      return true;
    }
    const current = Number(state.youtubePlayer.getCurrentTime?.() || 0);
    const duration = Number(state.youtubePlayer.getDuration?.() || 0);
    const unclamped = current + delta;
    const target = duration > 0 ? Math.max(0, Math.min(duration, unclamped)) : Math.max(0, unclamped);
    state.youtubePlayer.seekTo(target, true);
    updateMovieStatus(`Seeked to ${Math.floor(target)}s.`);
    return true;
  }

  const video = els.moviePlayer;
  if (!video.currentSrc && !video.src) {
    updateMovieStatus("Load a movie first.");
    return false;
  }

  const applySeek = () => {
    const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    const duration = Number(video.duration);
    const unclamped = current + delta;
    const target = Number.isFinite(duration) && duration > 0
      ? Math.max(0, Math.min(duration, unclamped))
      : Math.max(0, unclamped);
    video.currentTime = target;
    updateMovieStatus(`Seeked to ${Math.floor(target)}s.`);
    return true;
  };

  if (video.readyState >= 1) return applySeek();

  video.addEventListener("loadedmetadata", () => {
    applySeek();
  }, { once: true });
  updateMovieStatus("Preparing video timeline...");
  return true;
}

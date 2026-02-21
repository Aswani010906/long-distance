const els = {
  roomCode: document.getElementById("roomCode"),
  startBtn: document.getElementById("startBtn"),
  createBtn: document.getElementById("createBtn"),
  joinBtn: document.getElementById("joinBtn"),
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
  movieStatus: document.getElementById("movieStatus"),
  debug: document.getElementById("debug"),
  moviePlayer: document.getElementById("moviePlayer"),
};

// Ensure the player will allow CORS-enabled loads and attempt preloading
try {
  els.moviePlayer.crossOrigin = "anonymous";
  els.moviePlayer.preload = "auto";
} catch (e) {}

const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

const state = {
  tabId: `tab_${Math.random().toString(36).slice(2, 10)}`,
  pc: null,
  channel: null,
  dataChannel: null,
  localStream: null,
  isRemoteChange: false,
};

// --- 1. CAMERA & CONNECTION (STABLE) ---
els.startBtn.onclick = async () => {
  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    els.localVideo.srcObject = state.localStream;
    updateStatus("Camera OK. Ready to connect.");
  } catch (e) {
    updateStatus("Camera Error: " + e.message);
  }
};

els.createBtn.onclick = async () => {
  await initSession(true);
  updateStatus("Room created. Waiting for partner...");
};

els.joinBtn.onclick = async () => {
  await initSession(false);
  updateStatus("Joined room. Waiting for connection...");
};

async function initSession(isCaller) {
  const roomId = els.roomCode.value.trim();
  if (!roomId || !state.localStream) return alert("Start camera and enter room code!");

  state.pc = new RTCPeerConnection(rtcConfig);
  state.channel = new BroadcastChannel(`room_${roomId}`);

  state.localStream.getTracks().forEach(t => state.pc.addTrack(t, state.localStream));
  state.pc.ontrack = e => { if (e.streams[0]) els.remoteVideo.srcObject = e.streams[0]; };
  state.pc.onicecandidate = e => { if (e.candidate) sendSignal({ type: "ice", candidate: e.candidate }); };

  if (isCaller) {
    state.dataChannel = state.pc.createDataChannel("movieSync");
    setupDataChannel(state.dataChannel);
    const offer = await state.pc.createOffer();
    await state.pc.setLocalDescription(offer);
    sendSignal({ type: "offer", sdp: offer });
    // show feedback when caller creates the room and offer is sent
    updateStatus("Room created and offer sent.");
  } else {
    state.pc.ondatachannel = e => setupDataChannel(e.channel);
    sendSignal({ type: "request-offer" });
  }

  state.channel.onmessage = async ({ data }) => {
    if (data.from === state.tabId) return;
    if (data.type === "request-offer" && isCaller) {
        const offer = await state.pc.createOffer();
        await state.pc.setLocalDescription(offer);
        sendSignal({ type: "offer", sdp: offer });
    } else if (data.type === "offer" && !isCaller) {
      await state.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await state.pc.createAnswer();
      await state.pc.setLocalDescription(answer);
      sendSignal({ type: "answer", sdp: answer });
      // provide UI feedback when callee processes an offer and replies
      updateStatus("Received offer — answered (joined room).");
    } else if (data.type === "answer") {
        await state.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      updateStatus("Partner answered — connection progressing...");
    } else if (data.type === "ice") {
        state.pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {});
    }
    // Accept movie-related messages over BroadcastChannel as a fallback
    else if (data.type === "load" || data.type === "control" || data.type === "sync") {
      // reuse the same handling as data channel messages
      state.isRemoteChange = true;
      if (data.type === "load") {
        els.moviePlayer.pause();
        els.moviePlayer.removeAttribute('src');
        els.moviePlayer.src = data.url;
        els.moviePlayer.load();
        els.moviePlayer.play().catch(() => {});
      } else if (data.type === "control" || data.type === "sync") {
        els.moviePlayer.currentTime = data.time;
        if (data.action === "play" || (data.type === "sync" && !data.paused)) {
          els.moviePlayer.play().catch(() => {});
        } else {
          els.moviePlayer.pause();
        }
      }
      setTimeout(() => { state.isRemoteChange = false; }, 600);
    }
  };
}

// --- 2. THE MOVIE PLAYER FIX ---

// Handle Player Errors
els.moviePlayer.onerror = () => {
  const err = els.moviePlayer.error;
  const code = err?.code ?? "unknown";
  const message = (() => {
    if (!err) return "unknown media error";
    switch (err.code) {
      case err.MEDIA_ERR_ABORTED: return 'You aborted the media playback.';
      case err.MEDIA_ERR_NETWORK: return 'A network error caused the media download to fail.';
      case err.MEDIA_ERR_DECODE: return 'The media playback was aborted due to a corruption problem or because the media used features your browser did not support.';
      case err.MEDIA_ERR_SRC_NOT_SUPPORTED: return 'The media could not be loaded, either because the server or network failed or because the format is not supported.';
      default: return 'Media error code ' + err.code;
    }
  })();
  logDebug(`mediaError code=${code} message=${message}`);
  updateStatus(`Error: ${message} (possible CORS or blocked resource)` , "movie");
};

els.loadMovieBtn.onclick = () => {
  const url = els.movieUrl.value.trim();
  if (!url) return;
  
  // 1. Force Reset Player
  els.moviePlayer.pause();
  els.moviePlayer.removeAttribute('src');
  // ensure crossOrigin is set so CORS-enabled hosts will reply correctly
  els.moviePlayer.crossOrigin = "anonymous";
  els.moviePlayer.load();
  
  // 2. Set New Source
  els.moviePlayer.src = url;
  try { els.moviePlayer.load(); } catch(e) {}
  
  // 3. Play and Notify
  const afterLoad = () => {
    updateStatus("Movie Loaded.", "movie");
    logDebug(`loaded -> ${url}`);
    broadcastData({ type: "load", url });
  };

  els.moviePlayer.play().then(() => {
    updateStatus("Movie Loaded & Playing.", "movie");
    logDebug(`play after load -> ${url}`);
    broadcastData({ type: "load", url });
  }).catch(e => {
    // autoplay blocked, still notify peers and show status
    afterLoad();
  });
};

els.moviePlayBtn.onclick = () => handleVideoAction("play");
els.moviePauseBtn.onclick = () => handleVideoAction("pause");
els.movieSyncBtn.onclick = () => {
  broadcastData({ 
    type: "sync", 
    time: els.moviePlayer.currentTime, 
    paused: els.moviePlayer.paused 
  });
  updateStatus("Sent Sync Command.", "movie");
  logDebug(`sent sync time=${els.moviePlayer.currentTime} paused=${els.moviePlayer.paused}`);
};

function handleVideoAction(action) {
  if (state.isRemoteChange) return;
  if (action === "play") els.moviePlayer.play();
  if (action === "pause") els.moviePlayer.pause();

  broadcastData({
    type: "control",
    action: action,
    time: els.moviePlayer.currentTime
  });
  logDebug(`sent control action=${action} time=${els.moviePlayer.currentTime}`);
}

// back/forward seek buttons
els.movieBackBtn?.addEventListener('click', () => {
  if (state.isRemoteChange) return;
  els.moviePlayer.currentTime = Math.max(0, els.moviePlayer.currentTime - 10);
  broadcastData({ type: 'control', action: 'seek', time: els.moviePlayer.currentTime });
  logDebug(`seek -10 -> ${els.moviePlayer.currentTime}`);
});

els.movieForwardBtn?.addEventListener('click', () => {
  if (state.isRemoteChange) return;
  els.moviePlayer.currentTime = els.moviePlayer.currentTime + 10;
  broadcastData({ type: 'control', action: 'seek', time: els.moviePlayer.currentTime });
  logDebug(`seek +10 -> ${els.moviePlayer.currentTime}`);
});

function setupDataChannel(channel) {
  state.dataChannel = channel;
  channel.onopen = () => updateStatus("Partner Connected & Sync Ready!");
  channel.onmessage = e => {
    const msg = JSON.parse(e.data);
    state.isRemoteChange = true;
    logDebug(`received over dataChannel: ${JSON.stringify(msg)}`);
    
    if (msg.type === "load") {
      els.moviePlayer.crossOrigin = "anonymous";
      els.moviePlayer.src = msg.url;
      try { els.moviePlayer.load(); } catch(e) {}
      els.moviePlayer.play().catch(() => {});
    } else if (msg.type === "control" || msg.type === "sync") {
      els.moviePlayer.currentTime = msg.time;
      if (msg.action === "play" || (msg.type === "sync" && !msg.paused)) {
        els.moviePlayer.play().catch(() => {});
      } else {
        els.moviePlayer.pause();
      }
    }
    
    setTimeout(() => { state.isRemoteChange = false; }, 600);
  };
}

// --- 3. HELPERS ---
function sendSignal(data) { state.channel.postMessage({ ...data, from: state.tabId }); }
function broadcastData(data) {
  if (state.dataChannel && state.dataChannel.readyState === "open") {
    state.dataChannel.send(JSON.stringify(data));
    logDebug(`sent over dataChannel: ${JSON.stringify(data)}`);
  } else if (state.channel) {
    state.channel.postMessage({ ...data, from: state.tabId });
    logDebug(`sent over BroadcastChannel: ${JSON.stringify(data)}`);
  }
}
function updateStatus(txt, target = "main") {
  if (target === "movie" && els.movieStatus) els.movieStatus.textContent = txt;
  else els.status.textContent = txt;
}

function logDebug(txt) {
  try {
    if (els.debug) {
      const n = document.createElement('div');
      n.textContent = `${new Date().toLocaleTimeString()} — ${txt}`;
      els.debug.prepend(n);
    }
    console.log(txt);
  } catch (e) {}
}
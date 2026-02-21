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
  moviePlayer: document.getElementById("moviePlayer"),
};

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

els.createBtn.onclick = () => initSession(true);
els.joinBtn.onclick = () => initSession(false);

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
    } else if (data.type === "answer") {
        await state.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
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
  updateStatus("Error: Video link invalid or blocked by CORS.");
};

els.loadMovieBtn.onclick = () => {
  const url = els.movieUrl.value.trim();
  if (!url) return;
  
  // 1. Force Reset Player
  els.moviePlayer.pause();
  els.moviePlayer.removeAttribute('src'); 
  els.moviePlayer.load();
  
  // 2. Set New Source
  els.moviePlayer.src = url;
  els.moviePlayer.load();
  
  // 3. Play and Notify
  els.moviePlayer.play().then(() => {
    updateStatus("Movie Loaded & Playing.");
    broadcastData({ type: "load", url });
  }).catch(e => {
    updateStatus("Loaded. Click Play to start (Browser blocked autoplay).");
    broadcastData({ type: "load", url });
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
  updateStatus("Sent Sync Command.");
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
}

function setupDataChannel(channel) {
  state.dataChannel = channel;
  channel.onopen = () => updateStatus("Partner Connected & Sync Ready!");
  channel.onmessage = e => {
    const msg = JSON.parse(e.data);
    state.isRemoteChange = true;
    
    if (msg.type === "load") {
      els.moviePlayer.src = msg.url;
      els.moviePlayer.load();
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
  } else if (state.channel) {
    state.channel.postMessage({ ...data, from: state.tabId });
  }
}
function updateStatus(txt) { els.status.textContent = txt; }
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
  
  // Update locally first
  applyMovieSource(url);
  // Send the URL to partner
  broadcastData({ type: "load", url: url });
};

function applyMovieSource(url) {
  els.moviePlayer.pause();
  els.moviePlayer.src = url;
  els.moviePlayer.load(); // This is the fix for "not loading"
  els.moviePlayer.play().catch(() => updateStatus("Video loaded. Click Play."));
}

els.moviePlayBtn.onclick = () => handleVideoAction("play");
els.moviePauseBtn.onclick = () => handleVideoAction("pause");
els.movieBackBtn.onclick = () => handleVideoAction("seek", -10);
els.movieForwardBtn.onclick = () => handleVideoAction("seek", 10);

els.movieSyncBtn.onclick = () => {
  broadcastData({ 
    type: "sync", 
    time: els.moviePlayer.currentTime, 
    paused: els.moviePlayer.paused 
  });
  updateStatus("Syncing with partner...");
};

function handleVideoAction(action, val = 0) {
  if (state.isRemoteChange) return;

  if (action === "play") els.moviePlayer.play();
  if (action === "pause") els.moviePlayer.pause();
  if (action === "seek") els.moviePlayer.currentTime += val;

  broadcastData({
    type: "control",
    action: action,
    time: els.moviePlayer.currentTime
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
    } else if (msg.type === "control" || msg.type === "sync") {
      els.moviePlayer.currentTime = msg.time;
      if (msg.action === "play" || (msg.type === "sync" && !msg.paused)) {
        els.moviePlayer.play().catch(() => {});
      } else {
        els.moviePlayer.pause();
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
  }
}

function updateStatus(txt) {
  els.status.textContent = txt;
}
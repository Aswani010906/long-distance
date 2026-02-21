const els = {
  roomCode: document.getElementById("roomCode"),
  startBtn: document.getElementById("startBtn"),
  createBtn: document.getElementById("createBtn"),
  joinBtn: document.getElementById("joinBtn"),
  hangupBtn: document.getElementById("hangupBtn"), // Ensure this ID exists in HTML
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

const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

const state = {
  tabId: `tab_${Math.random().toString(36).slice(2, 10)}`,
  pc: null,
  channel: null,
  dataChannel: null,
  localStream: null,
  isRemoteChange: false,
};

// --- 1. INITIALIZATION & HANGUP ---

els.startBtn.onclick = async () => {
  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    els.localVideo.srcObject = state.localStream;
    updateStatus("Camera OK. Ready to connect.");
  } catch (e) {
    updateStatus("Camera Error: " + e.message);
  }
};

els.hangupBtn.onclick = () => {
  // Notify partner first
  sendSignal({ type: "hangup" });
  // Close locally
  handleHangup();
};

function handleHangup() {
  if (state.pc) {
    state.pc.close();
    state.pc = null;
  }
  if (state.dataChannel) {
    state.dataChannel.close();
    state.dataChannel = null;
  }
  // Clear the remote video stream
  els.remoteVideo.srcObject = null;
  updateStatus("Call ended.");
  logDebug("Call ended and connection closed.");
}

// --- 2. CONNECTION LOGIC ---

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
    updateStatus("Room created. Waiting for partner...");
  } else {
    state.pc.ondatachannel = e => setupDataChannel(e.channel);
    sendSignal({ type: "request-offer" });
    updateStatus("Joining room...");
  }

  state.channel.onmessage = async ({ data }) => {
    if (data.from === state.tabId) return;

    // Handle Call Ending
    if (data.type === "hangup") {
      handleHangup();
      return;
    }

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

// --- 3. MOVIE PLAYER LOGIC ---

els.loadMovieBtn.onclick = () => {
  const url = els.movieUrl.value.trim();
  if (!url) return;
  els.moviePlayer.src = url;
  els.moviePlayer.load();
  els.moviePlayer.play().then(() => {
    broadcastData({ type: "load", url });
  }).catch(() => {
    broadcastData({ type: "load", url });
  });
};

els.moviePlayBtn.onclick = () => handleVideoAction("play");
els.moviePauseBtn.onclick = () => handleVideoAction("pause");

function handleVideoAction(action) {
  if (state.isRemoteChange) return;
  if (action === "play") els.moviePlayer.play();
  if (action === "pause") els.moviePlayer.pause();
  broadcastData({ type: "control", action, time: els.moviePlayer.currentTime });
}

function setupDataChannel(channel) {
  state.dataChannel = channel;
  channel.onopen = () => updateStatus("Connected! Partner found.");
  channel.onmessage = e => {
    const msg = JSON.parse(e.data);
    state.isRemoteChange = true;
    if (msg.type === "load") {
      els.moviePlayer.src = msg.url;
      els.moviePlayer.load();
    } else if (msg.type === "control" || msg.type === "sync") {
      els.moviePlayer.currentTime = msg.time;
      msg.action === "play" ? els.moviePlayer.play() : els.moviePlayer.pause();
    }
    setTimeout(() => { state.isRemoteChange = false; }, 600);
  };
}

// --- 4. HELPERS ---

function sendSignal(data) { state.channel.postMessage({ ...data, from: state.tabId }); }

function broadcastData(data) {
  if (state.dataChannel?.readyState === "open") {
    state.dataChannel.send(JSON.stringify(data));
  } else if (state.channel) {
    state.channel.postMessage({ ...data, from: state.tabId });
  }
}

function updateStatus(txt) { els.status.textContent = txt; }

function logDebug(txt) {
  if (els.debug) {
    const n = document.createElement('div');
    n.textContent = `${new Date().toLocaleTimeString()} — ${txt}`;
    els.debug.prepend(n);
  }
}
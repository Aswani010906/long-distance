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
  isRemoteChange: false, // CRITICAL: Prevents the "Sync Loop"
};

// --- 1. CAMERA & CONNECTION ---
els.startBtn.onclick = async () => {
  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    els.localVideo.srcObject = state.localStream;
    updateStatus("Camera Active. Enter code and Create or Join.");
  } catch (e) {
    updateStatus("Camera Error: " + e.message);
  }
};

els.createBtn.onclick = () => initSession(true);
els.joinBtn.onclick = () => initSession(false);

async function initSession(isCaller) {
  const roomId = els.roomCode.value.trim();
  if (!roomId || !state.localStream) return alert("Start camera & enter room code!");

  state.pc = new RTCPeerConnection(rtcConfig);
  state.channel = new BroadcastChannel(`room_${roomId}`);

  // Attach Camera Tracks BEFORE the offer
  state.localStream.getTracks().forEach(t => state.pc.addTrack(t, state.localStream));

  state.pc.ontrack = e => {
    if (e.streams[0]) els.remoteVideo.srcObject = e.streams[0];
  };

  state.pc.onicecandidate = e => {
    if (e.candidate) sendSignal({ type: "ice", candidate: e.candidate });
  };

  if (isCaller) {
    // Caller creates the Data Channel
    state.dataChannel = state.pc.createDataChannel("movieSync");
    setupDataChannel(state.dataChannel);
    
    const offer = await state.pc.createOffer();
    await state.pc.setLocalDescription(offer);
    sendSignal({ type: "offer", sdp: offer });
    updateStatus("Room Created. Waiting for partner...");
  } else {
    // Callee waits for the Data Channel
    state.pc.ondatachannel = e => setupDataChannel(e.channel);
    sendSignal({ type: "request-offer" });
    updateStatus("Joining Room...");
  }

  // Handle Signaling (The "Handshake")
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
  };
}

// --- 2. MOVIE PLAYER LOGIC ---
els.loadMovieBtn.onclick = () => {
  const url = els.movieUrl.value.trim();
  if (!url) return;
  
  els.moviePlayer.src = url;
  els.moviePlayer.load(); // Forces browser to load the new file
  
  broadcastData({ type: "load", url });
  updateStatus("Movie Loaded. Syncing with partner...");
};

els.moviePlayBtn.onclick = () => handleVideoAction("play");
els.moviePauseBtn.onclick = () => handleVideoAction("pause");
els.movieSyncBtn.onclick = () => {
  broadcastData({ 
    type: "sync", 
    time: els.moviePlayer.currentTime, 
    paused: els.moviePlayer.paused 
  });
};

function handleVideoAction(action) {
  if (state.isRemoteChange) return; // Don't send data if we are reacting to partner

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
  channel.onopen = () => updateStatus("Connected! Partner found.");
  channel.onmessage = e => {
    const msg = JSON.parse(e.data);
    state.isRemoteChange = true; // LOCK: Mutes outgoing messages while we update
    
    if (msg.type === "load") {
      els.moviePlayer.src = msg.url;
      els.moviePlayer.load();
    } else if (msg.type === "control" || msg.type === "sync") {
      els.moviePlayer.currentTime = msg.time;
      if (msg.action === "play" || (msg.type === "sync" && !msg.paused)) {
        els.moviePlayer.play();
      } else {
        els.moviePlayer.pause();
      }
    }
    
    // UNLOCK after the change is finished
    setTimeout(() => { state.isRemoteChange = false; }, 500);
  };
}

// --- 3. HELPERS ---
function sendSignal(data) {
  state.channel.postMessage({ ...data, from: state.tabId });
}

function broadcastData(data) {
  if (state.dataChannel && state.dataChannel.readyState === "open") {
    state.dataChannel.send(JSON.stringify(data));
  }
}

function updateStatus(txt) {
  els.status.textContent = txt;
}
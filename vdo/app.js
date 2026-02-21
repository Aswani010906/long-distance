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
  moviePlayer: document.getElementById("moviePlayer"),
};

const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const state = {
  tabId: `tab_${Math.random().toString(36).slice(2, 10)}`,
  role: null,
  pc: null,
  channel: null,
  dataChannel: null,
  localStream: null,
  remoteStream: null,
  isApplyingRemote: false, // Prevents sync loops
};

init();

function init() {
  els.startBtn.onclick = startCamera;
  els.createBtn.onclick = createRoom;
  els.joinBtn.onclick = joinRoom;
  els.hangupBtn.onclick = hangUp;
  els.loadMovieBtn.onclick = loadMovie;
  
  els.moviePlayBtn.onclick = () => controlMovie("play");
  els.moviePauseBtn.onclick = () => controlMovie("pause");
  els.movieBackBtn.onclick = () => controlMovie("seek", -10);
  els.movieForwardBtn.onclick = () => controlMovie("seek", 10);
  
  els.movieSyncBtn.onclick = () => {
    sendData({ type: "movie-sync-state", time: els.moviePlayer.currentTime, paused: els.moviePlayer.paused });
  };

  // Listen for local video events to broadcast
  els.moviePlayer.onplay = () => !state.isApplyingRemote && controlMovie("play");
  els.moviePlayer.onpause = () => !state.isApplyingRemote && controlMovie("pause");

  setStatus("Ready. Start camera first.");
}

async function startCamera() {
  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    els.localVideo.srcObject = state.localStream;
    setStatus("Camera active. Create or Join room.");
  } catch (e) {
    setStatus("Error accessing camera.");
  }
}

async function prepareSession(role, roomId) {
  state.role = role;
  state.pc = new RTCPeerConnection(rtcConfig);

  // Add local tracks
  state.localStream.getTracks().forEach(track => state.pc.addTrack(track, state.localStream));

  // Handle incoming tracks
  state.pc.ontrack = (event) => {
    if (!els.remoteVideo.srcObject) {
      els.remoteVideo.srcObject = event.streams[0];
    }
  };

  // ICE Candidates
  state.pc.onicecandidate = (event) => {
    if (event.candidate) sendSignal({ type: "ice", candidate: event.candidate });
  };

  // Data Channel logic
  if (role === "caller") {
    state.dataChannel = state.pc.createDataChannel("movie-sync");
    setupDataChannelHandlers();
  } else {
    state.pc.ondatachannel = (event) => {
      state.dataChannel = event.channel;
      setupDataChannelHandlers();
    };
  }

  openChannel(roomId);
}

function setupDataChannelHandlers() {
  state.dataChannel.onopen = () => setStatus("Data Sync Connected!");
  state.dataChannel.onmessage = (e) => handleDataMessage(JSON.parse(e.data));
}

async function createRoom() {
  const roomId = els.roomCode.value.trim();
  if (!roomId) return alert("Enter Room Code");
  await prepareSession("caller", roomId);
  
  const offer = await state.pc.createOffer();
  await state.pc.setLocalDescription(offer);
  sendSignal({ type: "offer", sdp: offer });
  setStatus("Room Created. Waiting for partner...");
}

async function joinRoom() {
  const roomId = els.roomCode.value.trim();
  if (!roomId) return alert("Enter Room Code");
  await prepareSession("callee", roomId);
  sendSignal({ type: "join-request" });
  setStatus("Joining...");
}

function openChannel(roomId) {
  state.channel = new BroadcastChannel(`room-${roomId}`);
  state.channel.onmessage = async (event) => {
    const msg = event.data;
    if (msg.from === state.tabId) return;

    if (msg.type === "join-request" && state.role === "caller") {
      // Re-send offer if someone joins
      const offer = await state.pc.createOffer();
      await state.pc.setLocalDescription(offer);
      sendSignal({ type: "offer", sdp: offer });
    } else if (msg.type === "offer" && state.role === "callee") {
      await state.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      const answer = await state.pc.createAnswer();
      await state.pc.setLocalDescription(answer);
      sendSignal({ type: "answer", sdp: answer });
    } else if (msg.type === "answer") {
      await state.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
    } else if (msg.type === "ice") {
      try { await state.pc.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch(e){}
    }
  };
}

// Signaling & Data Helpers
function sendSignal(payload) {
  state.channel.postMessage({ ...payload, from: state.tabId });
}

function sendData(payload) {
  if (state.dataChannel?.readyState === "open") {
    state.dataChannel.send(JSON.stringify(payload));
  }
}

function handleDataMessage(msg) {
  state.isApplyingRemote = true; // Block local event listeners
  if (msg.type === "movie-load") {
    els.moviePlayer.src = msg.url;
  } else if (msg.type === "movie-control") {
    if (msg.action === "play") els.moviePlayer.play();
    if (msg.action === "pause") els.moviePlayer.pause();
    if (msg.action === "seek") els.moviePlayer.currentTime = msg.value;
  } else if (msg.type === "movie-sync-state") {
    els.moviePlayer.currentTime = msg.time;
    msg.paused ? els.moviePlayer.pause() : els.moviePlayer.play();
  }
  setTimeout(() => state.isApplyingRemote = false, 500);
}

// Movie Functions
async function loadMovie() {
  const url = els.movieUrl.value;
  if (!url) return;
  els.moviePlayer.src = url;
  sendData({ type: "movie-load", url });
}

async function controlMovie(action, value = 0) {
  if (state.isApplyingRemote) return;
  
  let finalValue = els.moviePlayer.currentTime;
  if (action === "play") await els.moviePlayer.play();
  if (action === "pause") els.moviePlayer.pause();
  if (action === "seek") {
    els.moviePlayer.currentTime += value;
    finalValue = els.moviePlayer.currentTime;
  }
  
  sendData({ type: "movie-control", action, value: finalValue });
}

function hangUp() {
  state.pc?.close();
  state.channel?.close();
  location.reload();
}

function setStatus(msg) {
  els.status.textContent = msg;
}
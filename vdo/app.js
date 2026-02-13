const els = {
  roomCode: document.getElementById("roomCode"),
  startBtn: document.getElementById("startBtn"),
  createBtn: document.getElementById("createBtn"),
  joinBtn: document.getElementById("joinBtn"),
  hangupBtn: document.getElementById("hangupBtn"),
  status: document.getElementById("status"),
  localVideo: document.getElementById("localVideo"),
  remoteVideo: document.getElementById("remoteVideo"),
};

const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const BUILD = "broadcast-v2026-02-13a";

const state = {
  tabId: `tab_${Math.random().toString(36).slice(2, 10)}`,
  role: null,
  roomId: null,
  pc: null,
  channel: null,
  localStream: null,
  remoteStream: null,
  joined: false,
};

init();

function init() {
  els.startBtn.addEventListener("click", startCamera);
  els.createBtn.addEventListener("click", createRoom);
  els.joinBtn.addEventListener("click", joinRoom);
  els.hangupBtn.addEventListener("click", hangUp);

  setButtons({
    start: true,
    create: false,
    join: false,
    hangup: false,
  });

  setStatus(`Ready (${BUILD}). Open this page in two tabs and use the same room code.`);
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
    event.streams[0].getTracks().forEach((track) => state.remoteStream.addTrack(track));
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
    if (!msg || msg.from === state.tabId) return;

    if (msg.type === "join-request" && state.role === "caller") {
      if (state.pc?.localDescription) {
        sendSignal({ type: "offer", sdp: serializeDescription(state.pc.localDescription) });
      }
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

    if (msg.type === "hangup") {
      setStatus("Partner ended call.");
      await cleanupSession(true);
    }
  };
}

async function onOffer(offer) {
  try {
    if (!state.pc.currentRemoteDescription) {
      await state.pc.setRemoteDescription(new RTCSessionDescription(offer));
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
    if (!state.pc.currentRemoteDescription) {
      await state.pc.setRemoteDescription(new RTCSessionDescription(answer));
      setStatus("Answer received. Finalizing connection...");
    }
  } catch (error) {
    setStatus(`Answer handling failed: ${describeError(error)}`);
  }
}

async function onIce(candidateData) {
  try {
    if (!state.pc || !candidateData) return;
    if (!state.pc.remoteDescription) return;
    await state.pc.addIceCandidate(new RTCIceCandidate(candidateData));
  } catch {
    // ignore occasional duplicate candidate errors
  }
}

function sendSignal(payload) {
  if (!state.channel || !state.joined) return;
  try {
    state.channel.postMessage({
      ...payload,
      from: state.tabId,
      roomId: state.roomId,
      ts: Date.now(),
    });
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

function sanitizeRoomCode(input) {
  return input.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24);
}

function setStatus(message) {
  els.status.textContent = message;
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